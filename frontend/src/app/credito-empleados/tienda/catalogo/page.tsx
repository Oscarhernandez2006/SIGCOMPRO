"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getUsuario, tieneAccesoAdministrativo } from "@/lib/auth";
import { misPuntosVenta, listarPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";
import { listarProductos, type ProductoPrecio } from "@/lib/productos";
import {
  obtenerCatalogoTienda,
  guardarCatalogoTienda,
  type ItemCatalogoTienda,
} from "@/lib/tienda-empleados";

const SIN_CATEGORIA = "Sin categoría";
const norm = (v?: string | null) => (v ?? "").trim();

/** Slug público (mismo criterio que el backend: nombre del punto). */
function slugTienda(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface Fila {
  referencia: string;
  producto: string;
  categoria: string;
  um: string;
  precio: number;
  incluido: boolean;
}

export default function CatalogoTiendaPage() {
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [puntoId, setPuntoId] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const punto = useMemo(() => puntos.find((p) => String(p.id) === puntoId) ?? null, [puntos, puntoId]);

  useEffect(() => {
    const u = getUsuario();
    const cargar = tieneAccesoAdministrativo(u?.rol) ? listarPuntosVenta() : misPuntosVenta();
    cargar
      .then((ps) => setPuntos(ps.filter((p) => p.activo && p.lista_precio?.trim())))
      .catch(() => setPuntos([]));
  }, []);

  const cargarCatalogo = useCallback(async (pid: string) => {
    const p = puntos.find((x) => String(x.id) === pid);
    if (!p || !p.lista_precio) return;
    setCargando(true);
    setError(null);
    setMensaje(null);
    try {
      const [productos, catalogo] = await Promise.all([
        listarProductos(p.lista_precio),
        obtenerCatalogoTienda(pid),
      ]);
      const incluidos = new Map(catalogo.map((c) => [c.referencia, c]));
      const nuevas: Fila[] = productos.map((pr: ProductoPrecio) => {
        const existente = incluidos.get(pr.referencia);
        return {
          referencia: pr.referencia,
          producto: (pr.producto ?? "").trim(),
          categoria: norm(pr.categoria) || SIN_CATEGORIA,
          um: pr.um ?? "",
          precio: existente ? existente.precio : Number(pr.precio) || 0,
          incluido: !!existente,
        };
      });
      // Ítems del catálogo que ya no están en la lista de precios: se conservan.
      for (const c of catalogo) {
        if (!nuevas.some((f) => f.referencia === c.referencia)) {
          nuevas.push({
            referencia: c.referencia,
            producto: c.producto,
            categoria: norm(c.categoria) || SIN_CATEGORIA,
            um: c.um,
            precio: c.precio,
            incluido: true,
          });
        }
      }
      setFilas(nuevas);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el catálogo.");
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }, [puntos]);

  useEffect(() => {
    if (puntoId) void cargarCatalogo(puntoId);
    else setFilas([]);
  }, [puntoId, cargarCatalogo]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter(
      (f) => f.producto.toLowerCase().includes(q) || f.referencia.toLowerCase().includes(q),
    );
  }, [filas, busqueda]);

  const porCategoria = useMemo(() => {
    const map = new Map<string, Fila[]>();
    for (const f of filtradas) {
      if (!map.has(f.categoria)) map.set(f.categoria, []);
      map.get(f.categoria)!.push(f);
    }
    return Array.from(map, ([categoria, items]) => ({ categoria, items }));
  }, [filtradas]);

  const nIncluidos = useMemo(() => filas.filter((f) => f.incluido).length, [filas]);

  function actualizar(referencia: string, cambios: Partial<Fila>) {
    setFilas((prev) => prev.map((f) => (f.referencia === referencia ? { ...f, ...cambios } : f)));
  }

  function marcarTodos(incluido: boolean) {
    const visibles = new Set(filtradas.map((f) => f.referencia));
    setFilas((prev) => prev.map((f) => (visibles.has(f.referencia) ? { ...f, incluido } : f)));
  }

  async function guardar() {
    if (!puntoId) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const items: ItemCatalogoTienda[] = filas
        .filter((f) => f.incluido)
        .map((f) => ({
          referencia: f.referencia,
          producto: f.producto,
          categoria: f.categoria,
          um: f.um,
          precio: Number(f.precio) || 0,
        }));
      const r = await guardarCatalogoTienda(puntoId, items);
      setMensaje(`Catálogo guardado: ${r.total} producto${r.total === 1 ? "" : "s"} publicados.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el catálogo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">Catálogo de la tienda online</h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Elige qué productos y precios ven los empleados en la tienda de cada punto.
          </p>
        </div>
        {punto && (
          <Link
            href={`/tienda-empleados/${slugTienda(punto.nombre)}`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-brown/15 bg-white px-4 py-2.5 text-sm font-semibold text-brand-wine transition hover:bg-brand-cream-soft"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Ver tienda
          </Link>
        )}
      </div>

      {/* Selector de punto */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={puntoId}
          onChange={(e) => setPuntoId(e.target.value)}
          className="rounded-xl border border-brand-brown/15 bg-white px-4 py-2.5 text-sm font-semibold text-brand-black outline-none focus:border-brand-amber"
        >
          <option value="">Selecciona un punto de venta…</option>
          {puntos.map((p) => (
            <option key={p.id} value={String(p.id)}>{p.nombre}</option>
          ))}
        </select>
        {puntoId && (
          <div className="relative min-w-[240px] flex-1">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o referencia"
              className="w-full rounded-xl border border-brand-brown/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-amber"
            />
          </div>
        )}
        {puntoId && (
          <span className="ml-auto rounded-full bg-brand-wine/10 px-3 py-1.5 text-xs font-semibold text-brand-wine">
            {nIncluidos} en la tienda
          </span>
        )}
      </div>

      {mensaje && (
        <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">{mensaje}</div>
      )}
      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {!puntoId ? (
        <div className="rounded-2xl border border-dashed border-brand-brown/20 bg-white px-6 py-16 text-center text-sm text-brand-brown/60">
          Selecciona un punto de venta para editar su catálogo.
        </div>
      ) : cargando ? (
        <p className="py-10 text-center text-sm text-brand-brown/60">Cargando productos…</p>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <button onClick={() => marcarTodos(true)} className="rounded-lg border border-brand-brown/15 bg-white px-3 py-1.5 text-xs font-semibold text-brand-wine hover:bg-brand-cream-soft">
              Incluir todo lo visible
            </button>
            <button onClick={() => marcarTodos(false)} className="rounded-lg border border-brand-brown/15 bg-white px-3 py-1.5 text-xs font-semibold text-brand-brown hover:bg-brand-cream-soft">
              Quitar todo lo visible
            </button>
          </div>

          <div className="space-y-5 pb-24">
            {porCategoria.map(({ categoria, items }) => (
              <div key={categoria} className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
                <div className="bg-brand-cream-soft px-4 py-2 text-xs font-bold uppercase tracking-wide text-brand-brown/60">
                  {categoria}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {items.map((f) => (
                      <tr key={f.referencia} className={`border-t border-brand-brown/5 ${f.incluido ? "bg-brand-amber/5" : ""}`}>
                        <td className="w-10 px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={f.incluido}
                            onChange={(e) => actualizar(f.referencia, { incluido: e.target.checked })}
                            className="h-4 w-4 accent-brand-amber"
                          />
                        </td>
                        <td className="px-2 py-2.5">
                          <p className="font-medium text-brand-black">{f.producto || f.referencia}</p>
                          <p className="text-[11px] text-brand-brown/40">Ref {f.referencia} · {f.um || "—"}</p>
                        </td>
                        <td className="w-40 px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1 rounded-lg border border-brand-brown/15 bg-white px-2 py-1">
                            <span className="text-brand-brown/40">$</span>
                            <input
                              type="number"
                              min="0"
                              value={f.precio}
                              onChange={(e) => actualizar(f.referencia, { precio: Number(e.target.value) || 0 })}
                              className="w-24 bg-transparent text-right font-semibold text-brand-black outline-none"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Barra de guardar */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-brand-brown/10 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              <span className="text-sm text-brand-brown/70">
                {nIncluidos} producto{nIncluidos === 1 ? "" : "s"} en la tienda de <b className="text-brand-wine">{punto?.nombre}</b>
              </span>
              <button
                onClick={guardar}
                disabled={guardando}
                className="rounded-xl bg-brand-wine px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar catálogo"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
