import { apiFetch } from "./api";

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
  destinatario_id: string;
  contenido: string;
  leido: boolean;
  creado_en: string;
  /** Id del mensaje al que responde (null si no es una respuesta). */
  responde_a_id: string | null;
  /** Contenido citado (vista previa "responder a"). */
  responde_a_contenido: string | null;
  /** Remitente del mensaje citado. */
  responde_a_remitente_id: string | null;
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
): Promise<MensajeChat> {
  return apiFetch<MensajeChat>("/chat/mensajes", {
    method: "POST",
    body: JSON.stringify({ destinatarioId, contenido, respondeAId }),
  });
}
