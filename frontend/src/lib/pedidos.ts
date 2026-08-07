import { apiFetch } from "./api";
import { API_URL } from "./api";
import { getToken } from "./auth";
import type { Pedido, TrazaEvento } from "@/app/(panel)/pedidos/page";

/** Metadata de despacho asociada a un pedido (se guarda junto al pedido). */
export interface DespachoMeta {
  porcionador?: string;
  inicio?: string;
  fin?: string;
  /** Número de la factura. */
  facturaNumero?: string;
  /** Valor facturado (puede diferir del total del pedido). */
  facturaValor?: number;
  /** Nombre del facturador (usuario con rol facturador) que hizo la factura. */
  facturadoPor?: string;
  /** Domiciliario asignado para el despacho. */
  domiciliario?: string;
  /** Code del vehículo (domiciliario) de Drivin correspondiente a `domiciliario`. */
  domiciliarioCodigo?: string;
  /** El pedido ya se subió a Drivin (evita reenviar si se re-factura). */
  drivinEnviado?: boolean;
  /** Instante en que el pedido pasó a "Despachado". */
  despachoFin?: string;
  /** Drivin marcó la ruta del domiciliario como finalizada: el pedido se ENTREGÓ. */
  entregado?: boolean;
  /** Instante en que Drivin finalizó la entrega (finished_at de la ruta). */
  entregadoEn?: string;
  /**
   * Instante en que se confirmó el pago (solo para transferencia). Al fijarse,
   * congela el cronómetro de despacho: el pedido ya está alistado y solo espera
   * que el cliente envíe la transferencia, por lo que no debe marcarse como
   * crítico ni en demora.
   */
  pagoConfirmado?: string;
  /**
   * Réplicas del pedido (el mismo pedido enviado por partes). Cada réplica
   * tiene un número (sufijo -N en el consecutivo del Excel) y puede llevar su
   * propio domiciliario. Deben ser secuenciales (1, 2, 3, 4, 5).
   */
  replicas?: {
    numero: number;
    domiciliario?: string;
    /** Code del vehículo (domiciliario) de Drivin de esta réplica. */
    domiciliarioCodigo?: string;
    /** La réplica ya se subió a Drivin correctamente. */
    drivinEnviado?: boolean;
  }[];
  /** Cuadre de caja: valor liquidado en efectivo por la cajera. */
  cuadreEfectivo?: number;
  /** Cuadre de caja: valor liquidado en otros medios de pago (O.M.P.). */
  cuadreOmp?: number;
  /** Cuadre de caja: el cuadre de ese día quedó cerrado (guardado). */
  cuadreCerrado?: boolean;
  /** Nombre de quien realizó el despacho (cajera/despachadora). */
  despachadoPor?: string;
  /**
   * Bandera liviana del comprobante de pago (la imagen se guarda aparte y se
   * consulta por separado). Solo aplica a pedidos de transferencia o mixto.
   */
  comprobante?: { tiene: boolean; confirmado: boolean } | null;
}

export interface EstadoPedidos {
  pedidos: Pedido[];
  meta: Record<string, DespachoMeta>;
  impresos: string[];
  /**
   * Instante del servidor de esta respuesta. Se reenvía como `desde` en el
   * siguiente poll para recibir SOLO lo que cambió (polling incremental).
   */
  ahora?: string;
}

/**
 * Carga los pedidos con su metadata e impresos.
 * - `desde`: polling incremental — solo lo cambiado desde ese instante.
 * - `rango`: alcance del conjunto. 'hoy' (Pedidos/Despacho, mucho más liviano),
 *   'fecha' (un día concreto, para ver días anteriores), 'posteriores'. Sin
 *   `rango` = comportamiento previo (activos + últimos días) para Cuadre de
 *   caja, Históricos y Dashboard.
 * - `fecha`: día concreto (YYYY-MM-DD) cuando `rango='fecha'`.
 */
export interface OpcionesCargaPedidos {
  desde?: string;
  rango?: "hoy" | "fecha" | "posteriores";
  fecha?: string;
}

export function cargarEstadoPedidos(
  opts?: OpcionesCargaPedidos,
): Promise<EstadoPedidos> {
  const p = new URLSearchParams();
  if (opts?.desde) p.set("desde", opts.desde);
  if (opts?.rango) p.set("rango", opts.rango);
  if (opts?.fecha) p.set("fecha", opts.fecha);
  const qs = p.toString();
  return apiFetch<EstadoPedidos>(`/pedidos${qs ? `?${qs}` : ""}`);
}

/**
 * Trazabilidad (historial) de un pedido, BAJO DEMANDA. El listado no la trae
 * para aligerar el payload que se refresca por polling; se consulta al abrir
 * el modal de trazabilidad de un pedido puntual.
 */
export function cargarTrazabilidad(id: string): Promise<TrazaEvento[]> {
  return apiFetch<{ trazabilidad: TrazaEvento[] }>(
    `/pedidos/${id}/trazabilidad`,
  ).then((r) => r.trazabilidad ?? []);
}

/**
 * Últimos pedidos NO anulados de un cliente (de cualquier fecha), para la
 * función "espejo" (crear un pedido nuevo a partir de uno anterior). Se carga
 * bajo demanda al abrir el modal de "Últimos pedidos" dentro del wizard.
 */
export function cargarPedidosCliente(
  clienteId: string,
  limit = 15,
): Promise<Pedido[]> {
  return apiFetch<{ pedidos: Pedido[] }>(
    `/pedidos/cliente/${encodeURIComponent(clienteId)}?limit=${limit}`,
  ).then((r) => r.pedidos ?? []);
}

/**
 * Crea o actualiza un pedido completo en la base de datos. Devuelve el pedido
 * final tal como quedó en el servidor: para pedidos nuevos, el backend asigna
 * el consecutivo y la comanda de forma atómica (evita duplicados en ventas
 * simultáneas), así que hay que usar este resultado para imprimir/mostrar.
 */
export function guardarPedidoApi(pedido: Pedido): Promise<Pedido> {
  return apiFetch<Pedido>(`/pedidos/${pedido.id}`, {
    method: "PUT",
    body: JSON.stringify(pedido),
  });
}

/** Mezcla cambios en la metadata de despacho de un pedido. */
export function actualizarMetaApi(
  id: string,
  cambios: Partial<DespachoMeta>,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/pedidos/${id}/meta`, {
    method: "PATCH",
    body: JSON.stringify(cambios),
  });
}

/** Marca un pedido como impreso. */
export function marcarImpresoApi(
  id: string,
  impreso = true,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/pedidos/${id}/impreso`, {
    method: "PATCH",
    body: JSON.stringify({ impreso }),
  });
}

/** Comprobante de pago de un pedido (una o varias imágenes + estado). */
export interface ComprobantePago {
  imagenes: { imagen: string; mime: string | null }[];
  confirmado: boolean;
  subidoPor: string | null;
  confirmadoPor: string | null;
}

/** Consulta el comprobante de pago de un pedido (o null si no existe). */
export function obtenerComprobanteApi(
  id: string,
): Promise<ComprobantePago | null> {
  return apiFetch<ComprobantePago | null>(`/pedidos/${id}/comprobante`);
}

/** AGREGA una imagen al comprobante de pago de un pedido. Queda sin confirmar. */
export function subirComprobanteApi(
  id: string,
  imagen: string,
  mime: string | null,
  subidoPor?: string | null,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/pedidos/${id}/comprobante`, {
    method: "POST",
    body: JSON.stringify({ imagen, mime, subidoPor }),
  });
}

/** Confirma el comprobante de pago de un pedido (queda solo de lectura). */
export function confirmarComprobanteApi(
  id: string,
  confirmadoPor?: string | null,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/pedidos/${id}/comprobante/confirmar`, {
    method: "PATCH",
    body: JSON.stringify({ confirmadoPor }),
  });
}

/** Elimina el comprobante: una imagen (indica `indice`) o todas. */
export function eliminarComprobanteApi(
  id: string,
  indice?: number,
): Promise<{ id: string }> {
  const qs = typeof indice === "number" ? `?indice=${indice}` : "";
  return apiFetch<{ id: string }>(`/pedidos/${id}/comprobante${qs}`, {
    method: "DELETE",
  });
}

/** Borra todos los pedidos (reinicio para producción). */
export function vaciarPedidosApi(): Promise<{ eliminados: number }> {
  return apiFetch<{ eliminados: number }>("/pedidos", { method: "DELETE" });
}

/**
 * Descarga el Excel de despacho del pedido (formato del software de ruteo).
 * Usa fetch directo para recibir el binario y dispara la descarga en el navegador.
 * Si se indica `replica` (1-5), el consecutivo del Excel lleva el sufijo "-N".
 */
export async function descargarExcelDespacho(
  id: string,
  replica?: number,
): Promise<void> {
  const token = getToken();
  const qs = replica ? `?replica=${replica}` : "";
  const res = await fetch(`${API_URL}/pedidos/${id}/excel${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    throw new Error("No se pudo generar el Excel de despacho");
  }

  // El nombre viene en Content-Disposition; si no, se arma uno por defecto.
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = cd.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] ?? `Despacho_${id}.xlsx`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Envía el pedido directamente a Drivin (reemplazo del Excel de cargue).
 * Usa el mismo mapeo de campos. Si se indica `replica` (1-5), el consecutivo
 * lleva el sufijo "-N". `vehiculo` = code del domiciliario de Drivin a
 * preasignar. Devuelve la respuesta del API de Drivin.
 */
export function enviarADrivinApi(
  id: string,
  replica?: number,
  vehiculo?: string,
): Promise<{ status: number; comanda: string; respuesta: unknown }> {
  const p = new URLSearchParams();
  if (replica) p.set("replica", String(replica));
  if (vehiculo) p.set("vehiculo", vehiculo);
  const qs = p.toString();
  return apiFetch<{ status: number; comanda: string; respuesta: unknown }>(
    `/pedidos/${id}/drivin${qs ? `?${qs}` : ""}`,
    { method: "POST" },
  );
}

/** Domiciliario (vehículo de Drivin) simplificado para el selector. */
export interface DomiciliarioDrivin {
  code: string;
  nombre: string;
  tipo?: string | null;
}

/**
 * Domiciliarios (vehículos de Drivin) asignados a un punto de venta. Se filtran
 * por la flota "Domiciliarios PDV <localidad>" del punto. Reemplaza la lista de
 * "Gestión de recursos" en el selector de despacho.
 */
export function cargarDomiciliariosDrivin(
  codigo: string,
  nombre: string,
): Promise<DomiciliarioDrivin[]> {
  const p = new URLSearchParams();
  if (codigo) p.set("codigo", codigo);
  if (nombre) p.set("nombre", nombre);
  return apiFetch<DomiciliarioDrivin[]>(
    `/pedidos/drivin/domiciliarios?${p.toString()}`,
  );
}

/**
 * Mapa comanda → domiciliario que Drivin asignó (o `null` si está en Drivin
 * pero sin domiciliario). Si la comanda NO está en el mapa, no está en Drivin.
 * Se consulta por polling para "bajar" la asignación y despachar automáticamente.
 */
export function cargarAsignacionesDrivin(): Promise<
  Record<string, { code: string; nombre: string } | null>
> {
  return apiFetch<Record<string, { code: string; nombre: string } | null>>(
    `/pedidos/drivin/asignaciones`,
  );
}

/**
 * Estado de ENTREGA (POD) de una lista de comandas. Devuelve por comanda
 * `{ status, entregadoEn }`. `status === "approved"` significa ENTREGADO.
 */
export function cargarEntregasDrivin(
  comandas: string[],
): Promise<
  Record<string, { status: string | null; entregadoEn: string | null; comment: string | null }>
> {
  return apiFetch<
    Record<string, { status: string | null; entregadoEn: string | null; comment: string | null }>
  >(`/pedidos/drivin/entregas`, {
    method: "POST",
    body: JSON.stringify({ comandas }),
  });
}
