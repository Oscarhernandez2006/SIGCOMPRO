/**
 * Peso de los ítems del pedido. Los productos por KG pesan su cantidad; los de
 * UNIDAD pesan lo que indique su descripción ("AGUA BRISA X 600 ML",
 * "QUESO X 500 GR", "6 X 330 ML"...) multiplicado por la cantidad. Los
 * volúmenes (ML/CC/L) se toman como 1 ml = 1 g.
 */

const GRAMOS_POR_UNIDAD_MEDIDA: Record<string, number> = {
  ML: 1, CC: 1,
  L: 1000, LT: 1000, LTS: 1000, LTR: 1000, LITRO: 1000, LITROS: 1000,
  G: 1, GR: 1, GRS: 1, GRAMO: 1, GRAMOS: 1,
  KG: 1000, KGS: 1000, KILO: 1000, KILOS: 1000,
  LB: 500, LBS: 500, LIBRA: 500, LIBRAS: 500,
};

const RE_MEDIDA =
  /(?:(\d+)\s*[X×]\s*)?(\d+(?:[.,]\d+)?)\s*(ML|CC|LITROS?|LTS?|LTR|L|GRAMOS?|GRS?|G|KILOS?|KGS?|LIBRAS?|LBS?)(?![A-Z])/g;

interface ItemConPeso {
  cantidad?: number | string | null;
  pesoVariable?: number | string | null;
  producto?: { um?: string | null; producto?: string | null } | null;
}

export function esUmKilo(um?: string | null): boolean {
  return (um ?? "").trim().toUpperCase() === "KG";
}

/** Gramos de UNA unidad según la descripción; null si no trae medida. */
export function gramosPorUnidad(descripcion?: string | null): number | null {
  const texto = (descripcion ?? "").toUpperCase();
  let ultimo: RegExpExecArray | null = null;
  for (const m of texto.matchAll(RE_MEDIDA)) ultimo = m as RegExpExecArray;
  if (!ultimo) return null;
  const pack = ultimo[1] ? Number(ultimo[1]) : 1;
  const valor = Number(ultimo[2].replace(",", "."));
  const factor = GRAMOS_POR_UNIDAD_MEDIDA[ultimo[3]];
  if (!factor || !(valor > 0) || !(pack > 0)) return null;
  return pack * valor * factor;
}

/** Peso del ítem en kilos (medida de la descripción o, si no trae, el peso variable digitado). */
export function pesoItemKg(i: ItemConPeso): number {
  const cant = Number(i.cantidad) || 0;
  if (esUmKilo(i.producto?.um)) return cant;
  const g = gramosPorUnidad(i.producto?.producto) ?? (Number(i.pesoVariable) || 0);
  return g ? (cant * g) / 1000 : 0;
}

/** Peso total del pedido en kilos. */
export function pesoPedidoKg(p: { carrito?: ItemConPeso[] | null }): number {
  return (p.carrito ?? []).reduce((s, i) => s + pesoItemKg(i), 0);
}
