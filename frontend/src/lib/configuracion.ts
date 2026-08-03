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
  /** ¿Activa? Si es false, no aparece en los selectores de despacho. */
  activo?: boolean;
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

/** Lista de tipos de corte (porcionado). */
export function obtenerTiposCorte(): Promise<string[]> {
  return apiFetch<string[]>("/configuracion/cortes");
}

/** Guarda (reemplaza) la lista de tipos de corte. Solo administradores. */
export function guardarTiposCorte(lista: string[]): Promise<string[]> {
  return apiFetch<string[]>("/configuracion/cortes", {
    method: "PUT",
    body: JSON.stringify({ lista }),
  });
}

/**
 * Caché en memoria de los tipos de corte para no pedirlos en cada apertura del
 * modal de producto. Se invalida al guardar cambios en configuración.
 */
let cacheCortes: string[] | null = null;

/** Devuelve los tipos de corte usando caché en memoria. */
export async function obtenerTiposCorteCache(): Promise<string[]> {
  if (cacheCortes) return cacheCortes;
  cacheCortes = await obtenerTiposCorte();
  return cacheCortes;
}

/** Invalida la caché de tipos de corte (llamar tras guardar cambios). */
export function invalidarCacheCortes(): void {
  cacheCortes = null;
}

/* -------------------------------------------------------------------------- */
/* Cuadre de caja: cierre por punto de venta + día                            */
/* -------------------------------------------------------------------------- */

/** Consulta si el cuadre de un punto en una fecha (YYYY-MM-DD) está cerrado. */
export function cuadreCerrado(
  puntoId: string,
  fecha: string,
): Promise<{ cerrado: boolean }> {
  const qs = `puntoId=${encodeURIComponent(puntoId)}&fecha=${encodeURIComponent(fecha)}`;
  return apiFetch<{ cerrado: boolean }>(`/configuracion/cuadre/cerrado?${qs}`);
}

/** Cierra el cuadre de un punto en una fecha concreta. */
export function cerrarCuadre(
  puntoId: string,
  fecha: string,
): Promise<{ cerrado: boolean }> {
  return apiFetch<{ cerrado: boolean }>("/configuracion/cuadre/cerrar", {
    method: "POST",
    body: JSON.stringify({ puntoId, fecha }),
  });
}

/** Reabre (quita el cierre de) el cuadre de un punto en una fecha. */
export function reabrirCuadre(
  puntoId: string,
  fecha: string,
): Promise<{ cerrado: boolean }> {
  return apiFetch<{ cerrado: boolean }>("/configuracion/cuadre/reabrir", {
    method: "POST",
    body: JSON.stringify({ puntoId, fecha }),
  });
}
