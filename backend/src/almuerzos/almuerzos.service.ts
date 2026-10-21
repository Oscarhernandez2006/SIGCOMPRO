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
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { tieneAccesoTotal } from '../users/permisos.catalog';

export type EstadoAlmuerzo =
  | 'pendiente'
  | 'aprobada'
  | 'reprogramada'
  | 'rechazada'
  | 'cancelada'
  | 'vencida'
  | 'terminada';

export interface SolicitudAlmuerzo {
  id: string;
  punto_id: string;
  punto_nombre: string | null;
  dia: string;
  documento: string;
  domiciliario: string;
  hora_solicitada: string;
  inicio: string;
  fin: string;
  estado: EstadoAlmuerzo;
  nota: string | null;
  solicitado_en: string;
  resuelto_por_nombre: string | null;
  resuelto_en: string | null;
  motivo_rechazo: string | null;
  motivo_reprogramacion: string | null;
  disponible_en: string | null;
  terminado_en: string | null;
  actualizado_en: string;
}

const COLUMNAS = `id::text, punto_id, punto_nombre, to_char(dia, 'YYYY-MM-DD') AS dia,
  documento, domiciliario, hora_solicitada, inicio, fin, estado, nota, solicitado_en,
  resuelto_por_nombre, resuelto_en, motivo_rechazo, motivo_reprogramacion, disponible_en, terminado_en, actualizado_en`;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const HORA_MIN = '06:00';
const HORA_MAX = '21:00';

const soloDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/**
 * Solicitudes de almuerzo de los domiciliarios. Las crea el domiciliario desde
 * Mi Variable Liquidación (server-to-server) y Despacho las aprueba, rechaza o
 * reprograma en SIGCOMPRO. El almuerzo dura siempre 1 hora y al cumplirse queda
 * "terminada" automáticamente.
 */
@Injectable()
export class AlmuerzosService implements OnModuleInit {
  private readonly logger = new Logger(AlmuerzosService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS almuerzos_solicitudes (
        id bigserial PRIMARY KEY,
        punto_id text NOT NULL,
        punto_nombre text,
        dia date NOT NULL,
        documento text NOT NULL,
        domiciliario text NOT NULL,
        hora_solicitada text NOT NULL,
        inicio timestamptz NOT NULL,
        fin timestamptz NOT NULL,
        estado text NOT NULL DEFAULT 'pendiente',
        nota text,
        solicitado_en timestamptz NOT NULL DEFAULT now(),
        resuelto_por_id text,
        resuelto_por_nombre text,
        resuelto_en timestamptz,
        motivo_rechazo text,
        terminado_en timestamptz,
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`ALTER TABLE almuerzos_solicitudes ADD COLUMN IF NOT EXISTS motivo_reprogramacion text, ADD COLUMN IF NOT EXISTS disponible_en timestamptz`);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_almuerzos_punto_dia ON almuerzos_solicitudes (punto_id, dia)`,
    );
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_almuerzos_dia_activo ON almuerzos_solicitudes (documento, dia)
        WHERE estado IN ('pendiente', 'aprobada', 'reprogramada', 'terminada')`,
    );
    await this.actualizarVencidas();
  }

  /** Cierra almuerzos cumplidos y vence solicitudes que nunca se aprobaron. */
  @Cron('0 * * * * *')
  async actualizarVencidas(): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE almuerzos_solicitudes
            SET estado = 'terminada', terminado_en = fin, actualizado_en = now()
          WHERE estado IN ('aprobada', 'reprogramada') AND fin <= now()`,
      );
      await this.pool.query(
        `UPDATE almuerzos_solicitudes
            SET estado = 'vencida', actualizado_en = now()
          WHERE estado = 'pendiente' AND fin <= now()`,
      );
    } catch (e) {
      this.logger.warn(`No se pudieron cerrar almuerzos: ${String(e)}`);
    }
  }

  private async nombreUsuario(user: JwtPayload): Promise<string> {
    const r = await this.pool.query<{ nombre: string }>(
      `SELECT nombre FROM usuarios WHERE id = $1::bigint LIMIT 1`,
      [user.sub],
    );
    return r.rows[0]?.nombre ?? user.cedula ?? '';
  }

  private async verificarPunto(user: JwtPayload, puntoId: string): Promise<void> {
    if (tieneAccesoTotal(user.rol)) return;
    const r = await this.pool.query(
      `SELECT 1 FROM usuario_punto_venta WHERE usuario_id = $1 AND punto_venta_id::text = $2 LIMIT 1`,
      [user.sub, puntoId],
    );
    if (!r.rowCount) throw new ForbiddenException('No tienes asignado este punto de venta.');
  }

  private async obtener(id: string): Promise<SolicitudAlmuerzo> {
    if (!/^\d+$/.test(id)) throw new NotFoundException('Solicitud no encontrada.');
    const r = await this.pool.query<SolicitudAlmuerzo>(
      `SELECT ${COLUMNAS} FROM almuerzos_solicitudes WHERE id = $1`,
      [id],
    );
    if (!r.rowCount) throw new NotFoundException('Solicitud no encontrada.');
    return r.rows[0];
  }

  /** Valida HH:MM y que la hora de inicio no haya pasado (tolerancia 10 min). */
  private async validarHora(hora: string): Promise<void> {
    if (!HORA.test(hora)) throw new BadRequestException('Hora inválida (usa HH:MM).');
    if (hora < HORA_MIN || hora > HORA_MAX) {
      throw new BadRequestException(`El almuerzo debe iniciar entre ${HORA_MIN} y ${HORA_MAX}.`);
    }
    const r = await this.pool.query<{ ok: boolean }>(
      `SELECT ((((now() AT TIME ZONE 'America/Bogota')::date + $1::time) AT TIME ZONE 'America/Bogota')
               >= now() - interval '10 minutes') AS ok`,
      [hora],
    );
    if (!r.rows[0]?.ok) throw new BadRequestException('La hora de inicio ya pasó.');
  }

  /* ------------------------------ Despacho ------------------------------ */

  async listarPunto(user: JwtPayload, puntoId: string, dia?: string) {
    await this.verificarPunto(user, puntoId);
    await this.actualizarVencidas();
    const d = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null;
    const r = await this.pool.query<SolicitudAlmuerzo>(
      `SELECT ${COLUMNAS} FROM almuerzos_solicitudes
        WHERE punto_id = $1 AND dia = COALESCE($2::date, (now() AT TIME ZONE 'America/Bogota')::date)
        ORDER BY (estado = 'pendiente') DESC, inicio ASC`,
      [puntoId, d],
    );
    return r.rows;
  }

  private async resolver(
    user: JwtPayload,
    id: string,
    estadosPermitidos: EstadoAlmuerzo[],
    sql: string,
    params: unknown[],
    error: string,
    condicion = 'true',
  ): Promise<SolicitudAlmuerzo> {
    const actual = await this.obtener(id);
    await this.verificarPunto(user, actual.punto_id);
    const nombre = await this.nombreUsuario(user);
    const r = await this.pool.query<SolicitudAlmuerzo>(
      `UPDATE almuerzos_solicitudes SET ${sql},
              resuelto_por_id = $2, resuelto_por_nombre = $3, resuelto_en = now(), actualizado_en = now()
        WHERE id = $1 AND estado = ANY($4::text[]) AND (${condicion})
        RETURNING ${COLUMNAS}`,
      [id, user.sub, nombre, estadosPermitidos, ...params],
    );
    if (!r.rowCount) throw new BadRequestException(error);
    return r.rows[0];
  }

  aprobar(user: JwtPayload, id: string) {
    return this.resolver(
      user,
      id,
      ['pendiente'],
      `estado = 'aprobada'`,
      [],
      'La solicitud ya no está pendiente o su hora ya pasó (reprográmala).',
      'fin > now()',
    );
  }

  rechazar(user: JwtPayload, id: string, motivo?: string) {
    const m = String(motivo ?? '').trim().slice(0, 300) || null;
    return this.resolver(
      user,
      id,
      ['pendiente'],
      `estado = 'rechazada', motivo_rechazo = $5`,
      [m],
      'La solicitud ya no está pendiente.',
    );
  }

  /** Mueve el almuerzo a otra hora (siempre 1 hora). Solo antes de que inicie. */
  async reprogramar(user: JwtPayload, id: string, hora?: string, motivo?: string) {
    const h = String(hora ?? '').trim();
    const razon = String(motivo ?? '').trim();
    if (!razon || razon.length > 300) throw new BadRequestException('Indique el motivo de reprogramacion (hasta 300 caracteres).');
    await this.validarHora(h);
    return this.resolver(
      user,
      id,
      ['pendiente', 'aprobada', 'reprogramada'],
      `estado = 'reprogramada',
       inicio = ((dia + $5::time) AT TIME ZONE 'America/Bogota'),
      fin = ((dia + $5::time) AT TIME ZONE 'America/Bogota') + interval '1 hour',
      motivo_reprogramacion = $6`,
          [h, razon],
      'Solo se puede reprogramar un almuerzo que aún no ha iniciado.',
      `estado = 'pendiente' OR inicio > now()`,
    );
  }

  /* --------------------------- Domiciliario (externo) --------------------------- */

  /** Puntos donde el domiciliario (por cédula) está registrado y activo. */
  async puntosDomiciliario(documento: string) {
    const doc = soloDigitos(documento);
    if (doc.length < 5) throw new BadRequestException('Documento inválido.');
    const registro = await this.configuracion.obtenerRegistroConCedulas();
    const coincidencias = registro.domiciliarios.filter(
      (d) => d.activo !== false && soloDigitos(d.cedula) === doc,
    );
    const ids = Array.from(new Set(coincidencias.flatMap((d) => d.puntos.map(String))));
    if (coincidencias.length === 0 || ids.length === 0) {
      return { nombre: null, puntos: [] as { id: string; nombre: string }[] };
    }
    const r = await this.pool.query<{ id: string; nombre: string }>(
      `SELECT id::text, nombre FROM puntos_venta WHERE id::text = ANY($1::text[]) AND activo = true ORDER BY nombre`,
      [ids],
    );
    return { nombre: coincidencias[0].nombre, puntos: r.rows };
  }

  async listarDomiciliario(documento: string) {
    const doc = soloDigitos(documento);
    if (doc.length < 5) throw new BadRequestException('Documento inválido.');
    await this.actualizarVencidas();
    const r = await this.pool.query<SolicitudAlmuerzo>(
      `SELECT ${COLUMNAS} FROM almuerzos_solicitudes
        WHERE documento = $1 AND dia >= (now() AT TIME ZONE 'America/Bogota')::date - 6
        ORDER BY solicitado_en DESC LIMIT 20`,
      [doc],
    );
    return r.rows;
  }

  async crear(body: { documento?: unknown; puntoId?: unknown; hora?: unknown; nota?: unknown }) {
    const documento = soloDigitos(body?.documento);
    const puntoId = String(body?.puntoId ?? '').trim();
    const hora = String(body?.hora ?? '').trim();
    const nota = String(body?.nota ?? '').trim().slice(0, 300) || null;
    const { nombre, puntos } = await this.puntosDomiciliario(documento);
    const punto = puntos.find((p) => p.id === puntoId);
    if (!nombre || !punto) {
      throw new ForbiddenException('No estás registrado como domiciliario activo en ese punto de venta.');
    }
    await this.validarHora(hora);
    await this.actualizarVencidas();
    try {
      const r = await this.pool.query<SolicitudAlmuerzo>(
        `WITH hoy AS (SELECT (now() AT TIME ZONE 'America/Bogota')::date AS d)
         INSERT INTO almuerzos_solicitudes
           (punto_id, punto_nombre, dia, documento, domiciliario, hora_solicitada, inicio, fin, nota)
         SELECT $1, $2, hoy.d, $3, $4, $5::text,
                ((hoy.d + $5::text::time) AT TIME ZONE 'America/Bogota'),
                ((hoy.d + $5::text::time) AT TIME ZONE 'America/Bogota') + interval '1 hour',
                $6
           FROM hoy
         RETURNING ${COLUMNAS}`,
        [punto.id, punto.nombre, documento, nombre, hora, nota],
      );
      return r.rows[0];
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new BadRequestException('Ya tienes un almuerzo solicitado o tomado hoy.');
      }
      throw e;
    }
  }

  async disponible(id: string, documento: unknown) {
    const doc = soloDigitos(documento);
    if (!/^\d+$/.test(id) || doc.length < 5) throw new NotFoundException('Solicitud no encontrada.');
    const r = await this.pool.query<SolicitudAlmuerzo>(
      `UPDATE almuerzos_solicitudes SET estado = 'terminada', disponible_en = COALESCE(disponible_en, now()),
           terminado_en = COALESCE(terminado_en, now()), actualizado_en = now()
        WHERE id = $1 AND documento = $2 AND estado IN ('aprobada', 'reprogramada', 'terminada')
          AND dia = (now() AT TIME ZONE 'America/Bogota')::date AND inicio <= now()
        RETURNING ${COLUMNAS}`,
      [id, doc],
    );
    if (!r.rowCount) throw new BadRequestException('Solo puede confirmar su regreso de un almuerzo iniciado hoy.');
    return r.rows[0];
  }

  async cancelar(_id: string, _documento: unknown): Promise<SolicitudAlmuerzo> {
    throw new ForbiddenException('Los almuerzos no se pueden cancelar.');
  }
}
