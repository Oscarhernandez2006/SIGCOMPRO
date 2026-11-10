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
  fundacion: boolean;
  direccion_incorrecta: boolean;
  dias_despacho: string[];
  vendedor_asignado: string | null;
  creado_en: string;
  /** Solo en la respuesta de actualizar: alternas marcadas/desmarcadas como fundación. */
  alternas_actualizadas?: number;
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
  'id, nit_cedula, nombre, apellidos, direccion, referencia, barrio, ciudad, telefono, correo, punto_venta, lat, lng, activo, horeca, fundacion, direccion_incorrecta, dias_despacho, vendedor_asignado, creado_en';

/** "901727043-3" -> "901727043"; si no es una dirección alterna devuelve null. */
function nitBaseDeAlterna(nit: string): string | null {
  const m = nit.trim().match(/^(.+)-\d+$/);
  return m ? m[1] : null;
}

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
    // Fundación: clientes con direcciones alternas ("<nit>-N") a las que se
    // envían pedidos desde "Puntos de envío" en Despacho.
    await this.pool.query(
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fundacion boolean NOT NULL DEFAULT false`,
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
    // Vendedor de Siesa asignado al cliente (informativo, viene del ERP).
    await this.pool.query(
      `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS vendedor_asignado text`,
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

    // Alternas "<nit>-N" en orden natural (original, -1, -2, … -10), no de texto.
    const ordenNit = `regexp_replace(nit_cedula, '-\\d+$', '') ASC,
       COALESCE(substring(nit_cedula from '-(\\d+)$')::numeric, 0) ASC`;
    const buscaNit = !!q && /^[\d\s.-]+$/.test(q.trim());
    const itemsRes = await this.pool.query<ClienteRow>(
      `SELECT ${COLUMNS} FROM clientes
       ${where}
       ORDER BY ${buscaNit ? `${ordenNit}, nombre ASC NULLS LAST` : `nombre ASC NULLS LAST, ${ordenNit}`}
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

    // Una dirección alterna nueva hereda la clasificación Fundación de su código original.
    const base = nitBaseDeAlterna(nit);
    let fundacion = dto.fundacion ?? false;
    if (dto.fundacion === undefined && base) {
      const orig = await this.findByNit(base);
      fundacion = !!orig?.fundacion;
    }
    const horeca = fundacion ? false : (dto.horeca ?? false);

    const res = await this.pool.query<ClienteRow>(
      `INSERT INTO clientes
         (nit_cedula, nombre, apellidos, direccion, referencia, barrio, ciudad, telefono, correo, punto_venta, lat, lng, activo, horeca, direccion_incorrecta, dias_despacho, vendedor_asignado, fundacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18)
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
        horeca,
        dto.direccion_incorrecta ?? false,
        JSON.stringify(Array.isArray(dto.dias_despacho) ? dto.dias_despacho : []),
        dto.vendedor_asignado?.trim() ?? null,
        fundacion,
      ],
    );
    const creado = res.rows[0];
    if (!base && fundacion) {
      creado.alternas_actualizadas = await this.propagarFundacion(nit, true);
    }
    return creado;
  }

  /**
   * Marca (o desmarca) como fundación todas las direcciones alternas
   * ("<nit>-1", "<nit>-2", …) de un código original. Devuelve cuántas cambiaron.
   */
  private async propagarFundacion(nitBase: string, valor: boolean): Promise<number> {
    const res = await this.pool.query(
      `UPDATE clientes
          SET fundacion = $2,
              horeca = CASE WHEN $2 THEN false ELSE horeca END,
              dias_despacho = CASE WHEN $2 THEN '[]'::jsonb ELSE dias_despacho END
        WHERE left(nit_cedula, length($1) + 1) = $1 || '-'
          AND substr(nit_cedula, length($1) + 2) ~ '^[0-9]+$'
          AND fundacion IS DISTINCT FROM $2`,
      [nitBase.trim(), valor],
    );
    return res.rowCount ?? 0;
  }

  async actualizar(id: string, dto: UpdateClienteDto): Promise<ClienteRow> {
    const anterior = await this.obtener(id);

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
      ['vendedor_asignado', 'vendedor_asignado'],
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

    // Hogar / HORECA / Fundación son excluyentes.
    let horeca = dto.horeca;
    const fundacion = dto.fundacion;
    if (fundacion === true) horeca = false;
    if (horeca !== undefined) {
      sets.push(`horeca = $${i++}`);
      valores.push(horeca);
    }
    if (fundacion !== undefined || horeca === true) {
      sets.push(`fundacion = $${i++}`);
      valores.push(horeca === true ? false : fundacion);
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
    const actualizado = res.rows[0];
    // Al cambiar la fundación del código original, se aplica a todas sus alternas.
    if (!nitBaseDeAlterna(actualizado.nit_cedula) && actualizado.fundacion !== anterior.fundacion) {
      actualizado.alternas_actualizadas = await this.propagarFundacion(
        actualizado.nit_cedula,
        actualizado.fundacion,
      );
    }
    return actualizado;
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
   * Importa/actualiza clientes desde un archivo Excel (el que se descarga en
   * «Descargar Excel» o la BD Clientes externa). Compara por NIT/cédula: crea
   * los nuevos y aplica a los existentes lo que cambió en las columnas que trae
   * el archivo (las que no trae se conservan). El punto de venta de un cliente
   * existente no se cambia. Si la dirección cambia de fondo se borran las
   * coordenadas (queda «sin verificar»), salvo que el archivo traiga Lat/Lng nuevas.
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
      nit: idxDe('nit_cedula', 'nit', 'cedula', 'nit/cedula', 'nit cedula'),
      nombre: idxDe('nombre', 'nombres'),
      apellidos: idxDe('apellidos', 'apellido'),
      direccion: idxDe('direccion'),
      referencia: idxDe('referencia'),
      barrio: idxDe('barrio'),
      ciudad: idxDe('ciudad'),
      telefono: idxDe('telefono', 'celular'),
      correo: idxDe('correo', 'email', 'e-mail'),
      puntoVenta: idxDe('punto_venta', 'punto venta', 'punto de venta', 'puntoventa', 'punto'),
      activo: idxDe('activo'),
      horeca: idxDe('horeca'),
      fundacion: idxDe('fundacion'),
      dias: idxDe('dias despacho', 'dias_despacho', 'dias de despacho'),
      lat: idxDe('lat', 'latitud'),
      lng: idxDe('lng', 'lon', 'longitud'),
    };
    if (col.nit < 0) {
      throw new BadRequestException(
        'No se encontró la columna Nit_Cedula en el archivo.',
      );
    }

    /** Texto limpio: sin espacios sobrantes; vacío = null. */
    const limpiar = (valor: unknown): string | null => {
      if (valor === null || valor === undefined) return null;
      const texto = String(valor).replace(/\s+/g, ' ').trim();
      return texto === '' ? null : texto;
    };
    const valorCol = (fila: unknown[], indice: number): string | null =>
      indice >= 0 ? limpiar(fila[indice]) : null;
    const leerBool = (v: string | null): boolean | undefined => {
      const t = normEnc(v);
      if (['si', 's', 'true', '1', 'x', 'yes'].includes(t)) return true;
      if (['no', 'n', 'false', '0'].includes(t)) return false;
      return undefined;
    };
    const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
    const leerDias = (v: string | null): string[] =>
      DIAS.filter((d) =>
        normEnc(v)
          .split(/[\/,;\s-]+/)
          .some((p) => p.slice(0, 3) === d),
      );
    /** Número de coordenada; `undefined` si la celda trae algo que no es número. */
    const leerCoord = (v: string | null): number | null | undefined => {
      if (v === null) return null;
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    };

    // Solo se tocan las columnas que trae el archivo (el resto se conserva).
    type Fila = {
      nit: string;
      nombre?: string | null;
      apellidos?: string | null;
      direccion?: string | null;
      referencia?: string | null;
      barrio?: string | null;
      ciudad?: string | null;
      telefono?: string | null;
      /** Teléfono escrito pero no es un celular de 10 dígitos (se ignora). */
      telefonoInvalido?: boolean;
      correo?: string | null;
      puntoVenta?: string | null;
      activo?: boolean;
      horeca?: boolean;
      fundacion?: boolean;
      dias?: string[];
      lat?: number | null;
      lng?: number | null;
    };
    const tiene = (i: number) => i >= 0;

    // Deduplica por NIT (gana la última fila del archivo).
    const porNit = new Map<string, Fila>();
    let descartadas = 0;
    for (let i = 1; i < filas.length; i++) {
      const fila = filas[i] as unknown[];
      const nit = valorCol(fila, col.nit);
      if (!nit) {
        descartadas++;
        continue;
      }
      const reg: Fila = { nit };
      if (tiene(col.nombre)) reg.nombre = valorCol(fila, col.nombre);
      if (tiene(col.apellidos)) reg.apellidos = valorCol(fila, col.apellidos);
      if (tiene(col.direccion)) reg.direccion = valorCol(fila, col.direccion);
      if (tiene(col.referencia)) reg.referencia = valorCol(fila, col.referencia);
      if (tiene(col.barrio)) reg.barrio = valorCol(fila, col.barrio);
      if (tiene(col.ciudad)) reg.ciudad = valorCol(fila, col.ciudad);
      if (tiene(col.telefono)) {
        const crudo = valorCol(fila, col.telefono);
        reg.telefono = soloMovil(crudo);
        reg.telefonoInvalido = !!crudo && !reg.telefono;
      }
      if (tiene(col.correo)) reg.correo = valorCol(fila, col.correo);
      if (tiene(col.puntoVenta)) reg.puntoVenta = valorCol(fila, col.puntoVenta);
      if (tiene(col.activo)) reg.activo = leerBool(valorCol(fila, col.activo));
      if (tiene(col.horeca)) reg.horeca = leerBool(valorCol(fila, col.horeca));
      if (tiene(col.fundacion)) reg.fundacion = leerBool(valorCol(fila, col.fundacion));
      if (reg.fundacion) reg.horeca = false;
      if (tiene(col.dias)) reg.dias = leerDias(valorCol(fila, col.dias));
      if (tiene(col.lat) && tiene(col.lng)) {
        const lat = leerCoord(valorCol(fila, col.lat));
        const lng = leerCoord(valorCol(fila, col.lng));
        if (lat !== undefined && lng !== undefined) {
          reg.lat = lat;
          reg.lng = lng;
        }
      }
      porNit.set(nit, reg);
    }

    // Carga los clientes existentes en memoria para comparar.
    type Existente = {
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
      fundacion: boolean;
      direccion_incorrecta: boolean;
      dias_despacho: string[] | null;
    };
    const existentesRes = await this.pool.query<Existente>(
      `SELECT nit_cedula, nombre, apellidos, direccion, referencia, barrio, ciudad,
              telefono, correo, punto_venta, lat, lng, activo, horeca, fundacion,
              direccion_incorrecta, dias_despacho
       FROM clientes`,
    );
    const existentes = new Map(
      existentesRes.rows.map((r) => [r.nit_cedula, r]),
    );

    // Igualdad EXACTA (respeta mayúsculas y tildes) para que se apliquen las
    // correcciones de formato hechas en el Excel.
    const igual = (a: string | null | undefined, b: string | null | undefined) =>
      limpiar(a) === limpiar(b);
    // Igualdad "de fondo" (sin mayúsculas/tildes): si la dirección solo cambió
    // de formato, se conservan las coordenadas verificadas.
    const comparable = (v: string | null | undefined): string =>
      (v ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    const mismaCoord = (a: number | null | undefined, b: number | null | undefined) =>
      a == null || b == null ? a == null && b == null : Math.abs(Number(a) - Number(b)) < 1e-7;

    const nuevos: Fila[] = [];
    // Fila final (existente + correcciones del archivo) de los que cambiaron.
    const cambiados: Existente[] = [];
    // Códigos originales cuya fundación cambió: se propaga a sus alternas.
    const fundacionCambiada = new Map<string, boolean>();
    for (const reg of porNit.values()) {
      const actual = existentes.get(reg.nit);
      if (!actual) {
        nuevos.push(reg);
        continue;
      }
      const final: Existente = { ...actual, dias_despacho: actual.dias_despacho ?? [] };
      let cambio = false;
      const textos = ['nombre', 'apellidos', 'direccion', 'referencia', 'barrio', 'ciudad', 'correo'] as const;
      for (const k of textos) {
        if (reg[k] !== undefined && !igual(actual[k], reg[k])) {
          final[k] = reg[k] ?? null;
          cambio = true;
        }
      }
      if (reg.telefono !== undefined && !reg.telefonoInvalido && !igual(actual.telefono, reg.telefono)) {
        final.telefono = reg.telefono;
        cambio = true;
      }
      if (reg.activo !== undefined && reg.activo !== actual.activo) {
        final.activo = reg.activo;
        cambio = true;
      }
      if (reg.horeca !== undefined && reg.horeca !== actual.horeca) {
        final.horeca = reg.horeca;
        if (reg.horeca) final.fundacion = false;
        cambio = true;
      }
      if (reg.fundacion !== undefined && reg.fundacion !== final.fundacion) {
        final.fundacion = reg.fundacion;
        cambio = true;
      }
      if (final.fundacion !== actual.fundacion && !nitBaseDeAlterna(reg.nit)) {
        fundacionCambiada.set(reg.nit, final.fundacion);
      }
      const diasActuales = DIAS.filter((d) => (actual.dias_despacho ?? []).includes(d));
      if (reg.dias !== undefined && reg.dias.join('/') !== diasActuales.join('/')) {
        final.dias_despacho = reg.dias;
        cambio = true;
      }
      const coordsEditadas =
        reg.lat !== undefined && (!mismaCoord(actual.lat, reg.lat) || !mismaCoord(actual.lng, reg.lng));
      const ubicacionCambio = (['direccion', 'barrio', 'ciudad'] as const).some(
        (k) => reg[k] !== undefined && comparable(actual[k]) !== comparable(reg[k]),
      );
      if (coordsEditadas) {
        final.lat = reg.lat ?? null;
        final.lng = reg.lng ?? null;
        final.direccion_incorrecta = false;
        cambio = true;
      } else if (ubicacionCambio) {
        // Dirección distinta: las coordenadas anteriores ya no sirven; el
        // cliente queda "sin verificar".
        final.lat = null;
        final.lng = null;
        final.direccion_incorrecta = false;
      }
      // El punto de venta NO cambia en la importación (se conserva el asignado).
      if (cambio) cambiados.push(final);
    }

    let creados = 0;
    let actualizados = 0;
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');

      const LOTE = 500;
      for (let i = 0; i < nuevos.length; i += LOTE) {
        const grupo = nuevos.slice(i, i + LOTE);
        const valores: unknown[] = [];
        const tuplas = grupo.map((r, j) => {
          const b = j * 16;
          valores.push(
            r.nit,
            r.nombre ?? null,
            r.apellidos ?? null,
            r.direccion ?? null,
            r.referencia ?? null,
            r.barrio ?? null,
            r.ciudad ?? null,
            r.telefono ?? null,
            r.correo ?? null,
            r.puntoVenta ?? null,
            r.lat ?? null,
            r.lng ?? null,
            r.activo ?? true,
            r.horeca ?? false,
            JSON.stringify(r.dias ?? []),
            r.fundacion ?? false,
          );
          const p = (n: number) => `$${b + n}`;
          return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, ${p(10)}, ${p(11)}::float8, ${p(12)}::float8, ${p(13)}::boolean, ${p(14)}::boolean, ${p(15)}::jsonb, ${p(16)}::boolean)`;
        });
        const res = await cliente.query(
          `INSERT INTO clientes
             (nit_cedula, nombre, apellidos, direccion, referencia, barrio, ciudad, telefono,
              correo, punto_venta, lat, lng, activo, horeca, dias_despacho, fundacion)
           VALUES ${tuplas.join(', ')}`,
          valores,
        );
        creados += res.rowCount ?? 0;
      }

      // Actualiza en LOTES con UPDATE ... FROM (VALUES ...): cada fila lleva
      // su versión final (lo existente + lo corregido en el archivo).
      for (let i = 0; i < cambiados.length; i += LOTE) {
        const grupo = cambiados.slice(i, i + LOTE);
        const valores: unknown[] = [];
        const tuplas = grupo.map((r, j) => {
          const b = j * 16;
          valores.push(
            r.nit_cedula,
            r.nombre,
            r.apellidos,
            r.direccion,
            r.referencia,
            r.barrio,
            r.ciudad,
            r.telefono,
            r.correo,
            r.lat,
            r.lng,
            r.activo,
            r.horeca,
            r.direccion_incorrecta,
            JSON.stringify(r.dias_despacho ?? []),
            r.fundacion,
          );
          const p = (n: number) => `$${b + n}`;
          // Casts en todas las filas: si una columna viene toda NULL, Postgres
          // no podría inferir su tipo.
          return `(${p(1)}::text, ${p(2)}::text, ${p(3)}::text, ${p(4)}::text, ${p(5)}::text, ${p(6)}::text, ${p(7)}::text, ${p(8)}::text, ${p(9)}::text, ${p(10)}::float8, ${p(11)}::float8, ${p(12)}::boolean, ${p(13)}::boolean, ${p(14)}::boolean, ${p(15)}::jsonb, ${p(16)}::boolean)`;
        });
        const res = await cliente.query(
          `UPDATE clientes c SET
             nombre = v.nombre, apellidos = v.apellidos, direccion = v.direccion,
             referencia = v.referencia, barrio = v.barrio, ciudad = v.ciudad,
             telefono = v.telefono, correo = v.correo, lat = v.lat, lng = v.lng,
             activo = v.activo, horeca = v.horeca,
             direccion_incorrecta = v.direccion_incorrecta, dias_despacho = v.dias,
             fundacion = v.fundacion
           FROM (VALUES ${tuplas.join(', ')})
             AS v(nit, nombre, apellidos, direccion, referencia, barrio, ciudad, telefono,
                  correo, lat, lng, activo, horeca, direccion_incorrecta, dias, fundacion)
           WHERE c.nit_cedula = v.nit`,
          valores,
        );
        actualizados += res.rowCount ?? 0;
      }

      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw new BadRequestException(
        `No se pudo importar: ${e instanceof Error ? e.message : 'error desconocido'}`,
      );
    } finally {
      cliente.release();
    }

    // Fundación: los códigos originales que cambiaron (o llegaron nuevos como
    // fundación) la aplican a sus alternas; las alternas nuevas sin la columna
    // heredan la de su código original.
    for (const r of nuevos) {
      if (r.fundacion && !nitBaseDeAlterna(r.nit)) fundacionCambiada.set(r.nit, true);
    }
    for (const [nit, valor] of fundacionCambiada) {
      await this.propagarFundacion(nit, valor);
    }
    const alternasNuevas = nuevos
      .filter((r) => r.fundacion === undefined && nitBaseDeAlterna(r.nit))
      .map((r) => r.nit);
    if (alternasNuevas.length > 0) {
      await this.pool.query(
        `UPDATE clientes a
            SET fundacion = true, horeca = false, dias_despacho = '[]'::jsonb
           FROM clientes b
          WHERE a.nit_cedula = ANY($1::text[])
            AND b.nit_cedula = regexp_replace(a.nit_cedula, '-[0-9]+$', '')
            AND b.fundacion AND NOT a.fundacion`,
        [alternasNuevas],
      );
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
