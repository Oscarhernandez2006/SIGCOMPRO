import { API_URL } from "./api";
import { getToken, limpiarSesion } from "./auth";

export interface ResultadoNormalizacion {
  blob: Blob;
  filename: string;
  filas: number;
}

/**
 * Sube un Excel de clientes al módulo Machine Learning, lo procesa (normaliza
 * direcciones y capitaliza campos) y devuelve el archivo corregido para
 * descargar. Usa FormData + Blob (no pasa por apiFetch, que es JSON).
 */
export async function normalizarDireccionesExcel(
  archivo: File,
): Promise<ResultadoNormalizacion> {
  const token = getToken();
  const form = new FormData();
  form.append("archivo", archivo);

  const res = await fetch(`${API_URL}/machine-learning/normalizar-direcciones`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (res.status === 401) {
    limpiarSesion();
    if (typeof window !== "undefined") window.location.href = "/";
    throw new Error("Sesión expirada");
  }

  if (!res.ok) {
    let msg = "No se pudo procesar el archivo";
    try {
      const data = await res.json();
      const m = (data as { message?: string | string[] })?.message;
      if (m) msg = Array.isArray(m) ? m.join(", ") : m;
    } catch {
      /* respuesta no JSON */
    }
    throw new Error(msg);
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] ?? "clientes_normalizado.xlsx";
  const filas = Number(res.headers.get("X-Filas-Procesadas") ?? "0") || 0;
  const blob = await res.blob();
  return { blob, filename, filas };
}

/** Dispara la descarga de un blob con el nombre indicado. */
export function descargarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
