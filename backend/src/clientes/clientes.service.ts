import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

export interface ClienteRow {
  id: string;
  nit_cedula: string;
  nombre: string | null;
  apellidos: string | null;
  direccion: string | null;
  referencia: string | null;
  barrio: string | null;
  ciudad: string | null;
  telefono: string | null;
  correo: string | null;
  punto_venta: string | null;
  lat: number | null;
  lng: number | null;
  activo: boolean;
  horeca: boolean;
  direccion_incorrecta: boolean;
  dias_despacho: string[];
  creado_en: string;
}

export interface ListarResultado {
  items: ClienteRow[];
  total: number;
}

export interface ImportacionResumen {
  /** Filas únicas (por NIT) procesadas del archivo. */
  totalFilas: number;
  /** Clientes nuevos creados. */
  creados: number;
  /** Clientes existentes que cambiaron y se actualizaron. */
  actualizados: number;
  /** Clientes que ya estaban iguales (sin cambios). */
  sinCambios: number;
  /** Filas ignoradas por no traer NIT/cédula. */
  descartadas: number;
}

const COLUMNS =
  'id, nit_cedula, nombre, apellidos, direccion, referencia, barrio, ciudad, telefono, correo, punto_venta, lat, lng, activo, horeca, direccion_incorrecta, dias_despacho, creado_en';

/** Solo guarda el teléfono si tiene exactamente 10 dígitos (celular colombiano). */
function soloMovil(tel: string | null | undefined): string | null {
  const solo = String(tel ?? '').replace(/\D/g, '');
  return solo.length === 10 ? solo : null;
}

@Injectable()
export class ClientesService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS horeca boolean NOT NULL DEFAULT false`,
    );
    await this.pool.query(
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS correo text`,
    );
    await this.pool.query(
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS apellidos text`,
    );
    await this.pool.query(
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion_incorrecta boolean NOT NULL DEFAULT false`,
    );
    // Punto de venta al que está asignado el cliente (viene del Excel de importación).
    await this.pool.query(
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS punto_venta text`,
    );
    // Días de despacho (HORECA): arreglo de días lun..dom en jsonb.
    await this.pool.query(
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS dias_despacho jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  /** Todos los clientes sin límite de paginación (solo para exportación). */
  async exportar(): Promise<ClienteRow[]> {
    const res = await this.pool.query<ClienteRow>(
      `SELECT ${COLUMNS} FROM clientes ORDER BY nombre ASC NULLS LAST`,
    );
    return res.rows;
  }

  /**
   * Últimos puntos de venta donde ha comprado cada cliente (por NIT/cédula),
   * más recientes primero, máximo `limite` por cliente. Se usa en el Step de
   * cliente del wizard para mostrar el historial de puntos de compra.
   */
  async puntosCompradosPorNit(
    nits: string[],
    limite = 3,
  ): Promise<Record<string, string[]>> {
    const limpios = Array.from(
      new Set(nits.map((n) => String(n ?? '').trim()).filter(Boolean)),
    );
    if (limpios.length === 0) return {};
    const lim = Math.min(Math.max(limite, 1), 10);
    const res = await this.pool.query<{ nit: string; punto: string }>(
      `SELECT nit, punto FROM (
         SELECT nit, punto,
                ROW_NUMBER() OVER (PARTITION BY nit ORDER BY ultima DESC) AS rn
           FROM (
             SELECT
               data->'cliente'->>'nit_cedula' AS nit,
               data->'punto'->>'nombre' AS punto,
               MAX(fecha) AS ultima
             FROM pedidos
             WHERE anulado = false
               AND data->'cliente'->>'nit_cedula' = ANY($1)
               AND COALESCE(data->'punto'->>'nombre', '') <> ''
             GROUP BY 1, 2
           ) agrupado
       ) numerado
       WHERE rn <= $2
       ORDER BY nit, rn`,
      [limpios, lim],
    );
    const mapa: Record<string, string[]> = {};
    for (const row of res.rows) {
      (mapa[row.nit] ??= []).push(row.punto);
    }
    return mapa;
  }

  async listar(
    q?: string,
    limit = 50,
    offset = 0,
  ): Promise<ListarResultado> {
    const lim = Math.min(Math.max(limit, 1), 200);
    const off = Math.max(offset, 0);

    const filtros: string[] = [];
    const valores: unknown[] = [];

    if (q && q.trim()) {
      valores.push(`%${q.trim()}%`);
      const p = `$${valores.length}`;
      filtros.push(
        `(nombre ILIKE ${p} OR nit_cedula ILIKE ${p} OR telefono ILIKE ${p} OR barrio ILIKE ${p} OR punto_venta ILIKE ${p})`,
      );
    }

    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const totalRes = await this.pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM clientes ${where}`,
      valores,
    );

    const itemsRes = await this.pool.query<ClienteRow>(
      `SELECT ${COLUMNS} FROM clientes
       ${where}
       ORDER BY nombre ASC NULLS LAST
       LIMIT ${lim} OFFSET ${off}`,
      valores,
    );

    return { items: itemsRes.rows, total: totalRes.rows[0].n };
  }

  /**
   * Estadísticas de clientes según la calidad de su ubicación:
   * - validados: coordenadas presentes y dentro de rango válido.
   * - incorrectos: tienen coordenadas pero son inválidas (0,0 o fuera de rango).
   * - sinVerificar: sin coordenadas (el mapa nunca se confirmó).
   */
  async estadisticas(): Promise<{
    total: number;
    validados: number;
    incorrectos: number;
    sinVerificar: number;
  }> {
    const res = await this.pool.query<{
      total: number;
      validados: number;
      incorrectos: number;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (
           WHERE direccion_incorrecta = false
             AND lat IS NOT NULL AND lng IS NOT NULL
             AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
             AND NOT (lat = 0 AND lng = 0)
         )::int AS validados,
         COUNT(*) FILTER (
           WHERE direccion_incorrecta = true
             OR (
               lat IS NOT NULL AND lng IS NOT NULL
               AND (
                 lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180
                 OR (lat = 0 AND lng = 0)
               )
             )
         )::int AS incorrectos
       FROM clientes`,
    );
    const total = res.rows[0]?.total ?? 0;
    const validados = res.rows[0]?.validados ?? 0;
    const incorrectos = res.rows[0]?.incorrectos ?? 0;
    return {
      total,
      validados,
      incorrectos,
      sinVerificar: total - validados - incorrectos,
    };
  }

  async obtener(id: string): Promise<ClienteRow> {
    const res = await this.pool.query<ClienteRow>(
      `SELECT ${COLUMNS} FROM clientes WHERE id = $1 LIMIT 1`,
      [id],
    );
    const cliente = res.rows[0];
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return cliente;
  }

  /** Lista de barrios distintos ya registrados (para autocompletar). */
  async listarBarrios(q?: string, ciudad?: string): Promise<string[]> {
    const filtros = ['barrio IS NOT NULL', "barrio <> ''"];
    const valores: unknown[] = [];

    if (ciudad && ciudad.trim()) {
      valores.push(ciudad.trim());
      filtros.push(`ciudad ILIKE $${valores.length}`);
    }
    if (q && q.trim()) {
      valores.push(`%${q.trim()}%`);
      filtros.push(`barrio ILIKE $${valores.length}`);
    }

    const res = await this.pool.query<{ barrio: string }>(
      `SELECT DISTINCT barrio FROM clientes
       WHERE ${filtros.join(' AND ')}
       ORDER BY barrio ASC
       LIMIT 30`,
      valores,
    );
    return res.rows.map((r) => r.barrio);
  }

  async findByNit(nit: string): Promise<ClienteRow | null> {
    const res = await this.pool.query<ClienteRow>(
      `SELECT ${COLUMNS} FROM clientes WHERE nit_cedula = $1 LIMIT 1`,
      [nit],
    );
    return res.rows[0] ?? null;
  }

  async crear(dto: CreateClienteDto): Promise<ClienteRow> {
    const nit = dto.nit_cedula.trim();
    const existe = await this.findByNit(nit);
    if (existe) {
      throw new ConflictException('Ya existe un cliente con ese NIT/cédula');
    }

    const res = await this.pool.query<ClienteRow>(
      `INSERT INTO clientes
         (nit_cedula, nombre, apellidos, direccion, referencia, barrio, ciudad, telefono, correo, punto_venta, lat, lng, activo, horeca, direccion_incorrecta, dias_despacho)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
       RETURNING ${COLUMNS}`,
      [
        nit,
        dto.nombre?.trim() ?? null,
        dto.apellidos?.trim() ?? null,
        dto.direccion?.trim() ?? null,
        dto.referencia?.trim() ?? null,
        dto.barrio?.trim() ?? null,
        dto.ciudad?.trim() ?? null,
        soloMovil(dto.telefono),
        dto.correo?.trim() ?? null,
        dto.punto_venta?.trim() ?? null,
        dto.lat ?? null,
        dto.lng ?? null,
        dto.activo ?? true,
        dto.horeca ?? false,
        dto.direccion_incorrecta ?? false,
        JSON.stringify(Array.isArray(dto.dias_despacho) ? dto.dias_despacho : []),
      ],
    );
    return res.rows[0];
  }

  async actualizar(id: string, dto: UpdateClienteDto): Promise<ClienteRow> {
    await this.obtener(id);

    if (dto.nit_cedula !== undefined) {
      const otro = await this.findByNit(dto.nit_cedula.trim());
      if (otro && otro.id !== id) {
        throw new ConflictException('Ya existe un cliente con ese NIT/cédula');
      }
    }

    const sets: string[] = [];
    const valores: unknown[] = [];
    let i = 1;

    const campos: Array<[keyof UpdateClienteDto, string]> = [
      ['nit_cedula', 'nit_cedula'],
      ['nombre', 'nombre'],
      ['apellidos', 'apellidos'],
      ['direccion', 'direccion'],
      ['referencia', 'referencia'],
      ['barrio', 'barrio'],
      ['ciudad', 'ciudad'],
      ['telefono', 'telefono'],
      ['correo', 'correo'],
      ['punto_venta', 'punto_venta'],
      ['lat', 'lat'],
      ['lng', 'lng'],
    ];

    for (const [campo, columna] of campos) {
      const valor = dto[campo];
      if (valor !== undefined) {
        sets.push(`${columna} = $${i++}`);
        const v = campo === 'telefono'
          ? soloMovil(typeof valor === 'string' ? valor : null)
          : (typeof valor === 'string' ? valor.trim() : valor);
        valores.push(v);
      }
    }

    if (dto.activo !== undefined) {
      sets.push(`activo = $${i++}`);
      valores.push(dto.activo);
    }

    if (dto.horeca !== undefined) {
      sets.push(`horeca = $${i++}`);
      valores.push(dto.horeca);
    }

    if (dto.direccion_incorrecta !== undefined) {
      sets.push(`direccion_incorrecta = $${i++}`);
      valores.push(dto.direccion_incorrecta);
    }

    if (dto.dias_despacho !== undefined) {
      sets.push(`dias_despacho = $${i++}::jsonb`);
      valores.push(JSON.stringify(Array.isArray(dto.dias_despacho) ? dto.dias_despacho : []));
    }

    if (sets.length === 0) {
      return this.obtener(id);
    }

    valores.push(id);
    const res = await this.pool.query<ClienteRow>(
      `UPDATE clientes SET ${sets.join(', ')}
       WHERE id = $${i}
       RETURNING ${COLUMNS}`,
      valores,
    );
    return res.rows[0];
  }

  async eliminar(id: string): Promise<{ id: string }> {
    const res = await this.pool.query(`DELETE FROM clientes WHERE id = $1`, [
      id,
    ]);
    if (res.rowCount === 0) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return { id };
  }

  /**
   * Importa/actualiza clientes desde un archivo Excel (BD Clientes).
   * Compara por NIT/cédula: crea los nuevos y actualiza los que cambiaron,
   * sin tocar los campos que el Excel no trae (correo, horeca, lat, lng).
   */
  async importarDesdeExcel(buffer: Buffer): Promise<ImportacionResumen> {
    let libro: XLSX.WorkBook;
    try {
      // Opciones de rendimiento: para .xlsm se omiten las macros (bookVBA),
      // fórmulas, estilos y formatos numéricos, que son lo que más ralentiza la
      // lectura. `dense` acelera el acceso a las celdas.
      libro = XLSX.read(buffer, {
        type: 'buffer',
        dense: true,
        bookVBA: false,
        cellFormula: false,
        cellHTML: false,
        cellNF: false,
        cellText: false,
        cellStyles: false,
        cellDates: false,
      });
    } catch {
      throw new BadRequestException('No se pudo leer el archivo Excel.');
    }

    const hoja =
      libro.Sheets['Clientes'] ?? libro.Sheets[libro.SheetNames[0]];
    if (!hoja) {
      throw new BadRequestException('El archivo no tiene ninguna hoja válida.');
    }

    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
      header: 1,
      blankrows: false,
      defval: null,
    });
    if (filas.length < 2) {
      throw new BadRequestException('El archivo no contiene datos de clientes.');
    }

    // Localiza las columnas por nombre de encabezado (tolerante a tildes/orden).
    const normEnc = (v: unknown) =>
      String(v ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
    const encabezados = (filas[0] as unknown[]).map(normEnc);
    const idxDe = (...alias: string[]) =>
      encabezados.findIndex((h) => alias.includes(h));

    const col = {
      nit: idxDe('nit_cedula', 'nit', 'cedula', 'nit/cedula'),
      nombre: idxDe('nombre', 'nombres'),
      direccion: idxDe('direccion'),
      referencia: idxDe('referencia'),
      barrio: idxDe('barrio'),
      ciudad: idxDe('ciudad'),
      telefono: idxDe('telefono', 'celular'),
      puntoVenta: idxDe('punto_venta', 'punto de venta', 'puntoventa', 'punto'),
    };
    if (col.nit < 0) {
      throw new BadRequestException(
        'No se encontró la columna Nit_Cedula en el archivo.',
      );
    }

    const limpiar = (valor: unknown): string | null => {
      if (valor === null || valor === undefined) return null;
      const texto = String(valor).trim();
      return texto === '' ? null : texto;
    };
    const valorCol = (fila: unknown[], indice: number): string | null =>
      indice >= 0 ? limpiar(fila[indice]) : null;

    // Deduplica por NIT (gana la última fila del archivo).
    const porNit = new Map<
      string,
      {
        nit: string;
        nombre: string | null;
        direccion: string | null;
        referencia: string | null;
        barrio: string | null;
        ciudad: string | null;
        telefono: string | null;
        puntoVenta: string | null;
      }
    >();
    let descartadas = 0;
    for (let i = 1; i < filas.length; i++) {
      const fila = filas[i] as unknown[];
      const nit = valorCol(fila, col.nit);
      if (!nit) {
        descartadas++;
        continue;
      }
      porNit.set(nit, {
        nit,
        nombre: valorCol(fila, col.nombre),
        direccion: valorCol(fila, col.direccion),
        referencia: valorCol(fila, col.referencia),
        barrio: valorCol(fila, col.barrio),
        ciudad: valorCol(fila, col.ciudad),
        telefono: soloMovil(valorCol(fila, col.telefono)),
        puntoVenta: valorCol(fila, col.puntoVenta),
      });
    }

    // Carga los clientes existentes (campos comparables) en memoria.
    const existentesRes = await this.pool.query<{
      nit_cedula: string;
      nombre: string | null;
      direccion: string | null;
      referencia: string | null;
      barrio: string | null;
      ciudad: string | null;
      telefono: string | null;
      punto_venta: string | null;
    }>(
      `SELECT nit_cedula, nombre, direccion, referencia, barrio, ciudad, telefono, punto_venta
       FROM clientes`,
    );
    const existentes = new Map(
      existentesRes.rows.map((r) => [r.nit_cedula, r]),
    );

    const nuevos: Array<ReturnType<typeof porNit.get>> = [];
    const cambiados: Array<NonNullable<ReturnType<typeof porNit.get>>> = [];
    // Cambió SOLO el punto de venta (no la dirección): se actualiza sin tocar
    // las coordenadas verificadas del cliente.
    const soloPunto: Array<NonNullable<ReturnType<typeof porNit.get>>> = [];
    // Normaliza para COMPARAR: ignora mayúsculas/minúsculas, tildes y espacios
    // repetidos. Así un cliente cuya única "diferencia" es de formato (p. ej. el
    // Excel viene en MAYÚSCULAS o sin tildes) NO se marca como cambiado y
    // conserva su ubicación verificada.
    const comparable = (v: string | null | undefined): string =>
      (v ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    for (const reg of porNit.values()) {
      const actual = existentes.get(reg.nit);
      if (!actual) {
        nuevos.push(reg);
        continue;
      }
      const difiere =
        comparable(actual.nombre) !== comparable(reg.nombre) ||
        comparable(actual.direccion) !== comparable(reg.direccion) ||
        comparable(actual.referencia) !== comparable(reg.referencia) ||
        comparable(actual.barrio) !== comparable(reg.barrio) ||
        comparable(actual.ciudad) !== comparable(reg.ciudad) ||
        comparable(actual.telefono) !== comparable(reg.telefono);
      const difierePunto =
        comparable(actual.punto_venta) !== comparable(reg.puntoVenta);
      if (difiere) cambiados.push(reg);
      else if (difierePunto) soloPunto.push(reg);
    }

    let creados = 0;
    let actualizados = 0;
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');

      // Inserta en lotes de 500 filas.
      const LOTE = 500;
      for (let i = 0; i < nuevos.length; i += LOTE) {
        const grupo = nuevos.slice(i, i + LOTE).filter(Boolean) as NonNullable<
          ReturnType<typeof porNit.get>
        >[];
        if (grupo.length === 0) continue;
        const valores: unknown[] = [];
        const tuplas = grupo.map((r, j) => {
          const base = j * 8;
          valores.push(
            r.nit,
            r.nombre,
            r.direccion,
            r.referencia,
            r.barrio,
            r.ciudad,
            r.telefono,
            r.puntoVenta,
          );
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
        });
        const res = await cliente.query(
          `INSERT INTO clientes
             (nit_cedula, nombre, direccion, referencia, barrio, ciudad, telefono, punto_venta)
           VALUES ${tuplas.join(', ')}`,
          valores,
        );
        creados += res.rowCount ?? 0;
      }

      // Actualiza en LOTES los clientes cuya dirección cambió. Al cambiar los
      // datos se limpian las coordenadas (lat/lng = NULL) para que el cliente
      // quede "sin verificar". Se usa UPDATE ... FROM (VALUES ...) para hacer
      // muchas filas en una sola consulta (mucho más rápido que una por una).
      for (let i = 0; i < cambiados.length; i += LOTE) {
        const grupo = cambiados.slice(i, i + LOTE);
        if (grupo.length === 0) continue;
        const valores: unknown[] = [];
        const tuplas = grupo.map((r, j) => {
          const b = j * 8;
          valores.push(
            r.nit,
            r.nombre,
            r.direccion,
            r.referencia,
            r.barrio,
            r.ciudad,
            r.telefono,
            r.puntoVenta,
          );
          // La primera fila lleva casts ::text para fijar el tipo de cada
          // columna del VALUES (si toda una columna viniera NULL, sin cast
          // Postgres no podría inferir el tipo).
          const c = j === 0 ? '::text' : '';
          return `($${b + 1}${c}, $${b + 2}${c}, $${b + 3}${c}, $${b + 4}${c}, $${b + 5}${c}, $${b + 6}${c}, $${b + 7}${c}, $${b + 8}${c})`;
        });
        const res = await cliente.query(
          `UPDATE clientes c SET
             nombre = v.nombre, direccion = v.direccion, referencia = v.referencia,
             barrio = v.barrio, ciudad = v.ciudad, telefono = v.telefono,
             punto_venta = v.punto_venta, lat = NULL, lng = NULL
           FROM (VALUES ${tuplas.join(', ')})
             AS v(nit, nombre, direccion, referencia, barrio, ciudad, telefono, punto_venta)
           WHERE c.nit_cedula = v.nit`,
          valores,
        );
        actualizados += res.rowCount ?? 0;
      }

      // Cambió solo el punto de venta: se actualiza en LOTES SIN tocar la
      // ubicación (conserva las coordenadas verificadas).
      // COMENTADO: El punto de venta NO debe cambiar durante la importación.
      // Se mantiene el punto actual asignado al cliente.
      /*
      for (let i = 0; i < soloPunto.length; i += LOTE) {
        const grupo = soloPunto.slice(i, i + LOTE);
        if (grupo.length === 0) continue;
        const valores: unknown[] = [];
        const tuplas = grupo.map((r, j) => {
          const b = j * 2;
          valores.push(r.nit, r.puntoVenta);
          const c = j === 0 ? '::text' : '';
          return `($${b + 1}${c}, $${b + 2}${c})`;
        });
        const res = await cliente.query(
          `UPDATE clientes c SET punto_venta = v.punto_venta
           FROM (VALUES ${tuplas.join(', ')}) AS v(nit, punto_venta)
           WHERE c.nit_cedula = v.nit`,
          valores,
        );
        actualizados += res.rowCount ?? 0;
      }
      */

      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw new BadRequestException(
        `No se pudo importar: ${e instanceof Error ? e.message : 'error desconocido'}`,
      );
    } finally {
      cliente.release();
    }

    return {
      totalFilas: porNit.size,
      creados,
      actualizados,
      sinCambios: porNit.size - creados - actualizados,
      descartadas,
    };
  }
}
