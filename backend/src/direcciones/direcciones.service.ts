import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';
import {
  COLUMNAS_DIRECCIONES,
  LETRAS_DIRECCIONES,
  datosPorDefecto,
} from './direcciones.columnas';

export type EstadoFiltro = 'todas' | 'corregidas' | 'pendientes';

export interface FilaDireccion {
  id: string;
  /** Número de fila como en el Excel (la fila 1 es el encabezado). */
  numero: number;
  datos: Record<string, string | number | null>;
  corregida: boolean;
  corregidaPor: string | null;
  corregidaEn: string | null;
  creadoPor: string | null;
  creadoEn: string;
  actualizadoPor: string | null;
  actualizadoEn: string;
}

interface FilaBD {
  id: string;
  numero: string | number;
  datos: Record<string, string | number | null>;
  corregida: boolean;
  corregida_por: string | null;
  corregida_en: string | null;
  creado_por: string | null;
  creado_en: string;
  actualizado_por: string | null;
  actualizado_en: string;
}

const MAX_VALOR = 1000;
const MAX_IDS = 5000;
const MAX_FILAS_IMPORTAR = 2000;

/** Texto buscable: columnas visibles concatenadas, sin tildes y en minúscula. */
const EXPR_BUSQUEDA = `translate(lower(concat_ws(' ', ${COLUMNAS_DIRECCIONES.filter(
  (c) => c.visible,
)
  .map((c) => `d.datos->>'${c.letra}'`)
  .join(', ')})), 'áéíóúüñ', 'aeiouun')`;

function quitarTildes(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/ñ/g, 'n');
}

@Injectable()
export class DireccionesService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS direcciones (
        id bigserial PRIMARY KEY,
        fila integer NOT NULL,
        codigo text NOT NULL DEFAULT '',
        datos jsonb NOT NULL DEFAULT '{}'::jsonb,
        corregida boolean NOT NULL DEFAULT false,
        corregida_por text,
        corregida_en timestamptz,
        creado_por text,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_por text,
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_direcciones_fila ON direcciones (fila, id)`,
    );
    // El código de dirección es la llave en Drivin: no se puede repetir.
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_direcciones_codigo
         ON direcciones (lower(codigo)) WHERE codigo <> ''`,
    );
  }

  private async nombreUsuario(user: JwtPayload): Promise<string> {
    const r = await this.pool.query<{ nombre: string }>(
      `SELECT nombre FROM usuarios WHERE id = $1::bigint LIMIT 1`,
      [user.sub],
    );
    return r.rows[0]?.nombre ?? user.cedula ?? '';
  }

  private mapear(r: FilaBD): FilaDireccion {
    return {
      id: String(r.id),
      numero: Number(r.numero),
      datos: r.datos ?? {},
      corregida: r.corregida,
      corregidaPor: r.corregida_por,
      corregidaEn: r.corregida_en,
      creadoPor: r.creado_por,
      creadoEn: r.creado_en,
      actualizadoPor: r.actualizado_por,
      actualizadoEn: r.actualizado_en,
    };
  }

  /** Columnas (letra, nombre, visible) para que el frontend arme la tabla. */
  columnas() {
    return COLUMNAS_DIRECCIONES.map(({ letra, nombre, visible }) => ({
      letra,
      nombre,
      visible: !!visible,
    }));
  }

  /**
   * Página de filas en el orden del Excel. `numero` es la fila del Excel
   * (posición entre TODAS las filas + 1 por el encabezado), aunque se filtre.
   */
  async listar(f: {
    q?: string;
    estado?: string;
    tipo?: string;
    offset?: number;
    limit?: number;
  }) {
    const limit = Math.min(500, Math.max(1, Number(f.limit) || 100));
    const offset = Math.max(0, Number(f.offset) || 0);
    const where: string[] = [];
    const params: unknown[] = [];
    const q = (f.q ?? '').trim();
    if (q) {
      for (const termino of quitarTildes(q).split(/\s+/).filter(Boolean).slice(0, 8)) {
        params.push(`%${termino}%`);
        where.push(`${EXPR_BUSQUEDA} LIKE $${params.length}`);
      }
    }
    if (f.estado === 'corregidas') where.push('d.corregida');
    else if (f.estado === 'pendientes') where.push('NOT d.corregida');
    const tipo = (f.tipo ?? '').trim();
    if (tipo === '__vacio__') {
      where.push(`COALESCE(d.datos->>'D', '') = ''`);
    } else if (tipo) {
      params.push(tipo);
      where.push(`d.datos->>'D' = $${params.length}`);
    }
    params.push(limit, offset);
    const res = await this.pool.query<FilaBD & { total_filtrado: string }>(
      `WITH d AS (
         SELECT *, ROW_NUMBER() OVER (ORDER BY fila, id) + 1 AS numero
         FROM direcciones
       )
       SELECT d.id, d.numero, d.datos, d.corregida, d.corregida_por, d.corregida_en,
              d.creado_por, d.creado_en, d.actualizado_por, d.actualizado_en,
              COUNT(*) OVER () AS total_filtrado
       FROM d
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY d.fila, d.id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    let total = Number(res.rows[0]?.total_filtrado ?? 0);
    // Página vacía más allá del final: el total se consulta aparte.
    if (res.rows.length === 0 && offset > 0) {
      const c = await this.pool.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM direcciones d
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
        params.slice(0, -2),
      );
      total = Number(c.rows[0]?.n ?? 0);
    }
    const t = await this.pool.query<{ todas: string; corregidas: string }>(
      `SELECT COUNT(*) AS todas, COUNT(*) FILTER (WHERE corregida) AS corregidas
       FROM direcciones`,
    );
    const todas = Number(t.rows[0]?.todas ?? 0);
    const corregidas = Number(t.rows[0]?.corregidas ?? 0);
    return {
      filas: res.rows.map((r) => this.mapear(r)),
      total,
      offset,
      limit,
      totales: { todas, corregidas, pendientes: todas - corregidas },
    };
  }

  /** Valores distintos de "Tipo de Dirección" (PDV) para el filtro. */
  async tipos(): Promise<string[]> {
    const r = await this.pool.query<{ tipo: string }>(
      `SELECT DISTINCT datos->>'D' AS tipo FROM direcciones
       WHERE COALESCE(datos->>'D', '') <> '' ORDER BY 1`,
    );
    return r.rows.map((x) => x.tipo);
  }

  private async obtener(id: string): Promise<FilaDireccion> {
    const r = await this.pool.query<FilaBD>(
      `WITH d AS (
         SELECT *, ROW_NUMBER() OVER (ORDER BY fila, id) + 1 AS numero
         FROM direcciones
       )
       SELECT id, numero, datos, corregida, corregida_por, corregida_en,
              creado_por, creado_en, actualizado_por, actualizado_en
       FROM d WHERE id = $1::bigint`,
      [id],
    );
    if (!r.rows[0]) throw new NotFoundException('La fila ya no existe');
    return this.mapear(r.rows[0]);
  }

  private validarId(id: string): string {
    if (!/^\d+$/.test(String(id ?? ''))) {
      throw new BadRequestException('Fila inválida');
    }
    return String(id);
  }

  private errorCodigo(e: unknown, codigo: string): never {
    if ((e as { code?: string })?.code === '23505') {
      throw new ConflictException(
        `Ya existe una dirección con el código "${codigo}".`,
      );
    }
    throw e;
  }

  /** Edita UNA celda (columna por letra). Vacío = borra el valor. */
  async actualizarCelda(
    user: JwtPayload,
    id: string,
    letra: string,
    valor: unknown,
  ): Promise<FilaDireccion> {
    this.validarId(id);
    const col = String(letra ?? '').trim().toUpperCase();
    if (!LETRAS_DIRECCIONES.has(col)) {
      throw new BadRequestException('Columna inválida');
    }
    const texto = String(valor ?? '').replace(/\s+/g, ' ').trim();
    if (texto.length > MAX_VALOR) {
      throw new BadRequestException(`Máximo ${MAX_VALOR} caracteres por celda`);
    }
    const nombre = await this.nombreUsuario(user);
    try {
      const r = await this.pool.query(
        `UPDATE direcciones SET
           datos = CASE WHEN $3 = '' THEN datos - $2::text
                        ELSE jsonb_set(datos, ARRAY[$2::text], to_jsonb($3::text)) END,
           codigo = CASE WHEN $2 = 'A' THEN $3 ELSE codigo END,
           actualizado_por = $4, actualizado_en = now()
         WHERE id = $1::bigint`,
        [id, col, texto, nombre],
      );
      if (!r.rowCount) throw new NotFoundException('La fila ya no existe');
    } catch (e) {
      this.errorCodigo(e, texto);
    }
    return this.obtener(id);
  }

  /** Agrega una fila al final (como en el Excel), sin marcar. */
  async agregar(
    user: JwtPayload,
    datos?: Record<string, unknown>,
  ): Promise<FilaDireccion> {
    const limpio: Record<string, string | number> = datosPorDefecto();
    for (const [k, v] of Object.entries(datos ?? {})) {
      const col = k.trim().toUpperCase();
      const texto = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_VALOR);
      if (LETRAS_DIRECCIONES.has(col) && texto) limpio[col] = texto;
    }
    const codigo = String(limpio.A ?? '');
    const nombre = await this.nombreUsuario(user);
    let id = '';
    try {
      const r = await this.pool.query<{ id: string }>(
        `INSERT INTO direcciones (fila, codigo, datos, creado_por, actualizado_por)
         VALUES ((SELECT COALESCE(MAX(fila), 0) + 1 FROM direcciones), $1, $2::jsonb, $3, $3)
         RETURNING id`,
        [codigo, JSON.stringify(limpio), nombre],
      );
      id = String(r.rows[0].id);
    } catch (e) {
      this.errorCodigo(e, codigo);
    }
    return this.obtener(id);
  }

  private validarIds(ids: unknown): string[] {
    const lista = Array.isArray(ids)
      ? [...new Set(ids.map((x) => String(x ?? '').trim()).filter((x) => /^\d+$/.test(x)))]
      : [];
    if (lista.length === 0) throw new BadRequestException('Selecciona al menos una fila');
    if (lista.length > MAX_IDS) {
      throw new BadRequestException(`Máximo ${MAX_IDS} filas por operación`);
    }
    return lista;
  }

  /** Marca (amarillo = corregida) o desmarca filas. */
  async marcar(user: JwtPayload, ids: unknown, corregida: boolean) {
    const lista = this.validarIds(ids);
    const nombre = await this.nombreUsuario(user);
    const r = await this.pool.query<{ id: string }>(
      `UPDATE direcciones SET
         corregida = $2,
         corregida_por = CASE WHEN $2 THEN $3 ELSE NULL END,
         corregida_en = CASE WHEN $2 THEN now() ELSE NULL END
       WHERE id = ANY($1::bigint[]) AND corregida IS DISTINCT FROM $2
       RETURNING id`,
      [lista, !!corregida, nombre],
    );
    return {
      actualizadas: r.rowCount ?? 0,
      corregida: !!corregida,
      corregidaPor: corregida ? nombre : null,
      corregidaEn: corregida ? new Date().toISOString() : null,
    };
  }

  async eliminar(ids: unknown) {
    const lista = this.validarIds(ids);
    const r = await this.pool.query(
      `DELETE FROM direcciones WHERE id = ANY($1::bigint[])`,
      [lista],
    );
    return { eliminadas: r.rowCount ?? 0 };
  }

  /** Códigos existentes (en minúscula) para que la importación detecte filas nuevas. */
  async codigos(): Promise<string[]> {
    const r = await this.pool.query<{ c: string }>(
      `SELECT lower(codigo) AS c FROM direcciones WHERE codigo <> ''`,
    );
    return r.rows.map((x) => x.c);
  }

  /**
   * Importa filas del Excel: SOLO agrega las que tengan un código (columna A)
   * que aún no exista; quedan al final, sin marcar (sin amarillo) para que las
   * corrijan. Las existentes no se tocan para no pisar lo ya corregido.
   */
  async importar(user: JwtPayload, filas: unknown) {
    if (!Array.isArray(filas)) throw new BadRequestException('Formato inválido');
    if (filas.length > MAX_FILAS_IMPORTAR) {
      throw new BadRequestException(`Máximo ${MAX_FILAS_IMPORTAR} filas por lote`);
    }
    const vistos = new Set<string>();
    const nuevas: { codigo: string; datos: Record<string, string | number> }[] = [];
    let sinCodigo = 0;
    for (const item of filas) {
      if (!item || typeof item !== 'object') continue;
      const datos: Record<string, string | number> = datosPorDefecto();
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        const col = k.trim().toUpperCase();
        if (!LETRAS_DIRECCIONES.has(col)) continue;
        if (typeof v === 'number' && Number.isFinite(v)) {
          datos[col] = v;
        } else if (typeof v === 'string' || typeof v === 'boolean') {
          const t = String(v).replace(/\s+/g, ' ').trim().slice(0, MAX_VALOR);
          if (t) datos[col] = t;
        }
      }
      const codigo = String(datos.A ?? '').trim();
      if (!codigo) {
        sinCodigo++;
        continue;
      }
      datos.A = typeof datos.A === 'number' ? datos.A : codigo;
      const k = codigo.toLowerCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      nuevas.push({ codigo, datos });
    }
    if (nuevas.length === 0) return { agregadas: 0, existentes: 0, sinCodigo };

    const nombre = await this.nombreUsuario(user);
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      // Serializa importaciones simultáneas para que el orden de filas sea estable.
      await cliente.query(`SELECT pg_advisory_xact_lock(hashtext('direcciones_importar'))`);
      const r = await cliente.query<{ id: string }>(
        `WITH base AS (SELECT COALESCE(MAX(fila), 0) AS b FROM direcciones),
         entrada AS (
           SELECT e.value->>'codigo' AS codigo, e.value->'datos' AS datos, e.ord
           FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS e(value, ord)
           WHERE NOT EXISTS (
             SELECT 1 FROM direcciones d WHERE lower(d.codigo) = lower(e.value->>'codigo')
           )
         )
         INSERT INTO direcciones (fila, codigo, datos, creado_por, actualizado_por)
         SELECT base.b + ROW_NUMBER() OVER (ORDER BY entrada.ord), entrada.codigo,
                entrada.datos, $2, $2
         FROM entrada, base
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [JSON.stringify(nuevas), nombre],
      );
      await cliente.query('COMMIT');
      const agregadas = r.rowCount ?? 0;
      return { agregadas, existentes: nuevas.length - agregadas, sinCodigo };
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      cliente.release();
    }
  }

  /**
   * Todas las filas para exportar el Excel con las 66 columnas del formato de
   * Drivin. Compacto: cada fila es [corregida(0/1), valorA, valorB, ...].
   */
  async exportar() {
    const r = await this.pool.query<{ datos: Record<string, unknown>; corregida: boolean }>(
      `SELECT datos, corregida FROM direcciones ORDER BY fila, id`,
    );
    const letras = COLUMNAS_DIRECCIONES.map((c) => c.letra);
    return {
      columnas: COLUMNAS_DIRECCIONES.map((c) => c.nombre),
      filas: r.rows.map((x) => {
        const fila: unknown[] = [
          x.corregida ? 1 : 0,
          ...letras.map((l) => x.datos?.[l] ?? null),
        ];
        while (fila.length > 1 && fila[fila.length - 1] === null) fila.pop();
        return fila;
      }),
    };
  }
}
