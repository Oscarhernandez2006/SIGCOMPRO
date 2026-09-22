import { apiFetch } from "./api";

export function tipoAdjuntoDe(mime: string): "imagen" | "video" | "archivo" {
  if (mime.startsWith("image/")) return "imagen";
  if (mime.startsWith("video/")) return "video";
  return "archivo";
}

export function leerArchivoComoBase64(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
}

export interface ContactoChat {
  id: string;
  nombre: string;
  rol: string;
  activo: boolean;
  /** Puntos de venta asignados al contacto, separados por coma (puede venir vacío). */
  puntos: string;
  noLeidos: number;
  ultimoMensaje: string | null;
  ultimoMensajeEn: string | null;
  ultimoMensajeEsMio: boolean;
}

export interface MensajeChat {
  id: string;
  remitente_id: string;
  destinatario_id: string | null;
  /** Grupo al que pertenece el mensaje (null = mensaje directo 1 a 1). */
  grupo_id: string | null;
  /** Nombre del remitente (solo viene resuelto en mensajes de GRUPO). */
  remitente_nombre: string | null;
  contenido: string;
  leido: boolean;
  creado_en: string;
  /** Id del mensaje al que responde (null si no es una respuesta). */
  responde_a_id: string | null;
  /** Contenido citado (vista previa "responder a"). */
  responde_a_contenido: string | null;
  /** Remitente del mensaje citado. */
  responde_a_remitente_id: string | null;
  /** Adjunto (foto/video/archivo) en base64 con prefijo data:<mime>;base64,... */
  adjunto_data: string | null;
  adjunto_mime: string | null;
  adjunto_nombre: string | null;
  adjunto_tipo: "imagen" | "video" | "archivo" | null;
}

export interface AdjuntoChat {
  data: string;
  mime: string;
  nombre: string;
  tipo: "imagen" | "video" | "archivo";
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

/** Lista de todos los usuarios con los que se puede chatear + resumen de la conversación. */
export function listarContactosChat(): Promise<ContactoChat[]> {
  return apiFetch<ContactoChat[]>("/chat/contactos");
}

/** Total de mensajes sin leer (para el globo de la burbuja flotante). */
export function noLeidosChat(): Promise<{ total: number }> {
  return apiFetch<{ total: number }>("/chat/no-leidos");
}

/** Historial (incremental si se pasa `desde`) de la conversación con `otroId`. */
export function historialChat(
  otroId: string,
  desde?: string,
): Promise<{ mensajes: MensajeChat[]; ahora: string }> {
  const qs = desde ? `?desde=${encodeURIComponent(desde)}` : "";
  return apiFetch(`/chat/mensajes/${otroId}${qs}`);
}

export function enviarMensajeChat(
  destinatarioId: string,
  contenido: string,
  respondeAId?: string,
  adjunto?: AdjuntoChat,
): Promise<MensajeChat> {
  return apiFetch<MensajeChat>("/chat/mensajes", {
    method: "POST",
    body: JSON.stringify({
      destinatarioId,
      contenido,
      respondeAId,
      adjuntoData: adjunto?.data,
      adjuntoMime: adjunto?.mime,
      adjuntoNombre: adjunto?.nombre,
      adjuntoTipo: adjunto?.tipo,
    }),
  });
}

// ---- Grupos ----

/** Grupos del usuario (con resumen de conversación), para mostrarlos junto a los contactos. */
export function listarGruposChat(): Promise<GrupoChatResumen[]> {
  return apiFetch<GrupoChatResumen[]>("/chat/grupos");
}

export function crearGrupoChat(input: {
  nombre: string;
  imagen?: string | null;
  miembros: string[];
}): Promise<GrupoChatDetalle> {
  return apiFetch<GrupoChatDetalle>("/chat/grupos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function obtenerGrupoChat(grupoId: string): Promise<GrupoChatDetalle> {
  return apiFetch<GrupoChatDetalle>(`/chat/grupos/${grupoId}`);
}

export function actualizarGrupoChat(
  grupoId: string,
  cambios: { nombre?: string; imagen?: string | null; agregar?: string[]; quitar?: string[] },
): Promise<GrupoChatDetalle> {
  return apiFetch<GrupoChatDetalle>(`/chat/grupos/${grupoId}`, {
    method: "PUT",
    body: JSON.stringify(cambios),
  });
}

/** Historial (incremental si se pasa `desde`) de un grupo. */
export function historialGrupoChat(
  grupoId: string,
  desde?: string,
): Promise<{ mensajes: MensajeChat[]; ahora: string }> {
  const qs = desde ? `?desde=${encodeURIComponent(desde)}` : "";
  return apiFetch(`/chat/grupos/${grupoId}/mensajes${qs}`);
}

export function enviarMensajeGrupoChat(
  grupoId: string,
  contenido: string,
  respondeAId?: string,
  adjunto?: AdjuntoChat,
): Promise<MensajeChat> {
  return apiFetch<MensajeChat>(`/chat/grupos/${grupoId}/mensajes`, {
    method: "POST",
    body: JSON.stringify({
      contenido,
      respondeAId,
      adjuntoData: adjunto?.data,
      adjuntoMime: adjunto?.mime,
      adjuntoNombre: adjunto?.nombre,
      adjuntoTipo: adjunto?.tipo,
    }),
  });
}
