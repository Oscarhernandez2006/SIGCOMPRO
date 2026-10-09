import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import * as https from 'https';
import { promises as dnsPromises } from 'dns';
import { Resolver as DnsResolver } from 'dns/promises';
import { randomUUID } from 'node:crypto';
import { Inject } from '@nestjs/common';
import { PG_POOL } from '../database/database.module';

// ── Tipos ────────────────────────────────────────────────────────────────
export interface RunErrandsPuntoVenta {
  id: string;
  indicador: number;
  nombre: string;
  activo: boolean;
  creadoEn: string;
}

export interface RunErrandsDomiciliario {
  id: string;
  nombre: string;
  telefono: string | null;
  cedula: string | null;
  email: string | null;
  puntoVentaId: string | null;
  activo: boolean;
  creadoEn: string;
  puntoVenta?: RunErrandsPuntoVenta | null;
}

export interface RunErrandsCliente {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  referencia: string | null;
  barrio: string | null;
  ciudad: string | null;
  region: string | null;
  telefono: string | null;
  email: string | null;
  observaciones: string | null;
  activo: boolean;
  creadoEn: string;
}

export interface RunErrandsPedido {
  id: string;
  numeroPedido: string;
  clienteId: string;
  puntoVentaId: string | null;
  domiciliarioId: string | null;
  kilos: number;
  estado: string;
  observaciones: string | null;
  fecha: string;
  usuario: string | null;
  creadoEn: string;
  drivinEstadoEnvio: string;
  drivinMensajeEnvio: string | null;
  drivinEstadoEntrega: string | null;
  drivinMotivoEntrega: string | null;
  drivinSyncAt: string | null;
  drivinSchemaName: string | null;
  cliente?: RunErrandsCliente;
  puntoVenta?: RunErrandsPuntoVenta | null;
  domiciliario?: RunErrandsDomiciliario | null;
}

export const ESTADOS_PEDIDO = ['REVISADO', 'EN_PROCESO', 'ENTREGADO', 'CANCELADO'];

// ── Mapeo de filas (snake_case en BD -> camelCase) ──────────────────────
function mapPdv(r: Record<string, unknown>): RunErrandsPuntoVenta {
  return {
    id: r.id as string,
    indicador: Number(r.indicador),
    nombre: r.nombre as string,
    activo: Boolean(r.activo),
    creadoEn: (r.creado_en as Date)?.toString?.() ?? String(r.creado_en),
  };
}
function mapDomiciliario(r: Record<string, unknown>): RunErrandsDomiciliario {
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    telefono: (r.telefono as string) ?? null,
    cedula: (r.cedula as string) ?? null,
    email: (r.email as string) ?? null,
    puntoVentaId: (r.punto_venta_id as string) ?? null,
    activo: Boolean(r.activo),
    creadoEn: String(r.creado_en),
    puntoVenta: r.pdv_nombre
      ? {
          id: r.punto_venta_id as string,
          indicador: Number(r.pdv_indicador),
          nombre: r.pdv_nombre as string,
          activo: Boolean(r.pdv_activo),
          creadoEn: '',
        }
      : null,
  };
}
function mapCliente(r: Record<string, unknown>): RunErrandsCliente {
  return {
    id: r.id as string,
    codigo: r.codigo as string,
    nombre: r.nombre as string,
    direccion: (r.direccion as string) ?? null,
    referencia: (r.referencia as string) ?? null,
    barrio: (r.barrio as string) ?? null,
    ciudad: (r.ciudad as string) ?? null,
    region: (r.region as string) ?? null,
    telefono: (r.telefono as string) ?? null,
    email: (r.email as string) ?? null,
    observaciones: (r.observaciones as string) ?? null,
    activo: Boolean(r.activo),
    creadoEn: String(r.creado_en),
  };
}
function mapPedido(r: Record<string, unknown>): RunErrandsPedido {
  return {
    id: r.id as string,
    numeroPedido: r.numero_pedido as string,
    clienteId: r.cliente_id as string,
    puntoVentaId: (r.punto_venta_id as string) ?? null,
    domiciliarioId: (r.domiciliario_id as string) ?? null,
    kilos: Number(r.kilos),
    estado: r.estado as string,
    observaciones: (r.observaciones as string) ?? null,
    fecha: String(r.fecha),
    usuario: (r.usuario as string) ?? null,
    creadoEn: String(r.creado_en),
    drivinEstadoEnvio: r.drivin_estado_envio as string,
    drivinMensajeEnvio: (r.drivin_mensaje_envio as string) ?? null,
    drivinEstadoEntrega: (r.drivin_estado_entrega as string) ?? null,
    drivinMotivoEntrega: (r.drivin_motivo_entrega as string) ?? null,
    drivinSyncAt: r.drivin_sync_at ? String(r.drivin_sync_at) : null,
    drivinSchemaName: (r.drivin_schema_name as string) ?? null,
    cliente: r.cli_codigo
      ? {
          id: r.cliente_id as string,
          codigo: r.cli_codigo as string,
          nombre: r.cli_nombre as string,
          direccion: (r.cli_direccion as string) ?? null,
          referencia: (r.cli_referencia as string) ?? null,
          barrio: (r.cli_barrio as string) ?? null,
          ciudad: (r.cli_ciudad as string) ?? null,
          region: (r.cli_region as string) ?? null,
          telefono: (r.cli_telefono as string) ?? null,
          email: (r.cli_email as string) ?? null,
          observaciones: null,
          activo: true,
          creadoEn: '',
        }
      : undefined,
    puntoVenta: r.pdv_nombre
      ? {
          id: r.punto_venta_id as string,
          indicador: Number(r.pdv_indicador),
          nombre: r.pdv_nombre as string,
          activo: true,
          creadoEn: '',
        }
      : null,
    domiciliario: r.dom_nombre
      ? {
          id: r.domiciliario_id as string,
          nombre: r.dom_nombre as string,
          telefono: (r.dom_telefono as string) ?? null,
          cedula: null,
          email: null,
          puntoVentaId: null,
          activo: true,
          creadoEn: '',
        }
      : null,
  };
}

@Injectable()
export class RunErrandsService implements OnModuleInit {
  private readonly logger = new Logger(RunErrandsService.name);
  private drivinIp: { ip: string; ts: number } | null = null;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS run_errands_puntos_venta (
        id text PRIMARY KEY,
        indicador integer NOT NULL UNIQUE,
        nombre text NOT NULL,
        activo boolean NOT NULL DEFAULT true,
        creado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS run_errands_domiciliarios (
        id text PRIMARY KEY,
        nombre text NOT NULL,
        telefono text NULL,
        cedula text NULL,
        email text NULL,
        punto_venta_id text NULL REFERENCES run_errands_puntos_venta(id),
        activo boolean NOT NULL DEFAULT true,
        creado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS run_errands_domiciliarios_pdv_idx ON run_errands_domiciliarios(punto_venta_id)`,
    );
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS run_errands_clientes (
        id text PRIMARY KEY,
        codigo text NOT NULL UNIQUE,
        nombre text NOT NULL,
        direccion text NULL,
        referencia text NULL,
        barrio text NULL,
        ciudad text NULL,
        region text NULL,
        telefono text NULL,
        email text NULL,
        observaciones text NULL,
        activo boolean NOT NULL DEFAULT true,
        creado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS run_errands_pedidos (
        id text PRIMARY KEY,
        numero_pedido text NOT NULL UNIQUE,
        cliente_id text NOT NULL REFERENCES run_errands_clientes(id),
        punto_venta_id text NULL REFERENCES run_errands_puntos_venta(id),
        domiciliario_id text NULL REFERENCES run_errands_domiciliarios(id),
        kilos numeric(10,2) NOT NULL DEFAULT 1,
        estado text NOT NULL DEFAULT 'REVISADO',
        observaciones text NULL,
        fecha timestamptz NOT NULL DEFAULT now(),
        usuario text NULL,
        creado_en timestamptz NOT NULL DEFAULT now(),
        drivin_estado_envio text NOT NULL DEFAULT 'PENDIENTE',
        drivin_mensaje_envio text NULL,
        drivin_estado_entrega text NULL,
        drivin_motivo_entrega text NULL,
        drivin_sync_at timestamptz NULL,
        drivin_schema_name text NULL
      )
    `);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS run_errands_pedidos_fecha_idx ON run_errands_pedidos(fecha)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS run_errands_pedidos_cliente_idx ON run_errands_pedidos(cliente_id)`,
    );
  }

  // ── Puntos de venta ──────────────────────────────────────────────────
  async listarPuntosVenta(todos: boolean): Promise<RunErrandsPuntoVenta[]> {
    const r = await this.pool.query(
      `SELECT * FROM run_errands_puntos_venta ${todos ? '' : 'WHERE activo = true'} ORDER BY indicador ASC`,
    );
    return r.rows.map(mapPdv);
  }

  async crearPuntoVenta(nombre: string): Promise<RunErrandsPuntoVenta> {
    if (!nombre?.trim()) throw new BadRequestException('Falta el nombre del punto de venta');
    const max = await this.pool.query(
      `SELECT COALESCE(MAX(indicador), 0) AS max FROM run_errands_puntos_venta`,
    );
    const indicador = Number(max.rows[0].max) + 1;
    const id = randomUUID();
    const r = await this.pool.query(
      `INSERT INTO run_errands_puntos_venta (id, indicador, nombre) VALUES ($1, $2, $3) RETURNING *`,
      [id, indicador, nombre.trim()],
    );
    return mapPdv(r.rows[0]);
  }

  async actualizarPuntoVenta(
    id: string,
    data: { nombre?: string; activo?: boolean },
  ): Promise<RunErrandsPuntoVenta> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (data.nombre !== undefined) {
      values.push(data.nombre.trim());
      sets.push(`nombre = $${values.length}`);
    }
    if (data.activo !== undefined) {
      values.push(data.activo);
      sets.push(`activo = $${values.length}`);
    }
    if (sets.length === 0) throw new BadRequestException('Nada para actualizar');
    values.push(id);
    const r = await this.pool.query(
      `UPDATE run_errands_puntos_venta SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (r.rowCount === 0) throw new NotFoundException('Punto de venta no encontrado');
    return mapPdv(r.rows[0]);
  }

  async eliminarPuntoVenta(id: string): Promise<{ ok: true }> {
    await this.pool.query(`UPDATE run_errands_puntos_venta SET activo = false WHERE id = $1`, [id]);
    return { ok: true };
  }

  // ── Domiciliarios ────────────────────────────────────────────────────
  async listarDomiciliarios(todos: boolean, pdv?: string): Promise<RunErrandsDomiciliario[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (!todos) where.push('d.activo = true');
    if (pdv === 'SIN') where.push('d.punto_venta_id IS NULL');
    else if (pdv && pdv !== 'TODOS') {
      values.push(pdv);
      where.push(`d.punto_venta_id = $${values.length}`);
    }
    const r = await this.pool.query(
      `SELECT d.*, p.nombre AS pdv_nombre, p.indicador AS pdv_indicador, p.activo AS pdv_activo
       FROM run_errands_domiciliarios d
       LEFT JOIN run_errands_puntos_venta p ON p.id = d.punto_venta_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY d.nombre ASC`,
      values,
    );
    return r.rows.map(mapDomiciliario);
  }

  async crearDomiciliario(data: {
    nombre: string;
    telefono?: string;
    cedula?: string;
    email?: string;
    puntoVentaId?: string | null;
  }): Promise<RunErrandsDomiciliario> {
    if (!data.nombre?.trim()) throw new BadRequestException('Falta el nombre');
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO run_errands_domiciliarios (id, nombre, telefono, cedula, email, punto_venta_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, data.nombre.trim(), data.telefono ?? null, data.cedula ?? null, data.email ?? null, data.puntoVentaId ?? null],
    );
    const [item] = await this.listarDomiciliarioPorId(id);
    return item;
  }

  private async listarDomiciliarioPorId(id: string): Promise<RunErrandsDomiciliario[]> {
    const r = await this.pool.query(
      `SELECT d.*, p.nombre AS pdv_nombre, p.indicador AS pdv_indicador, p.activo AS pdv_activo
       FROM run_errands_domiciliarios d
       LEFT JOIN run_errands_puntos_venta p ON p.id = d.punto_venta_id
       WHERE d.id = $1`,
      [id],
    );
    if (r.rowCount === 0) throw new NotFoundException('Domiciliario no encontrado');
    return r.rows.map(mapDomiciliario);
  }

  async actualizarDomiciliario(
    id: string,
    data: {
      nombre?: string;
      telefono?: string;
      cedula?: string;
      email?: string;
      puntoVentaId?: string | null;
      activo?: boolean;
    },
  ): Promise<RunErrandsDomiciliario> {
    const campos: Record<string, unknown> = {
      nombre: data.nombre?.trim(),
      telefono: data.telefono,
      cedula: data.cedula,
      email: data.email,
      punto_venta_id: data.puntoVentaId,
      activo: data.activo,
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [col, val] of Object.entries(campos)) {
      if (val === undefined) continue;
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    }
    if (sets.length === 0) throw new BadRequestException('Nada para actualizar');
    values.push(id);
    const r = await this.pool.query(
      `UPDATE run_errands_domiciliarios SET ${sets.join(', ')} WHERE id = $${values.length}`,
      values,
    );
    if (r.rowCount === 0) throw new NotFoundException('Domiciliario no encontrado');
    return (await this.listarDomiciliarioPorId(id))[0];
  }

  async eliminarDomiciliario(id: string): Promise<{ ok: true }> {
    await this.pool.query(`UPDATE run_errands_domiciliarios SET activo = false WHERE id = $1`, [id]);
    return { ok: true };
  }

  async borrarTodosDomiciliarios(): Promise<{ ok: true }> {
    await this.pool.query(`DELETE FROM run_errands_domiciliarios`);
    return { ok: true };
  }

  async cargaMasivaDomiciliarios(
    filas: { nombre: string; telefono?: string; cedula?: string; email?: string; puntoVentaNombre?: string }[],
  ): Promise<{ creados: number; actualizados: number }> {
    const pdvs = await this.listarPuntosVenta(true);
    const pdvPorNombre = new Map(pdvs.map((p) => [p.nombre.trim().toLowerCase(), p.id]));
    let creados = 0;
    let actualizados = 0;
    for (const f of filas) {
      const nombre = (f.nombre ?? '').trim();
      if (!nombre) continue;
      const puntoVentaId = f.puntoVentaNombre ? pdvPorNombre.get(f.puntoVentaNombre.trim().toLowerCase()) ?? null : null;
      const existente = await this.pool.query(
        `SELECT id FROM run_errands_domiciliarios WHERE lower(nombre) = lower($1)`,
        [nombre],
      );
      if (existente.rowCount && existente.rowCount > 0) {
        await this.pool.query(
          `UPDATE run_errands_domiciliarios SET telefono = COALESCE($2, telefono), cedula = COALESCE($3, cedula),
           email = COALESCE($4, email), punto_venta_id = COALESCE($5, punto_venta_id) WHERE id = $1`,
          [existente.rows[0].id, f.telefono ?? null, f.cedula ?? null, f.email ?? null, puntoVentaId],
        );
        actualizados++;
      } else {
        await this.pool.query(
          `INSERT INTO run_errands_domiciliarios (id, nombre, telefono, cedula, email, punto_venta_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), nombre, f.telefono ?? null, f.cedula ?? null, f.email ?? null, puntoVentaId],
        );
        creados++;
      }
    }
    return { creados, actualizados };
  }

  // ── Clientes ─────────────────────────────────────────────────────────
  // Código de cliente (equivale a su cédula/NIT): "Run123" + la secuencia que
  // le toque (01, 02, 10, 50, 300, 1058...) en el orden de creación.
  // Confirmado con Carlos Barbas (WhatsApp 1/oct/2026).
  async siguienteCodigoCliente(): Promise<string> {
    const r = await this.pool.query(`SELECT codigo FROM run_errands_clientes`);
    let max = 0;
    for (const row of r.rows) {
      const m = /^Run123(\d+)$/.exec(row.codigo as string);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `Run123${String(max + 1).padStart(2, '0')}`;
  }

  async listarClientes(buscar: string, todos: boolean): Promise<RunErrandsCliente[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (!todos) where.push('activo = true');
    if (buscar?.trim()) {
      values.push(`%${buscar.trim()}%`);
      where.push(`(nombre ILIKE $${values.length} OR codigo ILIKE $${values.length})`);
    }
    const r = await this.pool.query(
      `SELECT * FROM run_errands_clientes ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY nombre ASC`,
      values,
    );
    return r.rows.map(mapCliente);
  }

  async obtenerCliente(id: string): Promise<RunErrandsCliente> {
    const r = await this.pool.query(`SELECT * FROM run_errands_clientes WHERE id = $1`, [id]);
    if (r.rowCount === 0) throw new NotFoundException('Cliente no encontrado');
    return mapCliente(r.rows[0]);
  }

  async crearCliente(data: {
    nombre: string;
    direccion?: string;
    referencia?: string;
    barrio?: string;
    ciudad?: string;
    region?: string;
    telefono?: string;
    email?: string;
    observaciones?: string;
  }): Promise<RunErrandsCliente & { drivinOk: boolean; drivinMensaje?: string }> {
    if (!data.nombre?.trim()) throw new BadRequestException('Falta el nombre del cliente');
    const codigo = await this.siguienteCodigoCliente();
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO run_errands_clientes (id, codigo, nombre, direccion, referencia, barrio, ciudad, region, telefono, email, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, codigo, data.nombre.trim(), data.direccion ?? null, data.referencia ?? null, data.barrio ?? null,
        data.ciudad ?? null, data.region ?? null, data.telefono ?? null, data.email ?? null, data.observaciones ?? null,
      ],
    );
    const cliente = await this.obtenerCliente(id);
    const drivin = await this.sincronizarClienteDrivin(cliente);
    return { ...cliente, drivinOk: drivin.ok, drivinMensaje: drivin.mensaje };
  }

  async actualizarCliente(
    id: string,
    data: Partial<{
      nombre: string; direccion: string; referencia: string; barrio: string; ciudad: string;
      region: string; telefono: string; email: string; observaciones: string; activo: boolean;
    }>,
  ): Promise<RunErrandsCliente & { drivinOk: boolean; drivinMensaje?: string }> {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [col, val] of Object.entries(data)) {
      if (val === undefined) continue;
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    }
    if (sets.length > 0) {
      values.push(id);
      const r = await this.pool.query(
        `UPDATE run_errands_clientes SET ${sets.join(', ')} WHERE id = $${values.length}`,
        values,
      );
      if (r.rowCount === 0) throw new NotFoundException('Cliente no encontrado');
    }
    const cliente = await this.obtenerCliente(id);
    const drivin = await this.sincronizarClienteDrivin(cliente);
    return { ...cliente, drivinOk: drivin.ok, drivinMensaje: drivin.mensaje };
  }

  async eliminarCliente(id: string): Promise<{ ok: true }> {
    await this.pool.query(`UPDATE run_errands_clientes SET activo = false WHERE id = $1`, [id]);
    return { ok: true };
  }

  async borrarTodosClientes(): Promise<{ ok: true }> {
    await this.pool.query(`DELETE FROM run_errands_pedidos`);
    await this.pool.query(`DELETE FROM run_errands_clientes`);
    return { ok: true };
  }

  async cargaMasivaClientes(
    filas: {
      codigo?: string; nombre: string; direccion?: string; referencia?: string; barrio?: string;
      ciudad?: string; region?: string; telefono?: string; email?: string; observaciones?: string;
    }[],
  ): Promise<{ creados: number; actualizados: number }> {
    let creados = 0;
    let actualizados = 0;
    for (const f of filas) {
      const nombre = (f.nombre ?? '').trim();
      if (!nombre) continue;
      const codigoRaw = (f.codigo ?? '').trim();
      const existente = codigoRaw
        ? await this.pool.query(`SELECT id FROM run_errands_clientes WHERE codigo = $1`, [codigoRaw])
        : { rowCount: 0, rows: [] as { id: string }[] };
      if (existente.rowCount && existente.rowCount > 0) {
        await this.pool.query(
          `UPDATE run_errands_clientes SET nombre=$2, direccion=COALESCE($3,direccion), referencia=COALESCE($4,referencia),
           barrio=COALESCE($5,barrio), ciudad=COALESCE($6,ciudad), region=COALESCE($7,region),
           telefono=COALESCE($8,telefono), email=COALESCE($9,email), observaciones=COALESCE($10,observaciones)
           WHERE id = $1`,
          [
            existente.rows[0].id, nombre, f.direccion ?? null, f.referencia ?? null, f.barrio ?? null,
            f.ciudad ?? null, f.region ?? null, f.telefono ?? null, f.email ?? null, f.observaciones ?? null,
          ],
        );
        actualizados++;
      } else {
        const codigo = codigoRaw || (await this.siguienteCodigoCliente());
        await this.pool.query(
          `INSERT INTO run_errands_clientes (id, codigo, nombre, direccion, referencia, barrio, ciudad, region, telefono, email, observaciones)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            randomUUID(), codigo, nombre, f.direccion ?? null, f.referencia ?? null, f.barrio ?? null,
            f.ciudad ?? null, f.region ?? null, f.telefono ?? null, f.email ?? null, f.observaciones ?? null,
          ],
        );
        creados++;
      }
    }
    return { creados, actualizados };
  }

  // ── Pedidos ──────────────────────────────────────────────────────────
  async siguienteNumeroPedido(): Promise<string> {
    const r = await this.pool.query(`SELECT numero_pedido FROM run_errands_pedidos`);
    // Piso configurable para no reiniciar en 00001 si hay datos migrados de
    // otro sistema con una secuencia más alta (ver RUN_ERRANDS_NUMERO_PEDIDO_BASE).
    let max = Number(this.config.get<string>('RUN_ERRANDS_NUMERO_PEDIDO_BASE', '0')) || 0;
    for (const row of r.rows) {
      const m = /^OSRun(\d+)$/.exec(row.numero_pedido as string);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `OSRun${String(max + 1).padStart(5, '0')}`;
  }

  private pedidoSelectBase = `
    SELECT pe.*, c.codigo AS cli_codigo, c.nombre AS cli_nombre, c.direccion AS cli_direccion,
      c.referencia AS cli_referencia, c.barrio AS cli_barrio, c.ciudad AS cli_ciudad, c.region AS cli_region,
      c.telefono AS cli_telefono, c.email AS cli_email,
      p.nombre AS pdv_nombre, p.indicador AS pdv_indicador,
      d.nombre AS dom_nombre, d.telefono AS dom_telefono
    FROM run_errands_pedidos pe
    JOIN run_errands_clientes c ON c.id = pe.cliente_id
    LEFT JOIN run_errands_puntos_venta p ON p.id = pe.punto_venta_id
    LEFT JOIN run_errands_domiciliarios d ON d.id = pe.domiciliario_id
  `;

  async listarPedidos(filtros: { estado?: string; pdv?: string; desde?: string; hasta?: string }): Promise<RunErrandsPedido[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filtros.estado) {
      values.push(filtros.estado);
      where.push(`pe.estado = $${values.length}`);
    }
    if (filtros.pdv) {
      values.push(filtros.pdv);
      where.push(`pe.punto_venta_id = $${values.length}`);
    }
    if (filtros.desde) {
      values.push(filtros.desde);
      where.push(`pe.fecha >= $${values.length}`);
    }
    if (filtros.hasta) {
      values.push(`${filtros.hasta} 23:59:59`);
      where.push(`pe.fecha <= $${values.length}`);
    }
    const r = await this.pool.query(
      `${this.pedidoSelectBase} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY pe.fecha DESC`,
      values,
    );
    return r.rows.map(mapPedido);
  }

  async obtenerPedido(id: string): Promise<RunErrandsPedido> {
    const r = await this.pool.query(`${this.pedidoSelectBase} WHERE pe.id = $1`, [id]);
    if (r.rowCount === 0) throw new NotFoundException('Pedido no encontrado');
    return mapPedido(r.rows[0]);
  }

  async crearPedidos(
    filas: {
      clienteId: string; puntoVentaId?: string | null; domiciliarioId?: string | null;
      kilos?: number; estado?: string; observaciones?: string; schemaName?: string;
    }[],
    usuario: string | null,
  ): Promise<RunErrandsPedido[]> {
    const esquemas = await this.listarEsquemasDrivin();
    const creados: RunErrandsPedido[] = [];
    for (const data of filas) {
      if (!data.clienteId) throw new BadRequestException('Falta el cliente del pedido');
      const numeroPedido = await this.siguienteNumeroPedido();
      const id = randomUUID();
      await this.pool.query(
        `INSERT INTO run_errands_pedidos (id, numero_pedido, cliente_id, punto_venta_id, domiciliario_id, kilos, estado, observaciones, usuario)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id, numeroPedido, data.clienteId, data.puntoVentaId ?? null, data.domiciliarioId ?? null,
          data.kilos ?? 1, data.estado ?? 'REVISADO', data.observaciones ?? null, usuario,
        ],
      );
      let pedido = await this.obtenerPedido(id);
      const schemaName = data.schemaName || (pedido.puntoVenta ? this.emparejarEsquemaDrivin(pedido.puntoVenta.nombre, esquemas) : null);
      pedido = await this.enviarPedidoADrivin(pedido, schemaName);
      creados.push(pedido);
    }
    return creados;
  }

  async actualizarPedido(
    id: string,
    data: Partial<{
      clienteId: string; puntoVentaId: string | null; domiciliarioId: string | null;
      kilos: number; estado: string; observaciones: string; drivinSchemaName: string;
    }>,
  ): Promise<RunErrandsPedido> {
    const columnas: Record<string, string> = {
      clienteId: 'cliente_id', puntoVentaId: 'punto_venta_id', domiciliarioId: 'domiciliario_id',
      kilos: 'kilos', estado: 'estado', observaciones: 'observaciones', drivinSchemaName: 'drivin_schema_name',
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, col] of Object.entries(columnas)) {
      const val = (data as Record<string, unknown>)[key];
      if (val === undefined) continue;
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    }
    if (sets.length > 0) {
      values.push(id);
      const r = await this.pool.query(`UPDATE run_errands_pedidos SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
      if (r.rowCount === 0) throw new NotFoundException('Pedido no encontrado');
    }
    return this.obtenerPedido(id);
  }

  async cambiarEstadoPedido(id: string, estado: string): Promise<RunErrandsPedido> {
    if (!ESTADOS_PEDIDO.includes(estado)) throw new BadRequestException('Estado inválido');
    const previo = await this.obtenerPedido(id).catch(() => null);
    const r = await this.pool.query(`UPDATE run_errands_pedidos SET estado = $2 WHERE id = $1`, [id, estado]);
    if (r.rowCount === 0) throw new NotFoundException('Pedido no encontrado');
    // Si ya se había enviado a Drivin, intenta cancelarlo allá también
    // (best-effort: no bloquea si Drivin falla, igual que al enviarlo).
    if (estado === 'CANCELADO' && previo?.drivinEstadoEnvio === 'ENVIADO') {
      this.cancelarPedidoDrivin(previo).catch(() => { /* ya quedó logueado adentro */ });
    }
    return this.obtenerPedido(id);
  }

  /** Cancela el pedido en Drivin (best-effort, no bloquea el cambio de estado en SIGCOMPRO). */
  private async cancelarPedidoDrivin(pedido: RunErrandsPedido): Promise<void> {
    try {
      const esquemas = await this.listarEsquemasDrivin();
      const schemaCode = esquemas.find((e) => e.name === pedido.drivinSchemaName)?.code ?? pedido.drivinSchemaName;
      if (!schemaCode) return;
      const path = `/orders/${encodeURIComponent(pedido.numeroPedido)}?schema_code=${encodeURIComponent(schemaCode)}`;
      const { status } = await this.drivinRequest('PUT', path, JSON.stringify({ status: 'cancelled' }));
      if (status < 200 || status >= 300) {
        this.logger.warn(`No se pudo cancelar en Drivin el pedido ${pedido.numeroPedido} (status ${status})`);
      }
    } catch (e) {
      this.logger.warn(
        `Error cancelando en Drivin el pedido ${pedido.numeroPedido}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async reenviarDrivin(id: string): Promise<RunErrandsPedido> {
    const pedido = await this.obtenerPedido(id);
    const esquemas = await this.listarEsquemasDrivin();
    const schemaName = pedido.drivinSchemaName || (pedido.puntoVenta ? this.emparejarEsquemaDrivin(pedido.puntoVenta.nombre, esquemas) : null);
    return this.enviarPedidoADrivin(pedido, schemaName);
  }

  async eliminarPedido(id: string): Promise<{ ok: true }> {
    await this.pool.query(`DELETE FROM run_errands_pedidos WHERE id = $1`, [id]);
    return { ok: true };
  }

  async borrarTodosPedidos(): Promise<{ ok: true }> {
    await this.pool.query(`DELETE FROM run_errands_pedidos`);
    return { ok: true };
  }

  // ── Dashboard ────────────────────────────────────────────────────────
  async dashboard(desde?: string, hasta?: string) {
    const where: string[] = [];
    const values: unknown[] = [];
    if (desde) {
      values.push(desde);
      where.push(`pe.fecha >= $${values.length}`);
    }
    if (hasta) {
      values.push(`${hasta} 23:59:59`);
      where.push(`pe.fecha <= $${values.length}`);
    }
    const r = await this.pool.query(
      `SELECT pe.estado, pe.kilos, pe.fecha, c.nombre AS cliente_nombre, p.nombre AS pdv_nombre
       FROM run_errands_pedidos pe
       JOIN run_errands_clientes c ON c.id = pe.cliente_id
       LEFT JOIN run_errands_puntos_venta p ON p.id = pe.punto_venta_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
      values,
    );

    const porPdv = new Map<string, number>();
    const porCliente = new Map<string, number>();
    const porDia = new Map<string, number>();
    const porEstado = new Map<string, number>();
    let totalKilos = 0;
    for (const p of r.rows) {
      const pdvLabel = (p.pdv_nombre as string) ?? 'Sin PDV';
      porPdv.set(pdvLabel, (porPdv.get(pdvLabel) ?? 0) + 1);
      porCliente.set(p.cliente_nombre as string, (porCliente.get(p.cliente_nombre as string) ?? 0) + 1);
      porEstado.set(p.estado as string, (porEstado.get(p.estado as string) ?? 0) + 1);
      totalKilos += Number(p.kilos);
      const dia = new Date(p.fecha as string).toISOString().slice(0, 10);
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    }

    const dias14: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dias14.push({ label: key.slice(5), value: porDia.get(key) ?? 0 });
    }

    const [{ rows: clienteRows }, { rows: pdvRows }] = await Promise.all([
      this.pool.query(`SELECT COUNT(*) AS n FROM run_errands_clientes WHERE activo = true`),
      this.pool.query(`SELECT COUNT(*) AS n FROM run_errands_puntos_venta WHERE activo = true`),
    ]);

    return {
      totalPedidos: r.rows.length,
      totalKilos,
      totalClientes: Number(clienteRows[0].n),
      totalPuntosVenta: Number(pdvRows[0].n),
      porEstado: ESTADOS_PEDIDO.map((e) => ({ label: e, value: porEstado.get(e) ?? 0 })),
      porPdv: [...porPdv.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      porCliente: [...porCliente.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10),
      porDia: dias14,
    };
  }

  // ── Drivin ───────────────────────────────────────────────────────────
  // Misma integración (conectar por IP + SNI manual) que ya usa PedidosService
  // para saltar bloqueos intermitentes de DNS a external.driv.in.
  private async resolveDrivinIp(): Promise<string> {
    const host = 'external.driv.in';
    if (this.drivinIp && Date.now() - this.drivinIp.ts < 10 * 60 * 1000) return this.drivinIp.ip;
    try {
      const res = await dnsPromises.lookup(host, { family: 4 });
      this.drivinIp = { ip: res.address, ts: Date.now() };
      return res.address;
    } catch {
      const resolver = new DnsResolver();
      resolver.setServers(['8.8.8.8', '1.1.1.1']);
      const ips = await resolver.resolve4(host);
      if (!ips.length) throw new Error('Sin IP para external.driv.in');
      this.drivinIp = { ip: ips[0], ts: Date.now() };
      return ips[0];
    }
  }

  private async drivinRequest(method: string, path: string, body?: string): Promise<{ status: number; text: string }> {
    // Run Errands (Santacruz Domicilios) es una ORGANIZACIÓN de Drivin distinta
    // de la de despacho/distribución de Carnes -- en SIGROUTE usaba una API key
    // separada (DRIVIN_ERRANDS_API_KEY) y no se pueden unificar. Si no está
    // configurada acá todavía, cae de respaldo a DRIVIN_API_KEY (la de
    // Pedidos), pero ESO HAY QUE CONFIRMARLO: si los esquemas/domiciliarios de
    // Run Errands no aparecen, es porque se necesita la key de esa org aparte.
    const apiKey = this.config.get<string>('DRIVIN_ERRANDS_API_KEY') || this.config.get<string>('DRIVIN_API_KEY');
    if (!apiKey) throw new Error('Falta DRIVIN_ERRANDS_API_KEY (o DRIVIN_API_KEY) en el backend (.env)');
    const host = 'external.driv.in';
    const ip = await this.resolveDrivinIp();
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: ip,
          servername: host,
          port: 443,
          path: `/api/external/v2${path}`,
          method,
          headers: {
            'X-API-Key': apiKey,
            Host: host,
            ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
          },
          timeout: 15000,
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, text: data }));
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Drivin: timeout')));
      if (body) req.write(body);
      req.end();
    });
  }

  private async llamarDrivin(path: string, body: unknown): Promise<{ ok: boolean; mensaje?: string }> {
    try {
      const { status, text } = await this.drivinRequest('POST', path, JSON.stringify(body));
      const json = text ? JSON.parse(text) : {};
      if (status < 200 || status >= 300 || json?.success === false) {
        this.drivinIp = null;
        return { ok: false, mensaje: `Drivin ${status}: ${text.slice(0, 300)}` };
      }
      return { ok: true };
    } catch (err) {
      this.drivinIp = null;
      return { ok: false, mensaje: (err as Error)?.message ?? 'Error de red con Drivin' };
    }
  }

  async sincronizarClienteDrivin(c: {
    codigo: string; nombre: string; direccion: string | null; barrio: string | null;
    ciudad: string | null; region: string | null; telefono: string | null; email: string | null;
  }): Promise<{ ok: boolean; mensaje?: string }> {
    const nombreDrivin = `Run Errands - ${c.nombre}`;
    return this.llamarDrivin('/addresses', {
      addresses: [{
        code: c.codigo,
        address1: c.direccion || c.nombre,
        address2: c.barrio || undefined,
        city: c.ciudad || 'Barranquilla',
        state: c.region || 'Atlántico',
        country: 'Colombia',
        name: nombreDrivin,
        client: nombreDrivin,
        client_code: c.codigo,
        phone: c.telefono || undefined,
        email: c.email || undefined,
        update_all: true,
      }],
    });
  }

  async listarEsquemasDrivin(): Promise<{ code: string; name: string }[]> {
    try {
      const { status, text } = await this.drivinRequest('GET', '/schemas');
      if (status < 200 || status >= 300) return [];
      const json = JSON.parse(text) as { response?: { code?: string; name?: string }[] };
      return (json.response ?? []).filter((s): s is { code: string; name: string } => Boolean(s.code && s.name));
    } catch {
      return [];
    }
  }

  // Empareja el nombre del PDV con el nombre del esquema de Drivin (match
  // insensible a tildes/mayúsculas, igual que en SIGROUTE).
  private emparejarEsquemaDrivin(pdvNombre: string, esquemas: { code: string; name: string }[]): string | null {
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const n = norm(pdvNombre);
    const exacto = esquemas.find((e) => norm(e.name) === n);
    if (exacto) return exacto.name;
    const parcial = esquemas.find((e) => norm(e.name).includes(n) || n.includes(norm(e.name)));
    return parcial?.name ?? null;
  }

  private async enviarPedidoADrivin(pedido: RunErrandsPedido, schemaName: string | null): Promise<RunErrandsPedido> {
    if (!schemaName || !pedido.cliente) {
      await this.pool.query(
        `UPDATE run_errands_pedidos SET drivin_estado_envio = 'ERROR', drivin_mensaje_envio = $2 WHERE id = $1`,
        [pedido.id, 'No se encontró un esquema de Drivin para este PDV; elige uno manualmente e inténtalo de nuevo.'],
      );
      return this.obtenerPedido(pedido.id);
    }
    const esquemas = await this.listarEsquemasDrivin();
    const schemaCode = esquemas.find((e) => e.name === schemaName)?.code ?? schemaName;
    await this.sincronizarClienteDrivin(pedido.cliente);
    const descripcion = (pedido.observaciones ?? '').trim() || `Mandado ${pedido.numeroPedido}`;
    const fecha = new Date(pedido.fecha).toISOString().slice(0, 10);
    // El domiciliario ve "nombre / referencia" donde normalmente iría el
    // cliente; sin `reference`/`name` en el pedido (solo se mandaban en el
    // sync de /addresses) esa línea queda en blanco en la app de Drivin.
    const referencia = `${pedido.numeroPedido} / Mandado`;
    const drivin = await this.llamarDrivin(`/orders?schema_code=${encodeURIComponent(schemaCode)}`, {
      clients: [{
        code: pedido.cliente.codigo,
        reference: referencia,
        name: `Run Errands - ${pedido.cliente.nombre}`,
        client_name: `Run Errands - ${pedido.cliente.nombre}`,
        orders: [{
          code: pedido.numeroPedido,
          alt_code: referencia,
          description: descripcion,
          category: 'Delivery',
          units_1: pedido.kilos,
          delivery_date: fecha,
          deploy_date: fecha,
          items: [{ code: 'RUN-ERRANDS', description: descripcion, units: 1, units_1: pedido.kilos }],
        }],
      }],
    });
    await this.pool.query(
      `UPDATE run_errands_pedidos SET drivin_estado_envio = $2, drivin_mensaje_envio = $3, drivin_schema_name = $4 WHERE id = $1`,
      [pedido.id, drivin.ok ? 'ENVIADO' : 'ERROR', drivin.mensaje ?? null, schemaName],
    );
    return this.obtenerPedido(pedido.id);
  }

  async syncDrivin(desdeISO: string, hastaISO: string): Promise<{ actualizados: number }> {
    let pods: Map<string, { status: string; reason: string | null }>;
    try {
      const { status, text } = await this.drivinRequest(
        'GET',
        `/pods?start_date=${desdeISO}&end_date=${hastaISO}`,
      );
      pods = new Map();
      if (status >= 200 && status < 300) {
        const json = JSON.parse(text) as { data?: { attributes?: { code?: string | null; status?: string | null; reason?: string | null } }[] };
        for (const item of json.data ?? []) {
          const a = item.attributes ?? {};
          if (!a.code) continue;
          pods.set(a.code, { status: (a.status ?? '').toLowerCase(), reason: a.reason ?? null });
        }
      }
    } catch {
      pods = new Map();
    }

    const r = await this.pool.query(
      `SELECT id, numero_pedido FROM run_errands_pedidos WHERE fecha >= $1 AND fecha <= $2`,
      [desdeISO, `${hastaISO} 23:59:59`],
    );
    let actualizados = 0;
    for (const row of r.rows) {
      const pod = pods.get(row.numero_pedido as string);
      if (!pod) continue;
      const estadoLocal =
        pod.status === 'approved' ? 'ENTREGADO' : pod.status === 'rejected' ? 'CANCELADO'
        : pod.status === 'pending' || pod.status === 'in-transit' ? 'EN_PROCESO' : null;
      await this.pool.query(
        `UPDATE run_errands_pedidos SET drivin_estado_entrega = $2, drivin_motivo_entrega = $3, drivin_sync_at = now()
         ${estadoLocal ? ', estado = $4' : ''} WHERE id = $1`,
        estadoLocal ? [row.id, pod.status, pod.reason, estadoLocal] : [row.id, pod.status, pod.reason],
      );
      actualizados++;
    }
    return { actualizados };
  }
}
