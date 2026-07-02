import { apiFetch } from "./api";

/**
 * API de pedidos congelados (borradores en espera) persistidos en la base de
 * datos por usuario. El tipo del borrador lo define el consumidor.
 */

/** Lista los congelados del usuario autenticado. */
export function listarCongeladosApi<T = unknown>(): Promise<T[]> {
  return apiFetch<T[]>("/congelados");
}

/** Crea o actualiza un congelado. Devuelve el borrador guardado (con su consecutivo temporal). */
export function guardarCongeladoApi<T = unknown>(id: string, data: T): Promise<T> {
  return apiFetch<T>(`/congelados/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/** Elimina un congelado del usuario. */
export function eliminarCongeladoApi(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/congelados/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
