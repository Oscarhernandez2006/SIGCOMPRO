import { apiFetch } from "./api";

/** Personal de despacho configurable (porcionadores y domiciliarios). */
export interface PersonalDespacho {
  porcionadores: string[];
  domiciliarios: string[];
}

/** Personal de despacho de todos los puntos, indexado por id de punto de venta. */
export function obtenerPersonalDespachoTodos(): Promise<
  Record<string, PersonalDespacho>
> {
  return apiFetch<Record<string, PersonalDespacho>>("/configuracion/despacho");
}

/** Personal de despacho de un punto de venta específico. */
export function obtenerPersonalDespachoPunto(
  puntoId: string,
): Promise<PersonalDespacho> {
  return apiFetch<PersonalDespacho>(
    `/configuracion/despacho/${encodeURIComponent(puntoId)}`,
  );
}

/** Guarda (reemplaza) el personal de despacho de un punto. Solo administradores. */
export function guardarPersonalDespachoPunto(
  puntoId: string,
  datos: PersonalDespacho,
): Promise<PersonalDespacho> {
  return apiFetch<PersonalDespacho>(
    `/configuracion/despacho/${encodeURIComponent(puntoId)}`,
    {
      method: "PUT",
      body: JSON.stringify(datos),
    },
  );
}
