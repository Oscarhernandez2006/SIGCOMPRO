import { apiFetch } from "./api";

export interface FilaReporteProducto {
  nit: string;
  cliente: string;
  punto: string;
  codigo: string;
  producto: string;
  cantidad: number;
  n_pedidos: number;
  monto: number;
  ultima_compra: string | null;
}

export interface ReporteProductos {
  filas: FilaReporteProducto[];
  resumen: { clientes: number; cantidad: number; monto: number; filas: number };
}

/** Reporte de clientes que han comprado productos (por punto / código / general). */
export function reporteProductos(filtros: {
  codigo?: string;
  punto_id?: string;
  desde?: string;
  hasta?: string;
}): Promise<ReporteProductos> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (typeof v === "string" && v.trim()) qs.set(k, v.trim());
  }
  const sufijo = qs.toString();
  return apiFetch<ReporteProductos>(`/pedidos/reporte-productos${sufijo ? `?${sufijo}` : ""}`);
}
