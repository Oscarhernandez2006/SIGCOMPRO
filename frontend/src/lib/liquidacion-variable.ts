import { apiFetch } from "./api";
import { objetivoDespacho, deadlinePreparacion } from "./despacho";
import type { DespachoMeta } from "./pedidos";
import type { Pedido } from "@/app/(panel)/pedidos/page";

export type RolLiquidacion = "porcionador" | "televentas" | "caja" | "facturacion";

export const ROLES_LIQUIDACION: { key: RolLiquidacion; label: string }[] = [
  { key: "porcionador", label: "Porcionadores" },
  { key: "televentas", label: "Televentas" },
  { key: "caja", label: "Caja" },
  { key: "facturacion", label: "Facturación" },
];

export interface ConfigLiquidacion {
  porcionador_minimo: number;
  porcionador_por_kg: number;
  porcionador_seg_por_kg: number;
  televentas_por_pedido: number;
  caja_por_pedido: number;
  facturacion_por_pedido: number;
}

export const CONFIG_DEFECTO: ConfigLiquidacion = {
  porcionador_minimo: 150000,
  porcionador_por_kg: 100,
  porcionador_seg_por_kg: 20,
  televentas_por_pedido: 0,
  caja_por_pedido: 0,
  facturacion_por_pedido: 0,
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function obtenerConfigsLiquidacion(): Promise<Record<string, ConfigLiquidacion>> {
  return apiFetch<Record<string, ConfigLiquidacion>>("/liquidacion-variable/config");
}

export function guardarConfigLiquidacion(
  puntoId: string,
  config: ConfigLiquidacion,
): Promise<ConfigLiquidacion> {
  return apiFetch<ConfigLiquidacion>(`/liquidacion-variable/config/${encodeURIComponent(puntoId)}`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function pedidosLiquidacion(
  desde: string,
  hasta: string,
  puntoId?: string,
): Promise<{ pedidos: Pedido[]; meta: Record<string, DespachoMeta> }> {
  const p = new URLSearchParams({ desde, hasta });
  if (puntoId) p.set("punto_id", puntoId);
  return apiFetch(`/liquidacion-variable/pedidos?${p.toString()}`);
}

export function overridesLiquidacion(periodo: string): Promise<Record<string, boolean>> {
  return apiFetch<Record<string, boolean>>(
    `/liquidacion-variable/overrides?periodo=${encodeURIComponent(periodo)}`,
  );
}

export function guardarOverrideLiquidacion(input: {
  periodo: string;
  rol: RolLiquidacion;
  pedido_id: string;
  pagar: boolean;
}): Promise<{ ok: true }> {
  return apiFetch("/liquidacion-variable/overrides", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Periodo quincenal (1–15 y 16–fin de mes)
// ---------------------------------------------------------------------------

export interface Quincena {
  key: string; // "YYYY-MM-1" | "YYYY-MM-2"
  label: string;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}

export function quincena(anio: number, mes1a12: number, mitad: 1 | 2): Quincena {
  const mm = String(mes1a12).padStart(2, "0");
  const ultimoDia = new Date(anio, mes1a12, 0).getDate();
  const desde = mitad === 1 ? `${anio}-${mm}-01` : `${anio}-${mm}-16`;
  const hasta = mitad === 1 ? `${anio}-${mm}-15` : `${anio}-${mm}-${String(ultimoDia).padStart(2, "0")}`;
  const nombreMes = new Date(anio, mes1a12 - 1, 1).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
  });
  return {
    key: `${anio}-${mm}-${mitad}`,
    label: `${mitad === 1 ? "1–15" : "16–fin"} de ${nombreMes}`,
    desde,
    hasta,
  };
}

// ---------------------------------------------------------------------------
// Cálculo de la liquidación (misma lógica de tiempos que Despacho/Dashboard)
// ---------------------------------------------------------------------------

export interface DetalleLiquidacion {
  pedidoId: string;
  comanda: string;
  puntoId: string;
  puntoNombre: string;
  fecha: string;
  persona: string;
  kilos: number;
  prepMs: number | null;
  prepATiempo: boolean;
  entregaATiempo: boolean;
  razonable: boolean;
  elegible: boolean;
  pagar: boolean;
  overridden: boolean;
  monto: number;
}

export interface ResumenPersona {
  persona: string;
  puntoId: string;
  puntoNombre: string;
  nPedidos: number;
  kilos: number;
  monto: number;
  minimoAplicado: boolean;
}

export interface LiquidacionRol {
  detalle: DetalleLiquidacion[];
  resumen: ResumenPersona[];
  total: number;
}

export type LiquidacionCompleta = Record<RolLiquidacion, LiquidacionRol>;

function kilosDe(p: Pedido): number {
  return (p.carrito ?? []).reduce((s, i) => {
    const esKg = (i.producto?.um ?? "").trim().toUpperCase() === "KG";
    return s + (esKg ? Number(i.cantidad) || 0 : 0);
  }, 0);
}

const norm = (v?: string | null) => (v ?? "").trim();

/**
 * Calcula la liquidación de las 4 áreas para un periodo.
 * Reusa `objetivoDespacho`/`deadlinePreparacion` para el cumplimiento de tiempos.
 */
export function calcularLiquidacion(
  pedidos: Pedido[],
  meta: Record<string, DespachoMeta>,
  configs: Record<string, ConfigLiquidacion>,
  overrides: Record<string, boolean>,
): LiquidacionCompleta {
  const detalle: Record<RolLiquidacion, DetalleLiquidacion[]> = {
    porcionador: [],
    televentas: [],
    caja: [],
    facturacion: [],
  };

  for (const p of pedidos) {
    const m = meta[p.id] ?? {};
    const puntoId = String(p.punto?.id ?? "");
    const puntoNombre = p.punto?.nombre ?? "—";
    const cfg = configs[puntoId] ?? CONFIG_DEFECTO;
    const kilos = kilosDe(p);
    const pc = m.pagoConfirmado ?? null;

    const finMs = m.fin ? new Date(m.fin).getTime() : null;
    const inicioMs = m.inicio ? new Date(m.inicio).getTime() : null;
    const prepMs = finMs != null && inicioMs != null ? finMs - inicioMs : null;
    const prepATiempo = finMs != null && finMs <= deadlinePreparacion(p, pc);

    const despachoFinMs = m.despachoFin ? new Date(m.despachoFin).getTime() : null;
    const entregaATiempo =
      despachoFinMs != null && despachoFinMs <= objetivoDespacho(p, pc);

    // Razonable (porcionador): a tiempo y con un mínimo de segundos por kilo.
    const razonable =
      prepATiempo &&
      prepMs != null &&
      kilos > 0 &&
      prepMs >= kilos * cfg.porcionador_seg_por_kg * 1000;

    const base = {
      pedidoId: p.id,
      comanda: p.comanda,
      puntoId,
      puntoNombre,
      fecha: p.fecha,
      kilos,
      prepMs,
      prepATiempo,
      entregaATiempo,
    };

    const agregar = (
      rol: RolLiquidacion,
      persona: string,
      elegible: boolean,
      monto: number,
      razonableFlag = false,
    ) => {
      if (!norm(persona)) return;
      const ov = overrides[`${rol}|${p.id}`];
      const pagar = ov ?? elegible;
      detalle[rol].push({
        ...base,
        persona: norm(persona),
        razonable: razonableFlag,
        elegible,
        pagar,
        overridden: ov !== undefined && ov !== elegible,
        monto,
      });
    };

    agregar("porcionador", m.porcionador ?? "", razonable, kilos * cfg.porcionador_por_kg, razonable);
    agregar("televentas", p.vendedorNombre ?? "", prepATiempo, cfg.televentas_por_pedido);
    agregar("caja", m.despachadoPor ?? "", prepATiempo, cfg.caja_por_pedido);
    agregar("facturacion", m.facturadoPor ?? "", entregaATiempo, cfg.facturacion_por_pedido);
  }

  const resultado = {} as LiquidacionCompleta;
  for (const rol of ["porcionador", "televentas", "caja", "facturacion"] as RolLiquidacion[]) {
    const items = detalle[rol];
    // Agrupa por persona + punto.
    const grupos = new Map<string, ResumenPersona>();
    for (const it of items) {
      const clave = `${it.persona.toLowerCase()}|${it.puntoId}`;
      let g = grupos.get(clave);
      if (!g) {
        g = {
          persona: it.persona,
          puntoId: it.puntoId,
          puntoNombre: it.puntoNombre,
          nPedidos: 0,
          kilos: 0,
          monto: 0,
          minimoAplicado: false,
        };
        grupos.set(clave, g);
      }
      if (it.pagar) {
        g.nPedidos += 1;
        g.kilos += it.kilos;
      }
    }
    // Aplica la fórmula de cada rol.
    for (const g of grupos.values()) {
      const cfg = configs[g.puntoId] ?? CONFIG_DEFECTO;
      if (rol === "porcionador") {
        const porKilos = g.kilos * cfg.porcionador_por_kg;
        g.monto = Math.max(cfg.porcionador_minimo, porKilos);
        g.minimoAplicado = porKilos < cfg.porcionador_minimo;
      } else {
        const valor =
          rol === "televentas"
            ? cfg.televentas_por_pedido
            : rol === "caja"
              ? cfg.caja_por_pedido
              : cfg.facturacion_por_pedido;
        g.monto = g.nPedidos * valor;
      }
    }
    const resumen = Array.from(grupos.values())
      .filter((g) => g.nPedidos > 0 || rol === "porcionador")
      .sort((a, b) => b.monto - a.monto);
    resultado[rol] = {
      detalle: items.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()),
      resumen,
      total: resumen.reduce((s, g) => s + g.monto, 0),
    };
  }
  return resultado;
}

export function copLiq(v: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v || 0);
}

/** Formatea una duración en ms como "m:ss" o "h m". */
export function duracionLiq(ms: number | null): string {
  if (ms == null) return "—";
  const seg = Math.round(ms / 1000);
  if (seg < 60) return `${seg}s`;
  const min = Math.floor(seg / 60);
  if (min < 60) return `${min}m ${seg % 60}s`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}
