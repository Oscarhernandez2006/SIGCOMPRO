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
  observacion?: string;
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
  origen: string;
  factura_numero: string | null;
  factura_imagen?: string | null;
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

// ---------------------------------------------------------------------------
// Acceso del trabajador (cédula + contraseña, registro con foto de cédula)
// ---------------------------------------------------------------------------

export interface EstadoAccesoTrabajador {
  encontrado: boolean;
  activo: boolean;
  nombre: string | null;
  /** true si ya configuró contraseña (pedir clave); false = primer ingreso. */
  registrado: boolean;
}

export interface SesionTrabajador {
  cedula: string;
  nombre: string;
  telefono?: string | null;
}

export function estadoAccesoTrabajador(cedula: string): Promise<EstadoAccesoTrabajador> {
  return fetchPublico<EstadoAccesoTrabajador>("/tienda-empleados/auth/estado", {
    method: "POST",
    body: JSON.stringify({ cedula }),
  });
}

export function loginTrabajador(cedula: string, clave: string): Promise<SesionTrabajador> {
  return fetchPublico<SesionTrabajador>("/tienda-empleados/auth/login", {
    method: "POST",
    body: JSON.stringify({ cedula, clave }),
  });
}

export function verificarCedulaTrabajador(input: {
  cedula: string;
  foto: string;
}): Promise<{ ok: true; nombre: string }> {
  return fetchPublico("/tienda-empleados/auth/verificar-cedula", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function registrarTrabajador(input: {
  cedula: string;
  clave: string;
}): Promise<SesionTrabajador> {
  return fetchPublico<SesionTrabajador>("/tienda-empleados/auth/registrar", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cambiarClaveTrabajador(input: {
  cedula: string;
  clave_actual: string;
  clave_nueva: string;
}): Promise<{ ok: true }> {
  return fetchPublico("/tienda-empleados/auth/cambiar-clave", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function actualizarTelefonoTrabajador(input: {
  cedula: string;
  clave: string;
  telefono: string;
}): Promise<{ ok: true; telefono: string | null }> {
  return fetchPublico("/tienda-empleados/auth/telefono", {
    method: "POST",
    body: JSON.stringify(input),
  });
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
  origen?: string;
} = {}): Promise<PedidoTienda[]> {
  const p = new URLSearchParams();
  if (filtros.estado) p.set("estado", filtros.estado);
  if (filtros.punto_id) p.set("punto_id", filtros.punto_id);
  if (filtros.desde) p.set("desde", filtros.desde);
  if (filtros.hasta) p.set("hasta", filtros.hasta);
  if (filtros.origen) p.set("origen", filtros.origen);
  const qs = p.toString();
  return apiFetch<PedidoTienda[]>(`/tienda-empleados/pedidos${qs ? `?${qs}` : ""}`);
}

export function actualizarEstadoPedidoTienda(
  id: string,
  estado: "pendiente" | "facturado" | "entregado" | "anulado",
  extra?: { factura_imagen?: string | null; factura_numero?: string | null },
): Promise<PedidoTienda> {
  return apiFetch<PedidoTienda>(`/tienda-empleados/pedidos/${encodeURIComponent(id)}/estado`, {
    method: "PATCH",
    body: JSON.stringify({ estado, ...(extra ?? {}) }),
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
