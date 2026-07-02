"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  listarListasPrecio,
  listarProductos,
  sincronizarProductos,
  ultimaSincronizacion,
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

  const cargarListas = useCallback(async () => {
    try {
      const [ls, u] = await Promise.all([
        listarListasPrecio(),
        ultimaSincronizacion(),
      ]);
      setListas(ls);
      setUltima(u);
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

  const termino = buscar.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      termino
        ? productos.filter(
            (p) =>
              (p.producto ?? "").toLowerCase().includes(termino) ||
              p.referencia.toLowerCase().includes(termino),
          )
        : productos,
    [productos, termino],
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">
            Productos y precios
          </h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Lista de precios por punto de venta (compañía 4). Sincroniza para
            traer nuevos productos o cambios de precio.
          </p>
          {ultima && (
            <p className="mt-1 text-xs text-brand-brown/50">
              Última sincronización: {fmtFecha(ultima)}
            </p>
          )}
        </div>
        <button
          onClick={sincronizar}
          disabled={sincronizando}
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
        <input
          type="text"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por producto o referencia…"
          className="min-w-64 flex-1 rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center text-sm text-brand-brown/60">
            No hay productos. Pulsa «Sincronizar» para traerlos de la API.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-brand-brown/10 bg-brand-cream-soft text-xs uppercase tracking-wide text-brand-brown/60">
                <tr>
                  <th className="px-4 py-3 font-semibold">Referencia</th>
                  <th className="px-4 py-3 font-semibold">Producto</th>
                  <th className="px-4 py-3 font-semibold">UM</th>
                  <th className="px-4 py-3 text-right font-semibold">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-brown/5">
                {filtrados.map((p) => (
                  <tr key={p.id} className="transition hover:bg-brand-cream-soft/60">
                    <td className="px-4 py-3 font-mono text-xs text-brand-brown/80">
                      {p.referencia}
                    </td>
                    <td className="px-4 py-3 font-medium text-brand-black">
                      {p.producto ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-brand-brown/70">{p.um ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-wine">
                      {fmtPrecio.format(p.precio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
