/**
 * Helpers de permisos de navegación (lado cliente).
 *
 * - El panel administrativo es exclusivo de los roles con acceso total
 *   (administrador/desarrollador): es el centro de gestión de todos los módulos.
 * - El panel operativo muestra a cada usuario solo los módulos de negocio que
 *   tenga asignados en `permisos` (los roles con acceso total ven todos).
 *
 * El catálogo de módulos de negocio vive en `./usuarios`.
 */
import { tieneAccesoAdministrativo, type Usuario } from "./auth";
import { CATALOGO_PERMISOS } from "./usuarios";

export interface PanelAccesible {
  key: string;
  label: string;
  /** Ruta de inicio del panel. */
  href: string;
}

/** Ruta de cada módulo de negocio en el panel operativo. */
export const RUTA_MODULO: Record<string, string> = {
  pedidos: "/pedidos",
  despacho: "/despacho",
  clientes: "/clientes",
  dashboard: "/dashboard",
  cuadre_caja: "/cuadre-caja",
  cotizaciones: "/cotizaciones",
  lista_precios: "/lista-precios",
  reporte_productos: "/reporte-productos",
  mi_resumen: "/mi-resumen",
  liquidacion_variable: "/liquidacion-variable",
  credito_empleados: "/credito-empleados",
  monitoreo: "/monitoreo",
  run_errands: "/run-errands",
};

/** Apartado del catálogo que agrupa los módulos de negocio. */
const APARTADO_OPERATIVO = "operativo";
const APARTADO_CREDITO_EMPLEADOS = "credito_empleados";
const APARTADO_RUN_ERRANDS = "run_errands";

/** ¿El usuario puede ver un módulo concreto? */
export function puedeVerModulo(
  usuario: Usuario | null,
  moduloKey: string,
): boolean {
  if (tieneAccesoAdministrativo(usuario?.rol)) return true;
  return (usuario?.permisos ?? []).includes(moduloKey);
}

/**
 * ¿El usuario puede ejecutar una acción granular (sub-permiso)?
 * Los roles con acceso total pueden todo. En otro caso, debe tener la clave
 * exacta de la acción (ej. "clientes.crear") en su lista de permisos.
 */
export function puedeAccion(
  usuario: Usuario | null,
  accionKey: string,
): boolean {
  if (tieneAccesoAdministrativo(usuario?.rol)) return true;
  return (usuario?.permisos ?? []).includes(accionKey);
}

/** Claves de módulo que pertenecen a un apartado. */
function modulosDeApartado(apartadoKey: string): string[] {
  const apartado = CATALOGO_PERMISOS.find((a) => a.key === apartadoKey);
  return apartado ? apartado.modulos.map((m) => m.key) : [];
}

/** ¿El usuario puede acceder a un apartado (tiene al menos un módulo)? */
export function puedeAccederApartado(
  usuario: Usuario | null,
  apartadoKey: string,
): boolean {
  if (tieneAccesoAdministrativo(usuario?.rol)) return true;
  const permisos = usuario?.permisos ?? [];
  return modulosDeApartado(apartadoKey).some((k) => permisos.includes(k));
}

/** Primer módulo operativo visible para el usuario (en orden del catálogo). */
export function rutaOperativaInicial(usuario: Usuario | null): string | null {
  for (const key of modulosDeApartado(APARTADO_OPERATIVO)) {
    if (puedeVerModulo(usuario, key)) {
      return RUTA_MODULO[key] ?? null;
    }
  }
  return null;
}

/** Lista de paneles a los que el usuario tiene acceso. */
export function panelesAccesibles(usuario: Usuario | null): PanelAccesible[] {
  const paneles: PanelAccesible[] = [];

  // Panel único SIGCOMPRO: los roles con acceso total entran a la vista
  // administrativa; el resto, al primer módulo operativo que tenga.
  const inicioSigcompro = tieneAccesoAdministrativo(usuario?.rol)
    ? "/admin"
    : rutaOperativaInicial(usuario);
  if (inicioSigcompro) {
    paneles.push({
      key: "operativo",
      label: "Sigcompro",
      href: inicioSigcompro,
    });
  }

  // Panel Run Errands (proceso de Carnes, migrado desde SIGROUTE).
  const inicioRunErrands = puedeAccederApartado(usuario, APARTADO_RUN_ERRANDS)
    ? RUTA_MODULO.run_errands
    : null;
  if (inicioRunErrands) {
    paneles.push({
      key: "run_errands",
      label: "Run Errands",
      href: inicioRunErrands,
    });
  }

  // Panel de crédito empleados: separado del operativo.
  const inicioCredito = puedeAccederApartado(usuario, APARTADO_CREDITO_EMPLEADOS)
    ? RUTA_MODULO.credito_empleados
    : null;
  if (inicioCredito) {
    paneles.push({
      key: "credito_empleados",
      label: "Compras Empleados",
      href: inicioCredito,
    });
  }

  return paneles;
}
