import { apiFetch } from "./api";

/** Hora de Bogotá desde la que se habilita «Marcar no gestionado». */
export const HORA_HABILITA_INCUMPLIMIENTO = 20;

export const ROLES_INCUMPLIMIENTOS = ["administrador app", "desarrollador"];

export const MOTIVOS_INCUMPLIMIENTO = [
  "Pedido sin gestionar al cierre del turno",
  "Estado del pedido sin actualizar",
  "Pedido sin alistar",
  "Pedido sin facturar",
  "Pedido sin despachar",
  "Pago sin confirmar",
  "Domiciliario sin asignar",
  "Otro",
];

export interface Responsable {
  id: string;
  nombre: string;
  cedula: string;
  rol: string;
}

export interface SugerenciaResponsable {
  usuarioId: string;
  nombre: string;
  cedula: string;
  regla: "porcionador" | "facturador" | "ultimo_turno";
  criterio: string;
}

export interface ResumenPedidoIncumplimiento {
  comanda: string;
  numeroDia: number | null;
  fecha: string | null;
  fechaProgramada: string | null;
  horaDespacho: string | null;
  estado: string;
  pago: string;
  entrega: string;
  vendedor: string;
  observacion: string;
  cliente: { nombre: string; nit: string; direccion: string; barrio: string; ciudad: string; telefono: string };
  productos: { referencia: string; producto: string; um: string; cantidad: number; valor: number }[];
  subtotal: number;
  domicilio: number;
  total: number;
  despacho: {
    porcionador: string | null;
    inicioAlistamiento: string | null;
    finAlistamiento: string | null;
    factura: string | null;
    valorFactura: number | string | null;
    domiciliario: string | null;
    pagoConfirmado: boolean;
  };
}

export interface Incumplimiento {
  id: string;
  pedidoId: string;
  comanda: string;
  puntoId: string;
  puntoNombre: string;
  usuarioId: string;
  usuarioNombre: string;
  usuarioCedula: string;
  motivo: string;
  descripcion: string;
  criterio?: string;
  estadoPedido: string;
  pedido: Partial<ResumenPedidoIncumplimiento>;
  imagen: string | null;
  registradoPorId: string;
  registradoPorNombre: string;
  creadoEn: string;
}

export interface PersonaResumen {
  usuarioId: string;
  nombre: string;
  cedula: string;
  total: number;
  ultimo: string;
  puntos: string[];
}

export interface FichaPersona {
  persona: {
    id: string;
    nombre: string;
    cedula: string;
    rol: string;
    activo: boolean;
    creadoEn: string | null;
    puntos: string[];
  };
  incumplimientos: Incumplimiento[];
}

export function puedeGestionarIncumplimientos(rol?: string | null): boolean {
  return ROLES_INCUMPLIMIENTOS.includes((rol ?? "").trim().toLowerCase());
}

export function horaBogota(ms = Date.now()): number {
  return (
    Number(
      new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "2-digit", hour12: false })
        .format(new Date(ms))
        .replace(/\D/g, ""),
    ) % 24
  );
}

export const responsablesPunto = (puntoId: string) =>
  apiFetch<Responsable[]>(`/incumplimientos/responsables/${encodeURIComponent(puntoId)}`);

export const marcadosHoy = () => apiFetch<string[]>("/incumplimientos/marcados-hoy");

export const sugerirResponsable = (pedidoId: string) =>
  apiFetch<SugerenciaResponsable | null>(`/incumplimientos/sugerencia/${encodeURIComponent(pedidoId)}`);

export const crearIncumplimiento = (body: {
  pedidoId: string;
  usuarioId: string;
  motivo: string;
  descripcion: string;
  imagen: string | null;
  criterio?: string;
}) => apiFetch<Incumplimiento>("/incumplimientos", { method: "POST", body: JSON.stringify(body) });

export const personasIncumplimientos = () => apiFetch<PersonaResumen[]>("/incumplimientos/personas");

export const fichaPersona = (usuarioId: string) =>
  apiFetch<FichaPersona>(`/incumplimientos/personas/${encodeURIComponent(usuarioId)}`);

export const eliminarIncumplimiento = (id: string) =>
  apiFetch<{ ok: true }>(`/incumplimientos/${encodeURIComponent(id)}`, { method: "DELETE" });
