import type { Pedido } from "@/app/(panel)/pedidos/page";
import type { DespachoMeta } from "./pedidos";
import { msRestantesDespacho, yaDespachado } from "./despacho";
import { pesoPedidoKg } from "./peso";

/**
 * Resumen de las cards de Despacho de un punto (cantidad y kilos por estado),
 * con las mismas reglas que la vista de Despacho. Se guarda como "foto" al
 * crear una solicitud de extensión para que quien aprueba vea la carga del punto.
 */
export type ClaveCard =
  | "total"
  | "todos"
  | "entregados"
  | "pendientes"
  | "atrasados"
  | "retenido"
  | "cancelados"
  | "posteriores"
  | "produccion"
  | "alistados"
  | "facturados"
  | "despachados"
  | "transito";

export type ResumenDespacho = Record<ClaveCard, { cantidad: number; kg: number }>;

export const CARDS_DESPACHO: { key: ClaveCard; label: string; sub: string }[] = [
  { key: "total", label: "Total", sub: "Activos de hoy" },
  { key: "entregados", label: "Entregados", sub: "Entregados (Drivin)" },
  { key: "pendientes", label: "Pendientes", sub: "Sin finalizar" },
  { key: "atrasados", label: "Atrasados", sub: "No finalizados" },
  { key: "retenido", label: "Retenido", sub: "Cartera" },
  { key: "cancelados", label: "Cancelados", sub: "Anulados" },
  { key: "posteriores", label: "Posteriores", sub: "Programados" },
  { key: "produccion", label: "En producción", sub: "En preparación" },
  { key: "alistados", label: "Alistados", sub: "Listos para facturar" },
  { key: "facturados", label: "Facturados", sub: "Con factura" },
  { key: "despachados", label: "Despachados", sub: "En ruta" },
  { key: "transito", label: "En tránsito", sub: "En reparto (Drivin)" },
];

const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

const MATCH: Partial<Record<ClaveCard, (p: Pedido) => boolean>> = {
  pendientes: (x) => !x.anulado && norm(x.estado) === "en proceso",
  retenido: (x) => norm(x.estado) === "liberación",
  cancelados: (x) => x.anulado || norm(x.estado) === "anulado",
  produccion: (x) => norm(x.estado) === "en producción",
  alistados: (x) => norm(x.estado) === "alistado",
  facturados: (x) => norm(x.estado) === "facturado",
  despachados: (x) => norm(x.estado) === "despachado",
  transito: (x) => norm(x.estado) === "en tránsito",
};

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function calcularResumenDespacho(
  pedidos: Pedido[],
  meta: Record<string, DespachoMeta>,
  impresos: Set<string>,
  puntoId: string,
  ahora: number = Date.now(),
): ResumenDespacho {
  const hoy = isoLocal(new Date(ahora));
  const delPunto = pedidos.filter((p) => String(p.punto?.id ?? "") === puntoId);
  const diaEntrega = (p: Pedido) =>
    p.entregaProgramada && p.fechaProgramada ? p.fechaProgramada : isoLocal(new Date(p.fecha));
  const activo = (p: Pedido) => !p.anulado && !yaDespachado(p.estado) && norm(p.estado) !== "anulado";

  const deHoy = delPunto.filter((p) => {
    const dia = diaEntrega(p);
    return dia === hoy || (dia < hoy && activo(p));
  });
  const posteriores = delPunto.filter(
    (p) => p.entregaProgramada && p.fechaProgramada && p.fechaProgramada > hoy && impresos.has(p.id),
  );
  const atrasados = deHoy.filter(
    (p) => activo(p) && msRestantesDespacho(p, ahora, meta[p.id]?.pagoConfirmado) <= 0,
  );
  const idsAtrasados = new Set(atrasados.map((p) => p.id));

  const sumar = (lista: Pedido[]) => ({
    cantidad: lista.length,
    kg: Number(lista.reduce((s, p) => s + pesoPedidoKg(p), 0).toFixed(2)),
  });

  const res = {} as ResumenDespacho;
  for (const { key } of CARDS_DESPACHO) {
    if (key === "total") continue;
    if (key === "entregados")
      res.entregados = sumar(deHoy.filter((p) => ["entregado", "rechazado"].includes(norm(p.estado))));
    else if (key === "atrasados") res.atrasados = sumar(atrasados);
    else if (key === "posteriores") res.posteriores = sumar(posteriores);
    else res[key] = sumar(deHoy.filter((p) => MATCH[key]!(p) && !idsAtrasados.has(p.id)));
  }
  // Todos los pedidos del día (como el Total de Despacho), para "Entregados X/Y".
  res.todos = sumar([...deHoy, ...posteriores]);
  // Total de la extensión = lo que aún está por despachar en el punto.
  const sumanTotal: ClaveCard[] = ["pendientes", "atrasados", "retenido", "produccion", "alistados", "facturados"];
  res.total = {
    cantidad: sumanTotal.reduce((s, k) => s + res[k].cantidad, 0),
    kg: Number(sumanTotal.reduce((s, k) => s + res[k].kg, 0).toFixed(2)),
  };
  return res;
}
