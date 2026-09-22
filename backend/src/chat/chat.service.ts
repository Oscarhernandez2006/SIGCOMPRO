import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface MensajeChatRow {
  id: string;
  remitente_id: string;
  destinatario_id: string;
  contenido: string;
  leido: boolean;
  creado_en: string;
  /** Id del mensaje al que responde (null si no es una respuesta). */
  responde_a_id: string | null;
  /** Contenido del mensaje citado (para mostrar la vista previa "responder a"). */
  responde_a_contenido: string | null;
  /** Remitente del mensaje citado (para saber si lo escribí yo o el contacto). */
  responde_a_remitente_id: string | null;
  /** Adjunto (foto/video/archivo) en base64 con su prefijo data:<mime>;base64,... (null si no tiene). */
  adjunto_data: string | null;
  adjunto_mime: string | null;
  adjunto_nombre: string | null;
  adjunto_tipo: 'imagen' | 'video' | 'archivo' | null;
}

export interface ContactoChat {
  id: string;
  nombre: string;
  rol: string;
  activo: boolean;
  /** Nombres de los puntos de venta asignados al contacto (separados por coma). */
  puntos: string;
  noLeidos: number;
  ultimoMensaje: string | null;
  ultimoMensajeEn: string | null;
  /** true si el último mensaje de la conversación lo envié yo. */
  ultimoMensajeEsMio: boolean;
}

/** Mensajería interna (tipo chat) entre usuarios de SIGCOMPRO. */
@Injectable()
export class ChatService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS mensajes_chat (
        id bigserial PRIMARY KEY,
        remitente_id bigint NOT NULL,
        destinatario_id bigint NOT NULL,
        contenido text NOT NULL,
        leido boolean NOT NULL DEFAULT false,
        creado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_mensajes_chat_par ON mensajes_chat (remitente_id, destinatario_id, creado_en)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_mensajes_chat_destinatario ON mensajes_chat (destinatario_id, leido)`,
    );
    // Mensaje citado al "responder" (tipo WhatsApp).
    await this.pool.query(
      `ALTER TABLE mensajes_chat ADD COLUMN IF NOT EXISTS responde_a_id bigint REFERENCES mensajes_chat(id)`,
    );
    // Adjuntos (foto/video/archivo). El mensaje puede ir solo con adjunto (sin texto).
    await this.pool.query(
      `ALTER TABLE mensajes_chat ALTER COLUMN contenido DROP NOT NULL`,
    );
    await this.pool.query(
      `ALTER TABLE mensajes_chat ADD COLUMN IF NOT EXISTS adjunto_data text`,
    );
    await this.pool.query(
      `ALTER TABLE mensajes_chat ADD COLUMN IF NOT EXISTS adjunto_mime text`,
    );
    await this.pool.query(
      `ALTER TABLE mensajes_chat ADD COLUMN IF NOT EXISTS adjunto_nombre text`,
    );
    await this.pool.query(
      `ALTER TABLE mensajes_chat ADD COLUMN IF NOT EXISTS adjunto_tipo text`,
    );
  }

  /** Todos los usuarios (menos yo) con su rol, puntos asignados y resumen de la conversación. */
  async contactos(usuarioId: string): Promise<ContactoChat[]> {
    const usuarios = await this.pool.query<{
      id: string;
      nombre: string;
      rol: string;
      activo: boolean;
      puntos: string;
    }>(
      `SELECT u.id::text AS id, u.nombre, u.rol, u.activo,
              COALESCE(string_agg(DISTINCT pv.nombre, ', ' ORDER BY pv.nombre), '') AS puntos
       FROM usuarios u
       LEFT JOIN usuario_punto_venta upv ON upv.usuario_id = u.id
       LEFT JOIN puntos_venta pv ON pv.id = upv.punto_venta_id
       WHERE u.id <> $1::bigint
       GROUP BY u.id, u.nombre, u.rol, u.activo
       ORDER BY u.nombre ASC`,
      [usuarioId],
    );

    const resumen = await this.pool.query<{
      contacto_id: string;
      ultimo_en: string;
      ultimo_contenido: string;
      ultimo_adjunto_tipo: string | null;
      ultimo_remitente: string;
      no_leidos: number;
    }>(
      `SELECT
         (CASE WHEN remitente_id = $1::bigint THEN destinatario_id ELSE remitente_id END)::text AS contacto_id,
         MAX(creado_en) AS ultimo_en,
         (array_agg(contenido ORDER BY creado_en DESC))[1] AS ultimo_contenido,
         (array_agg(adjunto_tipo ORDER BY creado_en DESC))[1] AS ultimo_adjunto_tipo,
         (array_agg(remitente_id ORDER BY creado_en DESC))[1]::text AS ultimo_remitente,
         COUNT(*) FILTER (WHERE destinatario_id = $1::bigint AND leido = false)::int AS no_leidos
       FROM mensajes_chat
       WHERE remitente_id = $1::bigint OR destinatario_id = $1::bigint
       GROUP BY contacto_id`,
      [usuarioId],
    );
    const porContacto = new Map(resumen.rows.map((r) => [r.contacto_id, r]));

    const contactos = usuarios.rows.map((u) => {
      const r = porContacto.get(u.id);
      return {
        id: u.id,
        nombre: u.nombre,
        rol: u.rol,
        activo: u.activo,
        puntos: u.puntos,
        noLeidos: r?.no_leidos ?? 0,
        ultimoMensaje:
          r?.ultimo_contenido ||
          (r?.ultimo_adjunto_tipo === 'imagen'
            ? '📷 Foto'
            : r?.ultimo_adjunto_tipo === 'video'
              ? '🎥 Video'
              : r?.ultimo_adjunto_tipo === 'archivo'
                ? '📎 Archivo'
                : null),
        ultimoMensajeEn: r?.ultimo_en ?? null,
        ultimoMensajeEsMio: r ? r.ultimo_remitente === usuarioId : false,
      };
    });

    // Contactos con conversación reciente primero; luego alfabético.
    contactos.sort((a, b) => {
      if (a.ultimoMensajeEn && b.ultimoMensajeEn) {
        return a.ultimoMensajeEn < b.ultimoMensajeEn ? 1 : -1;
      }
      if (a.ultimoMensajeEn) return -1;
      if (b.ultimoMensajeEn) return 1;
      return a.nombre.localeCompare(b.nombre);
    });
    return contactos;
  }

  /** Total de mensajes sin leer del usuario (para el globo de la burbuja flotante). */
  async noLeidosTotal(usuarioId: string): Promise<number> {
    const res = await this.pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM mensajes_chat WHERE destinatario_id = $1::bigint AND leido = false`,
      [usuarioId],
    );
    return Number(res.rows[0]?.n ?? 0);
  }

  /**
   * Historial de la conversación con `otroId`. Al consultarse marca como
   * leídos los mensajes que el otro me envió (se asume que si se pide el
   * historial es porque el chat está abierto en pantalla).
   */
  async historial(
    usuarioId: string,
    otroId: string,
    desde?: string,
  ): Promise<{ mensajes: MensajeChatRow[]; ahora: string }> {
    const ahora = new Date().toISOString();
    const desdeValido =
      desde && !Number.isNaN(Date.parse(desde)) ? desde : null;

    await this.pool.query(
      `UPDATE mensajes_chat SET leido = true
       WHERE destinatario_id = $1::bigint AND remitente_id = $2::bigint AND leido = false`,
      [usuarioId, otroId],
    );

    const res = await this.pool.query<MensajeChatRow>(
      `SELECT m.id::text AS id, m.remitente_id::text AS remitente_id,
              m.destinatario_id::text AS destinatario_id, m.contenido, m.leido, m.creado_en,
              m.responde_a_id::text AS responde_a_id,
              r.contenido AS responde_a_contenido,
              r.remitente_id::text AS responde_a_remitente_id,
              m.adjunto_data, m.adjunto_mime, m.adjunto_nombre, m.adjunto_tipo
       FROM mensajes_chat m
       LEFT JOIN mensajes_chat r ON r.id = m.responde_a_id
       WHERE ((m.remitente_id = $1::bigint AND m.destinatario_id = $2::bigint)
           OR (m.remitente_id = $2::bigint AND m.destinatario_id = $1::bigint))
         AND ($3::timestamptz IS NULL OR m.creado_en > $3::timestamptz)
       ORDER BY m.creado_en ASC`,
      [usuarioId, otroId, desdeValido],
    );
    return { mensajes: res.rows, ahora };
  }

  /** Trae un mensaje ya insertado con su cita ("responde a") resuelta. */
  private async obtenerMensaje(id: string): Promise<MensajeChatRow> {
    const res = await this.pool.query<MensajeChatRow>(
      `SELECT m.id::text AS id, m.remitente_id::text AS remitente_id,
              m.destinatario_id::text AS destinatario_id, m.contenido, m.leido, m.creado_en,
              m.responde_a_id::text AS responde_a_id,
              r.contenido AS responde_a_contenido,
              r.remitente_id::text AS responde_a_remitente_id,
              m.adjunto_data, m.adjunto_mime, m.adjunto_nombre, m.adjunto_tipo
       FROM mensajes_chat m
       LEFT JOIN mensajes_chat r ON r.id = m.responde_a_id
       WHERE m.id = $1::bigint`,
      [id],
    );
    return res.rows[0];
  }

  async enviar(
    remitenteId: string,
    destinatarioId: string,
    contenido: string | undefined,
    respondeAId?: string | null,
    adjunto?: {
      data: string;
      mime: string;
      nombre: string;
      tipo: 'imagen' | 'video' | 'archivo';
    } | null,
  ): Promise<MensajeChatRow> {
    if (String(remitenteId) === String(destinatarioId)) {
      throw new BadRequestException('No puedes enviarte mensajes a ti mismo.');
    }
    const texto = (contenido ?? '').trim();
    if (!texto && !adjunto) {
      throw new BadRequestException('El mensaje no puede estar vacío.');
    }
    // Tope de tamaño del adjunto (base64 incluido): protege el body del backend.
    if (adjunto && adjunto.data.length > 16 * 1024 * 1024) {
      throw new BadRequestException('El archivo adjunto es demasiado grande (máx. 12 MB).');
    }
    const destino = await this.pool.query(
      `SELECT id FROM usuarios WHERE id = $1::bigint LIMIT 1`,
      [destinatarioId],
    );
    if (destino.rowCount === 0) {
      throw new BadRequestException('El destinatario no existe.');
    }

    // El mensaje citado debe pertenecer a esta misma conversación.
    let respondeA: string | null = null;
    if (respondeAId) {
      const cita = await this.pool.query(
        `SELECT id FROM mensajes_chat WHERE id = $1::bigint
         AND ((remitente_id = $2::bigint AND destinatario_id = $3::bigint)
           OR (remitente_id = $3::bigint AND destinatario_id = $2::bigint))
         LIMIT 1`,
        [respondeAId, remitenteId, destinatarioId],
      );
      if ((cita.rowCount ?? 0) > 0) respondeA = respondeAId;
    }

    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO mensajes_chat
         (remitente_id, destinatario_id, contenido, responde_a_id,
          adjunto_data, adjunto_mime, adjunto_nombre, adjunto_tipo)
       VALUES ($1::bigint, $2::bigint, $3, $4::bigint, $5, $6, $7, $8)
       RETURNING id::text AS id`,
      [
        remitenteId,
        destinatarioId,
        texto || null,
        respondeA,
        adjunto?.data ?? null,
        adjunto?.mime ?? null,
        adjunto?.nombre ?? null,
        adjunto?.tipo ?? null,
      ],
    );
    return this.obtenerMensaje(res.rows[0].id);
  }
}
