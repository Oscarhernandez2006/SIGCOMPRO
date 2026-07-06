import { apiFetch } from "./api";
import { API_URL } from "./api";
import { getToken, limpiarSesion } from "./auth";

export interface Cliente {
  id: string;
  nit_cedula: string;
  nombre: string | null;
  apellidos: string | null;
  direccion: string | null;
  referencia: string | null;
  barrio: string | null;
  ciudad: string | null;
  telefono: string | null;
  correo: string | null;
  lat: number | null;
  lng: number | null;
  activo: boolean;
  horeca: boolean;
  direccion_incorrecta: boolean;
  creado_en: string;
}

export interface ListarClientesResp {
  items: Cliente[];
  total: number;
}

export interface ClienteInput {
  nit_cedula: string;
  nombre?: string;
  apellidos?: string;
  direccion?: string;
  referencia?: string;
  barrio?: string;
  ciudad?: string;
  telefono?: string;
  correo?: string;
  lat?: number | null;
  lng?: number | null;
  activo?: boolean;
  horeca?: boolean;
  direccion_incorrecta?: boolean;
}

export function listarClientes(
  q: string,
  limit: number,
  offset: number,
): Promise<ListarClientesResp> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return apiFetch<ListarClientesResp>(`/clientes?${params.toString()}`);
}

/** Estadísticas de clientes según la calidad de su ubicación. */
export interface EstadisticasClientes {
  total: number;
  validados: number;
  incorrectos: number;
  sinVerificar: number;
}
export function estadisticasClientes(): Promise<EstadisticasClientes> {
  return apiFetch<EstadisticasClientes>("/clientes/estadisticas");
}

export type EstadoUbicacion = "validado" | "incorrecto" | "sin";

/**
 * Clasifica la ubicación de un cliente:
 * - "incorrecto": marcada manualmente como incorrecta (para revisión), o con
 *   coordenadas inválidas (0,0 o fuera de rango).
 * - "validado": coordenadas presentes y dentro de rango válido.
 * - "sin": sin coordenadas (el mapa nunca se abrió/confirmó).
 */
export function estadoUbicacion(c: {
  lat: number | null;
  lng: number | null;
  direccion_incorrecta?: boolean | null;
}): EstadoUbicacion {
  if (c.direccion_incorrecta) return "incorrecto";
  if (c.lat == null || c.lng == null) return "sin";
  const latOk = c.lat >= -90 && c.lat <= 90;
  const lngOk = c.lng >= -180 && c.lng <= 180;
  if (!latOk || !lngOk || (c.lat === 0 && c.lng === 0)) return "incorrecto";
  return "validado";
}

export function crearCliente(input: ClienteInput): Promise<Cliente> {
  return apiFetch<Cliente>("/clientes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function actualizarCliente(
  id: string,
  input: Partial<ClienteInput>,
): Promise<Cliente> {
  return apiFetch<Cliente>(`/clientes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function eliminarCliente(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/clientes/${id}`, {
    method: "DELETE",
  });
}

export interface ImportacionResumen {
  totalFilas: number;
  creados: number;
  actualizados: number;
  sinCambios: number;
  descartadas: number;
}

/**
 * Sube el Excel de BD Clientes para crear/actualizar clientes.
 * Usa FormData (no JSON), por eso no pasa por apiFetch.
 */
export async function importarClientesDB(
  archivo: File,
): Promise<ImportacionResumen> {
  const token = getToken();
  const form = new FormData();
  form.append("archivo", archivo);

  const res = await fetch(`${API_URL}/clientes/importar`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (res.status === 401) {
    limpiarSesion();
    if (typeof window !== "undefined") window.location.href = "/";
    throw new Error("Sesión expirada");
  }

  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    const mensaje = (data && (data.message as string | string[])) ?? "No se pudo importar";
    throw new Error(Array.isArray(mensaje) ? mensaje.join(", ") : mensaje);
  }
  return data as ImportacionResumen;
}

/** Barrios ya registrados (autocompletar), opcionalmente filtrados por ciudad. */
export function buscarBarrios(q: string, ciudad?: string): Promise<string[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (ciudad && ciudad.trim()) params.set("ciudad", ciudad.trim());
  return apiFetch<string[]>(`/clientes/barrios?${params.toString()}`);
}
