"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  listarPedidosTienda,
  actualizarEstadoPedidoTienda,
  copTienda,
  type PedidoTienda,
} from "@/lib/tienda-empleados";
import { obtenerPedidoCredito, type PedidoCredito } from "@/lib/credito-empleados";

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

/** Quita el prefijo "PDV Carnes Santacruz" del nombre del punto para la tabla. */
function puntoCorto(nombre: string): string {
  return (nombre ?? "").replace(/^\s*pdv\s+carnes\s+santacruz\s*/i, "").trim() || (nombre ?? "");
}

export default function PedidosTiendaPage() {
  const [pedidos, setPedidos] = useState<PedidoTienda[]>([]);
  const [filtro, setFiltro] = useState<string>("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entregar, setEntregar] = useState<PedidoTienda | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [busq, setBusq] = useState("");
  const [fPunto, setFPunto] = useState("");
  const [fOrigen, setFOrigen] = useState("");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");

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

  const puntosUnicos = useMemo(
    () => Array.from(new Set(pedidos.map((p) => p.punto_nombre).filter(Boolean))).sort(),
    [pedidos],
  );

  const visibles = useMemo(() => {
    const q = busq.trim().toLowerCase();
    const hastaTs = fHasta ? new Date(`${fHasta}T00:00:00`).getTime() + 86_400_000 : null;
    const desdeTs = fDesde ? new Date(`${fDesde}T00:00:00`).getTime() : null;
    return pedidos.filter((p) => {
      if (filtro && p.estado !== filtro) return false;
      if (fPunto && p.punto_nombre !== fPunto) return false;
      if (fOrigen && (p.origen || "manual") !== fOrigen) return false;
      if (q && !`${p.trabajador_nombre} ${p.trabajador_cedula}`.toLowerCase().includes(q)) return false;
      const ts = new Date(p.creado_en).getTime();
      if (desdeTs !== null && ts < desdeTs) return false;
      if (hastaTs !== null && ts >= hastaTs) return false;
      return true;
    });
  }, [pedidos, filtro, busq, fPunto, fOrigen, fDesde, fHasta]);

  const hayFiltros = !!(busq || filtro || fPunto || fOrigen || fDesde || fHasta);

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

      {/* Filtros */}
      <div className="mb-4 rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-end gap-2 px-4 py-3">
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Buscar</label>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-brown/35">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
              </svg>
              <input value={busq} onChange={(e) => setBusq(e.target.value)}
                placeholder="Nombre o cédula"
                className="h-9 w-full rounded-lg border border-brand-brown/20 pl-8 pr-2.5 text-sm outline-none transition focus:border-brand-wine" />
            </div>
          </div>
          <div className="min-w-[130px]">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Estado</label>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}
              className="h-9 rounded-lg border border-brand-brown/20 bg-white px-2.5 text-sm outline-none transition focus:border-brand-wine">
              <option value="">Todos</option>
              <option value="pendiente">Nuevos</option>
              <option value="facturado">Preparados</option>
              <option value="entregado">Entregados</option>
              <option value="anulado">Anulados</option>
            </select>
          </div>
          {puntosUnicos.length > 1 && (
            <div className="min-w-[140px]">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Punto</label>
              <select value={fPunto} onChange={(e) => setFPunto(e.target.value)}
                className="h-9 rounded-lg border border-brand-brown/20 bg-white px-2.5 text-sm outline-none transition focus:border-brand-wine">
                <option value="">Todos</option>
                {puntosUnicos.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          <div className="min-w-[120px]">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Origen</label>
            <select value={fOrigen} onChange={(e) => setFOrigen(e.target.value)}
              className="h-9 rounded-lg border border-brand-brown/20 bg-white px-2.5 text-sm outline-none transition focus:border-brand-wine">
              <option value="">Todos</option>
              <option value="manual">Panel</option>
              <option value="tienda">Tienda online</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Desde</label>
            <input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)}
              className="h-9 rounded-lg border border-brand-brown/20 px-2.5 text-sm outline-none transition focus:border-brand-wine [color-scheme:light]" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Hasta</label>
            <input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)}
              className="h-9 rounded-lg border border-brand-brown/20 px-2.5 text-sm outline-none transition focus:border-brand-wine [color-scheme:light]" />
          </div>
          {hayFiltros && (
            <button type="button" onClick={() => { setBusq(""); setFiltro(""); setFPunto(""); setFOrigen(""); setFDesde(""); setFHasta(""); }}
              className="h-9 rounded-lg border border-brand-brown/20 px-3 text-sm text-brand-brown/60 transition hover:bg-brand-cream-soft">
              Limpiar
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {cargando && pedidos.length === 0 ? (
        <p className="py-10 text-center text-sm text-brand-brown/60">Cargando pedidos…</p>
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-brown/20 bg-white px-6 py-16 text-center text-sm text-brand-brown/60">
          No hay pedidos para los filtros aplicados.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-brand-brown/10 bg-neutral-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Colaborador</th>
                  <th className="px-4 py-3">Punto</th>
                  <th className="px-4 py-3">Entrega</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="whitespace-nowrap px-4 py-3">Origen</th>
                  <th className="px-4 py-3">Nómina</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const esTienda = p.origen === "tienda";
                  return (
                    <tr key={p.id} onClick={() => setDetalleId(p.id)}
                      className="cursor-pointer border-b border-brand-brown/8 transition hover:bg-brand-cream-soft/50">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-brand-brown/65">
                        {new Date(p.creado_en).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-wine/10 text-[10px] font-bold text-brand-wine">
                            {(p.trabajador_nombre ?? "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium leading-tight text-brand-black">{p.trabajador_nombre}</p>
                            <p className="text-[11px] text-brand-brown/50">CC {p.trabajador_cedula}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-brand-brown/75">{puntoCorto(p.punto_nombre)}</td>
                      <td className="px-4 py-3 text-xs text-brand-brown/70">{p.entrega === "domicilio" ? "Domicilio" : "Recoge"}</td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-semibold tabular-nums text-brand-black">{copTienda(p.total)}</p>
                        {p.items.length > 0 && (
                          <p className="mt-0.5 text-[11px] text-brand-brown/45">{p.items.length} {p.items.length === 1 ? "producto" : "productos"}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${chipEstado(p.estado)}`}>{labelEstado(p.estado)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${esTienda ? "bg-amber-100 text-amber-700" : "bg-brand-brown/8 text-brand-brown/60"}`}>
                          {esTienda ? "Tienda online" : "Panel"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-brand-brown/65">
                        {p.nomina_fecha
                          ? new Date(`${p.nomina_fecha}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })
                          : <span className="italic text-brand-brown/25">—</span>}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {p.estado === "pendiente" && (
                            <>
                              <button onClick={() => cambiar(p.id, "facturado")} className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-sky-700">Preparar</button>
                              <button onClick={() => { if (confirm("¿Anular este pedido?")) cambiar(p.id, "anulado"); }} className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-600 transition hover:bg-red-50">Anular</button>
                            </>
                          )}
                          {p.estado === "facturado" && (
                            <>
                              <button onClick={() => setEntregar(p)} className="rounded-lg bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-green-700">Entregar</button>
                              <button onClick={() => cambiar(p.id, "pendiente")} className="rounded-lg border border-brand-brown/15 px-2.5 py-1 text-[11px] font-semibold text-brand-brown transition hover:bg-brand-cream-soft">Volver</button>
                            </>
                          )}
                          {p.estado === "entregado" && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                              Entregado
                            </span>
                          )}
                          {p.estado === "anulado" && (
                            <button onClick={() => cambiar(p.id, "pendiente")} className="rounded-lg border border-brand-brown/15 px-2.5 py-1 text-[11px] font-semibold text-brand-brown transition hover:bg-brand-cream-soft">Reactivar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
      {detalleId && (
        <DetallePedidoModal id={detalleId} onClose={() => setDetalleId(null)} />
      )}
    </div>
  );
}

// ── Modal detalle del pedido (click en una fila) ───────────────────────────────

function DetallePedidoModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [pedido, setPedido] = useState<PedidoCredito | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    obtenerPedidoCredito(id)
      .then((p) => { if (vivo) setPedido(p); })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : "No se pudo cargar el detalle."); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [id]);

  const items = pedido
    ? (pedido.tienda_items && pedido.tienda_items.length > 0)
      ? pedido.tienda_items.map((it) => ({ nombre: it.producto, cantidad: it.cantidad, um: it.um, total: Number(it.precio) * it.cantidad, obs: it.observacion }))
      : (pedido.factura_productos && pedido.factura_productos.length > 0)
        ? pedido.factura_productos.map((it) => ({ nombre: it.descripcion, cantidad: it.cantidad, um: it.um, total: Number(it.total), obs: undefined as string | undefined }))
        : []
    : [];
  const esTienda = pedido?.origen === "tienda";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-brand-wine">Detalle del pedido</h2>
            <p className="text-xs text-brand-brown/55">Información completa</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"
            className="rounded-lg p-1.5 text-brand-brown/40 transition hover:bg-brand-cream-soft hover:text-brand-brown">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {cargando ? (
            <div className="flex items-center justify-center py-12 text-brand-brown/50">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-wine border-t-transparent" />
            </div>
          ) : error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : pedido ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-brand-black">{pedido.trabajador_nombre}</p>
                  <p className="text-xs text-brand-brown/55">CC {pedido.trabajador_cedula}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${chipEstado(pedido.estado)}`}>{labelEstado(pedido.estado)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${esTienda ? "bg-amber-100 text-amber-700" : "bg-brand-brown/8 text-brand-brown/60"}`}>
                    {esTienda ? "Tienda online" : "Panel"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <Dato label="Punto de venta">{pedido.punto_nombre}</Dato>
                <Dato label="Fecha">{new Date(pedido.creado_en).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Dato>
                <Dato label="Nómina">
                  {pedido.nomina_fecha ? new Date(`${pedido.nomina_fecha}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" }) : "—"}
                </Dato>
                {pedido.entrega && <Dato label="Entrega">{pedido.entrega === "domicilio" ? "Domicilio" : "Recoge en punto"}</Dato>}
                {pedido.factura_numero && <Dato label="N° factura">{pedido.factura_numero}</Dato>}
                {pedido.telefono && <Dato label="Teléfono">{pedido.telefono}</Dato>}
              </div>
              {pedido.direccion && <Dato label="Dirección">{pedido.direccion}</Dato>}

              {items.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-brand-brown/45">Productos</p>
                  <div className="divide-y divide-brand-brown/8 rounded-xl border border-brand-brown/10">
                    {items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="flex h-6 min-w-[2rem] items-center justify-center rounded-md bg-brand-wine/8 px-1 text-xs font-bold text-brand-wine">{it.cantidad}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-brand-black">{it.nombre}</p>
                          {it.obs && <p className="text-[11px] italic text-brand-brown/50">“{it.obs}”</p>}
                        </div>
                        <span className="text-[11px] text-brand-brown/45">{it.um}</span>
                        <span className="w-24 text-right font-semibold tabular-nums text-brand-black">{copTienda(it.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pedido.observacion && <Dato label="Observación">{pedido.observacion}</Dato>}

              {pedido.factura_imagen && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-brand-brown/45">Comprobante (factura + cédula)</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pedido.factura_imagen} alt="Comprobante" className="w-full rounded-xl border border-brand-brown/15" />
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl bg-brand-wine px-4 py-3 text-white">
                <span className="text-sm font-medium text-brand-cream/80">Total a crédito</span>
                <span className="font-serif text-xl font-bold">{copTienda(Number(pedido.total) || 0)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-brand-brown/10 bg-brand-cream-soft/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-brown/45">{label}</p>
      <p className="mt-0.5 text-sm text-brand-black">{children}</p>
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
