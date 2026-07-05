import { apiFetch } from "./api";

/** Personal de despacho de un punto (porcionadores y domiciliarios). */
export interface PersonalDespacho {
  porcionadores: string[];
  domiciliarios: string[];
}

/** Una persona con los puntos de venta donde está asignada. */
export interface PersonaAsignada {
  nombre: string;
  puntos: string[];
}

/** Registro global de personas (centrado en la persona, no en el punto). */
export interface RegistroPersonal {
  porcionadores: PersonaAsignada[];
  domiciliarios: PersonaAsignada[];
}

/** Personal de despacho de todos los puntos, indexado por id de punto de venta. */
export function obtenerPersonalDespachoTodos(): Promise<
  Record<string, PersonalDespacho>
> {
  return apiFetch<Record<string, PersonalDespacho>>("/configuracion/despacho");
}

/** Registro global de porcionadores y domiciliarios con sus puntos asignados. */
export function obtenerRegistroPersonal(): Promise<RegistroPersonal> {
  return apiFetch<RegistroPersonal>("/configuracion/personal");
}

/** Guarda (reemplaza) el registro global de personas. Solo administradores. */
export function guardarRegistroPersonal(
  datos: RegistroPersonal,
): Promise<RegistroPersonal> {
  return apiFetch<RegistroPersonal>("/configuracion/personal", {
    method: "PUT",
    body: JSON.stringify(datos),
  });
}
