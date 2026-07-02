import { apiFetch } from "./api";

export interface PuntoVenta {
  id: string;
  nombre: string;
  codigo: string | null;
  direccion: string | null;
  telefono: string | null;
  lista_precio: string | null;
  activo: boolean;
  creado_en: string;
  /** Número de usuarios asignados (solo en el listado admin). */
  usuarios?: number;
}

export interface PuntoVentaInput {
  nombre: string;
  codigo?: string;
  direccion?: string;
  telefono?: string;
  lista_precio?: string;
  activo?: boolean;
}

export function listarPuntosVenta(): Promise<PuntoVenta[]> {
  return apiFetch<PuntoVenta[]>("/puntos-venta");
}

export function crearPuntoVenta(input: PuntoVentaInput): Promise<PuntoVenta> {
  return apiFetch<PuntoVenta>("/puntos-venta", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function actualizarPuntoVenta(
  id: string,
  input: Partial<PuntoVentaInput>,
): Promise<PuntoVenta> {
  return apiFetch<PuntoVenta>(`/puntos-venta/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function eliminarPuntoVenta(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/puntos-venta/${id}`, {
    method: "DELETE",
  });
}

/** IDs de usuarios asignados a un punto de venta. */
export function usuariosDePunto(id: string): Promise<string[]> {
  return apiFetch<string[]>(`/puntos-venta/${id}/usuarios`);
}

/** Reemplaza la lista de usuarios asignados a un punto de venta. */
export function asignarUsuariosPunto(
  id: string,
  usuarioIds: string[],
): Promise<string[]> {
  return apiFetch<string[]>(`/puntos-venta/${id}/usuarios`, {
    method: "PUT",
    body: JSON.stringify({ usuarioIds }),
  });
}

/** Puntos de venta asignados al usuario autenticado (panel operativo). */
export function misPuntosVenta(): Promise<PuntoVenta[]> {
  return apiFetch<PuntoVenta[]>("/puntos-venta/mios");
}
