import { apiFetch } from "./api";

export type ValorCelda = string | number | null;

export interface ColumnaDireccion {
  letra: string;
  nombre: string;
  visible: boolean;
}

export interface FilaDireccion {
  id: string;
  /** Número de fila como en el Excel (la fila 1 es el encabezado). */
  numero: number;
  datos: Record<string, ValorCelda>;
  /** Marcada en amarillo = ya corregida. */
  corregida: boolean;
  corregidaPor: string | null;
  corregidaEn: string | null;
  creadoPor: string | null;
  creadoEn: string;
  actualizadoPor: string | null;
  actualizadoEn: string;
}

export type EstadoDireccion = "todas" | "corregidas" | "pendientes";

export interface PaginaDirecciones {
  filas: FilaDireccion[];
  total: number;
  offset: number;
  limit: number;
  totales: { todas: number; corregidas: number; pendientes: number };
}

/** Valor del filtro de tipo para las filas SIN "Tipo de Dirección". */
export const TIPO_VACIO = "__vacio__";

export function obtenerColumnasDirecciones(): Promise<ColumnaDireccion[]> {
  return apiFetch<ColumnaDireccion[]>("/direcciones/columnas");
}

export function obtenerTiposDireccion(): Promise<string[]> {
  return apiFetch<string[]>("/direcciones/tipos");
}

export function listarDirecciones(f: {
  q?: string;
  estado?: EstadoDireccion;
  tipo?: string;
  offset?: number;
  limit?: number;
}): Promise<PaginaDirecciones> {
  const p = new URLSearchParams();
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.estado && f.estado !== "todas") p.set("estado", f.estado);
  if (f.tipo) p.set("tipo", f.tipo);
  p.set("offset", String(f.offset ?? 0));
  p.set("limit", String(f.limit ?? 100));
  return apiFetch<PaginaDirecciones>(`/direcciones?${p.toString()}`);
}

export function actualizarCeldaDireccion(
  id: string,
  columna: string,
  valor: string,
): Promise<FilaDireccion> {
  return apiFetch<FilaDireccion>(`/direcciones/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ columna, valor }),
  });
}

export function agregarDireccion(
  datos?: Record<string, string>,
): Promise<FilaDireccion> {
  return apiFetch<FilaDireccion>("/direcciones", {
    method: "POST",
    body: JSON.stringify({ datos: datos ?? {} }),
  });
}

export function marcarDirecciones(
  ids: string[],
  corregida: boolean,
): Promise<{
  actualizadas: number;
  corregida: boolean;
  corregidaPor: string | null;
  corregidaEn: string | null;
}> {
  return apiFetch("/direcciones/marcar", {
    method: "POST",
    body: JSON.stringify({ ids, corregida }),
  });
}

export function eliminarDirecciones(ids: string[]): Promise<{ eliminadas: number }> {
  return apiFetch("/direcciones/eliminar", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

/** Códigos de dirección existentes (en minúscula). */
export function obtenerCodigosDirecciones(): Promise<string[]> {
  return apiFetch<string[]>("/direcciones/codigos");
}

/** Agrega SOLO las filas cuyo código no exista (llegan sin amarillo). */
export function importarDirecciones(
  filas: Record<string, ValorCelda>[],
): Promise<{ agregadas: number; existentes: number; sinCodigo: number }> {
  return apiFetch("/direcciones/importar", {
    method: "POST",
    body: JSON.stringify({ filas }),
  });
}

/** Todas las filas con las 66 columnas: cada fila es [corregida(0/1), A, B, ...]. */
export function exportarDirecciones(): Promise<{
  columnas: string[];
  filas: ValorCelda[][];
}> {
  return apiFetch("/direcciones/exportar");
}
