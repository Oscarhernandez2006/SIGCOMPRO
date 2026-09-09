"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [entregar, setEntregar] = useState<PedidoTienda | null>(null);

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
          <h1 className="font-serif text-3xl font-bold text-brand-wine">Pedidos a crédito</h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Compras de empleados (panel y tienda online). Prepáralas y ciérralas con la foto de la factura al entregar.
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
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${chipEstado(p.estado)}`}>
                    {labelEstado(p.estado)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${p.origen === "tienda" ? "bg-amber-100 text-amber-700" : "bg-brand-brown/8 text-brand-brown/55"}`}>
                    {p.origen === "tienda" ? "Tienda online" : "Panel"}
                  </span>
                </div>
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
                    <button onClick={() => setEntregar(p)} className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-700">
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

      {entregar && (
        <EntregarModal
          pedido={entregar}
          onClose={() => setEntregar(null)}
          onEntregado={(act) => {
            setPedidos((prev) => prev.map((p) => (p.id === act.id ? act : p)));
            setEntregar(null);
          }}
        />
      )}
    </div>
  );
}

// ── Modal de entrega: exige foto de la factura (con la cédula) para cerrar ──────

function EntregarModal({ pedido, onClose, onEntregado }: {
  pedido: PedidoTienda;
  onClose: () => void;
  onEntregado: (p: PedidoTienda) => void;
}) {
  const [imagen, setImagen] = useState<string | null>(null);
  const [numFactura, setNumFactura] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function confirmar() {
    if (!imagen) { setError("Adjunta la foto de la factura con la cédula al lado."); return; }
    setGuardando(true); setError(null);
    try {
      const act = await actualizarEstadoPedidoTienda(pedido.id, "entregado", {
        factura_imagen: imagen,
        factura_numero: numFactura.trim() || null,
      });
      onEntregado(act);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar la venta.");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !guardando && onClose()} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="border-b border-brand-brown/10 px-5 py-4">
          <h2 className="font-serif text-lg font-bold text-brand-wine">Cerrar venta y entregar</h2>
          <p className="text-xs text-brand-brown/55">
            {pedido.trabajador_nombre} · C.C. {pedido.trabajador_cedula} · {copTienda(pedido.total)}
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-brown/60">
              Foto de la factura <span className="normal-case text-brand-brown/40">(con la cédula al lado)</span>
            </label>
            <input
              ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => setImagen(ev.target?.result as string);
                reader.readAsDataURL(file);
              }}
            />
            {imagen ? (
              <div className="relative overflow-hidden rounded-xl border border-brand-brown/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagen} alt="Factura" className="max-h-56 w-full object-cover" />
                <button type="button" onClick={() => { setImagen(null); if (inputRef.current) inputRef.current.value = ""; }}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => inputRef.current?.click()}
                className="flex h-24 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-brown/30 text-sm text-brand-brown/55 transition hover:border-brand-wine/40 hover:text-brand-wine/70">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
                Tomar foto o seleccionar imagen
              </button>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-brown/60">
              N° de factura <span className="normal-case text-brand-brown/40">(opcional)</span>
            </label>
            <input value={numFactura} onChange={(e) => setNumFactura(e.target.value)}
              placeholder="Ej: CE1C11433"
              className="h-11 w-full rounded-xl border border-brand-brown/25 px-3 text-sm outline-none transition focus:border-brand-wine" />
          </div>

          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-brand-brown/10 px-5 py-3">
          <button type="button" onClick={onClose} disabled={guardando}
            className="h-10 rounded-xl border border-brand-brown/25 px-4 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={guardando || !imagen}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-green-600 px-5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
            {guardando ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
            {guardando ? "Cerrando…" : "Confirmar entrega"}
          </button>
        </div>
      </div>
    </div>
  );
}
