import { apiFetch } from "./api";

/** Orden de un plan de Drivin, cruzada con su pedido de SIGCOMPRO. */
export interface OrdenPlan {
  codigo: string;
  cliente: string;
  codigoCliente: string;
  direccion: string;
  barrio: string;
  ciudad: string;
  prioridad: number | null;
  kilos: number;
  vehiculo: string | null;
  domiciliario: string | null;
  viaje: number | null;
  proveedor: string;
  fechaEntrega: string;
  pedidoId: string | null;
  /** Número de réplica si la orden es "comanda-N". */
  replica: number | null;
  estadoSigcompro: string | null;
}

/** Plan (escenario) de Drivin de un día para un esquema. */
export interface PlanDrivin {
  esquemaCodigo: string;
  esquemaNombre: string;
  descripcion: string;
  estado: string;
  fecha: string;
  creadoEn: string | null;
  puntos: string[];
  ordenes: OrdenPlan[];
  error: string | null;
}

/** Configuración de Drivin de un punto de venta. */
export interface EsquemaPunto {
  puntoId: string;
  puntoNombre: string;
  puntoCodigo: string;
  activo: boolean;
  drivin: boolean;
  esquemaConfigurado: string | null;
  localidadConfigurada: string | null;
  esquemaEfectivo: string;
  localidadEfectiva: string;
  esquemaNombreDrivin: string | null;
  /** null = no se pudo consultar Drivin. */
  planHoy: boolean | null;
  estadoPlanHoy: string | null;
}

/** Planes de Drivin de un día (YYYY-MM-DD). `fresco` salta la caché del servidor. */
export function obtenerPlanes(fecha: string, fresco = false): Promise<PlanDrivin[]> {
  const p = new URLSearchParams({ fecha });
  if (fresco) p.set("fresco", "1");
  return apiFetch<PlanDrivin[]>(`/planes?${p.toString()}`);
}

export function obtenerEsquemas(): Promise<EsquemaPunto[]> {
  return apiFetch<EsquemaPunto[]>("/planes/esquemas");
}

/** Resultado de crear (o no) el plan de un esquema. */
export interface ResultadoPlan {
  esquemaCodigo: string;
  esquemaNombre: string;
  puntos: string[];
  estado: "pendiente" | "creado" | "existente" | "error";
  /** Paso en curso (avance en vivo). */
  paso?: "pendiente" | "creando" | "optimizando" | "aprobando" | "listo";
  /** Último estado que reportó Drivin (ej. "Optimizing", "Optimized"). */
  estadoDrivin?: string | null;
  mensaje: string;
  token?: string | null;
  /** ¿Se aprobó en Drivin? null/ausente = no aplica. */
  aprobado?: boolean | null;
  errorAprobacion?: string | null;
  /** ¿Se optimizó en Drivin (después de aprobar)? null/ausente = no aplica. */
  optimizado?: boolean | null;
  errorOptimizacion?: string | null;
}

/** Una corrida de generación de planes (automática o manual). */
export interface GeneracionPlanes {
  id: string;
  fecha: string;
  origen: "automatico" | "manual";
  usuario: string | null;
  resultado: ResultadoPlan[];
  creadoEn: string;
  estado?: "en_curso" | "terminado" | "error" | "interrumpida";
  error?: string | null;
  terminadoEn?: string | null;
}

/**
 * Inicia en el servidor la creación (crear → aprobar → optimizar) de los planes
 * que falten de un día. Responde de inmediato; el avance se lee con obtenerGeneracion.
 */
export function generarPlanes(fecha: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/planes/generar", {
    method: "POST",
    body: JSON.stringify({ fecha }),
  });
}

/** Avance (en vivo) de una generación. */
export function obtenerGeneracion(id: string): Promise<GeneracionPlanes> {
  return apiFetch<GeneracionPlanes>(`/planes/generaciones/${encodeURIComponent(id)}`);
}

export function obtenerGeneraciones(): Promise<GeneracionPlanes[]> {
  return apiFetch<GeneracionPlanes[]>("/planes/generaciones");
}
