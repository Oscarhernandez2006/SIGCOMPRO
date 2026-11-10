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

/** Hora (0-23) desde la que se puede marcar un pedido como no gestionado (Bogotá). */
export const HORA_HABILITA_INCUMPLIMIENTO = 20;

/** Estados en los que un pedido cuenta como "sin gestionar" al cierre del turno. */
const ESTADOS_NO_FINALIZADOS = [
  'en proceso',
  'atrasado',
  'liberación',
  'liberacion',
  'en producción',
  'en produccion',
  'alistado',
  'facturado',
  'despachado',
  'en tránsito',
  'en transito',
];

const MAX_IMAGEN = 8 * 1024 * 1024;

export interface Incumplimiento {
  id: string;
  pedidoId: string;
  comanda: string;
  puntoId: string;
  puntoNombre: string;
  usuarioId: string;
  usuarioNombre: string;
  usuarioCedula: string;
  motivo: string;
  descripcion: string;
  estadoPedido: string;
  pedido: Record<string, unknown>;
  imagen: string | null;
  registradoPorId: string;
  registradoPorNombre: string;
  creadoEn: string;
}

interface Fila {
  id: string;
  pedido_id: string;
  comanda: string;
  punto_id: string;
  punto_nombre: string;
  usuario_id: string;
  usuario_nombre: string;
  usuario_cedula: string;
  motivo: string;
  descripcion: string;
  estado_pedido: string;
  pedido: Record<string, unknown>;
  imagen: string | null;
  registrado_por_id: string;
  registrado_por_nombre: string;
  creado_en: Date;
}

const aIncumplimiento = (r: Fila): Incumplimiento => ({
  id: String(r.id),
  pedidoId: r.pedido_id,
  comanda: r.comanda,
  puntoId: r.punto_id,
  puntoNombre: r.punto_nombre,
  usuarioId: r.usuario_id,
  usuarioNombre: r.usuario_nombre,
  usuarioCedula: r.usuario_cedula,
  motivo: r.motivo,
  descripcion: r.descripcion,
  estadoPedido: r.estado_pedido,
  pedido: r.pedido ?? {},
  imagen: r.imagen,
  registradoPorId: r.registrado_por_id,
  registradoPorNombre: r.registrado_por_nombre,
  creadoEn: r.creado_en.toISOString(),
});

/**
 * Incumplimientos operativos: pedidos que quedaron sin gestionar al cierre del
 * turno, asignados al operario responsable como evidencia para informes.
 */
@Injectable()
export class IncumplimientosService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS incumplimientos_personal (
         id bigserial PRIMARY KEY,
         pedido_id text NOT NULL,
         comanda text NOT NULL DEFAULT '',
         punto_id text NOT NULL DEFAULT '',
         punto_nombre text NOT NULL DEFAULT '',
         usuario_id text NOT NULL,
         usuario_nombre text NOT NULL DEFAULT '',
         usuario_cedula text NOT NULL DEFAULT '',
         motivo text NOT NULL,
         descripcion text NOT NULL,
         estado_pedido text NOT NULL DEFAULT '',
         pedido jsonb NOT NULL DEFAULT '{}'::jsonb,
         imagen text NULL,
         registrado_por_id text NOT NULL DEFAULT '',
         registrado_por_nombre text NOT NULL DEFAULT '',
         dia date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Bogota')::date,
         creado_en timestamptz NOT NULL DEFAULT now()
       )`,
    );
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_incumplimientos_pedido_dia
         ON incumplimientos_personal (pedido_id, dia)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_incumplimientos_usuario
         ON incumplimientos_personal (usuario_id, creado_en DESC)`,
    );
  }

  private horaBogota(): number {
    return Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: '2-digit', hour12: false })
        .format(new Date())
        .replace(/\D/g, ''),
    ) % 24;
  }

  /** Personal de despacho asignado al punto (si no hay, todos los activos del punto). */
  async responsables(puntoId: string) {
    const res = await this.pool.query<{ id: string; nombre: string; cedula: string; rol: string }>(
      `SELECT u.id::text AS id, u.nombre, u.cedula, u.rol
         FROM usuarios u
         JOIN usuario_punto_venta upv ON upv.usuario_id = u.id
        WHERE upv.punto_venta_id::text = $1 AND u.activo = true
        ORDER BY (lower(trim(u.rol)) = 'despacho') DESC, u.nombre ASC`,
      [puntoId],
    );
    const despacho = res.rows.filter((r) => (r.rol ?? '').trim().toLowerCase() === 'despacho');
    return despacho.length ? despacho : res.rows;
  }

  /** IDs de pedidos ya marcados hoy (para mostrar el sello en Despacho). */
  async marcadosHoy(): Promise<string[]> {
    const res = await this.pool.query<{ pedido_id: string }>(
      `SELECT pedido_id FROM incumplimientos_personal
        WHERE dia = (now() AT TIME ZONE 'America/Bogota')::date`,
    );
    return res.rows.map((r) => r.pedido_id);
  }

  async crear(
    autor: JwtPayload,
    body: { pedidoId?: string; usuarioId?: string; motivo?: string; descripcion?: string; imagen?: string },
  ): Promise<Incumplimiento> {
    if (this.horaBogota() < HORA_HABILITA_INCUMPLIMIENTO) {
      throw new BadRequestException('Solo se puede marcar un pedido como no gestionado después de las 8:00 p. m.');
    }
    const pedidoId = String(body.pedidoId ?? '').trim();
    const usuarioId = String(body.usuarioId ?? '').trim();
    const motivo = String(body.motivo ?? '').trim().slice(0, 200);
    const descripcion = String(body.descripcion ?? '').trim().slice(0, 4000);
    const imagen = typeof body.imagen === 'string' ? body.imagen : null;
    if (!pedidoId || !usuarioId) throw new BadRequestException('Falta el pedido o el responsable.');
    if (!motivo) throw new BadRequestException('Indica el motivo del incumplimiento.');
    if (descripcion.length < 10) throw new BadRequestException('Describe lo ocurrido (mínimo 10 caracteres).');
    if (imagen && (!/^data:image\/(png|jpeg);base64,/.test(imagen) || imagen.length > MAX_IMAGEN)) {
      throw new BadRequestException('La imagen del pedido no es válida.');
    }

    const ped = await this.pool.query<{
      id: string;
      estado: string | null;
      anulado: boolean;
      fecha: Date | null;
      data: Record<string, any>;
      meta: Record<string, any>;
    }>(`SELECT id, estado, anulado, fecha, data, meta FROM pedidos WHERE id = $1`, [pedidoId]);
    const p = ped.rows[0];
    if (!p) throw new NotFoundException('Pedido no encontrado.');
    const estado = (p.estado || p.data?.estado || 'En proceso') as string;
    if (p.anulado || !ESTADOS_NO_FINALIZADOS.includes(estado.trim().toLowerCase())) {
      throw new BadRequestException(`El pedido está "${estado}": no cuenta como no gestionado.`);
    }

    const resp = await this.pool.query<{ id: string; nombre: string; cedula: string }>(
      `SELECT id::text AS id, nombre, cedula FROM usuarios WHERE id::text = $1`,
      [usuarioId],
    );
    const r = resp.rows[0];
    if (!r) throw new NotFoundException('El responsable no existe.');
    const aut = await this.pool.query<{ nombre: string }>(
      `SELECT nombre FROM usuarios WHERE id::text = $1`,
      [String(autor.sub)],
    );

    const d = p.data ?? {};
    const m = p.meta ?? {};
    const carrito = Array.isArray(d.carrito) ? d.carrito : [];
    const subtotal = carrito.reduce(
      (s: number, i: any) => s + (Number(i?.producto?.precio) || 0) * (Number(i?.cantidad) || 0),
      0,
    );
    const domicilio = d.entrega === 'domicilio' ? Number(d.valorDomicilio) || 0 : 0;
    // Copia fija del pedido al momento de marcarlo (no cambia aunque luego se gestione).
    const resumen = {
      comanda: d.comanda ?? '',
      numeroDia: d.numeroDia ?? null,
      fecha: p.fecha ? p.fecha.toISOString() : d.fecha ?? null,
      fechaProgramada: d.entregaProgramada ? d.fechaProgramada ?? null : null,
      horaDespacho: d.horaDespacho ?? null,
      estado,
      pago: d.pago ?? '',
      entrega: d.entrega ?? '',
      vendedor: d.vendedorNombre ?? '',
      observacion: d.observacion ?? '',
      cliente: {
        nombre: d.cliente?.nombre ?? '',
        nit: d.cliente?.nit_cedula ?? '',
        direccion: d.cliente?.direccion ?? '',
        barrio: d.cliente?.barrio ?? '',
        ciudad: d.cliente?.ciudad ?? '',
        telefono: d.cliente?.telefono ?? '',
      },
      productos: carrito.map((i: any) => ({
        referencia: i?.producto?.referencia ?? '',
        producto: i?.producto?.producto ?? '',
        um: i?.producto?.um ?? '',
        cantidad: Number(i?.cantidad) || 0,
        valor: (Number(i?.producto?.precio) || 0) * (Number(i?.cantidad) || 0),
      })),
      subtotal,
      domicilio,
      total: subtotal + domicilio,
      despacho: {
        porcionador: m.porcionador ?? null,
        inicioAlistamiento: m.inicio ?? null,
        finAlistamiento: m.fin ?? null,
        factura: m.facturaNumero ?? null,
        valorFactura: m.facturaValor ?? null,
        domiciliario: m.domiciliario ?? null,
        pagoConfirmado: Boolean(m.pagoConfirmado),
      },
    };

    try {
      const ins = await this.pool.query<Fila>(
        `INSERT INTO incumplimientos_personal
           (pedido_id, comanda, punto_id, punto_nombre, usuario_id, usuario_nombre, usuario_cedula,
            motivo, descripcion, estado_pedido, pedido, imagen, registrado_por_id, registrado_por_nombre)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)
         RETURNING *`,
        [
          p.id,
          String(d.comanda ?? ''),
          String(d.punto?.id ?? ''),
          String(d.punto?.nombre ?? ''),
          r.id,
          r.nombre ?? '',
          r.cedula ?? '',
          motivo,
          descripcion,
          estado,
          JSON.stringify(resumen),
          imagen,
          String(autor.sub ?? ''),
          aut.rows[0]?.nombre ?? autor.cedula ?? '',
        ],
      );
      return aIncumplimiento(ins.rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ConflictException('Este pedido ya fue marcado como no gestionado hoy.');
      }
      throw e;
    }
  }

  /** Personas con incumplimientos registrados (resumen). */
  async personas() {
    const res = await this.pool.query<{
      usuario_id: string;
      nombre: string;
      cedula: string;
      total: number;
      ultimo: Date;
      puntos: string[];
    }>(
      `SELECT usuario_id,
              (array_agg(usuario_nombre ORDER BY creado_en DESC))[1] AS nombre,
              (array_agg(usuario_cedula ORDER BY creado_en DESC))[1] AS cedula,
              COUNT(*)::int AS total,
              MAX(creado_en) AS ultimo,
              array_agg(DISTINCT punto_nombre) AS puntos
         FROM incumplimientos_personal
        GROUP BY usuario_id
        ORDER BY MAX(creado_en) DESC`,
    );
    return res.rows.map((r) => ({
      usuarioId: r.usuario_id,
      nombre: r.nombre,
      cedula: r.cedula,
      total: r.total,
      ultimo: r.ultimo.toISOString(),
      puntos: (r.puntos ?? []).filter(Boolean),
    }));
  }

  /** Ficha de la persona y todas sus marcaciones (con evidencia). */
  async persona(usuarioId: string) {
    const u = await this.pool.query<{
      id: string;
      nombre: string;
      cedula: string;
      rol: string;
      activo: boolean;
      creado_en: Date | null;
    }>(`SELECT id::text AS id, nombre, cedula, rol, activo, creado_en FROM usuarios WHERE id::text = $1`, [usuarioId]);
    const pts = await this.pool.query<{ nombre: string }>(
      `SELECT pv.nombre FROM usuario_punto_venta upv
         JOIN puntos_venta pv ON pv.id = upv.punto_venta_id
        WHERE upv.usuario_id::text = $1 ORDER BY pv.nombre`,
      [usuarioId],
    );
    const inc = await this.pool.query<Fila>(
      `SELECT * FROM incumplimientos_personal WHERE usuario_id = $1 ORDER BY creado_en DESC`,
      [usuarioId],
    );
    if (!u.rows[0] && inc.rows.length === 0) throw new NotFoundException('Persona no encontrada.');
    const x = u.rows[0];
    return {
      persona: {
        id: usuarioId,
        nombre: x?.nombre ?? inc.rows[0]?.usuario_nombre ?? '',
        cedula: x?.cedula ?? inc.rows[0]?.usuario_cedula ?? '',
        rol: x?.rol ?? '',
        activo: x?.activo ?? false,
        creadoEn: x?.creado_en ? x.creado_en.toISOString() : null,
        puntos: pts.rows.map((r) => r.nombre),
      },
      incumplimientos: inc.rows.map(aIncumplimiento),
    };
  }

  async eliminar(id: string): Promise<{ ok: true }> {
    const res = await this.pool.query(`DELETE FROM incumplimientos_personal WHERE id::text = $1`, [id]);
    if (!res.rowCount) throw new NotFoundException('Registro no encontrado.');
    return { ok: true };
  }
}
