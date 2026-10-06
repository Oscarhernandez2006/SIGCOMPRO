import { apiFetch } from "./api";

export interface PuntoVenta {
  id: string;
  indicador: number;
  nombre: string;
  activo: boolean;
  creadoEn: string;
}

export interface Domiciliario {
  id: string;
  nombre: string;
  telefono: string | null;
  cedula: string | null;
  email: string | null;
  puntoVentaId: string | null;
  activo: boolean;
  creadoEn: string;
  puntoVenta?: PuntoVenta | null;
}

export interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  referencia: string | null;
  barrio: string | null;
  ciudad: string | null;
  region: string | null;
  telefono: string | null;
  email: string | null;
  observaciones: string | null;
  activo: boolean;
  creadoEn: string;
}

export interface Pedido {
  id: string;
  numeroPedido: string;
  clienteId: string;
  puntoVentaId: string | null;
  domiciliarioId: string | null;
  kilos: number;
  estado: string;
  observaciones: string | null;
  fecha: string;
  usuario: string | null;
  creadoEn: string;
  drivinEstadoEnvio: string;
  drivinMensajeEnvio: string | null;
  drivinEstadoEntrega: string | null;
  drivinMotivoEntrega: string | null;
  drivinSyncAt: string | null;
  drivinSchemaName: string | null;
  cliente?: Cliente;
  puntoVenta?: PuntoVenta | null;
  domiciliario?: Domiciliario | null;
}

export interface EsquemaDrivin {
  code: string;
  name: string;
}

export interface DashboardRunErrands {
  totalPedidos: number;
  totalKilos: number;
  totalClientes: number;
  totalPuntosVenta: number;
  porEstado: { label: string; value: number }[];
  porPdv: { label: string; value: number }[];
  porCliente: { label: string; value: number }[];
  porDia: { label: string; value: number }[];
}

const base = "/run-errands";

// ── Puntos de venta ────────────────────────────────────────────────────
export const getPuntosVenta = (todos = false) =>
  apiFetch<PuntoVenta[]>(`${base}/puntos-venta${todos ? "?todos=1" : ""}`);
export const crearPuntoVenta = (nombre: string) =>
  apiFetch<PuntoVenta>(`${base}/puntos-venta`, { method: "POST", body: JSON.stringify({ nombre }) });
export const actualizarPuntoVenta = (id: string, data: { nombre?: string; activo?: boolean }) =>
  apiFetch<PuntoVenta>(`${base}/puntos-venta/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const eliminarPuntoVenta = (id: string) =>
  apiFetch<{ ok: true }>(`${base}/puntos-venta/${id}`, { method: "DELETE" });

// ── Domiciliarios ───────────────────────────────────────────────────────
export const getDomiciliarios = (opts: { todos?: boolean; pdv?: string } = {}) => {
  const qs = new URLSearchParams();
  if (opts.todos) qs.set("todos", "1");
  if (opts.pdv) qs.set("pdv", opts.pdv);
  const q = qs.toString();
  return apiFetch<Domiciliario[]>(`${base}/domiciliarios${q ? `?${q}` : ""}`);
};
export const crearDomiciliario = (data: {
  nombre: string; telefono?: string; cedula?: string; email?: string; puntoVentaId?: string | null;
}) => apiFetch<Domiciliario>(`${base}/domiciliarios`, { method: "POST", body: JSON.stringify(data) });
export const actualizarDomiciliario = (
  id: string,
  data: Partial<{ nombre: string; telefono: string; cedula: string; email: string; puntoVentaId: string | null; activo: boolean }>,
) => apiFetch<Domiciliario>(`${base}/domiciliarios/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const eliminarDomiciliario = (id: string) =>
  apiFetch<{ ok: true }>(`${base}/domiciliarios/${id}`, { method: "DELETE" });

// ── Clientes ─────────────────────────────────────────────────────────────
export const getClientes = (buscar = "", todos = false) => {
  const qs = new URLSearchParams();
  if (buscar) qs.set("buscar", buscar);
  if (todos) qs.set("todos", "1");
  const q = qs.toString();
  return apiFetch<Cliente[]>(`${base}/clientes${q ? `?${q}` : ""}`);
};
export const getCliente = (id: string) => apiFetch<Cliente>(`${base}/clientes/${id}`);
export const crearCliente = (data: {
  nombre: string; direccion?: string; referencia?: string; barrio?: string;
  ciudad?: string; region?: string; telefono?: string; email?: string; observaciones?: string;
}) => apiFetch<Cliente & { drivinOk: boolean; drivinMensaje?: string }>(`${base}/clientes`, {
  method: "POST",
  body: JSON.stringify(data),
});
export const actualizarCliente = (
  id: string,
  data: Partial<{
    nombre: string; direccion: string; referencia: string; barrio: string; ciudad: string;
    region: string; telefono: string; email: string; observaciones: string; activo: boolean;
  }>,
) =>
  apiFetch<Cliente & { drivinOk: boolean; drivinMensaje?: string }>(`${base}/clientes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const eliminarCliente = (id: string) => apiFetch<{ ok: true }>(`${base}/clientes/${id}`, { method: "DELETE" });

// ── Pedidos ──────────────────────────────────────────────────────────────
export const getPedidos = (filtros: { estado?: string; pdv?: string; desde?: string; hasta?: string } = {}) => {
  const qs = new URLSearchParams();
  if (filtros.estado) qs.set("estado", filtros.estado);
  if (filtros.pdv) qs.set("pdv", filtros.pdv);
  if (filtros.desde) qs.set("desde", filtros.desde);
  if (filtros.hasta) qs.set("hasta", filtros.hasta);
  const q = qs.toString();
  return apiFetch<Pedido[]>(`${base}/pedidos${q ? `?${q}` : ""}`);
};
export const getPedido = (id: string) => apiFetch<Pedido>(`${base}/pedidos/${id}`);
export const getSiguienteNumeroPedido = () => apiFetch<{ numeroPedido: string }>(`${base}/pedidos-next-numero`);
export const getEsquemasDrivin = () => apiFetch<EsquemaDrivin[]>(`${base}/drivin-esquemas`);
export const crearPedido = (data: {
  clienteId: string; puntoVentaId?: string | null; domiciliarioId?: string | null;
  kilos?: number; estado?: string; observaciones?: string; schemaName?: string;
}) => apiFetch<Pedido>(`${base}/pedidos`, { method: "POST", body: JSON.stringify(data) });
/** Crea varios mandados de una vez (se guardan y se envían todos a Drivin). */
export const crearPedidosLote = (pedidos: {
  clienteId: string; puntoVentaId?: string | null; domiciliarioId?: string | null;
  kilos?: number; estado?: string; observaciones?: string; schemaName?: string;
}[]) => apiFetch<{ creados: Pedido[] }>(`${base}/pedidos`, { method: "POST", body: JSON.stringify({ pedidos }) });
export const actualizarPedido = (
  id: string,
  data: Partial<{
    clienteId: string; puntoVentaId: string | null; domiciliarioId: string | null;
    kilos: number; estado: string; observaciones: string; drivinSchemaName: string;
  }>,
) => apiFetch<Pedido>(`${base}/pedidos/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const cambiarEstadoPedido = (id: string, estado: string) =>
  apiFetch<Pedido>(`${base}/pedidos/${id}/estado`, { method: "PUT", body: JSON.stringify({ estado }) });
export const reenviarDrivin = (id: string) =>
  apiFetch<Pedido>(`${base}/pedidos/${id}/reenviar-drivin`, { method: "POST" });
export const syncDrivin = (desde: string, hasta: string) =>
  apiFetch<{ actualizados: number }>(`${base}/pedidos/sync-drivin`, { method: "POST", body: JSON.stringify({ desde, hasta }) });
export const eliminarPedido = (id: string) => apiFetch<{ ok: true }>(`${base}/pedidos/${id}`, { method: "DELETE" });

// ── Dashboard ────────────────────────────────────────────────────────────
export const getDashboardRunErrands = (desde?: string, hasta?: string) => {
  const qs = new URLSearchParams();
  if (desde) qs.set("desde", desde);
  if (hasta) qs.set("hasta", hasta);
  const q = qs.toString();
  return apiFetch<DashboardRunErrands>(`${base}/dashboard${q ? `?${q}` : ""}`);
};
