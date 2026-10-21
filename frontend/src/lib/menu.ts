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
export interface ListaMenu {
  id: string;
  nombre: string;
}

export function listarMenus(puntoId: string): Promise<ListaMenu[]> {
  return apiFetch(`/menu-config/${encodeURIComponent(puntoId)}/listas`);
}

export function crearMenu(puntoId: string, nombre: string): Promise<ListaMenu> {
  return apiFetch(`/menu-config/${encodeURIComponent(puntoId)}/listas`, { method: "POST", body: JSON.stringify({ nombre }) });
}

export function obtenerMenuConfig(puntoId: string, listaId = "general"): Promise<MenuConfigItem[]> {
  return apiFetch<MenuConfigItem[]>(`/menu-config/${encodeURIComponent(puntoId)}/listas/${encodeURIComponent(listaId)}`);
}

/** Guarda (reemplaza) la configuración del menú de un punto. */
export function guardarMenuConfig(
  puntoId: string,
  items: MenuConfigItem[],
  listaId = "general",
): Promise<{ ok: true; total: number }> {
  return apiFetch<{ ok: true; total: number }>(
    `/menu-config/${encodeURIComponent(puntoId)}/listas/${encodeURIComponent(listaId)}`,
    { method: "PUT", body: JSON.stringify({ items }) },
  );
}
