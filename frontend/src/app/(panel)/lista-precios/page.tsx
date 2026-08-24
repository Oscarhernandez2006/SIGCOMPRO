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
/*  PDF presentable (estilo Carnes Santacruz)                      */
/* -------------------------------------------------------------- */

function generarPdfLista(
  items: ItemLista[],
  punto: PuntoVenta | null,
) {
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
    );
  const logo = `${window.location.origin}/LOGOCARNESSANTACRUZ.png`;
  const fecha = new Date().toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Agrupa por categoría conservando el orden de aparición.
  const grupos = new Map<string, ItemLista[]>();
  for (const it of items) {
    const cat = it.categoria || SIN_CATEGORIA;
    if (!grupos.has(cat)) grupos.set(cat, []);
    grupos.get(cat)!.push(it);
  }

  const secciones = Array.from(grupos, ([categoria, lista]) => {
    const filas = lista
      .map(
        (it) => `<tr>
          <td class="prod">${esc((it.producto || it.referencia).toUpperCase())}</td>
          <td class="precio">${esc(precioCOP(it.precio))}${
            umLabel(it.um) ? ` <span class="um">${esc(umLabel(it.um))}</span>` : ""
          }</td>
        </tr>`,
      )
      .join("");
    return `<section class="cat">
        <h2>${esc(categoria.toUpperCase())}</h2>
        <table>
          <thead><tr><th class="prod">Producto</th><th class="precio">Precio</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </section>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
  <title>Lista de precios${punto?.nombre ? " · " + esc(punto.nombre) : ""}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{size:letter;margin:12mm}
    body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0d0d0d;color:#f5f0e6;font-size:12px}
    .hoja{background:#0d0d0d;padding:6mm 4mm}
    .head{display:flex;align-items:center;gap:18px;border-bottom:2px solid #c8a24a;padding-bottom:14px;margin-bottom:18px}
    .head img{height:78px;width:auto;object-fit:contain}
    .head .t{flex:1}
    .head h1{margin:0;font-size:26px;font-weight:800;letter-spacing:1.5px;color:#f5f0e6;text-transform:uppercase}
    .head .sub{margin-top:4px;font-size:13px;color:#c8a24a;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
    .head .meta{margin-top:2px;font-size:11px;color:#b9b0a0}
    .grid{column-count:2;column-gap:20px}
    .cat{break-inside:avoid;margin:0 0 16px}
    .cat h2{margin:0 0 6px;font-size:15px;font-weight:800;letter-spacing:1px;color:#c8a24a;text-transform:uppercase;border-bottom:1px solid #3a3a3a;padding-bottom:4px}
    table{width:100%;border-collapse:collapse}
    thead th{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#8a8378;text-align:left;padding:0 0 4px;font-weight:700}
    thead th.precio{text-align:right}
    tbody td{padding:3px 0;font-size:12px;vertical-align:bottom;border-bottom:1px dotted #333}
    td.prod{color:#f0ebe0;padding-right:8px}
    td.precio{color:#f5d98a;text-align:right;white-space:nowrap;font-weight:700}
    td.precio .um{color:#9a9384;font-weight:400;font-size:10px}
    .pie{margin-top:18px;border-top:2px solid #c8a24a;padding-top:12px;text-align:center}
    .pie .lema{font-size:17px;font-weight:800;letter-spacing:1px;color:#f5f0e6;text-transform:uppercase}
    .pie .lema span{color:#c8a24a}
    .pie .web{margin-top:3px;font-size:11px;letter-spacing:3px;color:#b9b0a0;text-transform:uppercase}
  </style></head><body>
    <div class="hoja">
      <div class="head">
        <img src="${logo}" alt="Carnes Santacruz" onerror="this.style.display='none'">
        <div class="t">
          <h1>Listado de Precios</h1>
          <div class="sub">${esc(punto?.nombre ?? "Punto de venta")}</div>
          <div class="meta">${
            punto?.direccion ? esc(punto.direccion) + " · " : ""
          }${fecha}</div>
        </div>
      </div>
      <div class="grid">
        ${secciones || `<p style="color:#b9b0a0">Sin productos seleccionados.</p>`}
      </div>
      <div class="pie">
        <div class="lema">¡Calidad <span>Superior!</span></div>
        <div class="web">www.carnessantacruz.co</div>
      </div>
    </div>
  </body></html>`;

  const w = window.open("", "_blank", "width=980,height=800");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  const img = w.document.querySelector("img");
  if (img && !img.complete) {
    img.onload = () => w.print();
    img.onerror = () => w.print();
  } else {
    w.print();
  }
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

  // Carga el catálogo de la lista de precios del punto seleccionado.
  useEffect(() => {
    const lista = punto?.lista_precio?.trim();
    setSeleccion([]);
    setBusqueda("");
    setCategoria("");
    if (!lista) {
      setCatalogo([]);
      return;
    }
    setCargandoCat(true);
    listarProductos(lista)
      .then((prods) => setCatalogo(prods))
      .catch(() => setCatalogo([]))
      .finally(() => setCargandoCat(false));
  }, [punto?.lista_precio]);

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
  }, [catalogoFiltrado]);

  const quitar = useCallback((ref: string) => {
    setSeleccion((prev) => prev.filter((s) => s.referencia !== ref));
  }, []);

  const cambiarPrecio = useCallback((ref: string, precio: number) => {
    setSeleccion((prev) =>
      prev.map((s) => (s.referencia === ref ? { ...s, precio } : s)),
    );
  }, []);

  if (cargando) {
    return <p className="text-sm text-brand-brown/60">Cargando…</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">
          Lista de Precios
        </h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Arma la lista de precios del punto de venta: busca artículos por
          código o categoría, ajusta el precio y descarga un PDF presentable
          para los clientes.
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
