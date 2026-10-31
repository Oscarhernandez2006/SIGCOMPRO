"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  listarListasPrecio,
  listarProductos,
  actualizarProductoAgotado,
  sincronizarProductos,
  ultimaSincronizacion,
  movimientosProductos,
  type ListaPrecio,
  type ProductoPrecio,
} from "@/lib/productos";

const fmtPrecio = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function fmtFecha(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-CO");
}

export default function AdminProductosPage() {
  const [listas, setListas] = useState<ListaPrecio[]>([]);
  const [listaSel, setListaSel] = useState<string>("");
  const [productos, setProductos] = useState<ProductoPrecio[]>([]);
  const [buscar, setBuscar] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ultima, setUltima] = useState<string | null>(null);
  const [actualizandoAgotado, setActualizandoAgotado] = useState<string | null>(null);
  const [movimientos, setMovimientos] = useState<Record<string, number>>({});

  const cargarListas = useCallback(async () => {
    try {
      const [ls, u] = await Promise.all([
        listarListasPrecio(),
        ultimaSincronizacion(),
      ]);
      setListas(ls);
      setUltima(u);
      movimientosProductos().then(setMovimientos).catch(() => setMovimientos({}));
      setListaSel((prev) => prev || ls[0]?.lista_precio || "");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "No se pudieron cargar las listas",
      );
    }
  }, []);

  const cargarProductos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setProductos(await listarProductos(listaSel || undefined));
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "No se pudieron cargar los productos",
      );
    } finally {
      setCargando(false);
    }
  }, [listaSel]);

  useEffect(() => {
    cargarListas();
  }, [cargarListas]);

  useEffect(() => {
    cargarProductos();
  }, [cargarProductos]);

  async function sincronizar() {
    setSincronizando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await sincronizarProductos();
      setAviso(`Sincronizados ${r.total} productos en ${r.listas} listas.`);
      await cargarListas();
      await cargarProductos();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "No se pudo sincronizar con la API",
      );
    } finally {
      setSincronizando(false);
    }
  }

  async function alternarAgotado(producto: ProductoPrecio) {
    const key = `${producto.lista_precio}:${producto.referencia}`;
    setActualizandoAgotado(key);
    setError(null);
    try {
      await actualizarProductoAgotado(producto.lista_precio, producto.referencia, !producto.agotado);
      setProductos((previous) => previous.map((item) => item.id === producto.id ? { ...item, agotado: !producto.agotado } : item));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cambiar la disponibilidad del producto");
    } finally { setActualizandoAgotado(null); }
  }

  const termino = buscar.trim().toLowerCase();
  const movDe = useCallback(
    (p: ProductoPrecio) => movimientos[p.referencia.trim().replace(/^0+/, "")] ?? 0,
    [movimientos],
  );
  const filtrados = useMemo(() => {
    const base = termino
      ? productos.filter(
          (p) =>
            (p.producto ?? "").toLowerCase().includes(termino) ||
            p.referencia.toLowerCase().includes(termino),
        )
      : productos;
    // Primero los que tienen movimiento en pedidos (más pedidos arriba); los sin movimiento al final.
    return [...base].sort((a, b) => {
      const d = movDe(b) - movDe(a);
      if (d !== 0) return d;
      return (a.producto ?? "").localeCompare(b.producto ?? "", "es");
    });
  }, [productos, termino, movDe]);
  const disponibles = useMemo(() => filtrados.filter((p) => !p.agotado), [filtrados]);
  const agotados = useMemo(() => filtrados.filter((p) => p.agotado), [filtrados]);

  function renderPanel(titulo: string, items: ProductoPrecio[], agotado: boolean) {
    return (
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        <div className={`flex items-center justify-between border-b px-4 py-3 ${agotado ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
          <h2 className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wide ${agotado ? "text-red-700" : "text-emerald-700"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${agotado ? "bg-red-600" : "bg-emerald-600"}`} />
            {titulo}
          </h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${agotado ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div className="py-12 text-center text-sm text-brand-black/60">
            {agotado ? "Ningún producto agotado." : "No hay productos disponibles."}
          </div>
        ) : (
          <div className="max-h-[calc(100vh-360px)] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-brand-brown/10 bg-brand-cream-soft text-xs uppercase tracking-wide text-brand-black shadow-sm">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Producto</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Precio</th>
                  <th className="px-3 py-2.5 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-brown/5">
                {items.map((p) => {
                  const n = movDe(p);
                  const key = `${p.lista_precio}:${p.referencia}`;
                  const ocupado = actualizandoAgotado === key;
                  return (
                    <tr key={p.id} className={`transition hover:bg-brand-cream-soft/60 ${n === 0 ? "opacity-70" : ""}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-brand-black">{p.producto ?? "—"}</div>
                        <div className="flex items-center gap-2 text-[11px] text-brand-black/60">
                          <span className="font-mono">{p.referencia}</span>
                          {p.um && <span>· {p.um}</span>}
                          {n > 0 && (
                            <span className="rounded-full bg-brand-amber/15 px-1.5 py-px font-semibold text-brand-amber" title="Pedidos en los últimos 90 días">
                              {n} ped.
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-brand-wine">
                        {fmtPrecio.format(p.precio)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          title={agotado ? "Marcar disponible" : "Marcar agotado"}
                          aria-label={`${agotado ? "Marcar disponible" : "Marcar agotado"}: ${p.producto ?? p.referencia}`}
                          disabled={ocupado}
                          onClick={() => void alternarAgotado(p)}
                          className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold transition disabled:opacity-50 ${agotado ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"}`}
                        >
                          {ocupado ? (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : agotado ? (
                            <>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                              Disponible
                            </>
                          ) : (
                            <>
                              Agotado
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">
            Productos y precios
          </h1>
          <p className="mt-1 text-sm text-brand-black">
            Lista de precios por punto de venta (compañía 4). Sincroniza para
            traer nuevos productos o cambios de precio.
          </p>
          {ultima && (
            <p className="mt-1 text-xs text-brand-black">
              Última sincronización: {fmtFecha(ultima)}
            </p>
          )}
        </div>
        <button
          onClick={sincronizar}
          disabled={sincronizando}
          title="Sincronizar productos y precios con la API"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber-light disabled:opacity-60"
        >
          {sincronizando ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.027 15.348h4.992v4.992m12.74-7.512a8.25 8.25 0 0 1-15.518 1.508m-.001-4.692a8.25 8.25 0 0 1 15.518-1.5" />
            </svg>
          )}
          Sincronizar
        </button>
      </div>

      {aviso && (
        <div className="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
          {aviso}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-3 text-sm text-brand-wine">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={listaSel}
          onChange={(e) => setListaSel(e.target.value)}
          className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
        >
          {listas.length === 0 && <option value="">Sin listas</option>}
          {listas.map((l) => (
            <option key={l.lista_precio} value={l.lista_precio}>
              {l.desc_lista ?? `Lista ${l.lista_precio}`} ({l.productos})
            </option>
          ))}
        </select>
        <div className="relative min-w-64 flex-1">
          <input
            type="text"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por producto o referencia…"
            className="w-full rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 pr-9 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
          />
          {buscar && (
            <button
              type="button"
              onClick={() => setBuscar("")}
              title="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-brand-black transition hover:bg-brand-cream-soft hover:text-brand-wine"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center rounded-2xl border border-brand-brown/10 bg-white py-16 shadow-sm">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-brand-brown/10 bg-white py-16 text-center text-sm text-brand-black shadow-sm">
          No hay productos. Pulsa «Sincronizar» para traerlos de la API.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {renderPanel("Disponibles", disponibles, false)}
          {renderPanel("Agotados", agotados, true)}
        </div>
      )}
    </div>
  );
}
