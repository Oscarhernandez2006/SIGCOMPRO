import { apiFetch } from "./api";

/** Ítem curado del menú de un punto (lo que verá el cliente). */
export interface MenuConfigItem {
  referencia: string;
  producto: string;
  categoria: string;
  um: string;
  precio: number;
}

/** Carga la configuración guardada del menú de un punto. */
export function obtenerMenuConfig(puntoId: string): Promise<MenuConfigItem[]> {
  return apiFetch<MenuConfigItem[]>(`/menu-config/${encodeURIComponent(puntoId)}`);
}

/** Guarda (reemplaza) la configuración del menú de un punto. */
export function guardarMenuConfig(
  puntoId: string,
  items: MenuConfigItem[],
): Promise<{ ok: true; total: number }> {
  return apiFetch<{ ok: true; total: number }>(
    `/menu-config/${encodeURIComponent(puntoId)}`,
    { method: "PUT", body: JSON.stringify({ items }) },
  );
}
