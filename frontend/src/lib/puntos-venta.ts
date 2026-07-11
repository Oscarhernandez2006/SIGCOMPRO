import { apiFetch } from "./api";

export interface PuntoVenta {
  id: string;
  nombre: string;
  codigo: string | null;
  direccion: string | null;
  telefono: string | null;
  lista_precio: string | null;
  barrio: string | null;
  ciudad: string | null;
  lat: number | null;
  lng: number | null;
  /** Km incluidos en la tarifa base del domicilio. */
  dom_km_base: number;
  /** Valor base del domicilio (cubre hasta dom_km_base km). */
  dom_valor_base: number;
  /** Valor por cada km adicional. */
  dom_valor_km: number;
  /** Valor del pedido a partir del cual el domicilio es gratis (0 = sin gratis). */
  dom_gratis_desde: number;
  /** Margen de error hacia abajo para aplicar el domicilio gratis. */
  dom_gratis_margen: number;
  activo: boolean;
  creado_en: string;
  /** Número de usuarios asignados (solo en el listado admin). */
  usuarios?: number;
}

export interface PuntoVentaInput {
  nombre: string;
  codigo?: string;
  direccion?: string;
  telefono?: string;
  lista_precio?: string;
  barrio?: string;
  ciudad?: string;
  lat?: number | null;
  lng?: number | null;
  dom_km_base?: number;
  dom_valor_base?: number;
  dom_valor_km?: number;
  dom_gratis_desde?: number;
  dom_gratis_margen?: number;
  activo?: boolean;
}

export function listarPuntosVenta(): Promise<PuntoVenta[]> {
  return apiFetch<PuntoVenta[]>("/puntos-venta");
}

export function crearPuntoVenta(input: PuntoVentaInput): Promise<PuntoVenta> {
  return apiFetch<PuntoVenta>("/puntos-venta", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function actualizarPuntoVenta(
  id: string,
  input: Partial<PuntoVentaInput>,
): Promise<PuntoVenta> {
  return apiFetch<PuntoVenta>(`/puntos-venta/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function eliminarPuntoVenta(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/puntos-venta/${id}`, {
    method: "DELETE",
  });
}

/** IDs de usuarios asignados a un punto de venta. */
export function usuariosDePunto(id: string): Promise<string[]> {
  return apiFetch<string[]>(`/puntos-venta/${id}/usuarios`);
}

/** Reemplaza la lista de usuarios asignados a un punto de venta. */
export function asignarUsuariosPunto(
  id: string,
  usuarioIds: string[],
): Promise<string[]> {
  return apiFetch<string[]>(`/puntos-venta/${id}/usuarios`, {
    method: "PUT",
    body: JSON.stringify({ usuarioIds }),
  });
}

/** IDs de puntos de venta asignados a un usuario (asistente de administración). */
export function puntosDeUsuarioIds(usuarioId: string): Promise<string[]> {
  return apiFetch<string[]>(`/puntos-venta/de-usuario/${usuarioId}`);
}

/** Reemplaza la lista de puntos de venta asignados a un usuario. */
export function asignarPuntosAUsuario(
  usuarioId: string,
  puntoIds: string[],
): Promise<string[]> {
  return apiFetch<string[]>(`/puntos-venta/de-usuario/${usuarioId}`, {
    method: "PUT",
    body: JSON.stringify({ puntoIds }),
  });
}

/** Puntos de venta asignados al usuario autenticado (panel operativo). */
export function misPuntosVenta(): Promise<PuntoVenta[]> {
  return apiFetch<PuntoVenta[]>("/puntos-venta/mios");
}

/**
 * Indica si un par de coordenadas es válido para cálculos geográficos.
 * Rechaza null, NaN, fuera de rango y el punto nulo (0,0).
 */
export function coordenadasValidas(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return false;
  if (la === 0 && lo === 0) return false;
  return true;
}

/**
 * Distancia en línea recta (km) entre dos coordenadas usando la fórmula de Haversine.
 * Coacciona a número por si Postgres devolvió las coordenadas como texto.
 */
export function distanciaKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // radio de la Tierra en km
  const rad = (g: number) => (Number(g) * Math.PI) / 180;
  const dLat = rad(Number(lat2) - Number(lat1));
  const dLng = rad(Number(lng2) - Number(lng1));
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) *
      Math.cos(rad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcula el valor del domicilio según la tarifa del punto:
 * el valor base cubre `dom_km_base` km; cada km adicional (redondeado hacia
 * arriba) suma `dom_valor_km`.
 */
export function calcularValorDomicilio(punto: PuntoVenta, km: number): number {
  const base = Number(punto.dom_valor_base) || 0;
  const kmBase = Number(punto.dom_km_base) || 0;
  const valorKm = Number(punto.dom_valor_km) || 0;
  const kmRedondeado = Math.ceil(Number(km) || 0);
  const adicionales = Math.max(0, kmRedondeado - kmBase);
  return base + adicionales * valorKm;
}

/**
 * Indica si un pedido califica para domicilio gratis según la tarifa del punto:
 * el valor del pedido (factura) debe alcanzar `dom_gratis_desde` menos el
 * `dom_gratis_margen` (margen de error hacia abajo). Si `dom_gratis_desde` es 0,
 * el punto no ofrece domicilio gratis.
 */
export function domicilioGratisAplica(
  punto: Pick<PuntoVenta, "dom_gratis_desde" | "dom_gratis_margen">,
  valorPedido: number,
): boolean {
  const desde = Number(punto.dom_gratis_desde) || 0;
  if (desde <= 0) return false;
  const margen = Math.max(0, Number(punto.dom_gratis_margen) || 0);
  return (Number(valorPedido) || 0) >= desde - margen;
}

/**
 * Devuelve el punto de venta más cercano al cliente (con coordenadas válidas),
 * junto con la distancia. Ignora puntos sin coordenadas o con coordenadas
 * inválidas (NaN, fuera de rango o 0,0).
 */
export function puntoMasCercano(
  puntos: PuntoVenta[],
  lat: number,
  lng: number,
): { punto: PuntoVenta; km: number } | null {
  if (!coordenadasValidas(lat, lng)) return null;
  let mejor: { punto: PuntoVenta; km: number } | null = null;
  for (const p of puntos) {
    if (!coordenadasValidas(p.lat, p.lng)) continue;
    const km = distanciaKm(lat, lng, Number(p.lat), Number(p.lng));
    if (!Number.isFinite(km)) continue;
    if (!mejor || km < mejor.km) mejor = { punto: p, km };
  }
  return mejor;
}
