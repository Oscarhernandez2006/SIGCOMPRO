"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  listarPedidosTienda,
  actualizarEstadoPedidoTienda,
  copTienda,
  type PedidoTienda,
} from "@/lib/tienda-empleados";

const ESTADOS: Array<{ key: string; label: string; chip: string }> = [
  { key: "pendiente", label: "Nuevos", chip: "bg-amber-100 text-amber-700" },
  { key: "facturado", label: "Preparados", chip: "bg-sky-100 text-sky-700" },
  { key: "entregado", label: "Entregados", chip: "bg-green-100 text-green-700" },
  { key: "anulado", label: "Anulados", chip: "bg-red-100 text-red-600" },
];

function chipEstado(estado: string): string {
  return ESTADOS.find((e) => e.key === estado)?.chip ?? "bg-brand-brown/10 text-brand-brown";
}
function labelEstado(estado: string): string {
  return (
    { pendiente: "Nuevo", facturado: "Preparado", entregado: "Entregado", anulado: "Anulado" }[estado] ??
    estado
  );
}

export default function PedidosTiendaPage() {
  const [pedidos, setPedidos] = useState<PedidoTienda[]>([]);
  const [filtro, setFiltro] = useState<string>("pendiente");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await listarPedidosTienda();
      setPedidos(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los pedidos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const id = setInterval(cargar, 20000);
    return () => clearInterval(id);
  }, [cargar]);

  const conteos = useMemo(() => {
    const c: Record<string, number> = { pendiente: 0, facturado: 0, entregado: 0, anulado: 0 };
    for (const p of pedidos) c[p.estado] = (c[p.estado] ?? 0) + 1;
    return c;
  }, [pedidos]);

  const visibles = useMemo(
    () => pedidos.filter((p) => p.estado === filtro),
    [pedidos, filtro],
  );

  async function cambiar(id: string, estado: "pendiente" | "facturado" | "entregado" | "anulado") {
    try {
      const actualizado = await actualizarEstadoPedidoTienda(id, estado);
      setPedidos((prev) => prev.map((p) => (p.id === id ? actualizado : p)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">Pedidos de la tienda online</h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Compras de empleados a crédito. Prepáralas y márcalas como entregadas al reclamarlas.
          </p>
        </div>
        <Link
          href="/credito-empleados/tienda/catalogo"
          className="inline-flex items-center gap-2 rounded-xl border border-brand-brown/15 bg-white px-4 py-2.5 text-sm font-semibold text-brand-wine transition hover:bg-brand-cream-soft"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12A1.125 1.125 0 0 1 19.75 21H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 6.75h12.974c.576 0 1.059.435 1.119 1.007Z" />
          </svg>
          Editar catálogo
        </Link>
      </div>

      {/* Tabs por estado */}
      <div className="mb-5 flex flex-wrap gap-2">
        {ESTADOS.map((e) => (
          <button
            key={e.key}
            onClick={() => setFiltro(e.key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              filtro === e.key ? "bg-brand-wine text-white" : "bg-white text-brand-brown hover:bg-brand-cream-soft"
            }`}
          >
            {e.label}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${filtro === e.key ? "bg-white/20 text-white" : e.chip}`}>
              {conteos[e.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {cargando && pedidos.length === 0 ? (
        <p className="py-10 text-center text-sm text-brand-brown/60">Cargando pedidos…</p>
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-brown/20 bg-white px-6 py-16 text-center text-sm text-brand-brown/60">
          No hay pedidos en este estado.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibles.map((p) => (
            <div key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b border-brand-brown/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-brand-black">{p.trabajador_nombre}</p>
                  <p className="text-[11px] text-brand-brown/50">C.C. {p.trabajador_cedula}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chipEstado(p.estado)}`}>
                  {labelEstado(p.estado)}
                </span>
              </div>

              <div className="px-4 py-3">
                <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-brand-brown/60">
                  <span className="inline-flex items-center gap-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />
                    </svg>
                    {p.punto_nombre}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-6" />
                    </svg>
                    {p.entrega === "domicilio" ? "Domicilio" : "Recoge en punto"}
                  </span>
                  {p.nomina_fecha && (
                    <span className="inline-flex items-center gap-1">
                      Nómina {new Date(`${p.nomina_fecha}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                    </span>
                  )}
                </div>

                {p.entrega === "domicilio" && (p.direccion || p.telefono) && (
                  <div className="mb-2 rounded-lg border border-brand-brown/10 bg-brand-cream-soft/50 px-3 py-2 text-xs text-brand-brown/70">
                    {p.direccion && <div>{p.direccion}</div>}
                    {p.telefono && <div>Tel. {p.telefono}</div>}
                  </div>
                )}

                {/* Productos */}
                <div className="max-h-40 overflow-y-auto rounded-lg border border-brand-brown/10">
                  <table className="w-full text-xs">
                    <tbody>
                      {p.items.map((it) => (
                        <tr key={it.referencia} className="border-b border-brand-brown/5 last:border-0">
                          <td className="px-3 py-1.5 text-brand-brown/50">{it.cantidad}×</td>
                          <td className="px-1 py-1.5 text-brand-black">
                            {it.producto || it.referencia}
                            {it.observacion && <span className="block text-[10px] italic text-brand-brown/50">“{it.observacion}”</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium text-brand-black">{copTienda(it.precio * it.cantidad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {p.observacion && (
                  <p className="mt-2 text-xs italic text-brand-brown/60">Nota: {p.observacion}</p>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-brand-brown/50">Total a crédito</span>
                  <span className="font-serif text-lg font-bold text-brand-wine">{copTienda(p.total)}</span>
                </div>
              </div>

              {/* Acciones */}
              <div className="mt-auto flex gap-2 border-t border-brand-brown/10 px-4 py-3">
                {p.estado === "pendiente" && (
                  <>
                    <button onClick={() => cambiar(p.id, "facturado")} className="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
                      Marcar preparado
                    </button>
                    <button onClick={() => { if (confirm("¿Anular este pedido?")) cambiar(p.id, "anulado"); }} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50">
                      Anular
                    </button>
                  </>
                )}
                {p.estado === "facturado" && (
                  <>
                    <button onClick={() => cambiar(p.id, "entregado")} className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-700">
                      Marcar entregado
                    </button>
                    <button onClick={() => cambiar(p.id, "pendiente")} className="rounded-lg border border-brand-brown/15 px-3 py-2 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft">
                      Volver a nuevo
                    </button>
                  </>
                )}
                {p.estado === "entregado" && (
                  <div className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-50 py-2 text-sm font-semibold text-green-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    Entregado
                  </div>
                )}
                {p.estado === "anulado" && (
                  <button onClick={() => cambiar(p.id, "pendiente")} className="w-full rounded-lg border border-brand-brown/15 px-3 py-2 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft">
                    Reactivar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
