import { apiFetch } from "./api";
import { API_URL } from "./api";
import { getToken } from "./auth";
import type { Pedido } from "@/app/(panel)/pedidos/page";

/** Metadata de despacho asociada a un pedido (se guarda junto al pedido). */
export interface DespachoMeta {
  porcionador?: string;
  inicio?: string;
  fin?: string;
  /** Número de la factura. */
  facturaNumero?: string;
  /** Valor facturado (puede diferir del total del pedido). */
  facturaValor?: number;
  /** Domiciliario asignado para el despacho. */
  domiciliario?: string;
  /** Instante en que el pedido pasó a "Despachado". */
  despachoFin?: string;
  /**
   * Instante en que se confirmó el pago (solo para transferencia). Al fijarse,
   * congela el cronómetro de despacho: el pedido ya está alistado y solo espera
   * que el cliente envíe la transferencia, por lo que no debe marcarse como
   * crítico ni en demora.
   */
  pagoConfirmado?: string;
  /**
   * Réplicas del pedido (el mismo pedido enviado por partes). Cada réplica
   * tiene un número (sufijo -N en el consecutivo del Excel) y puede llevar su
   * propio domiciliario. Deben ser secuenciales (1, 2, 3, 4, 5).
   */
  replicas?: { numero: number; domiciliario?: string }[];
}

export interface EstadoPedidos {
  pedidos: Pedido[];
  meta: Record<string, DespachoMeta>;
  impresos: string[];
}

/** Carga todos los pedidos con su metadata de despacho e impresos. */
export function cargarEstadoPedidos(): Promise<EstadoPedidos> {
  return apiFetch<EstadoPedidos>("/pedidos");
}

/**
 * Crea o actualiza un pedido completo en la base de datos. Devuelve el pedido
 * final tal como quedó en el servidor: para pedidos nuevos, el backend asigna
 * el consecutivo y la comanda de forma atómica (evita duplicados en ventas
 * simultáneas), así que hay que usar este resultado para imprimir/mostrar.
 */
export function guardarPedidoApi(pedido: Pedido): Promise<Pedido> {
  return apiFetch<Pedido>(`/pedidos/${pedido.id}`, {
    method: "PUT",
    body: JSON.stringify(pedido),
  });
}

/** Mezcla cambios en la metadata de despacho de un pedido. */
export function actualizarMetaApi(
  id: string,
  cambios: Partial<DespachoMeta>,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/pedidos/${id}/meta`, {
    method: "PATCH",
    body: JSON.stringify(cambios),
  });
}

/** Marca un pedido como impreso. */
export function marcarImpresoApi(
  id: string,
  impreso = true,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/pedidos/${id}/impreso`, {
    method: "PATCH",
    body: JSON.stringify({ impreso }),
  });
}

/** Borra todos los pedidos (reinicio para producción). */
export function vaciarPedidosApi(): Promise<{ eliminados: number }> {
  return apiFetch<{ eliminados: number }>("/pedidos", { method: "DELETE" });
}

/**
 * Descarga el Excel de despacho del pedido (formato del software de ruteo).
 * Usa fetch directo para recibir el binario y dispara la descarga en el navegador.
 * Si se indica `replica` (1-5), el consecutivo del Excel lleva el sufijo "-N".
 */
export async function descargarExcelDespacho(
  id: string,
  replica?: number,
): Promise<void> {
  const token = getToken();
  const qs = replica ? `?replica=${replica}` : "";
  const res = await fetch(`${API_URL}/pedidos/${id}/excel${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    throw new Error("No se pudo generar el Excel de despacho");
  }

  // El nombre viene en Content-Disposition; si no, se arma uno por defecto.
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = cd.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] ?? `Despacho_${id}.xlsx`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Envía el pedido directamente a Drivin (reemplazo del Excel de cargue).
 * Usa el mismo mapeo de campos. Si se indica `replica` (1-5), el consecutivo
 * lleva el sufijo "-N". Devuelve la respuesta del API de Drivin.
 */
export function enviarADrivinApi(
  id: string,
  replica?: number,
): Promise<{ status: number; comanda: string; respuesta: unknown }> {
  const qs = replica ? `?replica=${replica}` : "";
  return apiFetch<{ status: number; comanda: string; respuesta: unknown }>(
    `/pedidos/${id}/drivin${qs}`,
    { method: "POST" },
  );
}
