import { apiFetch } from "./api";

/** Versiones de novedades que el usuario ya vio (guardado en la BD). */
export function novedadesVistas(): Promise<string[]> {
  return apiFetch<string[]>("/novedades/vistas");
}

export function marcarNovedadVista(version: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/novedades/${encodeURIComponent(version)}/vista`, { method: "POST" });
}
