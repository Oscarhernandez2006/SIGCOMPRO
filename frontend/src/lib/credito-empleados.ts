import { apiFetch } from "./api";

export interface TrabajadorCredito {
  cedula: string;
  nombre: string;
  cupo_asignado: number;
  activo: boolean;
  /** Fecha del próximo descuento de nómina (YYYY-MM-DD). */
  fecha_proximo_descuento: string | null;
  creado_en: string;
  actualizado_en: string;
  deuda_vigente: number;
  cupo_disponible: number;
  /** Saldo en cartera de Siesa. null = integración no configurada. */
  siesa_saldo: number | null;
}

export interface PedidoCredito {
  id: string;
  trabajador_cedula: string;
  trabajador_nombre: string;
  punto_id: string;
  punto_nombre: string;
  total: number;
  observacion: string | null;
  estado: "pendiente" | "facturado" | "anulado";
  cartera_referencia: string | null;
  cartera_estado: string | null;
  creado_por_id: string | null;
  creado_por_nombre: string | null;
  creado_en: string;
  actualizado_en: string;
}

export function buscarTrabajadoresCredito(q: string): Promise<TrabajadorCredito[]> {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set("q", q.trim());
  const sufijo = qs.toString();
  return apiFetch<TrabajadorCredito[]>(`/credito-empleados/trabajadores${sufijo ? `?${sufijo}` : ""}`);
}

export function obtenerTrabajadorCredito(cedula: string): Promise<TrabajadorCredito> {
  return apiFetch<TrabajadorCredito>(`/credito-empleados/trabajadores/${encodeURIComponent(cedula)}`);
}

export function guardarTrabajadorCredito(input: {
  cedula: string;
  nombre: string;
  cupo_asignado: number;
  activo?: boolean;
  fecha_proximo_descuento?: string | null;
}): Promise<TrabajadorCredito> {
  return apiFetch<TrabajadorCredito>("/credito-empleados/trabajadores", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Consulta el estado de crédito de un colaborador (no requiere permiso credito_empleados). */
export function consultarCreditoPorCedula(cedula: string): Promise<TrabajadorCredito> {
  return apiFetch<TrabajadorCredito>(`/credito-empleados/consulta/${encodeURIComponent(cedula)}`);
}

export function listarPedidosCredito(filtros: {
  cedula?: string;
  estado?: string;
  punto_id?: string;
  desde?: string;
  hasta?: string;
}): Promise<PedidoCredito[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (typeof v === "string" && v.trim()) qs.set(k, v.trim());
  }
  const sufijo = qs.toString();
  return apiFetch<PedidoCredito[]>(`/credito-empleados/pedidos${sufijo ? `?${sufijo}` : ""}`);
}

export function crearPedidoCredito(input: {
  trabajador_cedula: string;
  punto_id: string;
  punto_nombre: string;
  total: number;
  observacion?: string;
}): Promise<PedidoCredito> {
  return apiFetch<PedidoCredito>("/credito-empleados/pedidos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function actualizarEstadoPedidoCredito(
  id: string,
  estado: "pendiente" | "facturado" | "anulado",
): Promise<PedidoCredito> {
  return apiFetch<PedidoCredito>(`/credito-empleados/pedidos/${id}/estado`, {
    method: "PATCH",
    body: JSON.stringify({ estado }),
  });
}
