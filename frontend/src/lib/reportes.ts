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
  /** Números de factura digitados en Despacho (separados por coma si son varios pedidos). */
  facturas?: string;
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

export type EstadoCruce = "sin_facturar" | "pendiente" | "no_encontrada" | "coincide" | "diferencia";

export interface ProductoPedido {
  cod: string;
  producto: string;
  um: string;
  cantidad: number;
  valor: number;
}

export interface LineaFactura {
  cod: string;
  producto: string;
  um: string;
  cantidad: number;
  neto: number;
}

export interface FilaFacturacion {
  id: string;
  comanda: string;
  fecha: string;
  punto: string;
  cliente: string;
  nit: string;
  estado: string;
  pago: string;
  totalPedido: number;
  facturaDigitada: string | null;
  valorDigitado: number | null;
  facturaSiesa: string | null;
  /** Fecha/hora local de Bogotá de la factura (sin zona). */
  fechaFactura: string | null;
  totalFacturado: number | null;
  diferencia: number | null;
  estadoFactura: string | null;
  pdvSiesa: string | null;
  cajero: string | null;
  metodo: string | null;
  estadoCruce: EstadoCruce;
  productos?: ProductoPedido[];
  lineasFactura?: LineaFactura[];
}

export interface ReporteFacturacion {
  filas: FilaFacturacion[];
  resumen: {
    pedidos: number;
    totalPedidos: number;
    totalFacturado: number;
    coinciden: number;
    conDiferencia: number;
    noEncontradas: number;
    pendientes: number;
    sinFacturar: number;
  };
}

/** Pedido vs facturado en Siesa (una fila por pedido). */
export function reporteFacturacion(filtros: {
  punto_id?: string;
  desde: string;
  hasta: string;
  detalle?: boolean;
}): Promise<ReporteFacturacion> {
  const qs = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta });
  if (filtros.punto_id) qs.set("punto_id", filtros.punto_id);
  if (filtros.detalle) qs.set("detalle", "1");
  return apiFetch<ReporteFacturacion>(`/siesa/reporte-facturacion?${qs}`);
}

export function detalleFacturacion(pedidoId: string): Promise<{ productos: ProductoPedido[]; lineasFactura: LineaFactura[] }> {
  return apiFetch(`/siesa/reporte-facturacion/${encodeURIComponent(pedidoId)}`);
}

/** Trae de Siesa los días del rango que aún no se han consultado (máx. 3 por llamada). */
export function sincronizarFacturacion(desde: string, hasta: string): Promise<{ dias: string[]; relacionadas: number }> {
  const qs = new URLSearchParams({ desde, hasta });
  return apiFetch(`/siesa/sincronizar?${qs}`, { method: "POST" });
}
