import { apiFetch } from "./api";

export interface ClaveDinamica {
  /** Código de 6 dígitos vigente. */
  codigo: string;
  /** Segundos que le quedan de vigencia al código actual. */
  expiraEn: number;
  /** Duración total del periodo en segundos (60). */
  periodo: number;
}

/** Obtiene la clave dinámica vigente (solo administrador app / desarrollador). */
export function obtenerClaveDinamica(): Promise<ClaveDinamica> {
  return apiFetch<ClaveDinamica>("/auth/clave-dinamica");
}

/**
 * Verifica un código dinámico dictado por un administrador para autorizar una
 * acción sensible. Cualquier usuario autenticado puede llamarla.
 */
export function verificarClaveDinamica(codigo: string): Promise<{ valido: boolean }> {
  return apiFetch<{ valido: boolean }>("/auth/clave-dinamica/verificar", {
    method: "POST",
    body: JSON.stringify({ codigo }),
  });
}
