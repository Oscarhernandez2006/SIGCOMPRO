"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { misPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";
import {
  actualizarEstadoPedidoCredito,
  crearPedidoCredito,
  listarPedidosCredito,
  obtenerTrabajadorCredito,
  type PedidoCredito,
  type TrabajadorCredito,
} from "@/lib/credito-empleados";

const fmtCop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const money = (v: number) => fmtCop.format(Number.isFinite(v) ? v : 0);

function fechaCorta(v: string) {
  if (!v) return "-";
  return new Date(v).toLocaleString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-700",
  facturado: "border-brand-wine/25 bg-brand-wine/5 text-brand-wine",
  anulado:   "border-neutral-200 bg-neutral-100 text-neutral-500",
};
const ESTADO_LABEL: Record<string, string> = { pendiente: "Pendiente", facturado: "Facturado", anulado: "Anulado" };

function EstadoBadge({ estado }: { estado: string }) {
  const dot: Record<string, string> = {
    pendiente: "bg-amber-400", facturado: "bg-brand-wine", anulado: "bg-neutral-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ESTADO_BADGE[estado] ?? "border-brand-brown/20 bg-brand-brown/5 text-brand-brown"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[estado] ?? "bg-brand-brown/40"}`} />
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  );
}

// ── Íconos ────────────────────────────────────────────────────────────────────

const Ico = {
  wallet:    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />,
  clock:     <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  arrowUp:   <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />,
  check:     <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  plus:      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />,
  search:    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />,
  filter:    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />,
  user:      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />,
  store:     <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />,
  money:     <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.107-.879-1.107-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  note:      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487 18.55 2.8a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />,
  xmark:     <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />,
  calendar:  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />,
};

function Icon({ d, cls = "h-5 w-5" }: { d: React.ReactNode; cls?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={cls}>
      {d}
    </svg>
  );
}

// ── Modal "Nueva compra" ─────────────────────────────────────────────────────

function ModalNuevaCompra({ puntos, onClose, onCreado }: { puntos: PuntoVenta[]; onClose: () => void; onCreado: () => void }) {
  const [cedula, setCedula]         = useState("");
  const [trabajador, setTrabajador] = useState<TrabajadorCredito | null>(null);
  const [buscando, setBuscando]     = useState(false);
  const [errorBuscar, setErrorBuscar] = useState<string | null>(null);

  const [puntoSel, setPuntoSel]     = useState(puntos[0]?.id ?? "");
  const [total, setTotal]           = useState("");
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando]   = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const c = cedula.trim();
    if (!c) { setErrorBuscar("Ingresa la cédula."); return; }
    setBuscando(true); setErrorBuscar(null); setTrabajador(null);
    try { setTrabajador(await obtenerTrabajadorCredito(c)); }
    catch (err) { setErrorBuscar(err instanceof ApiError ? err.message : "No se encontró el trabajador."); }
    finally { setBuscando(false); }
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!trabajador) { setErrorGuardar("Busca primero el trabajador."); return; }
    const valor = Number(total);
    if (!Number.isFinite(valor) || valor <= 0) { setErrorGuardar("Ingresa un valor válido."); return; }
    const punto = puntos.find((p) => p.id === puntoSel);
    if (!punto) { setErrorGuardar("Selecciona un punto de venta."); return; }
    setGuardando(true); setErrorGuardar(null);
    try {
      await crearPedidoCredito({ trabajador_cedula: trabajador.cedula, punto_id: punto.id, punto_nombre: punto.nombre, total: valor, observacion });
      onCreado(); onClose();
    } catch (err) { setErrorGuardar(err instanceof ApiError ? err.message : "No se pudo registrar la compra."); }
    finally { setGuardando(false); }
  }

  const disponible = Number(trabajador?.cupo_disponible ?? 0);
  const valorNum   = Number(total || 0);
  const superaCupo = trabajador && Number.isFinite(valorNum) && valorNum > 0 && valorNum > disponible;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm" onClick={() => !guardando && onClose()} />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">

        {/* Header del modal */}
        <div className="flex items-center gap-3 border-b border-brand-brown/10 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-wine/10 text-brand-wine">
            <Icon d={Ico.wallet} cls="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-serif text-lg font-bold text-brand-wine">Nueva compra a crédito</h2>
            <p className="text-xs text-brand-brown/55">Busca el colaborador y registra el valor</p>
          </div>
          <button type="button" onClick={onClose} disabled={guardando} aria-label="Cerrar"
            className="rounded-lg p-1.5 text-brand-brown/40 transition hover:bg-brand-cream-soft hover:text-brand-brown disabled:opacity-40">
            <Icon d={Ico.xmark} cls="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[82vh] overflow-y-auto px-5 py-4 space-y-5">

          {/* Paso 1 */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-wine text-[10px] font-bold text-white">1</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-brown/55">Buscar colaborador</p>
            </div>
            <form onSubmit={buscar} className="flex gap-2">
              <div className="relative flex-1">
                <Icon d={Ico.user} cls="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/35" />
                <input ref={inputRef} value={cedula}
                  onChange={(e) => { setCedula(e.target.value.replace(/\D/g, "")); setTrabajador(null); setErrorBuscar(null); }}
                  placeholder="Número de cédula"
                  className="h-11 w-full rounded-xl border border-brand-brown/25 pl-9 pr-3 text-sm outline-none transition focus:border-brand-wine" />
              </div>
              <button type="submit" disabled={buscando}
                className="flex h-11 items-center gap-1.5 rounded-xl bg-brand-wine px-4 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-50">
                {buscando
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  : <Icon d={Ico.search} cls="h-4 w-4" />}
                {buscando ? "Buscando…" : "Buscar"}
              </button>
            </form>
            {errorBuscar && (
              <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                {errorBuscar}
              </p>
            )}
          </div>

          {/* Tarjeta del trabajador */}
          {trabajador && (
            <div className={`overflow-hidden rounded-xl border ${trabajador.activo ? "border-brand-wine/25" : "border-rose-200"}`}>
              {/* Banner */}
              <div className={`flex items-center gap-3 px-4 py-3 ${trabajador.activo ? "bg-brand-wine" : "bg-rose-600"}`}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
                  <Icon d={Ico.user} cls="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white leading-tight truncate">{trabajador.nombre}</p>
                  <p className="text-[11px] text-white/70">CC {trabajador.cedula}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${trabajador.activo ? "bg-white/20 text-white" : "bg-white/20 text-white"}`}>
                  {trabajador.activo ? "Activo" : "Inactivo"}
                </span>
              </div>
              {!trabajador.activo && (
                <div className="bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700">
                  ⚠ Este colaborador está inactivo y no puede usar crédito.
                </div>
              )}
              {/* Stats */}
              <div className="grid grid-cols-3 divide-x divide-brand-brown/10 bg-white">
                {[
                  { label: "Cupo total",  val: money(Number(trabajador.cupo_asignado)),  color: "text-brand-black" },
                  { label: "Deuda actual", val: money(Number(trabajador.deuda_vigente)), color: "text-amber-700" },
                  { label: "Disponible",  val: money(disponible), color: disponible > 0 ? "text-brand-wine" : "text-rose-600" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="px-3 py-2.5 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-brand-brown/50">{label}</p>
                    <p className={`mt-0.5 text-sm font-bold ${color}`}>{val}</p>
                  </div>
                ))}
              </div>
              {trabajador.siesa_saldo !== null && (
                <div className="flex items-center gap-2 border-t border-brand-brown/10 bg-neutral-50 px-4 py-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5 shrink-0 text-brand-brown/40">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                  </svg>
                  <span className="text-[11px] text-brand-brown/55">Saldo en Siesa (cartera ERP)</span>
                  <span className={`ml-auto text-xs font-bold ${trabajador.siesa_saldo > 0 ? "text-rose-600" : "text-brand-wine"}`}>
                    {money(trabajador.siesa_saldo)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Paso 2 */}
          {trabajador?.activo && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-wine text-[10px] font-bold text-white">2</span>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-brown/55">Detalle de la compra</p>
              </div>
              <form onSubmit={registrar} className="space-y-3">
                {/* Punto */}
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-brown/60">
                    <Icon d={Ico.store} cls="h-3.5 w-3.5" />Punto de venta
                  </label>
                  <select value={puntoSel} onChange={(e) => setPuntoSel(e.target.value)}
                    className="h-11 w-full rounded-xl border border-brand-brown/25 bg-white px-3 text-sm outline-none transition focus:border-brand-wine">
                    <option value="">Selecciona un punto</option>
                    {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                {/* Valor */}
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-brown/60">
                    <Icon d={Ico.money} cls="h-3.5 w-3.5" />Valor de la compra
                  </label>
                  <input value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="Ej: 185000"
                    className={`h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-brand-wine ${superaCupo ? "border-rose-300 bg-rose-50" : "border-brand-brown/25"}`} />
                  {superaCupo && <p className="mt-1 text-xs font-medium text-rose-600">Supera el cupo disponible ({money(disponible)})</p>}
                  {total && !superaCupo && Number(total) > 0 && (
                    <p className="mt-1 text-xs font-semibold text-brand-wine">{money(Number(total))}</p>
                  )}
                </div>
                {/* Observación */}
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-brown/60">
                    <Icon d={Ico.note} cls="h-3.5 w-3.5" />
                    Observación <span className="font-normal normal-case text-brand-brown/35">(opcional)</span>
                  </label>
                  <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)}
                    rows={2} placeholder="Detalle o notas de cartera…"
                    className="w-full resize-none rounded-xl border border-brand-brown/25 px-3 py-2.5 text-sm outline-none transition focus:border-brand-wine" />
                </div>
                {errorGuardar && (
                  <p className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    {errorGuardar}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={onClose} disabled={guardando}
                    className="h-10 rounded-xl border border-brand-brown/25 px-4 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={guardando || !!superaCupo || !puntoSel || !total}
                    className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-wine px-5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:cursor-not-allowed disabled:opacity-50">
                    {guardando ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Icon d={Ico.check} cls="h-4 w-4" />}
                    {guardando ? "Registrando…" : "Registrar compra"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal confirmación de cambio de estado ────────────────────────────────────

function ModalConfirm({ pedido, nuevoEstado, onClose, onConfirmar }: {
  pedido: PedidoCredito;
  nuevoEstado: "facturado" | "anulado" | "pendiente";
  onClose: () => void;
  onConfirmar: () => Promise<void>;
}) {
  const [ejecutando, setEjecutando] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const cfg = {
    facturado: { titulo: "Facturar compra",     desc: "Se marcará como facturada en cartera.",         btn: "Sí, facturar",  color: "bg-brand-wine hover:bg-brand-wine/90", icon: Ico.check },
    anulado:   { titulo: "Anular compra",        desc: "El cupo se liberará. Difícil de revertir.",     btn: "Sí, anular",    color: "bg-rose-600 hover:bg-rose-700",     icon: Ico.xmark },
    pendiente: { titulo: "Volver a pendiente",   desc: "El estado quedará pendiente de facturación.",   btn: "Sí, revertir",  color: "bg-amber-600 hover:bg-amber-700",   icon: Ico.clock },
  }[nuevoEstado];

  async function confirmar() {
    setEjecutando(true); setError(null);
    try { await onConfirmar(); onClose(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Error al cambiar el estado."); setEjecutando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm" onClick={() => !ejecutando && onClose()} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="font-serif text-lg font-bold text-brand-black">{cfg.titulo}</h2>
        <p className="mt-1 text-sm text-brand-brown/70">{cfg.desc}</p>
        <div className="mt-4 rounded-xl border border-brand-brown/10 bg-brand-cream-soft px-4 py-3 text-sm space-y-0.5">
          <p className="font-semibold text-brand-black">{pedido.trabajador_nombre}</p>
          <p className="text-brand-brown/65 text-xs">CC {pedido.trabajador_cedula} · {pedido.punto_nombre}</p>
          <p className="font-bold text-brand-black pt-1">{money(Number(pedido.total))}</p>
        </div>
        {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} disabled={ejecutando}
            className="flex-1 h-10 rounded-xl border border-brand-brown/25 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={ejecutando}
            className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50 ${cfg.color}`}>
            {ejecutando ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Icon d={cfg.icon} cls="h-4 w-4" />}
            {ejecutando ? "Aplicando…" : cfg.btn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CreditoEmpleadosPage() {
  const [usuario]   = useState(() => getUsuario());
  const [puntos, setPuntos]         = useState<PuntoVenta[]>([]);
  const [pedidos, setPedidos]       = useState<PedidoCredito[]>([]);
  const [cargando, setCargando]     = useState(false);
  const [errorPedidos, setErrorPedidos] = useState<string | null>(null);

  const [filtroCedula, setFiltroCedula] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroDesde, setFiltroDesde]   = useState("");
  const [filtroHasta, setFiltroHasta]   = useState("");
  const [filtroPunto, setFiltroPunto]   = useState("");

  const [modalNueva, setModalNueva]   = useState(false);
  const [confirmacion, setConfirmacion] = useState<{ pedido: PedidoCredito; nuevoEstado: "facturado" | "anulado" | "pendiente" } | null>(null);

  const puedeCrear         = puedeAccion(usuario, "credito_empleados.pedidos") || puedeAccion(usuario, "credito_empleados");
  const puedeCambiarEstado = puedeAccion(usuario, "credito_empleados.estado")  || puedeAccion(usuario, "credito_empleados");

  useEffect(() => { misPuntosVenta().then(setPuntos).catch(() => setPuntos([])); }, []);

  const cargarPedidos = useCallback(async () => {
    setCargando(true); setErrorPedidos(null);
    try {
      setPedidos(await listarPedidosCredito({
        cedula:   filtroCedula.trim() || undefined,
        estado:   filtroEstado || undefined,
        punto_id: filtroPunto || undefined,
        desde:    filtroDesde || undefined,
        hasta:    filtroHasta || undefined,
      }));
    } catch (e) { setErrorPedidos(e instanceof ApiError ? e.message : "No se pudieron cargar los pedidos."); }
    finally { setCargando(false); }
  }, [filtroCedula, filtroEstado, filtroPunto, filtroDesde, filtroHasta]);

  useEffect(() => { void cargarPedidos(); }, [cargarPedidos]);

  async function ejecutarCambioEstado() {
    if (!confirmacion) return;
    const act = await actualizarEstadoPedidoCredito(confirmacion.pedido.id, confirmacion.nuevoEstado);
    setPedidos((prev) => prev.map((p) => (p.id === act.id ? act : p)));
  }

  const nPendiente     = pedidos.filter((p) => p.estado === "pendiente").length;
  const totalPendiente = pedidos.filter((p) => p.estado === "pendiente").reduce((s, p) => s + Number(p.total || 0), 0);
  const totalFacturado = pedidos.filter((p) => p.estado === "facturado").reduce((s, p) => s + Number(p.total || 0), 0);

  const kpis = [
    { label: "Total pedidos",  val: String(pedidos.length),  color: "text-brand-black",   bg: "bg-brand-brown/8",  ico: Ico.wallet  },
    { label: "Pendientes",     val: String(nPendiente),       color: "text-amber-700",     bg: "bg-amber-50",       ico: Ico.clock   },
    { label: "Por cobrar",     val: money(totalPendiente),    color: "text-amber-700",     bg: "bg-amber-50",       ico: Ico.arrowUp },
    { label: "Facturado",      val: money(totalFacturado),    color: "text-brand-wine",   bg: "bg-brand-wine/5",     ico: Ico.check   },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-brand-wine">Compras a crédito</h1>
          <p className="mt-0.5 text-sm text-brand-brown/60">Registro de compras de colaboradores contra su cupo asignado.</p>
        </div>
        {puedeCrear && (
          <button type="button" onClick={() => setModalNueva(true)}
            className="flex h-10 items-center gap-2 rounded-xl bg-brand-wine px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-wine/90">
            <Icon d={Ico.plus} cls="h-4 w-4" />
            Nueva compra
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex items-center gap-3 rounded-2xl border border-brand-brown/10 bg-white px-4 py-3 shadow-sm">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${k.bg}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={`h-5 w-5 ${k.color}`}>
                {k.ico}
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-brand-brown/55">{k.label}</p>
              <p className={`mt-0.5 text-base font-bold tabular-nums truncate ${k.color}`}>{k.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-brand-brown/8 px-4 py-3">
          <Icon d={Ico.filter} cls="h-4 w-4 text-brand-brown/40" />
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-brown/50">Filtros</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 px-4 py-3">
          {/* Cédula */}
          <div className="min-w-[130px] flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Cédula</label>
            <div className="relative">
              <Icon d={Ico.user} cls="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-brown/35" />
              <input value={filtroCedula} onChange={(e) => setFiltroCedula(e.target.value.replace(/\D/g, ""))}
                placeholder="Filtrar por cédula"
                className="h-9 w-full rounded-lg border border-brand-brown/20 pl-8 pr-2.5 text-sm outline-none transition focus:border-brand-wine" />
            </div>
          </div>
          {/* Estado */}
          <div className="min-w-[110px]">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Estado</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
              className="h-9 rounded-lg border border-brand-brown/20 bg-white px-2.5 text-sm outline-none transition focus:border-brand-wine">
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="facturado">Facturado</option>
              <option value="anulado">Anulado</option>
            </select>
          </div>
          {/* Desde */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">
              <Icon d={Ico.calendar} cls="h-3 w-3" />Desde
            </label>
            <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)}
              className="h-9 rounded-lg border border-brand-brown/20 px-2.5 text-sm outline-none transition focus:border-brand-wine [color-scheme:light]" />
          </div>
          {/* Hasta */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">
              <Icon d={Ico.calendar} cls="h-3 w-3" />Hasta
            </label>
            <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)}
              className="h-9 rounded-lg border border-brand-brown/20 px-2.5 text-sm outline-none transition focus:border-brand-wine [color-scheme:light]" />
          </div>
          {/* Punto */}
          {puntos.length > 1 && (
            <div className="min-w-[130px]">
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">
                <Icon d={Ico.store} cls="h-3 w-3" />Punto
              </label>
              <select value={filtroPunto} onChange={(e) => setFiltroPunto(e.target.value)}
                className="h-9 rounded-lg border border-brand-brown/20 bg-white px-2.5 text-sm outline-none transition focus:border-brand-wine">
                <option value="">Todos</option>
                {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          )}
          <button type="button" onClick={() => void cargarPedidos()}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-brand-wine px-4 text-sm font-semibold text-brand-wine transition hover:bg-brand-wine/5">
            <Icon d={Ico.search} cls="h-3.5 w-3.5" />Filtrar
          </button>
          {(filtroCedula || filtroEstado || filtroDesde || filtroHasta || filtroPunto) && (
            <button type="button" onClick={() => { setFiltroCedula(""); setFiltroEstado(""); setFiltroDesde(""); setFiltroHasta(""); setFiltroPunto(""); }}
              className="h-9 rounded-lg border border-brand-brown/20 px-3 text-sm text-brand-brown/60 transition hover:bg-brand-cream-soft">
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        {errorPedidos && (
          <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-sm text-rose-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            {errorPedidos}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brand-brown/10 bg-neutral-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Colaborador</th>
                <th className="px-4 py-3">Punto</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Observación</th>
                {puedeCambiarEstado && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-brand-brown/50">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-wine border-t-transparent align-middle" />
                    <span className="ml-2 align-middle">Cargando…</span>
                  </td>
                </tr>
              ) : pedidos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-brown/8 text-brand-brown/30">
                      <Icon d={Ico.wallet} cls="h-7 w-7" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-brand-brown/50">No hay compras para los filtros aplicados</p>
                    <p className="mt-1 text-xs text-brand-brown/35">Ajusta los filtros o registra una nueva compra</p>
                  </td>
                </tr>
              ) : (
                pedidos.map((p) => (
                  <tr key={p.id} className="border-b border-brand-brown/8 transition hover:bg-neutral-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-brand-brown/65">{fechaCorta(p.creado_en)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-wine/10 text-[10px] font-bold text-brand-wine">
                          {(p.trabajador_nombre ?? "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-brand-black leading-tight">{p.trabajador_nombre}</p>
                          <p className="text-[11px] text-brand-brown/50">CC {p.trabajador_cedula}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-brand-brown/75">{p.punto_nombre}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-brand-black">
                      {money(Number(p.total) || 0)}
                    </td>
                    <td className="px-4 py-3"><EstadoBadge estado={p.estado} /></td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-xs text-brand-brown/60">
                      {p.observacion || <span className="italic text-brand-brown/25">—</span>}
                    </td>
                    {puedeCambiarEstado && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {p.estado !== "facturado" && (
                            <button onClick={() => setConfirmacion({ pedido: p, nuevoEstado: "facturado" })}
                              className="flex items-center gap-1 rounded-lg border border-brand-wine/25 px-2 py-1 text-[11px] font-semibold text-brand-wine transition hover:bg-brand-wine/5">
                              <Icon d={Ico.check} cls="h-3 w-3" />Facturar
                            </button>
                          )}
                          {p.estado !== "anulado" && (
                            <button onClick={() => setConfirmacion({ pedido: p, nuevoEstado: "anulado" })}
                              className="flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50">
                              <Icon d={Ico.xmark} cls="h-3 w-3" />Anular
                            </button>
                          )}
                          {p.estado !== "pendiente" && (
                            <button onClick={() => setConfirmacion({ pedido: p, nuevoEstado: "pendiente" })}
                              className="flex items-center gap-1 rounded-lg border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-50">
                              <Icon d={Ico.clock} cls="h-3 w-3" />Pendiente
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalNueva && (
        <ModalNuevaCompra puntos={puntos} onClose={() => setModalNueva(false)} onCreado={() => void cargarPedidos()} />
      )}
      {confirmacion && (
        <ModalConfirm pedido={confirmacion.pedido} nuevoEstado={confirmacion.nuevoEstado}
          onClose={() => setConfirmacion(null)} onConfirmar={ejecutarCambioEstado} />
      )}
    </div>
  );
}
