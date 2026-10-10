import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { tieneAccesoTotal } from '../users/permisos.catalog';
import { ItemConPeso, pesoCarritoKg } from '../common/peso';

export type EstadoSolicitud =
  | 'pendiente'
  | 'aprobada'
  | 'rechazada'
  | 'cancelada'
  | 'vencida'
  | 'cerrada';

export interface SolicitudExtension {
  id: string;
  punto_id: string;
  punto_nombre: string | null;
  dia: string;
  domiciliario: string;
  domiciliario_codigo: string;
  motivo: string;
  estado: EstadoSolicitud;
  solicitado_por_nombre: string | null;
  solicitado_en: string;
  resuelto_por_nombre: string | null;
  resuelto_en: string | null;
  motivo_rechazo: string | null;
  valor: string | null;
  cerrado_en: string | null;
  pedidos: number;
  snapshot: Record<string, { cantidad: number; kg: number }> | null;
}

export interface PedidoExtension {
  pedido_id: string;
  replica: number;
  consecutivo: number | null;
  comanda: string | null;
  cliente_nombre: string | null;
  cliente_nit: string | null;
  estado_final: string | null;
  /** Kilos del pedido (null en réplicas: el peso es del pedido completo). */
  kg: number | null;
  asignado_en: string;
}

interface MetaAsignacion {
  domiciliario?: string | null;
  domiciliarioCodigo?: string | null;
  replicas?: Array<{
    numero?: number;
    domiciliario?: string | null;
    domiciliarioCodigo?: string | null;
    estado?: string | null;
  }>;
}

const ESTADO_REPLICA: Record<string, string> = {
  approved: 'Entregado',
  rejected: 'Rechazado',
  'in-transit': 'En tránsito',
  pending: 'Pendiente',
};

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Nombre comparable: sin tildes, minúsculas y espacios simples. */
export function normalizarNombre(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fecha (YYYY-MM-DD) de hoy en Bogotá. */
function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const COLUMNAS = `s.id, s.punto_id, s.punto_nombre, to_char(s.dia, 'YYYY-MM-DD') AS dia,
  s.domiciliario, s.domiciliario_codigo, s.motivo, s.estado,
  s.solicitado_por_nombre, s.solicitado_en, s.resuelto_por_nombre, s.resuelto_en,
  s.motivo_rechazo,
  CASE WHEN s.estado = 'aprobada'
       THEN COALESCE((SELECT c.valor FROM extensiones_config c WHERE c.punto_id = s.punto_id), s.valor, 0)
       ELSE s.valor END AS valor,
  s.cerrado_en, s.snapshot,
  (SELECT count(*)::int FROM extensiones_pedidos ep WHERE ep.solicitud_id = s.id) AS pedidos`;

/**
 * Extensiones de domiciliarios: Despacho las solicita por punto y, DESDE ESE
 * MOMENTO hasta el fin del día, cada pedido (o réplica) asignado a ese
 * domiciliario en ese punto queda registrado en la extensión. Si un
 * administrador la rechaza (o se cancela/vence) esos pedidos se descartan; si
 * la aprueba, quedan para el reporte. Al cambiar de día la extensión aprobada
 * se cierra y su reporte queda guardado de forma permanente (no hay borrado).
 */
@Injectable()
export class ExtensionesService implements OnModuleInit {
  private readonly logger = new Logger(ExtensionesService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS extensiones_solicitudes (
        id bigserial PRIMARY KEY,
        punto_id text NOT NULL,
        punto_nombre text,
        dia date NOT NULL,
        domiciliario text NOT NULL,
        domiciliario_codigo text NOT NULL DEFAULT '',
        motivo text NOT NULL,
        estado text NOT NULL DEFAULT 'pendiente',
        solicitado_por_id text,
        solicitado_por_nombre text,
        solicitado_en timestamptz NOT NULL DEFAULT now(),
        resuelto_por_id text,
        resuelto_por_nombre text,
        resuelto_en timestamptz,
        motivo_rechazo text,
        valor numeric(14,2),
        cerrado_en timestamptz
      )
    `);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_ext_sol_punto_dia ON extensiones_solicitudes (punto_id, dia)`,
    );
    // Foto de las cards de Despacho del punto al momento de solicitar.
    await this.pool.query(
      `ALTER TABLE extensiones_solicitudes ADD COLUMN IF NOT EXISTS snapshot jsonb`,
    );
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS extensiones_pedidos (
        id bigserial PRIMARY KEY,
        solicitud_id bigint NOT NULL REFERENCES extensiones_solicitudes(id),
        pedido_id text NOT NULL,
        replica int NOT NULL DEFAULT 0,
        consecutivo int,
        comanda text,
        cliente_nombre text,
        cliente_nit text,
        estado_final text,
        asignado_en timestamptz NOT NULL DEFAULT now(),
        UNIQUE (solicitud_id, pedido_id, replica)
      )
    `);
    await this.pool.query(
      `ALTER TABLE extensiones_pedidos ADD COLUMN IF NOT EXISTS kg numeric(12,2)`,
    );
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS extensiones_config (
        punto_id text PRIMARY KEY,
        valor numeric(14,2) NOT NULL DEFAULT 0,
        actualizado_por text,
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Cédula de cada domiciliario, casada por nombre normalizado (sin tildes ni mayúsculas).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS domiciliarios_cedula (
        cedula text PRIMARY KEY,
        nombre text NOT NULL,
        nombre_norm text NOT NULL
      )
    `);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_domiciliarios_cedula_nombre ON domiciliarios_cedula (nombre_norm)`,
    );
    // Si el servidor estaba apagado al cambiar de día, cierra lo pendiente.
    this.cerrarDiasAnteriores().catch((e) =>
      this.logger.warn(`No se pudieron cerrar extensiones: ${String(e)}`),
    );
  }

  private async nombreUsuario(user: JwtPayload): Promise<string> {
    const r = await this.pool.query<{ nombre: string }>(
      `SELECT nombre FROM usuarios WHERE id = $1::bigint LIMIT 1`,
      [user.sub],
    );
    return r.rows[0]?.nombre ?? user.cedula ?? '';
  }

  private async verificarPunto(user: JwtPayload, puntoId: string): Promise<void> {
    if (tieneAccesoTotal(norm(user.rol))) return;
    const r = await this.pool.query(
      `SELECT 1 FROM usuario_punto_venta WHERE usuario_id = $1 AND punto_venta_id::text = $2 LIMIT 1`,
      [user.sub, puntoId],
    );
    if (!r.rowCount) {
      throw new ForbiddenException('No tienes asignado este punto de venta.');
    }
  }

  private async obtener(id: string): Promise<SolicitudExtension & { solicitado_por_id: string | null }> {
    if (!/^\d+$/.test(id)) throw new NotFoundException('Solicitud no encontrada.');
    const r = await this.pool.query<SolicitudExtension & { solicitado_por_id: string | null }>(
      `SELECT ${COLUMNAS}, s.solicitado_por_id FROM extensiones_solicitudes s WHERE s.id = $1`,
      [id],
    );
    if (!r.rowCount) throw new NotFoundException('Solicitud no encontrada.');
    return r.rows[0];
  }

  /** Solicitudes de un punto para un día (por defecto hoy). */
  async listarPunto(user: JwtPayload, puntoId: string, dia?: string) {
    await this.verificarPunto(user, puntoId);
    const d = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : hoyBogota();
    const r = await this.pool.query<SolicitudExtension>(
      `SELECT ${COLUMNAS} FROM extensiones_solicitudes s
       WHERE s.punto_id = $1 AND s.dia = $2::date
       ORDER BY s.solicitado_en DESC`,
      [puntoId, d],
    );
    return r.rows;
  }

  async crear(
    user: JwtPayload,
    body: {
      puntoId?: string;
      domiciliario?: string;
      domiciliarioCodigo?: string;
      motivo?: string;
      snapshot?: unknown;
    },
  ) {
    const puntoId = String(body.puntoId ?? '').trim();
    const domiciliario = String(body.domiciliario ?? '').trim().slice(0, 200);
    const codigo = String(body.domiciliarioCodigo ?? '').trim().slice(0, 100);
    const motivo = String(body.motivo ?? '').trim().slice(0, 1000);
    if (!puntoId || !domiciliario || !motivo) {
      throw new BadRequestException('Punto, domiciliario y motivo son obligatorios.');
    }
    await this.verificarPunto(user, puntoId);
    const dia = hoyBogota();
    const punto = await this.pool.query<{ nombre: string }>(
      `SELECT nombre FROM puntos_venta WHERE id::text = $1 LIMIT 1`,
      [puntoId],
    );
    const nombre = await this.nombreUsuario(user);

    const client = await this.pool.connect();
    let id: string;
    try {
      await client.query('BEGIN');
      // Serializa solicitudes simultáneas del mismo domiciliario en el punto/día.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `extension:${puntoId}:${dia}:${codigo || domiciliario.toLowerCase()}`,
      ]);
      const previa = await client.query<{ estado: EstadoSolicitud }>(
        `SELECT estado FROM extensiones_solicitudes
         WHERE punto_id = $1 AND dia = $2::date AND estado IN ('pendiente', 'aprobada')
           AND (CASE WHEN $3 <> '' THEN domiciliario_codigo = $3
                     ELSE lower(trim(domiciliario)) = lower($4) END)
         ORDER BY solicitado_en DESC
         LIMIT 1`,
        [puntoId, dia, codigo, domiciliario],
      );
      const estadoPrevio = previa.rows[0]?.estado;
      if (estadoPrevio === 'pendiente') {
        throw new BadRequestException(
          `Ya hay una solicitud pendiente para ${domiciliario}. Primero debe ser gestionada (aprobada o rechazada).`,
        );
      }
      if (estadoPrevio === 'aprobada') {
        throw new BadRequestException(
          `${domiciliario} ya tiene una extensión aprobada hoy. No se puede solicitar otra el mismo día.`,
        );
      }
      const r = await client.query<{ id: string }>(
        `INSERT INTO extensiones_solicitudes
           (punto_id, punto_nombre, dia, domiciliario, domiciliario_codigo, motivo,
            solicitado_por_id, solicitado_por_nombre, snapshot)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING id`,
        [
          puntoId, punto.rows[0]?.nombre ?? null, dia, domiciliario, codigo, motivo, user.sub, nombre,
          JSON.stringify(this.limpiarSnapshot(body.snapshot)),
        ],
      );
      await client.query('COMMIT');
      id = r.rows[0].id;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return this.obtener(id);
  }

  /** Solo claves conocidas y números no negativos (el resumen lo arma el cliente). */
  private limpiarSnapshot(raw: unknown): Record<string, { cantidad: number; kg: number }> | null {
    if (!raw || typeof raw !== 'object') return null;
    const claves = [
      'total', 'todos', 'entregados', 'pendientes', 'atrasados', 'retenido', 'cancelados',
      'posteriores', 'produccion', 'alistados', 'facturados', 'despachados', 'transito',
    ];
    const out: Record<string, { cantidad: number; kg: number }> = {};
    for (const k of claves) {
      const v = (raw as Record<string, { cantidad?: unknown; kg?: unknown }>)[k];
      const cantidad = Math.max(0, Math.trunc(Number(v?.cantidad) || 0));
      const kg = Math.max(0, Number(Number(v?.kg).toFixed(2)) || 0);
      out[k] = { cantidad, kg };
    }
    return out;
  }

  async cancelar(user: JwtPayload, id: string) {
    const s = await this.obtener(id);
    if (s.estado !== 'pendiente') {
      throw new BadRequestException('Solo se puede cancelar una solicitud pendiente.');
    }
    if (s.solicitado_por_id !== String(user.sub) && !tieneAccesoTotal(norm(user.rol))) {
      throw new ForbiddenException('Solo quien la solicitó puede cancelarla.');
    }
    await this.pool.query(
      `UPDATE extensiones_solicitudes SET estado = 'cancelada', resuelto_en = now() WHERE id = $1`,
      [id],
    );
    await this.descartarPedidos(id);
    return this.obtener(id);
  }

  /** Una solicitud no aprobada (rechazada/cancelada/vencida) no conserva pedidos. */
  private async descartarPedidos(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM extensiones_pedidos WHERE solicitud_id = $1`, [id]);
  }

  /** Pendientes de hoy + la más reciente (para la burbuja y el aviso del menú). */
  async pendientes(): Promise<{
    pendientes: number;
    ultimo: { id: string; domiciliario: string; punto_nombre: string | null } | null;
  }> {
    const hoy = hoyBogota();
    const r = await this.pool.query<{ id: string; domiciliario: string; punto_nombre: string | null; total: number }>(
      `SELECT id::text, domiciliario, punto_nombre, count(*) OVER ()::int AS total
       FROM extensiones_solicitudes
       WHERE estado = 'pendiente' AND dia = $1::date
       ORDER BY id DESC
       LIMIT 1`,
      [hoy],
    );
    const fila = r.rows[0];
    return {
      pendientes: fila?.total ?? 0,
      ultimo: fila ? { id: fila.id, domiciliario: fila.domiciliario, punto_nombre: fila.punto_nombre } : null,
    };
  }

  /** Listado administrativo con filtros (fechas YYYY-MM-DD inclusivas). */
  async listarAdmin(f: { desde?: string; hasta?: string; puntoId?: string; estado?: string }) {
    const cond: string[] = [];
    const params: unknown[] = [];
    const fecha = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (fecha(f.desde)) {
      params.push(f.desde);
      cond.push(`s.dia >= $${params.length}::date`);
    }
    if (fecha(f.hasta)) {
      params.push(f.hasta);
      cond.push(`s.dia <= $${params.length}::date`);
    }
    if (f.puntoId) {
      params.push(String(f.puntoId));
      cond.push(`s.punto_id = $${params.length}`);
    }
    if (f.estado) {
      params.push(String(f.estado).split(',').map((e) => e.trim()));
      cond.push(`s.estado = ANY($${params.length}::text[])`);
    }
    const r = await this.pool.query<SolicitudExtension>(
      `SELECT ${COLUMNAS} FROM extensiones_solicitudes s
       ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
       ORDER BY s.dia DESC, s.solicitado_en DESC
       LIMIT 2000`,
      params,
    );
    return r.rows;
  }

  async aprobar(user: JwtPayload, id: string) {
    const s = await this.obtener(id);
    if (s.estado !== 'pendiente') {
      throw new BadRequestException('La solicitud ya no está pendiente.');
    }
    if (s.dia !== hoyBogota()) {
      throw new BadRequestException('La solicitud es de un día anterior y ya venció.');
    }
    const cfg = await this.pool.query<{ valor: string }>(
      `SELECT valor FROM extensiones_config WHERE punto_id = $1`,
      [s.punto_id],
    );
    const nombre = await this.nombreUsuario(user);
    await this.pool.query(
      `UPDATE extensiones_solicitudes
         SET estado = 'aprobada', resuelto_por_id = $2, resuelto_por_nombre = $3,
             resuelto_en = now(), valor = $4
       WHERE id = $1 AND estado = 'pendiente'`,
      [id, user.sub, nombre, cfg.rows[0]?.valor ?? 0],
    );
    return this.obtener(id);
  }

  async rechazar(user: JwtPayload, id: string, motivo?: string) {
    const s = await this.obtener(id);
    if (s.estado !== 'pendiente') {
      throw new BadRequestException('La solicitud ya no está pendiente.');
    }
    const m = String(motivo ?? '').trim().slice(0, 1000);
    if (!m) throw new BadRequestException('Escribe el motivo del rechazo.');
    const nombre = await this.nombreUsuario(user);
    await this.pool.query(
      `UPDATE extensiones_solicitudes
         SET estado = 'rechazada', resuelto_por_id = $2, resuelto_por_nombre = $3,
             resuelto_en = now(), motivo_rechazo = $4
       WHERE id = $1 AND estado = 'pendiente'`,
      [id, user.sub, nombre, m],
    );
    await this.descartarPedidos(id);
    return this.obtener(id);
  }

  /** Pedidos de una extensión. Si sigue abierta, el estado se lee en vivo. */
  async pedidos(user: JwtPayload, id: string): Promise<PedidoExtension[]> {
    const s = await this.obtener(id);
    await this.verificarPunto(user, s.punto_id);
    return this.pedidosDe(s);
  }

  private async pedidosDe(s: SolicitudExtension): Promise<PedidoExtension[]> {
    if (s.estado === 'cerrada') {
      const r = await this.pool.query<PedidoExtension>(
        `SELECT pedido_id, replica, consecutivo, comanda, cliente_nombre, cliente_nit,
                estado_final, kg::float AS kg, asignado_en
         FROM extensiones_pedidos WHERE solicitud_id = $1
         ORDER BY asignado_en`,
        [s.id],
      );
      return r.rows;
    }
    const filas = await this.filasVivas(s);
    return filas.filter((f) => !f.reasignado).map((f) => f.fila);
  }

  /**
   * Reporte para la API externa: extensiones aprobadas/cerradas del rango con
   * su valor y el detalle de sus pedidos. Rango máximo 93 días.
   */
  async reporteExterno(f: { desde?: string; hasta?: string; puntoId?: string }) {
    const fecha = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const hasta = fecha(f.hasta) ? f.hasta! : hoyBogota();
    const desde = fecha(f.desde) ? f.desde! : hasta;
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
    if (dias < 0 || dias > 93) {
      throw new BadRequestException('Rango inválido: "desde" debe ser <= "hasta" y máximo 93 días.');
    }
    const lista = await this.listarAdmin({ desde, hasta, puntoId: f.puntoId, estado: 'aprobada,cerrada' });
    const cedulas = await this.pool.query<{ cedula: string; nombre_norm: string }>(
      `SELECT cedula, nombre_norm FROM domiciliarios_cedula`,
    );
    const cedulaPorNombre = new Map(cedulas.rows.map((c) => [c.nombre_norm, c.cedula]));
    const extensiones = await Promise.all(
      lista.map(async (s) => {
        const pedidos = await this.pedidosDe(s);
        return {
          id: s.id,
          dia: s.dia,
          punto_id: s.punto_id,
          punto_venta: s.punto_nombre,
          domiciliario: s.domiciliario,
          domiciliario_cedula: cedulaPorNombre.get(normalizarNombre(s.domiciliario)) ?? null,
          domiciliario_codigo: s.domiciliario_codigo || null,
          motivo: s.motivo,
          estado: s.estado,
          solicitado_por: s.solicitado_por_nombre,
          solicitado_en: s.solicitado_en,
          aprobado_por: s.resuelto_por_nombre,
          aprobado_en: s.resuelto_en,
          cerrado_en: s.cerrado_en,
          valor_dia_extendido: Number(s.valor) || 0,
          total_pedidos: pedidos.length,
          pedidos: pedidos.map((p) => ({
            consecutivo: p.consecutivo,
            comanda: p.comanda,
            cliente: p.cliente_nombre,
            cliente_nit: p.cliente_nit,
            kilos: p.kg,
            estado: p.estado_final,
            asignado_en: p.asignado_en,
          })),
        };
      }),
    );
    return {
      desde,
      hasta,
      total_extensiones: extensiones.length,
      total_a_pagar: extensiones.reduce((acc, e) => acc + e.valor_dia_extendido, 0),
      extensiones,
    };
  }

  /** Filas de la extensión con estado/cliente actuales y si ya pasó a otro domiciliario. */
  private async filasVivas(s: SolicitudExtension) {
    const r = await this.pool.query<{
      pedido_id: string;
      replica: number;
      asignado_en: string;
      consecutivo: number | null;
      comanda: string | null;
      cliente_nombre: string | null;
      cliente_nit: string | null;
      estado_final: string | null;
      anulado: boolean | null;
      estado_pedido: string | null;
      meta: MetaAsignacion | null;
      carrito: ItemConPeso[] | null;
    }>(
      `SELECT ep.pedido_id, ep.replica, ep.asignado_en,
              COALESCE((p.data->>'consecutivo')::int, ep.consecutivo) AS consecutivo,
              COALESCE(p.data->>'comanda', ep.comanda) AS comanda,
              COALESCE(p.data->'cliente'->>'nombre', ep.cliente_nombre) AS cliente_nombre,
              COALESCE(p.data->'cliente'->>'nit_cedula', ep.cliente_nit) AS cliente_nit,
              ep.estado_final, p.anulado, p.data->>'estado' AS estado_pedido, p.meta,
              p.data->'carrito' AS carrito
       FROM extensiones_pedidos ep
       LEFT JOIN pedidos p ON p.id = ep.pedido_id
       WHERE ep.solicitud_id = $1
       ORDER BY ep.asignado_en`,
      [s.id],
    );
    return r.rows.map((row) => {
      const meta = row.meta ?? {};
      const rep = row.replica > 0 ? meta.replicas?.find((x) => Number(x.numero) === row.replica) : null;
      const actual = row.replica > 0
        ? { nombre: rep?.domiciliario, codigo: rep?.domiciliarioCodigo }
        : { nombre: meta.domiciliario, codigo: meta.domiciliarioCodigo };
      const reasignado =
        !!String(actual.nombre ?? '').trim() && !this.coincide(s, actual.nombre, actual.codigo);
      let estado = row.anulado ? 'Anulado' : row.estado_pedido ?? row.estado_final;
      if (rep?.estado) estado = ESTADO_REPLICA[rep.estado] ?? estado;
      return {
        reasignado,
        fila: {
          pedido_id: row.pedido_id,
          replica: row.replica,
          consecutivo: row.consecutivo,
          comanda: row.replica > 0 && row.comanda ? `${row.comanda}-${row.replica}` : row.comanda,
          cliente_nombre: row.cliente_nombre,
          cliente_nit: row.cliente_nit,
          estado_final: estado,
          kg: row.replica > 0 || !row.carrito ? null : Number(pesoCarritoKg(row.carrito).toFixed(2)),
          asignado_en: row.asignado_en,
        } as PedidoExtension,
      };
    });
  }

  private coincide(
    s: Pick<SolicitudExtension, 'domiciliario' | 'domiciliario_codigo'>,
    nombre?: string | null,
    codigo?: string | null,
  ): boolean {
    if (s.domiciliario_codigo) return String(codigo ?? '').trim() === s.domiciliario_codigo;
    return norm(nombre) === norm(s.domiciliario);
  }

  /** Valor fijo por extensión de cada punto. */
  async config() {
    const r = await this.pool.query<{ punto_id: string; nombre: string; valor: string }>(
      `SELECT p.id::text AS punto_id, p.nombre, COALESCE(c.valor, 0) AS valor
       FROM puntos_venta p
       LEFT JOIN extensiones_config c ON c.punto_id = p.id::text
       WHERE p.activo = true
       ORDER BY p.id`,
    );
    return r.rows;
  }

  async guardarConfig(user: JwtPayload, puntoId: string, valor: unknown) {
    const v = Number(valor);
    if (!Number.isFinite(v) || v < 0) {
      throw new BadRequestException('Valor inválido.');
    }
    const nombre = await this.nombreUsuario(user);
    await this.pool.query(
      `INSERT INTO extensiones_config (punto_id, valor, actualizado_por, actualizado_en)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (punto_id) DO UPDATE
         SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()`,
      [String(puntoId), v, nombre],
    );
    return { punto_id: String(puntoId), valor: v };
  }

  /**
   * Llamado al cambiar la metadata de un pedido: si se le asignó un
   * domiciliario (o a una réplica) que tiene extensión aprobada HOY en ese
   * punto, el pedido queda registrado en la extensión.
   */
  async registrarAsignaciones(
    pedidoId: string,
    puntoId: string | null,
    previo: MetaAsignacion,
    cambios: MetaAsignacion,
  ): Promise<void> {
    if (!puntoId) return;
    const nuevas: Array<{ replica: number; nombre: string; codigo: string }> = [];
    const nombreBase = String(cambios.domiciliario ?? '').trim();
    if (
      nombreBase &&
      (norm(nombreBase) !== norm(previo.domiciliario) ||
        String(cambios.domiciliarioCodigo ?? '') !== String(previo.domiciliarioCodigo ?? ''))
    ) {
      nuevas.push({ replica: 0, nombre: nombreBase, codigo: String(cambios.domiciliarioCodigo ?? '').trim() });
    }
    for (const r of Array.isArray(cambios.replicas) ? cambios.replicas : []) {
      const nombre = String(r.domiciliario ?? '').trim();
      const numero = Number(r.numero);
      if (!nombre || !(numero > 0)) continue;
      const ant = previo.replicas?.find((x) => Number(x.numero) === numero);
      if (
        !ant ||
        norm(ant.domiciliario) !== norm(nombre) ||
        String(ant.domiciliarioCodigo ?? '') !== String(r.domiciliarioCodigo ?? '')
      ) {
        nuevas.push({ replica: numero, nombre, codigo: String(r.domiciliarioCodigo ?? '').trim() });
      }
    }
    if (!nuevas.length) return;

    const activas = await this.pool.query<SolicitudExtension>(
      `SELECT ${COLUMNAS} FROM extensiones_solicitudes s
       WHERE s.punto_id = $1 AND s.dia = $2::date AND s.estado IN ('pendiente', 'aprobada')`,
      [puntoId, hoyBogota()],
    );
    for (const a of nuevas) {
      const ext = activas.rows.find((s) => this.coincide(s, a.nombre, a.codigo));
      if (!ext) continue;
      await this.pool.query(
        `INSERT INTO extensiones_pedidos
           (solicitud_id, pedido_id, replica, consecutivo, comanda, cliente_nombre, cliente_nit, estado_final)
         SELECT $1, p.id, $3, (p.data->>'consecutivo')::int, p.data->>'comanda',
                p.data->'cliente'->>'nombre', p.data->'cliente'->>'nit_cedula', p.data->>'estado'
         FROM pedidos p WHERE p.id = $2
         ON CONFLICT (solicitud_id, pedido_id, replica) DO NOTHING`,
        [ext.id, pedidoId, a.replica],
      );
    }
  }

  /** Al cambiar de día: cierra las aprobadas (congela su reporte) y vence las pendientes. */
  @Cron('0 5 0 * * *', { name: 'cerrar-extensiones', timeZone: 'America/Bogota' })
  async cerrarDiasAnteriores(): Promise<void> {
    const hoy = hoyBogota();
    await this.pool.query(
      `DELETE FROM extensiones_pedidos WHERE solicitud_id IN (
         SELECT id FROM extensiones_solicitudes WHERE estado = 'pendiente' AND dia < $1::date
       )`,
      [hoy],
    );
    await this.pool.query(
      `UPDATE extensiones_solicitudes SET estado = 'vencida'
       WHERE estado = 'pendiente' AND dia < $1::date`,
      [hoy],
    );
    const abiertas = await this.pool.query<SolicitudExtension>(
      `SELECT ${COLUMNAS} FROM extensiones_solicitudes s
       WHERE s.estado = 'aprobada' AND s.dia < $1::date`,
      [hoy],
    );
    for (const s of abiertas.rows) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        for (const { reasignado, fila } of await this.filasVivas(s)) {
          if (reasignado) {
            await client.query(
              `DELETE FROM extensiones_pedidos WHERE solicitud_id = $1 AND pedido_id = $2 AND replica = $3`,
              [s.id, fila.pedido_id, fila.replica],
            );
            continue;
          }
          await client.query(
            `UPDATE extensiones_pedidos
               SET consecutivo = $4, comanda = $5, cliente_nombre = $6, cliente_nit = $7, estado_final = $8, kg = $9
             WHERE solicitud_id = $1 AND pedido_id = $2 AND replica = $3`,
            [s.id, fila.pedido_id, fila.replica, fila.consecutivo, fila.comanda,
             fila.cliente_nombre, fila.cliente_nit, fila.estado_final, fila.kg],
          );
        }
        await client.query(
          `UPDATE extensiones_solicitudes s
             SET estado = 'cerrada', cerrado_en = now(),
                 valor = COALESCE((SELECT c.valor FROM extensiones_config c WHERE c.punto_id = s.punto_id), s.valor, 0)
           WHERE s.id = $1`,
          [s.id],
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        this.logger.warn(`No se pudo cerrar la extensión ${s.id}: ${String(e)}`);
      } finally {
        client.release();
      }
    }
  }
}
