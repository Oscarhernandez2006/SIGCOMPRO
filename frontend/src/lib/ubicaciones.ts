import { apiFetch } from "./api";

export interface CiudadSugerida {
  nombre: string;
  departamento: string | null;
}

/** Busca ciudades de Colombia por nombre (vía backend / api-colombia). */
export function buscarCiudades(q: string): Promise<CiudadSugerida[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  return apiFetch<CiudadSugerida[]>(`/ubicaciones/ciudades?${params.toString()}`);
}
