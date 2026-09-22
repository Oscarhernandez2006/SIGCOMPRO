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
  destinatario_id: string | null;
  /** Grupo al que pertenece el mensaje (null = mensaje directo 1 a 1). */
  grupo_id: string | null;
  /** Nombre del remitente (solo se resuelve en mensajes de GRUPO, para mostrar quién escribió). */
  remitente_nombre: string | null;
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

export interface GrupoChatResumen {
  id: string;
  nombre: string;
  imagen: string | null;
  miembros: number;
  noLeidos: number;
  ultimoMensaje: string | null;
  ultimoMensajeEn: string | null;
  ultimoMensajeEsMio: boolean;
}

export interface MiembroGrupoChat {
  id: string;
  nombre: string;
  rol: string;
}

export interface GrupoChatDetalle {
  id: string;
  nombre: string;
  imagen: string | null;
  creadoPor: string;
  miembros: MiembroGrupoChat[];
}


/**
 * Para mensajes directos usa la columna `leido`; para mensajes de grupo se considera
 * "leído" cuando TODOS los demás miembros del grupo ya vieron el mensaje (según
 * `chat_grupos_leidos`), similar a los dos chulos azules de WhatsApp en grupos.
 */
const SQL_LEIDO = `
  CASE
    WHEN m.grupo_id IS NULL THEN m.leido
    ELSE NOT EXISTS (
      SELECT 1 FROM chat_grupos_miembros gm2
      LEFT JOIN chat_grupos_leidos gl2 ON gl2.grupo_id = gm2.grupo_id AND gl2.usuario_id = gm2.usuario_id
      WHERE gm2.grupo_id = m.grupo_id
        AND gm2.usuario_id <> m.remitente_id
        AND (gl2.ultimo_leido_en IS NULL OR gl2.ultimo_leido_en < m.creado_en)
    )
  END AS leido
`;

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

    // ---- Grupos de chat ----
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_grupos (
        id bigserial PRIMARY KEY,
        nombre text NOT NULL,
        imagen text,
        creado_por bigint NOT NULL,
        creado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_grupos_miembros (
        grupo_id bigint NOT NULL REFERENCES chat_grupos(id) ON DELETE CASCADE,
        usuario_id bigint NOT NULL,
        agregado_en timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (grupo_id, usuario_id)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_grupos_leidos (
        grupo_id bigint NOT NULL REFERENCES chat_grupos(id) ON DELETE CASCADE,
        usuario_id bigint NOT NULL,
        ultimo_leido_en timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (grupo_id, usuario_id)
      )
    `);
    // Mensaje de GRUPO: mismo `mensajes_chat`, con `grupo_id` en vez de destinatario.
    await this.pool.query(
      `ALTER TABLE mensajes_chat ADD COLUMN IF NOT EXISTS grupo_id bigint REFERENCES chat_grupos(id)`,
    );
    await this.pool.query(
      `ALTER TABLE mensajes_chat ALTER COLUMN destinatario_id DROP NOT NULL`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_mensajes_chat_grupo ON mensajes_chat (grupo_id, creado_en)`,
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

  /** Total de mensajes sin leer del usuario (directos + de grupo), para el globo de la burbuja flotante. */
  async noLeidosTotal(usuarioId: string): Promise<number> {
    const directos = await this.pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM mensajes_chat WHERE destinatario_id = $1::bigint AND leido = false`,
      [usuarioId],
    );
    const grupos = await this.pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
         FROM mensajes_chat m
         JOIN chat_grupos_miembros gm ON gm.grupo_id = m.grupo_id AND gm.usuario_id = $1::bigint
         LEFT JOIN chat_grupos_leidos gl ON gl.grupo_id = m.grupo_id AND gl.usuario_id = $1::bigint
        WHERE m.grupo_id IS NOT NULL
          AND m.remitente_id <> $1::bigint
          AND m.creado_en > COALESCE(gl.ultimo_leido_en, 'epoch'::timestamptz)`,
      [usuarioId],
    );
    return Number(directos.rows[0]?.n ?? 0) + Number(grupos.rows[0]?.n ?? 0);
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
              m.destinatario_id::text AS destinatario_id, m.grupo_id::text AS grupo_id,
              NULL::text AS remitente_nombre,
              m.contenido, m.leido, m.creado_en,
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

  /** Trae un mensaje ya insertado con su cita ("responde a") resuelta y el nombre del remitente. */
  private async obtenerMensaje(id: string): Promise<MensajeChatRow> {
    const res = await this.pool.query<MensajeChatRow>(
      `SELECT m.id::text AS id, m.remitente_id::text AS remitente_id,
              m.destinatario_id::text AS destinatario_id, m.grupo_id::text AS grupo_id,
              u.nombre AS remitente_nombre,
              m.contenido, ${SQL_LEIDO}, m.creado_en,
              m.responde_a_id::text AS responde_a_id,
              r.contenido AS responde_a_contenido,
              r.remitente_id::text AS responde_a_remitente_id,
              m.adjunto_data, m.adjunto_mime, m.adjunto_nombre, m.adjunto_tipo
       FROM mensajes_chat m
       LEFT JOIN mensajes_chat r ON r.id = m.responde_a_id
       LEFT JOIN usuarios u ON u.id = m.remitente_id
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

  // ---------------------------------------------------------------------
  // Grupos de chat
  // ---------------------------------------------------------------------

  /** Lanza un error si el usuario no pertenece al grupo. */
  private async exigirMiembro(usuarioId: string, grupoId: string): Promise<void> {
    const r = await this.pool.query(
      `SELECT 1 FROM chat_grupos_miembros WHERE grupo_id = $1::bigint AND usuario_id = $2::bigint`,
      [grupoId, usuarioId],
    );
    if ((r.rowCount ?? 0) === 0) {
      throw new BadRequestException('No perteneces a este grupo.');
    }
  }

  /** Grupos del usuario, con resumen de la conversación (para la lista tipo "contactos"). */
  async gruposDe(usuarioId: string): Promise<GrupoChatResumen[]> {
    const res = await this.pool.query<{
      id: string;
      nombre: string;
      imagen: string | null;
      miembros: number;
      no_leidos: number;
      ultimo_en: string | null;
      ultimo_contenido: string | null;
      ultimo_adjunto_tipo: string | null;
      ultimo_remitente: string | null;
    }>(
      `SELECT g.id::text AS id, g.nombre, g.imagen,
              (SELECT COUNT(*)::int FROM chat_grupos_miembros gm2 WHERE gm2.grupo_id = g.id) AS miembros,
              COALESCE((
                SELECT COUNT(*)::int FROM mensajes_chat m
                WHERE m.grupo_id = g.id AND m.remitente_id <> $1::bigint
                  AND m.creado_en > COALESCE(gl.ultimo_leido_en, 'epoch'::timestamptz)
              ), 0) AS no_leidos,
              ultimo.creado_en AS ultimo_en,
              ultimo.contenido AS ultimo_contenido,
              ultimo.adjunto_tipo AS ultimo_adjunto_tipo,
              ultimo.remitente_id::text AS ultimo_remitente
         FROM chat_grupos g
         JOIN chat_grupos_miembros gm ON gm.grupo_id = g.id AND gm.usuario_id = $1::bigint
         LEFT JOIN chat_grupos_leidos gl ON gl.grupo_id = g.id AND gl.usuario_id = $1::bigint
         LEFT JOIN LATERAL (
           SELECT contenido, adjunto_tipo, remitente_id, creado_en
             FROM mensajes_chat m2
            WHERE m2.grupo_id = g.id
            ORDER BY m2.creado_en DESC
            LIMIT 1
         ) ultimo ON true
        ORDER BY g.nombre ASC`,
      [usuarioId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      imagen: r.imagen,
      miembros: Number(r.miembros) || 0,
      noLeidos: Number(r.no_leidos) || 0,
      ultimoMensaje:
        r.ultimo_contenido ||
        (r.ultimo_adjunto_tipo === 'imagen'
          ? '📷 Foto'
          : r.ultimo_adjunto_tipo === 'video'
            ? '🎥 Video'
            : r.ultimo_adjunto_tipo === 'archivo'
              ? '📎 Archivo'
              : null),
      ultimoMensajeEn: r.ultimo_en,
      ultimoMensajeEsMio: r.ultimo_remitente === usuarioId,
    }));
  }

  /** Crea un grupo con el creador + los miembros indicados. */
  async crearGrupo(
    creadorId: string,
    nombre: string,
    imagen: string | null | undefined,
    miembrosIds: string[],
  ): Promise<GrupoChatDetalle> {
    const nombreLimpio = (nombre ?? '').trim();
    if (!nombreLimpio) {
      throw new BadRequestException('El grupo necesita un nombre.');
    }
    const miembrosUnicos = [...new Set([creadorId, ...miembrosIds.map(String)])];
    if (miembrosUnicos.length < 2) {
      throw new BadRequestException('Selecciona al menos un participante.');
    }
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const ins = await cliente.query<{ id: string }>(
        `INSERT INTO chat_grupos (nombre, imagen, creado_por) VALUES ($1, $2, $3::bigint) RETURNING id::text AS id`,
        [nombreLimpio, imagen ?? null, creadorId],
      );
      const grupoId = ins.rows[0].id;
      for (const miembroId of miembrosUnicos) {
        await cliente.query(
          `INSERT INTO chat_grupos_miembros (grupo_id, usuario_id) VALUES ($1::bigint, $2::bigint)
           ON CONFLICT DO NOTHING`,
          [grupoId, miembroId],
        );
      }
      await cliente.query(
        `INSERT INTO chat_grupos_leidos (grupo_id, usuario_id) VALUES ($1::bigint, $2::bigint)
         ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET ultimo_leido_en = now()`,
        [grupoId, creadorId],
      );
      await cliente.query('COMMIT');
      return this.grupoDetalle(creadorId, grupoId);
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }

  /** Detalle del grupo (nombre, imagen, miembros) — exige pertenecer a él. */
  async grupoDetalle(usuarioId: string, grupoId: string): Promise<GrupoChatDetalle> {
    await this.exigirMiembro(usuarioId, grupoId);
    const grupo = await this.pool.query<{ id: string; nombre: string; imagen: string | null; creado_por: string }>(
      `SELECT id::text AS id, nombre, imagen, creado_por::text AS creado_por FROM chat_grupos WHERE id = $1::bigint`,
      [grupoId],
    );
    if ((grupo.rowCount ?? 0) === 0) {
      throw new BadRequestException('El grupo no existe.');
    }
    const miembros = await this.pool.query<{ id: string; nombre: string; rol: string }>(
      `SELECT u.id::text AS id, u.nombre, u.rol
         FROM chat_grupos_miembros gm
         JOIN usuarios u ON u.id = gm.usuario_id
        WHERE gm.grupo_id = $1::bigint
        ORDER BY u.nombre ASC`,
      [grupoId],
    );
    const g = grupo.rows[0];
    return {
      id: g.id,
      nombre: g.nombre,
      imagen: g.imagen,
      creadoPor: g.creado_por,
      miembros: miembros.rows,
    };
  }

  /** Actualiza nombre/imagen y agrega/quita miembros de un grupo (cualquier miembro puede administrar). */
  async actualizarGrupo(
    usuarioId: string,
    grupoId: string,
    cambios: { nombre?: string; imagen?: string | null; agregar?: string[]; quitar?: string[] },
  ): Promise<GrupoChatDetalle> {
    await this.exigirMiembro(usuarioId, grupoId);
    if (cambios.nombre !== undefined) {
      const nombreLimpio = cambios.nombre.trim();
      if (!nombreLimpio) throw new BadRequestException('El nombre del grupo no puede quedar vacío.');
      await this.pool.query(`UPDATE chat_grupos SET nombre = $1 WHERE id = $2::bigint`, [nombreLimpio, grupoId]);
    }
    if (cambios.imagen !== undefined) {
      await this.pool.query(`UPDATE chat_grupos SET imagen = $1 WHERE id = $2::bigint`, [cambios.imagen, grupoId]);
    }
    for (const nuevoId of cambios.agregar ?? []) {
      await this.pool.query(
        `INSERT INTO chat_grupos_miembros (grupo_id, usuario_id) VALUES ($1::bigint, $2::bigint)
         ON CONFLICT DO NOTHING`,
        [grupoId, nuevoId],
      );
    }
    for (const quitarId of cambios.quitar ?? []) {
      await this.pool.query(
        `DELETE FROM chat_grupos_miembros WHERE grupo_id = $1::bigint AND usuario_id = $2::bigint`,
        [grupoId, quitarId],
      );
    }
    return this.grupoDetalle(usuarioId, grupoId);
  }

  /** Historial de un grupo; marca como leído para el usuario que consulta. */
  async historialGrupo(
    usuarioId: string,
    grupoId: string,
    desde?: string,
  ): Promise<{ mensajes: MensajeChatRow[]; ahora: string }> {
    await this.exigirMiembro(usuarioId, grupoId);
    const ahora = new Date().toISOString();
    const desdeValido = desde && !Number.isNaN(Date.parse(desde)) ? desde : null;

    await this.pool.query(
      `INSERT INTO chat_grupos_leidos (grupo_id, usuario_id) VALUES ($1::bigint, $2::bigint)
       ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET ultimo_leido_en = now()`,
      [grupoId, usuarioId],
    );

    const res = await this.pool.query<MensajeChatRow>(
      `SELECT m.id::text AS id, m.remitente_id::text AS remitente_id,
              m.destinatario_id::text AS destinatario_id, m.grupo_id::text AS grupo_id,
              u.nombre AS remitente_nombre,
              m.contenido, ${SQL_LEIDO}, m.creado_en,
              m.responde_a_id::text AS responde_a_id,
              r.contenido AS responde_a_contenido,
              r.remitente_id::text AS responde_a_remitente_id,
              m.adjunto_data, m.adjunto_mime, m.adjunto_nombre, m.adjunto_tipo
         FROM mensajes_chat m
         LEFT JOIN mensajes_chat r ON r.id = m.responde_a_id
         LEFT JOIN usuarios u ON u.id = m.remitente_id
        WHERE m.grupo_id = $1::bigint
          AND ($2::timestamptz IS NULL OR m.creado_en > $2::timestamptz)
        ORDER BY m.creado_en ASC`,
      [grupoId, desdeValido],
    );
    return { mensajes: res.rows, ahora };
  }

  /** Envía un mensaje a un grupo (exige pertenecer a él). */
  async enviarGrupo(
    remitenteId: string,
    grupoId: string,
    contenido: string | undefined,
    respondeAId?: string | null,
    adjunto?: {
      data: string;
      mime: string;
      nombre: string;
      tipo: 'imagen' | 'video' | 'archivo';
    } | null,
  ): Promise<MensajeChatRow> {
    await this.exigirMiembro(remitenteId, grupoId);
    const texto = (contenido ?? '').trim();
    if (!texto && !adjunto) {
      throw new BadRequestException('El mensaje no puede estar vacío.');
    }
    if (adjunto && adjunto.data.length > 16 * 1024 * 1024) {
      throw new BadRequestException('El archivo adjunto es demasiado grande (máx. 12 MB).');
    }
    let respondeA: string | null = null;
    if (respondeAId) {
      const cita = await this.pool.query(
        `SELECT id FROM mensajes_chat WHERE id = $1::bigint AND grupo_id = $2::bigint LIMIT 1`,
        [respondeAId, grupoId],
      );
      if ((cita.rowCount ?? 0) > 0) respondeA = respondeAId;
    }
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO mensajes_chat
         (remitente_id, grupo_id, contenido, responde_a_id,
          adjunto_data, adjunto_mime, adjunto_nombre, adjunto_tipo)
       VALUES ($1::bigint, $2::bigint, $3, $4::bigint, $5, $6, $7, $8)
       RETURNING id::text AS id`,
      [
        remitenteId,
        grupoId,
        texto || null,
        respondeA,
        adjunto?.data ?? null,
        adjunto?.mime ?? null,
        adjunto?.nombre ?? null,
        adjunto?.tipo ?? null,
      ],
    );
    await this.pool.query(
      `INSERT INTO chat_grupos_leidos (grupo_id, usuario_id) VALUES ($1::bigint, $2::bigint)
       ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET ultimo_leido_en = now()`,
      [grupoId, remitenteId],
    );
    return this.obtenerMensaje(res.rows[0].id);
  }
}
