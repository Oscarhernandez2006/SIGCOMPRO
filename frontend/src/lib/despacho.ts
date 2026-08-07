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
/** Pedido PEQUEÑO (≤10 kg): alistado corto de 40 min y alerta (rojo) a los 20 min. */
export const LIMITE_ALISTADO_PEQUENO_MS = 40 * 60 * 1000;
export const ALERTA_ALISTADO_PEQUENO_MS = 20 * 60 * 1000;
/** Umbral (kg) para considerar "pequeño" un pedido. */
export const KILOS_PEDIDO_PEQUENO = 10;

/** ¿El pedido se paga por transferencia? */
export function esTransferencia(p: Pedido): boolean {
  return (p.pago ?? "").trim().toLowerCase() === "transferencia";
}

/** ¿El cliente RECOGE el pedido en el punto de venta (no lleva domicilio)? */
export function esRecoge(p: Pedido): boolean {
  return (p.entrega ?? "").trim().toLowerCase() === "recoge";
}

/**
 * ¿El pedido ya SALIÓ a reparto? Incluye "Despachado", "En tránsito" y
 * "Entregado" (los dos últimos vienen del estado de Drivin). Para Cuadre de
 * caja, Históricos y Dashboard estos tres cuentan igual que despachado.
 */
export function yaDespachado(estado?: string | null): boolean {
  const e = (estado ?? "").trim().toLowerCase();
  return e === "despachado" || e === "en tránsito" || e === "entregado";
}

/**
 * Clases de color (borde + fondo + texto) por estado, IGUALES a las cards de
 * Despacho, para mantener el mismo estándar de color en toda la app. En los
 * badges tipo "pill" (sin la clase `border`) el color de borde es inerte.
 */
export function colorEstado(estado?: string | null): string {
  switch ((estado ?? "").trim().toLowerCase()) {
    case "en producción":
      return "border-orange-200 bg-orange-100 text-orange-600";
    case "alistado":
      return "border-violet-200 bg-violet-100 text-violet-600";
    case "facturado":
      return "border-emerald-200 bg-emerald-100 text-emerald-600";
    case "despachado":
      return "border-teal-200 bg-teal-100 text-teal-700";
    case "en tránsito":
      return "border-sky-200 bg-sky-100 text-sky-600";
    case "entregado":
      return "border-green-200 bg-green-100 text-green-700";
    case "anulado":
    case "cancelado":
      return "border-red-200 bg-red-100 text-red-600";
    case "en proceso":
    default:
      return "border-amber-200 bg-amber-100 text-amber-700";
  }
}

/** Hora límite (18:00) para entregar pedidos que se RECOGEN en el punto. */
export const HORA_LIMITE_RECOGE = 18;

/** Día base del pedido: la fecha programada si aplica; si no, la de creación. */
function baseDiaPedido(p: Pedido): Date {
  return p.entregaProgramada && p.fechaProgramada
    ? new Date(`${p.fechaProgramada}T00:00:00`)
    : new Date(p.fecha);
}

/** Peso del pedido en kilos (ítems vendidos por KG). */
function pesoKgPedido(p: Pedido): number {
  return (p.carrito ?? []).reduce((s, i) => {
    const esKg = (i.producto?.um ?? "").trim().toUpperCase() === "KG";
    return s + (esKg ? i.cantidad || 0 : 0);
  }, 0);
}

/** ¿El pedido es "pequeño" (≤10 kg)? Su alistado dura solo 40 minutos. */
export function esPedidoPequeno(p: Pedido): boolean {
  return pesoKgPedido(p) <= KILOS_PEDIDO_PEQUENO;
}

/**
 * Instante objetivo de despacho (deadline de entrega).
 * - TRANSFERENCIA: el cronómetro corre 1h SOLO desde que se confirma
 *   (pagoConfirmado). Sin confirmar: Infinity (no vence).
 * - PROGRAMADO / con hora pedida: la hora de despacho ES el deadline de entrega
 *   y la promesa de 2h corre en las 2 HORAS PREVIAS (ej. entrega 8:00 → ventana
 *   6:00–8:00). Un programado sin hora usa las 8:00 a. m. del día de entrega.
 * - Resto (mismo día, sin hora): creación + 2 horas.
 */
export function objetivoDespacho(p: Pedido, pagoConfirmado?: string | null): number {
  // RECOGE en el punto: el objetivo de entrega es SIEMPRE las 6:00 PM del día
  // (programado o de creación); la cuenta regresiva corre hacia esa hora.
  if (esRecoge(p)) {
    const base = baseDiaPedido(p);
    base.setHours(HORA_LIMITE_RECOGE, 0, 0, 0);
    return base.getTime();
  }
  if (esTransferencia(p)) {
    if (pagoConfirmado) {
      return new Date(pagoConfirmado).getTime() + LIMITE_TRANSFERENCIA_MS;
    }
    return Infinity;
  }
  const hora = (p.horaDespacho ?? "").trim();
  const m = hora.match(/^(\d{1,2}):(\d{2})$/);
  const programado = Boolean(p.entregaProgramada && p.fechaProgramada);
  if (m || programado) {
    // La hora de despacho es el DEADLINE de entrega; la promesa de 2h corre en
    // las 2 horas PREVIAS. Un programado sin hora usa las 8:00 a. m. del día de
    // entrega (ventana 6:00–8:00 a. m.).
    const base = programado
      ? new Date(`${p.fechaProgramada}T00:00:00`)
      : new Date(p.fecha);
    if (m) base.setHours(Number(m[1]), Number(m[2]), 0, 0);
    else base.setHours(8, 0, 0, 0);
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
  const programado = Boolean(p.entregaProgramada && p.fechaProgramada);
  // Pedido PEQUEÑO (≤10 kg) NO programado: alistado corto de 40 min desde que entra.
  if (!programado && esPedidoPequeno(p)) {
    return new Date(p.fecha).getTime() + LIMITE_ALISTADO_PEQUENO_MS;
  }
  // RECOGE NO programado: 2 horas para alistarlo desde que entra (independiente
  // del objetivo de las 6:00 PM para la entrega).
  if (!programado && esRecoge(p)) {
    return new Date(p.fecha).getTime() + LIMITE_DESPACHO_MS;
  }
  // Programado (y el resto): la preparación se ancla al objetivo de entrega.
  const obj = objetivoDespacho(p, pagoConfirmado);
  if (!Number.isFinite(obj)) return obj;
  return esTransferencia(p) ? obj : obj - ALERTA_DESPACHO_MS;
}
