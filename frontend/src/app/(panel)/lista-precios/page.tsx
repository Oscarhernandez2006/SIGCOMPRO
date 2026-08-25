"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getUsuario, tieneAccesoAdministrativo, type Usuario } from "@/lib/auth";
import { puedeVerModulo } from "@/lib/permisos";
import {
  misPuntosVenta,
  listarPuntosVenta,
  type PuntoVenta,
} from "@/lib/puntos-venta";
import { listarProductos, type ProductoPrecio } from "@/lib/productos";
import { obtenerMenuConfig, guardarMenuConfig } from "@/lib/menu";
import {
  PORTADA_IMG,
  paginarItems,
  precioMenu,
  umMenu,
} from "@/lib/menu-plantillas";

/* -------------------------------------------------------------- */
/*  Utilidades                                                     */
/* -------------------------------------------------------------- */

/** Producto elegido para la lista de precios (con precio editable). */
interface ItemLista {
  referencia: string;
  producto: string;
  categoria: string;
  um: string;
  precio: number;
}

const SIN_CATEGORIA = "Sin categoría";

const norm = (v?: string | null) => (v ?? "").trim();

/** Precio con formato "$28.500" (sin decimales, separador de miles). */
function precioCOP(v: number): string {
  const n = Number.isFinite(v) ? Math.round(v) : 0;
  return `$${n.toLocaleString("es-CO")}`;
}

/** Unidad de medida en mayúsculas para mostrar junto al precio. */
function umLabel(um?: string | null): string {
  return (um ?? "").trim().toUpperCase();
}

/** Slug público de una tienda (mismo criterio que el backend: nombre). */
function slugTienda(p: PuntoVenta | null): string {
  return (p?.nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Convierte una fila de catálogo en un ítem de lista. */
function aItem(p: ProductoPrecio): ItemLista {
  return {
    referencia: p.referencia,
    producto: (p.producto ?? "").trim(),
    categoria: norm(p.categoria) || SIN_CATEGORIA,
    um: p.um ?? "",
    precio: Number(p.precio) || 0,
  };
}

/* -------------------------------------------------------------- */
/*  PDF con los fondos reales de marca (una hoja por bloque)        */
/* -------------------------------------------------------------- */

const PAGINA_ALTO_MM = 315;

function generarPdfLista(items: ItemLista[], punto: PuntoVenta | null) {
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
    );
  const origin = window.location.origin;
  const paginas = paginarItems(items);

  const seccion = ({ plantilla, items: lista }: (typeof paginas)[number]) => {
    const { area, filasPorPagina } = plantilla;
    const areaAltoMm = (PAGINA_ALTO_MM * (100 - area.top - area.bottom)) / 100;
    const filaMm = areaAltoMm / filasPorPagina;
    const fuenteMm = Math.min(filaMm * 0.42, 5.4);
    const filas = lista
      .map((it) => {
        const nombre = esc((it.producto || it.referencia).toUpperCase());
        const um = umMenu(it.um);
        const precio =
          it.precio > 0
            ? `${esc(precioMenu(it.precio))}${
                um ? ` <span class="um" style="font-size:${(fuenteMm * 0.72).toFixed(2)}mm">${esc(um)}</span>` : ""
              }`
            : "—";
        return `<tr>
            <td class="prod" style="height:${filaMm.toFixed(2)}mm;font-size:${fuenteMm.toFixed(2)}mm">${nombre}</td>
            <td class="precio" style="height:${filaMm.toFixed(2)}mm;font-size:${fuenteMm.toFixed(2)}mm">${precio}</td>
          </tr>`;
      })
      .join("");
    const pos = `top:${area.top}%;left:${area.left}%;right:${area.right}%;bottom:${area.bottom}%`;
    return `<section class="pagina">
        <img class="fondo" src="${origin}${plantilla.imagen}" alt="">
        <div class="lista" style="${pos}">
          <table><colgroup><col><col style="width:40mm"></colgroup><tbody>${filas}</tbody></table>
        </div>
      </section>`;
  };

  const portada = `<section class="pagina">
      <img class="fondo" src="${origin}${PORTADA_IMG}" alt="Carnes Santacruz">
      <div class="portada-top">
        <img class="portada-logo" src="${origin}/LOGOCARNESSANTACRUZ.png" alt="Carnes Santacruz">
        ${punto?.nombre ? `<div class="portada-nombre">${esc(punto.nombre.toUpperCase())}</div>` : ""}
      </div>
    </section>`;

  const cuerpo = paginas.map(seccion).join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <title>Lista de precios${punto?.nombre ? " · " + esc(punto.nombre) : ""}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{size:210mm 315mm;margin:0}
    html,body{background:#000}
    body{font-family:Arial,Helvetica,sans-serif}
    .pagina{position:relative;width:210mm;height:315mm;overflow:hidden;page-break-after:always;break-after:page}
    .pagina:last-child{page-break-after:auto;break-after:auto}
    .fondo{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
    .lista{position:absolute}
    .lista table{width:100%;border-collapse:collapse;table-layout:fixed}
    td.prod{color:#fff;text-transform:uppercase;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:3mm;vertical-align:middle}
    td.precio{color:#fff;text-align:right;white-space:nowrap;vertical-align:middle;font-variant-numeric:tabular-nums}
    td.precio .um{color:#e9e2d4}
    .portada-top{position:absolute;top:9mm;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2.6mm;padding:2.8mm 4mm 2.4mm;background:rgba(0,0,0,.45);border:0.4mm solid rgba(229,178,75,.45);border-radius:4mm;box-shadow:0 2mm 8mm rgba(0,0,0,.35)}
    .portada-logo{height:17mm;width:auto;object-fit:contain}
    .portada-nombre{text-align:center;color:#f4bf56;font-weight:800;letter-spacing:1px;font-size:3.8mm;text-transform:uppercase;text-shadow:0 0.8mm 2mm rgba(0,0,0,.55)}
  </style></head><body>${portada}${cuerpo}</body></html>`;

  const w = window.open("", "_blank", "width=760,height=1120");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();

  // Imprime cuando TODOS los fondos hayan cargado (con respaldo por tiempo).
  let listo = false;
  const disparar = () => {
    if (listo) return;
    listo = true;
    try {
      w.focus();
      w.print();
    } catch {
      /* ventana cerrada por el usuario */
    }
  };
  const imgs = Array.from(w.document.images);
  const pendientes = imgs.filter((i) => !i.complete);
  if (pendientes.length === 0) {
    disparar();
  } else {
    let faltan = pendientes.length;
    pendientes.forEach((i) => {
      i.addEventListener("load", () => --faltan === 0 && disparar());
      i.addEventListener("error", () => --faltan === 0 && disparar());
    });
  }
  // Respaldo: los fondos pesan varios MB; si algo no dispara, imprime igual.
  setTimeout(disparar, 6000);
}

/* -------------------------------------------------------------- */
/*  Página                                                         */
/* -------------------------------------------------------------- */

export default function ListaPreciosPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [puntoId, setPuntoId] = useState("");
  const [catalogo, setCatalogo] = useState<ProductoPrecio[]>([]);
  const [seleccion, setSeleccion] = useState<ItemLista[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [cargando, setCargando] = useState(true);
  const [cargandoCat, setCargandoCat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const esAdmin = tieneAccesoAdministrativo(usuario?.rol);

  useEffect(() => {
    const u = getUsuario();
    if (!puedeVerModulo(u, "lista_precios")) {
      router.replace("/");
      return;
    }
    setUsuario(u);
  }, [router]);

  // Carga los puntos del usuario (o todos si es admin).
  useEffect(() => {
    if (usuario === null) return;
    const carga = esAdmin ? listarPuntosVenta() : misPuntosVenta();
    carga
      .then((ps) => {
        const activos = ps.filter((p) => p.activo);
        setPuntos(activos);
        setPuntoId((prev) => prev || activos[0]?.id || "");
      })
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "No se pudieron cargar los puntos",
        ),
      )
      .finally(() => setCargando(false));
  }, [usuario, esAdmin]);

  const punto = useMemo(
    () => puntos.find((p) => p.id === puntoId) ?? null,
    [puntos, puntoId],
  );

  // Carga el catálogo de la lista de precios y la configuración guardada del
  // punto seleccionado (los productos/precios que verá el cliente en el menú).
  useEffect(() => {
    const pid = punto?.id;
    const lista = punto?.lista_precio?.trim();
    setBusqueda("");
    setCategoria("");
    setGuardado(false);
    if (!pid) {
      setCatalogo([]);
      setSeleccion([]);
      return;
    }
    if (lista) {
      setCargandoCat(true);
      listarProductos(lista)
        .then((prods) => setCatalogo(prods))
        .catch(() => setCatalogo([]))
        .finally(() => setCargandoCat(false));
    } else {
      setCatalogo([]);
    }
    obtenerMenuConfig(pid)
      .then((items) =>
        setSeleccion(
          items.map((it) => ({
            referencia: it.referencia,
            producto: it.producto,
            categoria: (it.categoria || "").trim() || SIN_CATEGORIA,
            um: it.um,
            precio: Number(it.precio) || 0,
          })),
        ),
      )
      .catch(() => setSeleccion([]));
  }, [punto?.id, punto?.lista_precio]);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalogo) set.add(norm(p.categoria) || SIN_CATEGORIA);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalogo]);

  const seleccionRefs = useMemo(
    () => new Set(seleccion.map((s) => s.referencia)),
    [seleccion],
  );

  // Catálogo filtrado por búsqueda (código/nombre/categoría) y categoría.
  const catalogoFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return catalogo.filter((p) => {
      const cat = norm(p.categoria) || SIN_CATEGORIA;
      if (categoria && cat !== categoria) return false;
      if (!q) return true;
      return (
        (p.producto ?? "").toLowerCase().includes(q) ||
        (p.referencia ?? "").toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q)
      );
    });
  }, [catalogo, busqueda, categoria]);

  // Catálogo agrupado por categoría (para el panel de selección).
  const catalogoPorCategoria = useMemo(() => {
    const map = new Map<string, ProductoPrecio[]>();
    for (const p of catalogoFiltrado) {
      const cat = norm(p.categoria) || SIN_CATEGORIA;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return Array.from(map, ([cat, prods]) => ({ cat, prods })).sort((a, b) =>
      a.cat.localeCompare(b.cat),
    );
  }, [catalogoFiltrado]);

  // Selección agrupada por categoría (para el panel derecho y el PDF).
  const seleccionPorCategoria = useMemo(() => {
    const map = new Map<string, ItemLista[]>();
    for (const it of seleccion) {
      const cat = it.categoria || SIN_CATEGORIA;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(it);
    }
    return Array.from(map, ([cat, items]) => ({ cat, items })).sort((a, b) =>
      a.cat.localeCompare(b.cat),
    );
  }, [seleccion]);

  const agregar = useCallback((p: ProductoPrecio) => {
    setSeleccion((prev) =>
      prev.some((s) => s.referencia === p.referencia)
        ? prev
        : [...prev, aItem(p)],
    );
    setGuardado(false);
  }, []);

  const agregarCategoria = useCallback(
    (cat: string) => {
      setSeleccion((prev) => {
        const refs = new Set(prev.map((s) => s.referencia));
        const nuevos = catalogo
          .filter(
            (p) =>
              (norm(p.categoria) || SIN_CATEGORIA) === cat &&
              !refs.has(p.referencia),
          )
          .map(aItem);
        return [...prev, ...nuevos];
      });
      setGuardado(false);
    },
    [catalogo],
  );

  const agregarTodos = useCallback(() => {
    setSeleccion((prev) => {
      const refs = new Set(prev.map((s) => s.referencia));
      const nuevos = catalogoFiltrado
        .filter((p) => !refs.has(p.referencia))
        .map(aItem);
      return [...prev, ...nuevos];
    });
    setGuardado(false);
  }, [catalogoFiltrado]);

  const quitar = useCallback((ref: string) => {
    setSeleccion((prev) => prev.filter((s) => s.referencia !== ref));
    setGuardado(false);
  }, []);

  const cambiarPrecio = useCallback((ref: string, precio: number) => {
    setSeleccion((prev) =>
      prev.map((s) => (s.referencia === ref ? { ...s, precio } : s)),
    );
    setGuardado(false);
  }, []);

  const guardar = useCallback(async () => {
    if (!punto) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarMenuConfig(punto.id, seleccion);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar la configuración",
      );
    } finally {
      setGuardando(false);
    }
  }, [punto, seleccion]);

  if (cargando) {
    return <p className="text-sm text-brand-brown/60">Cargando…</p>;
  }

  const origen = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">
          Lista de Precios
        </h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Arma la lista de precios del punto: busca artículos por código o
          categoría y ajusta el precio. Con <b>Guardar menú</b> se publica lo que
          verá el cliente en el link público; con <b>Descargar PDF</b> obtienes
          la versión imprimible.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Punto de venta */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2">
          <span className="text-xs font-semibold text-brand-brown/60">
            Punto:
          </span>
          <select
            value={puntoId}
            onChange={(e) => setPuntoId(e.target.value)}
            className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
          >
            {puntos.length === 0 && <option value="">Sin puntos asignados</option>}
            {puntos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        {punto && !punto.lista_precio && (
          <span className="text-xs font-medium text-amber-700">
            Este punto no tiene lista de precios configurada.
          </span>
        )}
        <span className="ml-auto text-xs font-medium text-brand-brown/60">
          {seleccion.length}{" "}
          {seleccion.length === 1 ? "artículo elegido" : "artículos elegidos"}
        </span>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || !punto}
          className="inline-flex items-center gap-2 rounded-xl border border-brand-wine/25 bg-white px-4 py-2 text-sm font-semibold text-brand-wine transition hover:bg-brand-wine/5 disabled:cursor-not-allowed disabled:opacity-40"
          title="Guardar la configuración que verá el cliente en el menú"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 21v-7.5A2.25 2.25 0 0 0 17.25 11.25h-10.5A2.25 2.25 0 0 0 4.5 13.5V21m15 0H4.5m15 0h1.5M4.5 21H3M16.5 6.75V3.75A.75.75 0 0 0 15.75 3H8.25a.75.75 0 0 0-.75.75v3m9 0h.008M7.5 6.75h9" />
          </svg>
          {guardado ? "¡Guardado!" : guardando ? "Guardando…" : "Guardar menú"}
        </button>
        <button
          type="button"
          onClick={() => generarPdfLista(seleccion, punto)}
          disabled={seleccion.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Descargar PDF
        </button>
      </div>

      {/* Link público del menú (para compartir con clientes) */}
      {punto?.lista_precio && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-brown/15 bg-brand-cream-soft/40 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-brand-brown/60">
              Menú público de esta tienda
            </div>
            <div className="truncate text-sm text-brand-wine">
              {`${origen}/tienda/${slugTienda(punto)}`}
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${origen}/tienda/${slugTienda(punto)}`,
                );
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              } catch {
                /* portapapeles no disponible */
              }
            }}
            className="rounded-lg border border-brand-wine/20 px-3 py-1.5 text-xs font-semibold text-brand-wine transition hover:bg-brand-wine/10"
          >
            {copiado ? "¡Copiado!" : "Copiar link"}
          </button>
          <a
            href={`${origen}/tienda/${slugTienda(punto)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-brand-brown/15 px-3 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-white"
          >
            Abrir
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Catálogo */}
        <div className="rounded-2xl border border-brand-brown/10 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por código, nombre o categoría"
                className="w-full rounded-xl border border-brand-brown/15 bg-white py-2 pl-9 pr-3 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda("")}
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-brand-brown/40 transition hover:bg-brand-cream-soft hover:text-brand-wine"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {cargandoCat ? (
            <p className="py-8 text-center text-sm text-brand-brown/60">
              Cargando catálogo…
            </p>
          ) : catalogoPorCategoria.length === 0 ? (
            <p className="py-8 text-center text-sm text-brand-brown/60">
              {punto?.lista_precio
                ? "Sin productos que coincidan."
                : "Selecciona un punto con lista de precios."}
            </p>
          ) : (
            <>
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={agregarTodos}
                  className="text-xs font-semibold text-brand-wine hover:underline"
                >
                  Agregar todo lo visible
                </button>
              </div>
              <div className="max-h-[calc(100vh-360px)] space-y-4 overflow-auto pr-1">
                {catalogoPorCategoria.map(({ cat, prods }) => (
                  <div key={cat}>
                    <div className="mb-1 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-brand-wine">
                        {cat}
                      </h3>
                      <button
                        type="button"
                        onClick={() => agregarCategoria(cat)}
                        className="text-[11px] font-semibold text-brand-brown/60 hover:text-brand-wine"
                      >
                        + Toda la categoría
                      </button>
                    </div>
                    <ul className="divide-y divide-brand-brown/5">
                      {prods.map((p) => {
                        const elegido = seleccionRefs.has(p.referencia);
                        return (
                          <li
                            key={p.referencia}
                            className="flex items-center gap-2 py-1.5"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-brand-black">
                                {(p.producto || p.referencia).toUpperCase()}
                              </div>
                              <div className="text-[11px] text-brand-brown/50">
                                {p.referencia} · {precioCOP(Number(p.precio) || 0)}
                                {umLabel(p.um) ? ` ${umLabel(p.um)}` : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => agregar(p)}
                              disabled={elegido}
                              className="shrink-0 rounded-lg border border-brand-wine/20 px-2.5 py-1 text-xs font-semibold text-brand-wine transition hover:bg-brand-wine/10 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {elegido ? "Agregado" : "Agregar"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Selección */}
        <div className="rounded-2xl border border-brand-brown/10 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-brand-wine">
              Artículos de la lista
            </h2>
            {seleccion.length > 0 && (
              <button
                type="button"
                onClick={() => setSeleccion([])}
                className="text-xs font-semibold text-brand-brown/60 hover:text-brand-wine"
              >
                Limpiar
              </button>
            )}
          </div>

          {seleccion.length === 0 ? (
            <p className="py-8 text-center text-sm text-brand-brown/60">
              Agrega artículos desde el catálogo para armar la lista.
            </p>
          ) : (
            <div className="max-h-[calc(100vh-330px)] space-y-4 overflow-auto pr-1">
              {seleccionPorCategoria.map(({ cat, items }) => (
                <div key={cat}>
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-wine">
                    {cat}
                  </h3>
                  <ul className="divide-y divide-brand-brown/5">
                    {items.map((it) => (
                      <li
                        key={it.referencia}
                        className="flex items-center gap-2 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-brand-black">
                            {(it.producto || it.referencia).toUpperCase()}
                          </div>
                          <div className="text-[11px] text-brand-brown/50">
                            {it.referencia}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-brand-brown/60">$</span>
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={it.precio}
                            onChange={(e) =>
                              cambiarPrecio(
                                it.referencia,
                                Math.max(0, Number(e.target.value) || 0),
                              )
                            }
                            className="w-24 rounded-lg border border-brand-brown/15 bg-white px-2 py-1 text-right text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
                          />
                          {umLabel(it.um) && (
                            <span className="w-8 text-[11px] text-brand-brown/50">
                              {umLabel(it.um)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => quitar(it.referencia)}
                          aria-label="Quitar"
                          title="Quitar de la lista"
                          className="shrink-0 rounded-lg p-1.5 text-brand-brown/40 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
