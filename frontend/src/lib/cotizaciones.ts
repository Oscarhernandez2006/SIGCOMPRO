import { apiFetch } from "./api";
import type { ItemCarrito, Pedido } from "@/app/(panel)/pedidos/page";
import type { PuntoVenta } from "./puntos-venta";
import type { Cliente } from "./clientes";
import type { ProductoPrecio } from "./productos";

/**
 * Cotización: misma estructura base que un pedido (punto, cliente, carrito) pero
 * el `precio` de cada item del carrito puede haber sido editado manualmente. Ese
 * precio es el que sale en el PDF y el que se usa al convertirla en pedido.
 */
export interface Cotizacion {
  id: string;
  numero: number;
  fecha: string;
  /** "borrador": aún editable · "confirmada": ya se convirtió en pedido. */
  estado: "borrador" | "confirmada";
  punto: PuntoVenta;
  cliente: Cliente;
  carrito: ItemCarrito[];
  /** Lista de precios (productos seleccionados) que sale como 2ª hoja del PDF. */
  listaPrecios?: ProductoPrecio[];
  total: number;
  observacion?: string;
  vendedorNombre?: string;
  vendedorCedula?: string;
  /** Id/comanda del pedido generado al confirmar la cotización. */
  pedidoId?: string;
  pedidoComanda?: string;
}

export function listarCotizaciones(): Promise<Cotizacion[]> {
  return apiFetch<Cotizacion[]>("/cotizaciones");
}

export function guardarCotizacion(cot: Cotizacion): Promise<Cotizacion> {
  return apiFetch<Cotizacion>(`/cotizaciones/${cot.id}`, {
    method: "PUT",
    body: JSON.stringify(cot),
  });
}

export function eliminarCotizacion(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/cotizaciones/${id}`, {
    method: "DELETE",
  });
}

export function convertirCotizacion(
  id: string,
): Promise<{ pedido: Pedido; cotizacion: Cotizacion }> {
  return apiFetch<{ pedido: Pedido; cotizacion: Cotizacion }>(
    `/cotizaciones/${id}/convertir`,
    { method: "POST" },
  );
}
