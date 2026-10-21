import { apiFetch } from "./api";
import type { ResumenDespacho } from "./resumen-despacho";

export type EstadoSolicitud =
  | "pendiente"
  | "aprobada"
  | "rechazada"
  | "cancelada"
  | "vencida"
  | "cerrada";

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
  /** Cards de Despacho del punto (cantidad y kg) en el momento de solicitar. */
  snapshot: ResumenDespacho | null;
}

export interface PedidoExtension {
  pedido_id: string;
  replica: number;
  consecutivo: number | null;
  comanda: string | null;
  cliente_nombre: string | null;
  cliente_nit: string | null;
  estado_final: string | null;
  /** Kilos del pedido (null en réplicas). */
  kg: number | null;
  asignado_en: string;
}

export interface ValorExtensionPunto {
  punto_id: string;
  nombre: string;
  valor: string;
}

export const ETIQUETA_ESTADO: Record<EstadoSolicitud, string> = {
  pendiente: "Pendiente de aprobación",
  aprobada: "Aprobada (activa)",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  vencida: "Vencida",
  cerrada: "Cerrada",
};

export const COLOR_ESTADO: Record<EstadoSolicitud, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-700",
  aprobada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rechazada: "border-red-200 bg-red-50 text-red-600",
  cancelada: "border-brand-brown/15 bg-brand-cream-soft text-brand-brown/70",
  vencida: "border-brand-brown/15 bg-brand-cream-soft text-brand-brown/70",
  cerrada: "border-sky-200 bg-sky-50 text-sky-700",
};

export function solicitudesDelPunto(puntoId: string, dia?: string): Promise<SolicitudExtension[]> {
  const qs = dia ? `?dia=${encodeURIComponent(dia)}` : "";
  return apiFetch(`/extensiones/punto/${encodeURIComponent(puntoId)}${qs}`);
}

export function crearSolicitudExtension(input: {
  puntoId: string;
  domiciliario: string;
  domiciliarioCodigo?: string;
  motivo: string;
  snapshot?: ResumenDespacho;
}): Promise<SolicitudExtension> {
  return apiFetch("/extensiones", { method: "POST", body: JSON.stringify(input) });
}

export function cancelarSolicitudExtension(id: string): Promise<SolicitudExtension> {
  return apiFetch(`/extensiones/${id}/cancelar`, { method: "PATCH" });
}

export function pedidosDeExtension(id: string): Promise<PedidoExtension[]> {
  return apiFetch(`/extensiones/${id}/pedidos`);
}

export function listarSolicitudesExtension(f: {
  desde?: string;
  hasta?: string;
  puntoId?: string;
  estado?: string;
}): Promise<SolicitudExtension[]> {
  const qs = new URLSearchParams();
  if (f.desde) qs.set("desde", f.desde);
  if (f.hasta) qs.set("hasta", f.hasta);
  if (f.puntoId) qs.set("puntoId", f.puntoId);
  if (f.estado) qs.set("estado", f.estado);
  const s = qs.toString();
  return apiFetch(`/extensiones${s ? `?${s}` : ""}`);
}

export function aprobarSolicitudExtension(id: string): Promise<SolicitudExtension> {
  return apiFetch(`/extensiones/${id}/aprobar`, { method: "PATCH" });
}

export function rechazarSolicitudExtension(id: string, motivo: string): Promise<SolicitudExtension> {
  return apiFetch(`/extensiones/${id}/rechazar`, { method: "PATCH", body: JSON.stringify({ motivo }) });
}

export function valoresExtension(): Promise<ValorExtensionPunto[]> {
  return apiFetch("/extensiones/config/valores");
}

export function guardarValorExtension(puntoId: string, valor: number): Promise<{ punto_id: string; valor: number }> {
  return apiFetch(`/extensiones/config/${encodeURIComponent(puntoId)}`, {
    method: "PUT",
    body: JSON.stringify({ valor }),
  });
}

/** ¿El rol puede solicitar extensiones? (rol Despacho). */
export function esRolDespacho(rol?: string | null): boolean {
  return (rol ?? "").trim().toLowerCase() === "despacho";
}

export interface ResumenPendientesExtension {
  pendientes: number;
  ultimo: { id: string; domiciliario: string; punto_nombre: string | null } | null;
}

export function resumenPendientesExtension(): Promise<ResumenPendientesExtension> {
  return apiFetch("/extensiones/pendientes/resumen");
}
