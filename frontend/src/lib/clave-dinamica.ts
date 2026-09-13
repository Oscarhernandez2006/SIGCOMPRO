import { apiFetch } from "./api";

export interface ClaveDinamicaPunto {
  puntoVentaId: string;
  puntoVentaNombre: string;
  codigo: string;
  /** Segundos que le quedan antes de rotar sola (si nadie la usa). */
  expiraEn: number;
  /** Duración total del ciclo en segundos (300 = 5 min). */
  duracion: number;
}

/** Lista la clave dinámica vigente de cada punto de venta (solo administrador app / desarrollador). */
export function obtenerClavesDinamicas(): Promise<ClaveDinamicaPunto[]> {
  return apiFetch<ClaveDinamicaPunto[]>("/auth/claves-dinamicas");
}

/**
 * Verifica el código dinámico de UN punto de venta específico. Es de un solo
 * uso: al usarse, cambia automáticamente. Si se reutiliza uno ya consumido,
 * `motivo` viene como "caducada" (hay que pedir uno nuevo al administrador).
 */
export function verificarClaveDinamica(
  puntoVentaId: string,
  codigo: string,
): Promise<{ valido: boolean; motivo?: "caducada" | "incorrecta" }> {
  return apiFetch<{ valido: boolean; motivo?: "caducada" | "incorrecta" }>(
    "/auth/clave-dinamica/verificar",
    {
      method: "POST",
      body: JSON.stringify({ puntoVentaId, codigo }),
    },
  );
}

/** Mensaje a mostrar según el resultado de `verificarClaveDinamica`. */
export function mensajeClaveInvalida(motivo?: "caducada" | "incorrecta"): string {
  return motivo === "caducada"
    ? "Esta clave dinámica ya caducó (de un solo uso). Pide una nueva al administrador."
    : "Clave incorrecta. Pide la clave vigente al administrador.";
}

