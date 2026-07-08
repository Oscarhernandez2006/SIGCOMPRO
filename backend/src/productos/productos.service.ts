import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface ProductoPrecioRow {
  id: string;
  lista_precio: string;
  desc_lista: string | null;
  referencia: string;
  producto: string | null;
  cia: number | null;
  um: string | null;
  precio: number;
  fecha_activacion: string | null;
  fecha_inactivacion: string | null;
  sincronizado_en: string;
}

export interface ListaPrecio {
  lista_precio: string;
  desc_lista: string | null;
  productos: number;
}

interface ApiProducto {
  LISTA_PRECIO: string | number;
  DESC_LISTA?: string;
  REFERENCIA: string | number;
  PRODUCTO?: string;
  CIA?: string | number;
  UM?: string;
  PRECIO?: string | number;
  FECHA_ACTIVACION?: string;
  FECHA_INACTIVACION?: string;
}

const TOKEN =
  '1b301e683240d8ab5ddb6eb061b112224e15bbe8d28a6e78f0251bdfaef0e4c2';

// Compañía 4: se cargan todas sus listas TPV/PDV (puntos existentes).
// Compañía 6: solo estas listas adicionales (por su DESC_LISTA, normalizado).
const CIAS = [4, 6] as const;
const LISTAS_CIA6_PERMITIDAS = new Set([
  'TPV CONCORD',
  'TPV ALAMEDA',
  'TPV ALAMEDA 2',
]);

/** Normaliza el nombre de una lista para compararlo con la lista blanca. */
function nombreLista(desc?: string | null): string {
  return (desc ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Indica si una fila debe cargarse según su compañía de origen. */
function listaPermitida(ciaFuente: number, desc?: string | null): boolean {
  const nombre = nombreLista(desc);
  if (ciaFuente === 6) return LISTAS_CIA6_PERMITIDAS.has(nombre);
  // Compañía 4 (o cualquier otra): todas las listas TPV/PDV.
  return nombre.includes('TPV') || nombre.includes('PDV');
}

@Injectable()
export class ProductosService implements OnModuleInit {
  private readonly logger = new Logger(ProductosService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS productos_precios (
        id bigserial PRIMARY KEY,
        lista_precio text NOT NULL,
        desc_lista text,
        referencia text NOT NULL,
        producto text,
        cia int,
        um text,
        precio numeric(14,2) DEFAULT 0,
        fecha_activacion date,
        fecha_inactivacion date,
        sincronizado_en timestamptz NOT NULL DEFAULT now(),
        UNIQUE (lista_precio, referencia)
      )
    `);
  }

  private apiUrl(cia: number): string {
    const base = this.config.get<string>(
      'LISTAS_PRECIOS_URL',
      'https://apiconsulta.grupo-santacruz.com/listas-precios',
    );
    return `${base}?cia=${cia}&token=${TOKEN}`;
  }

  /** Descarga las filas crudas de una compañía. */
  private async descargar(cia: number): Promise<ApiProducto[]> {
    const res = await fetch(this.apiUrl(cia));
    if (!res.ok) {
      throw new Error(`La API (cia ${cia}) respondió ${res.status}`);
    }
    const payload = (await res.json()) as
      | ApiProducto[]
      | { data: ApiProducto[] };
    const datos = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(datos)) {
      throw new Error(
        `Respuesta inesperada de la API de listas de precios (cia ${cia})`,
      );
    }
    return datos;
  }

  /** Actualiza la lista de precios automáticamente todos los días a las 7:50 a.m. */
  @Cron('50 7 * * *', {
    name: 'sincronizar-listas-precios',
    timeZone: 'America/Bogota',
  })
  async sincronizarProgramado(): Promise<void> {
    try {
      const r = await this.sincronizar();
      this.logger.log(
        `Sincronización programada (7:50 a.m.): ${r.total} precios en ${r.listas} listas.`,
      );
    } catch (e) {
      this.logger.error(
        `Falló la sincronización programada de listas de precios: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  private toFecha(valor?: string): string | null {
    if (!valor) return null;
    const fecha = String(valor).trim();
    return fecha ? fecha.slice(0, 10) : null;
  }

  /**
   * Descarga las listas de precios de las compañías 4 y 6 y actualiza la tabla.
   * De cia 4 se conservan todas las listas TPV/PDV; de cia 6 solo Concord,
   * Alameda y Alameda 2 (adicionales a las que ya existían).
   */
  async sincronizar(): Promise<{ total: number; listas: number }> {
    // Descarga cada compañía y etiqueta cada fila con su compañía de origen.
    const datos: Array<{ p: ApiProducto; ciaFuente: number }> = [];
    for (const cia of CIAS) {
      const filasCia = await this.descargar(cia);
      for (const p of filasCia) datos.push({ p, ciaFuente: cia });
    }

    // Normaliza y descarta filas inválidas antes de insertar.
    const unicas = new Map<
      string,
      {
        lista: string;
        referencia: string;
        desc: string | null;
        producto: string | null;
        cia: number;
        um: string | null;
        precio: number;
        fa: string | null;
        fi: string | null;
      }
    >();
    for (const { p, ciaFuente } of datos) {
      const lista = String(p.LISTA_PRECIO ?? '').trim();
      const referencia = String(p.REFERENCIA ?? '').trim();
      if (!lista || !referencia) continue;
      // cia 4: todas TPV/PDV · cia 6: solo Concord/Alameda/Alameda 2.
      if (!listaPermitida(ciaFuente, p.DESC_LISTA)) continue;
      const clave = `${lista}|${referencia}`;
      const fa = this.toFecha(p.FECHA_ACTIVACION);
      const existente = unicas.get(clave);
      // Si ya existe y la fila actual no es más reciente, se descarta.
      if (existente && (existente.fa ?? '') >= (fa ?? '')) continue;
      unicas.set(clave, {
        lista,
        referencia,
        desc: p.DESC_LISTA ?? null,
        producto: p.PRODUCTO ?? null,
        cia: p.CIA != null ? Number(p.CIA) : ciaFuente,
        um: p.UM ?? null,
        precio: p.PRECIO != null ? Number(p.PRECIO) : 0,
        fa,
        fi: this.toFecha(p.FECHA_INACTIVACION),
      });
    }
    const filas = [...unicas.values()];

    const listas = new Set(filas.map((f) => f.lista));
    const LOTE = 1000;
    const cliente = await this.pool.connect();
    let total = 0;
    try {
      await cliente.query('BEGIN');
      for (let i = 0; i < filas.length; i += LOTE) {
        const lote = filas.slice(i, i + LOTE);
        const valores: unknown[] = [];
        const placeholders = lote.map((f, n) => {
          const b = n * 9;
          valores.push(
            f.lista, f.desc, f.referencia, f.producto, f.cia,
            f.um, f.precio, f.fa, f.fi,
          );
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9}, now())`;
        });
        await cliente.query(
          `INSERT INTO productos_precios
             (lista_precio, desc_lista, referencia, producto, cia, um, precio,
              fecha_activacion, fecha_inactivacion, sincronizado_en)
           VALUES ${placeholders.join(',')}
           ON CONFLICT (lista_precio, referencia) DO UPDATE SET
             desc_lista = EXCLUDED.desc_lista,
             producto = EXCLUDED.producto,
             cia = EXCLUDED.cia,
             um = EXCLUDED.um,
             precio = EXCLUDED.precio,
             fecha_activacion = EXCLUDED.fecha_activacion,
             fecha_inactivacion = EXCLUDED.fecha_inactivacion,
             sincronizado_en = now()`,
          valores,
        );
        total += lote.length;
      }
      // Conserva solo: listas TPV/PDV de otras compañías (cia 4) y las 3
      // listas permitidas de cia 6. Elimina cualquier otra residual.
      await cliente.query(
        `DELETE FROM productos_precios
         WHERE upper(btrim(regexp_replace(coalesce(desc_lista,''), '\\s+', ' ', 'g'))) NOT IN (
           'TPV CONCORD', 'TPV ALAMEDA', 'TPV ALAMEDA 2'
         )
         AND NOT (
           (upper(coalesce(desc_lista,'')) LIKE '%TPV%'
             OR upper(coalesce(desc_lista,'')) LIKE '%PDV%')
           AND coalesce(cia, 0) <> 6
         )`,
      );
      // Elimina listas residuales/duplicadas con muy pocos productos.
      await cliente.query(
        `DELETE FROM productos_precios
         WHERE lista_precio IN (
           SELECT lista_precio FROM productos_precios
           GROUP BY lista_precio HAVING COUNT(*) < 10
         )`,
      );
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }

    this.logger.log(`Sincronizados ${total} productos en ${listas.size} listas`);
    return { total, listas: listas.size };
  }

  /** Listas de precios disponibles con su número de productos. */
  async listas(): Promise<ListaPrecio[]> {
    const res = await this.pool.query<ListaPrecio>(
      `SELECT lista_precio,
              MAX(desc_lista) AS desc_lista,
              COUNT(*)::int AS productos
       FROM productos_precios
       GROUP BY lista_precio
       ORDER BY desc_lista NULLS LAST, lista_precio`,
    );
    return res.rows;
  }

  /** Productos de una lista (o todos) con búsqueda opcional. */
  async listar(
    listaPrecio?: string,
    buscar?: string,
  ): Promise<ProductoPrecioRow[]> {
    const cond: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (listaPrecio) {
      cond.push(`lista_precio = $${i++}`);
      params.push(listaPrecio);
    }
    if (buscar?.trim()) {
      cond.push(`(producto ILIKE $${i} OR referencia ILIKE $${i})`);
      params.push(`%${buscar.trim()}%`);
      i++;
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const res = await this.pool.query<ProductoPrecioRow>(
      `SELECT id, lista_precio, desc_lista, referencia, producto, cia, um,
              precio, fecha_activacion, fecha_inactivacion, sincronizado_en
       FROM productos_precios
       ${where}
       ORDER BY producto NULLS LAST
       LIMIT 1000`,
      params,
    );
    return res.rows;
  }

  async ultimaSincronizacion(): Promise<string | null> {
    const res = await this.pool.query<{ max: string | null }>(
      `SELECT MAX(sincronizado_en) AS max FROM productos_precios`,
    );
    return res.rows[0]?.max ?? null;
  }
}
