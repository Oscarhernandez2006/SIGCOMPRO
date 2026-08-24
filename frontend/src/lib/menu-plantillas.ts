/**
 * Plantillas del "Listado de Precios" de Carnes Santacruz.
 *
 * Cada categoría de producto se dibuja sobre una imagen de fondo (portada +
 * 7 categorías, en `public/menu/`). Las imágenes ya traen el título, el sello,
 * los encabezados y el pie; aquí solo se define el RECTÁNGULO donde va la lista
 * de productos (en % del alto/ancho de la página) y cuántas filas caben por
 * hoja. Si una categoría tiene más productos que `filasPorPagina`, se repite la
 * misma hoja (paginación). Todas las imágenes son 1024×1536 (proporción 2:3).
 */

/** Rectángulo de contenido, en porcentaje de la página. */
export interface AreaContenido {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface Plantilla {
  clave: string;
  imagen: string;
  area: AreaContenido;
  filasPorPagina: number;
}

export interface ItemMenu {
  referencia: string;
  producto: string;
  categoria: string;
  um: string;
  precio: number;
}

export const PORTADA_IMG = "/menu/portada.png";

const RES: Plantilla = {
  clave: "res",
  imagen: "/menu/cortes-de-res.png",
  area: { top: 15.5, left: 26, right: 6, bottom: 12.5 },
  filasPorPagina: 20,
};
const CERDO: Plantilla = {
  clave: "cerdo",
  imagen: "/menu/cortes-de-cerdo.png",
  area: { top: 15.5, left: 26, right: 6, bottom: 12.5 },
  filasPorPagina: 20,
};
const POLLO: Plantilla = {
  clave: "pollo",
  imagen: "/menu/pollo.png",
  area: { top: 13.5, left: 26, right: 6, bottom: 12.5 },
  filasPorPagina: 20,
};
const VISCERAS: Plantilla = {
  clave: "visceras",
  imagen: "/menu/visceras.png",
  area: { top: 13.5, left: 28, right: 6, bottom: 12.5 },
  filasPorPagina: 20,
};
const EMBUTIDOS: Plantilla = {
  clave: "embutidos",
  imagen: "/menu/embutidos.png",
  area: { top: 19, left: 26, right: 6, bottom: 12.5 },
  filasPorPagina: 18,
};
const ASADERO: Plantilla = {
  clave: "asadero",
  imagen: "/menu/asadero.png",
  area: { top: 18, left: 26, right: 6, bottom: 12.5 },
  filasPorPagina: 18,
};
const EXTRAS: Plantilla = {
  clave: "extras",
  imagen: "/menu/extras.png",
  area: { top: 14, left: 7, right: 6, bottom: 45 },
  filasPorPagina: 12,
};

/** Orden en que se imprimen las categorías (tras la portada). */
export const PLANTILLAS: Plantilla[] = [
  RES,
  CERDO,
  POLLO,
  VISCERAS,
  EMBUTIDOS,
  ASADERO,
  EXTRAS,
];

/** Normaliza texto a slug simple (sin acentos, minúsculas). */
export function slugCategoria(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Mapea una categoría del ERP a su plantilla de fondo. */
export function plantillaDeCategoria(categoria: string): Plantilla {
  const s = slugCategoria(categoria);
  if (s.includes("cerdo") || s.includes("porcin")) return CERDO;
  if (s.includes("pollo") || s.includes("ave")) return POLLO;
  if (s.includes("embutido")) return EMBUTIDOS;
  if (s.includes("asader")) return ASADERO;
  if (s.includes("extra")) return EXTRAS;
  if (s.includes("viscera") || s.includes("pescado") || s.includes("mar"))
    return VISCERAS;
  if (s.includes("res") || s.includes("bovin") || s.includes("vacun"))
    return RES;
  return EXTRAS;
}

export interface PaginaMenu {
  plantilla: Plantilla;
  items: ItemMenu[];
}

/**
 * Reparte los productos en hojas: agrupa por plantilla (según su categoría),
 * ordena las plantillas según PLANTILLAS y pagina cada grupo por
 * `filasPorPagina` (repitiendo el fondo cuando hay más productos).
 */
export function paginarItems(items: ItemMenu[]): PaginaMenu[] {
  const grupos = new Map<string, ItemMenu[]>();
  for (const it of items) {
    const clave = plantillaDeCategoria(it.categoria).clave;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(it);
  }

  const paginas: PaginaMenu[] = [];
  for (const plantilla of PLANTILLAS) {
    const lista = grupos.get(plantilla.clave);
    if (!lista || lista.length === 0) continue;
    for (let i = 0; i < lista.length; i += plantilla.filasPorPagina) {
      paginas.push({
        plantilla,
        items: lista.slice(i, i + plantilla.filasPorPagina),
      });
    }
  }
  return paginas;
}

/** Precio con formato "$28.500" (sin decimales, separador de miles). */
export function precioMenu(v: number): string {
  const n = Number.isFinite(v) ? Math.round(v) : 0;
  return `$${n.toLocaleString("es-CO")}`;
}

/** Unidad de medida en mayúsculas. */
export function umMenu(um?: string | null): string {
  return (um ?? "").trim().toUpperCase();
}
