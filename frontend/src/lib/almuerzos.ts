import { apiFetch } from "./api";

export type EstadoAlmuerzo =
  | "pendiente"
  | "aprobada"
  | "reprogramada"
  | "rechazada"
  | "cancelada"
  | "vencida"
  | "terminada";

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
  terminado_en: string | null;
  actualizado_en: string;
}

export const ETIQUETA_ALMUERZO: Record<EstadoAlmuerzo, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobado",
  reprogramada: "Reprogramado",
  rechazada: "No aceptado",
  cancelada: "Cancelado",
  vencida: "Vencido sin respuesta",
  terminada: "Terminado",
};

export const COLOR_ALMUERZO: Record<EstadoAlmuerzo, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-700",
  aprobada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  reprogramada: "border-blue-200 bg-blue-50 text-blue-700",
  rechazada: "border-red-200 bg-red-50 text-red-600",
  cancelada: "border-brand-brown/15 bg-brand-cream-soft text-brand-black",
  vencida: "border-brand-brown/15 bg-brand-cream-soft text-brand-black",
  terminada: "border-sky-200 bg-sky-50 text-sky-700",
};

export function almuerzosDelPunto(puntoId: string): Promise<SolicitudAlmuerzo[]> {
  return apiFetch(`/almuerzos/punto/${encodeURIComponent(puntoId)}`);
}

export function aprobarAlmuerzo(id: string): Promise<SolicitudAlmuerzo> {
  return apiFetch(`/almuerzos/${encodeURIComponent(id)}/aprobar`, { method: "PATCH" });
}

export function rechazarAlmuerzo(id: string, motivo?: string): Promise<SolicitudAlmuerzo> {
  return apiFetch(`/almuerzos/${encodeURIComponent(id)}/rechazar`, {
    method: "PATCH",
    body: JSON.stringify({ motivo }),
  });
}

export function reprogramarAlmuerzo(id: string, hora: string): Promise<SolicitudAlmuerzo> {
  return apiFetch(`/almuerzos/${encodeURIComponent(id)}/reprogramar`, {
    method: "PATCH",
    body: JSON.stringify({ hora }),
  });
}
