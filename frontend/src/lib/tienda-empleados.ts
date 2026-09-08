import { API_URL, apiFetch } from "./api";

/** Clave de sessionStorage con la identificación del empleado (cédula/nombre). */
export const SESSION_KEY = "tiendaEmpleado";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ItemCatalogoTienda {
  referencia: string;
  producto: string;
  categoria: string;
  um: string;
  precio: number;
}

export interface ProductoTienda {
  referencia: string;
  producto: string;
  um: string;
  precio: number;
}

export interface CategoriaTienda {
  categoria: string;
  productos: ProductoTienda[];
}

export interface TiendaResumen {
  slug: string;
  nombre: string;
  ciudad: string | null;
}

export interface TiendaCatalogoPublico {
  slug: string;
  punto_id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  ciudad: string | null;
  categorias: CategoriaTienda[];
}

export interface SaldoTrabajador {
  cedula: string;
  nombre: string | null;
  encontrado: boolean;
  activo: boolean;
  cupo_asignado: number;
  cupo_disponible: number;
}

export interface ItemPedidoTienda {
  referencia: string;
  producto: string;
  um: string;
  precio: number;
  cantidad: number;
}

export interface PedidoTienda {
  id: string;
  trabajador_cedula: string;
  trabajador_nombre: string;
  punto_id: string;
  punto_nombre: string;
  total: number;
  entrega: string;
  direccion: string | null;
  telefono: string | null;
  metodo_pago: string | null;
  observacion: string | null;
  items: ItemPedidoTienda[];
  estado: string;
  nomina_fecha: string | null;
  creado_en: string;
  actualizado_en: string;
}

// ---------------------------------------------------------------------------
// Público (sin token) — fetch directo a la API
// ---------------------------------------------------------------------------

async function fetchPublico<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    const msg = (data && (data.message as string | string[])) ?? "Ocurrió un error";
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }
  return data as T;
}

export function listarTiendasPublicas(): Promise<TiendaResumen[]> {
  return fetchPublico<TiendaResumen[]>("/tienda-empleados/tiendas");
}

export function obtenerTiendaPublica(slug: string): Promise<TiendaCatalogoPublico> {
  return fetchPublico<TiendaCatalogoPublico>(`/tienda-empleados/tienda/${encodeURIComponent(slug)}`);
}

export function consultarSaldoPublico(cedula: string): Promise<SaldoTrabajador> {
  return fetchPublico<SaldoTrabajador>(`/tienda-empleados/saldo/${encodeURIComponent(cedula)}`);
}

export function crearPedidoTiendaPublico(input: {
  cedula: string;
  slug: string;
  items: ItemPedidoTienda[];
  entrega: "recoge" | "domicilio";
  direccion?: string;
  telefono?: string;
  observacion?: string;
}): Promise<PedidoTienda> {
  return fetchPublico<PedidoTienda>("/tienda-empleados/pedidos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Admin (con token)
// ---------------------------------------------------------------------------

export function obtenerCatalogoTienda(puntoId: string): Promise<ItemCatalogoTienda[]> {
  return apiFetch<ItemCatalogoTienda[]>(`/tienda-empleados/catalogo/${encodeURIComponent(puntoId)}`);
}

export function guardarCatalogoTienda(
  puntoId: string,
  items: ItemCatalogoTienda[],
): Promise<{ ok: true; total: number }> {
  return apiFetch(`/tienda-empleados/catalogo/${encodeURIComponent(puntoId)}`, {
    method: "PUT",
    body: JSON.stringify({ items }),
  });
}

export function listarPedidosTienda(filtros: {
  estado?: string;
  punto_id?: string;
  desde?: string;
  hasta?: string;
} = {}): Promise<PedidoTienda[]> {
  const p = new URLSearchParams();
  if (filtros.estado) p.set("estado", filtros.estado);
  if (filtros.punto_id) p.set("punto_id", filtros.punto_id);
  if (filtros.desde) p.set("desde", filtros.desde);
  if (filtros.hasta) p.set("hasta", filtros.hasta);
  const qs = p.toString();
  return apiFetch<PedidoTienda[]>(`/tienda-empleados/pedidos${qs ? `?${qs}` : ""}`);
}

export function actualizarEstadoPedidoTienda(
  id: string,
  estado: "pendiente" | "facturado" | "entregado" | "anulado",
): Promise<PedidoTienda> {
  return apiFetch<PedidoTienda>(`/tienda-empleados/pedidos/${encodeURIComponent(id)}/estado`, {
    method: "PATCH",
    body: JSON.stringify({ estado }),
  });
}

/** Formatea un valor en pesos colombianos. */
export function copTienda(v: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v || 0);
}
