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
  direccion: string | null;
  referencia: string | null;
  barrio: string | null;
  ciudad: string | null;
  telefono: string | null;
  correo: string | null;
  lat: number | null;
  lng: number | null;
  activo: boolean;
  horeca: boolean;
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
  'id, nit_cedula, nombre, direccion, referencia, barrio, ciudad, telefono, correo, lat, lng, activo, horeca, creado_en';

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
        `(nombre ILIKE ${p} OR nit_cedula ILIKE ${p} OR telefono ILIKE ${p} OR barrio ILIKE ${p})`,
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
         (nit_cedula, nombre, direccion, referencia, barrio, ciudad, telefono, correo, lat, lng, activo, horeca)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${COLUMNS}`,
      [
        nit,
        dto.nombre?.trim() ?? null,
        dto.direccion?.trim() ?? null,
        dto.referencia?.trim() ?? null,
        dto.barrio?.trim() ?? null,
        dto.ciudad?.trim() ?? null,
        dto.telefono?.trim() ?? null,
        dto.correo?.trim() ?? null,
        dto.lat ?? null,
        dto.lng ?? null,
        dto.activo ?? true,
        dto.horeca ?? false,
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
      ['direccion', 'direccion'],
      ['referencia', 'referencia'],
      ['barrio', 'barrio'],
      ['ciudad', 'ciudad'],
      ['telefono', 'telefono'],
      ['correo', 'correo'],
      ['lat', 'lat'],
      ['lng', 'lng'],
    ];

    for (const [campo, columna] of campos) {
      const valor = dto[campo];
      if (valor !== undefined) {
        sets.push(`${columna} = $${i++}`);
        valores.push(typeof valor === 'string' ? valor.trim() : valor);
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
      libro = XLSX.read(buffer, { type: 'buffer' });
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
        telefono: valorCol(fila, col.telefono),
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
    }>(
      `SELECT nit_cedula, nombre, direccion, referencia, barrio, ciudad, telefono
       FROM clientes`,
    );
    const existentes = new Map(
      existentesRes.rows.map((r) => [r.nit_cedula, r]),
    );

    const nuevos: Array<ReturnType<typeof porNit.get>> = [];
    const cambiados: Array<NonNullable<ReturnType<typeof porNit.get>>> = [];
    for (const reg of porNit.values()) {
      const actual = existentes.get(reg.nit);
      if (!actual) {
        nuevos.push(reg);
        continue;
      }
      const difiere =
        (actual.nombre ?? null) !== reg.nombre ||
        (actual.direccion ?? null) !== reg.direccion ||
        (actual.referencia ?? null) !== reg.referencia ||
        (actual.barrio ?? null) !== reg.barrio ||
        (actual.ciudad ?? null) !== reg.ciudad ||
        (actual.telefono ?? null) !== reg.telefono;
      if (difiere) cambiados.push(reg);
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
          const base = j * 7;
          valores.push(
            r.nit,
            r.nombre,
            r.direccion,
            r.referencia,
            r.barrio,
            r.ciudad,
            r.telefono,
          );
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
        });
        const res = await cliente.query(
          `INSERT INTO clientes
             (nit_cedula, nombre, direccion, referencia, barrio, ciudad, telefono)
           VALUES ${tuplas.join(', ')}`,
          valores,
        );
        creados += res.rowCount ?? 0;
      }

      // Actualiza solo los campos provenientes del Excel.
      for (const r of cambiados) {
        const res = await cliente.query(
          `UPDATE clientes
             SET nombre = $2, direccion = $3, referencia = $4,
                 barrio = $5, ciudad = $6, telefono = $7
           WHERE nit_cedula = $1`,
          [
            r.nit,
            r.nombre,
            r.direccion,
            r.referencia,
            r.barrio,
            r.ciudad,
            r.telefono,
          ],
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

    return {
      totalFilas: porNit.size,
      creados,
      actualizados,
      sinCambios: porNit.size - creados - actualizados,
      descartadas,
    };
  }
}
