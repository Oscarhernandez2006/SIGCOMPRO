import { apiFetch } from "./api";

export interface ListaPrecio {
  lista_precio: string;
  desc_lista: string | null;
  productos: number;
}

export interface ProductoPrecio {
  id: string;
  lista_precio: string;
  desc_lista: string | null;
  referencia: string;
  producto: string | null;
  cia: number | null;
  um: string | null;
  precio: number;
  fecha_activacion: string | null;
  fecha_inactivacion: string | null;
  sincronizado_en: string;
}

export function listarListasPrecio(): Promise<ListaPrecio[]> {
  return apiFetch<ListaPrecio[]>("/productos/listas");
}

export function listarProductos(
  lista?: string,
  buscar?: string,
): Promise<ProductoPrecio[]> {
  const params = new URLSearchParams();
  if (lista) params.set("lista", lista);
  if (buscar) params.set("buscar", buscar);
  const qs = params.toString();
  return apiFetch<ProductoPrecio[]>(`/productos${qs ? `?${qs}` : ""}`);
}

export function ultimaSincronizacion(): Promise<string | null> {
  return apiFetch<string | null>("/productos/ultima-sincronizacion");
}

export function sincronizarProductos(): Promise<{
  total: number;
  listas: number;
}> {
  return apiFetch<{ total: number; listas: number }>("/productos/sincronizar", {
    method: "POST",
  });
}
