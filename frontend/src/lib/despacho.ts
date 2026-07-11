import type { Pedido } from "@/app/(panel)/pedidos/page";

/**
 * Lógica de tiempos/deadlines de despacho, compartida entre la vista de
 * Despacho y el Dashboard (cumplimiento). Una sola fuente de verdad.
 */

/** Ventana normal (efectivo, tarjeta, etc.): 2 horas desde que entra. */
export const LIMITE_DESPACHO_MS = 2 * 60 * 60 * 1000;
/** Transferencia: 1 hora, y SOLO desde que se confirma la transferencia. */
export const LIMITE_TRANSFERENCIA_MS = 60 * 60 * 1000;
/** Umbral de advertencia / duración del alistamiento: 1 hora. */
export const ALERTA_DESPACHO_MS = 60 * 60 * 1000;

/** ¿El pedido se paga por transferencia? */
export function esTransferencia(p: Pedido): boolean {
  return (p.pago ?? "").trim().toLowerCase() === "transferencia";
}

/**
 * Instante objetivo de despacho (deadline de entrega).
 * - TRANSFERENCIA: el cronómetro corre 1h SOLO desde que se confirma
 *   (pagoConfirmado). Sin confirmar: Infinity (no vence).
 * - Resto: si hay hora de despacho pedida, ese es el objetivo; si no,
 *   creación + 2 horas.
 */
export function objetivoDespacho(p: Pedido, pagoConfirmado?: string | null): number {
  if (esTransferencia(p)) {
    if (pagoConfirmado) {
      return new Date(pagoConfirmado).getTime() + LIMITE_TRANSFERENCIA_MS;
    }
    return Infinity;
  }
  const hora = (p.horaDespacho ?? "").trim();
  const m = hora.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const base =
      p.entregaProgramada && p.fechaProgramada
        ? new Date(`${p.fechaProgramada}T00:00:00`)
        : new Date(p.fecha);
    base.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return base.getTime();
  }
  return new Date(p.fecha).getTime() + LIMITE_DESPACHO_MS;
}

/** Milisegundos restantes para despachar (puede ser negativo si venció). */
export function msRestantesDespacho(
  p: Pedido,
  ref: number,
  pagoConfirmado?: string | null,
): number {
  return objetivoDespacho(p, pagoConfirmado) - ref;
}

/**
 * Deadline de alistamiento (preparación). Normal: entrega − 1h. Transferencia:
 * toda la ventana de 1h desde la confirmación.
 */
export function deadlinePreparacion(p: Pedido, pagoConfirmado?: string | null): number {
  const obj = objetivoDespacho(p, pagoConfirmado);
  if (!Number.isFinite(obj)) return obj;
  return esTransferencia(p) ? obj : obj - ALERTA_DESPACHO_MS;
}
