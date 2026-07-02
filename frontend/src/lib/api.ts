import { getToken, limpiarSesion } from "./auth";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/**
 * Wrapper de fetch que adjunta el token de acceso y normaliza los errores.
 * Si el servidor responde 401, limpia la sesión y redirige al login.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    limpiarSesion();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
    throw new ApiError(401, "Sesión expirada");
  }

  // 204 No Content u otras respuestas sin cuerpo
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;

  if (!res.ok) {
    const mensaje =
      (data && (data.message as string | string[])) ?? "Ocurrió un error";
    throw new ApiError(
      res.status,
      Array.isArray(mensaje) ? mensaje.join(", ") : mensaje,
    );
  }

  return data as T;
}
