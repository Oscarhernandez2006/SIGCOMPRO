"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { consultarCreditoPorCedula, type TrabajadorCredito } from "@/lib/credito-empleados";

const fmtCop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const money = (v: number) => fmtCop.format(Number.isFinite(v) ? v : 0);

function fmtFechaLarga(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function diasRestantes(iso: string | null): number | null {
  if (!iso) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T12:00:00");
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - hoy.getTime()) / 86_400_000);
}

export default function ConsultaCreditoPage() {
  const [cedula, setCedula]           = useState("");
  const [trabajador, setTrabajador]   = useState<TrabajadorCredito | null>(null);
  const [buscando, setBuscando]       = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const c = cedula.trim();
    if (!c) { setError("Ingresa tu número de cédula."); return; }
    setBuscando(true); setError(null); setTrabajador(null);
    try {
      const t = await consultarCreditoPorCedula(c);
      setTrabajador(t);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("No se encontró ningún colaborador con esa cédula.");
      } else {
        setError(err instanceof ApiError ? err.message : "No se pudo consultar el crédito.");
      }
    } finally { setBuscando(false); }
  }

  function limpiar() {
    setTrabajador(null);
    setCedula("");
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const disponible = Number(trabajador?.cupo_disponible ?? 0);
  const dias       = diasRestantes(trabajador?.fecha_proximo_descuento ?? null);

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-start py-8">

      {/* Encabezado */}
      <div className="mb-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-wine/10 text-brand-wine mb-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
          </svg>
        </div>
        <h1 className="font-serif text-2xl font-bold text-brand-wine">Consultar mi crédito</h1>
        <p className="mt-1 text-sm text-brand-brown/60">Ingresa tu cédula para ver el estado de tu crédito</p>
      </div>

      {/* Buscador */}
      {!trabajador && (
        <form onSubmit={buscar} className="w-full max-w-sm space-y-3">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-brown/35">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            <input
              ref={inputRef}
              value={cedula}
              onChange={(e) => { setCedula(e.target.value.replace(/\D/g, "")); setError(null); }}
              inputMode="numeric"
              autoFocus
              placeholder="Número de cédula"
              className="h-14 w-full rounded-2xl border border-brand-brown/20 pl-11 pr-4 text-lg outline-none transition focus:border-brand-wine focus:ring-2 focus:ring-brand-wine/20"
            />
          </div>
          {error && (
            <p className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              {error}
            </p>
          )}
          <button type="submit" disabled={buscando || !cedula}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-wine text-base font-bold text-white transition hover:bg-brand-wine/90 disabled:opacity-50">
            {buscando
              ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />Consultando…</>
              : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" /></svg>Consultar</>}
          </button>
        </form>
      )}

      {/* Tarjeta de resultado */}
      {trabajador && (
        <div className="w-full max-w-sm space-y-4">

          {/* Avatar + nombre */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-wine/10 text-2xl font-bold text-brand-wine">
              {trabajador.nombre.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <h2 className="mt-2 font-serif text-xl font-bold text-brand-black">{trabajador.nombre}</h2>
            <p className="text-sm text-brand-brown/55">CC {trabajador.cedula}</p>
            {!trabajador.activo && (
              <span className="mt-1.5 inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-0.5 text-xs font-bold text-rose-700">
                Crédito inactivo
              </span>
            )}
          </div>

          {/* Stats grandes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-brand-brown/10 bg-white p-4 text-center shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-brown/50">Cupo total</p>
              <p className="mt-1 text-xl font-bold text-brand-black">{money(Number(trabajador.cupo_asignado))}</p>
            </div>
            <div className="rounded-2xl border border-brand-brown/10 bg-white p-4 text-center shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-brown/50">Deuda actual</p>
              <p className="mt-1 text-xl font-bold text-amber-700">{money(Number(trabajador.deuda_vigente))}</p>
            </div>
          </div>

          {/* Disponible (grande) */}
          <div className={`rounded-2xl border-2 p-5 text-center shadow-sm ${disponible > 0 ? "border-brand-wine/25 bg-brand-wine/5" : "border-rose-200 bg-rose-50"}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-brown/50">Disponible para comprar</p>
            <p className={`mt-1 text-3xl font-extrabold ${disponible > 0 ? "text-brand-wine" : "text-rose-600"}`}>
              {money(disponible)}
            </p>
            {disponible <= 0 && <p className="mt-1 text-xs text-rose-600">Has alcanzado tu cupo máximo</p>}
          </div>

          {/* Próximo descuento */}
          {trabajador.fecha_proximo_descuento ? (
            <div className="rounded-2xl border border-brand-brown/10 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-wine/10 text-brand-wine">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-brown/50">Próximo descuento</p>
                  <p className="text-sm font-bold capitalize text-brand-black">{fmtFechaLarga(trabajador.fecha_proximo_descuento)}</p>
                  {dias !== null && (
                    <p className={`text-xs font-medium mt-0.5 ${dias <= 7 ? "text-amber-700" : "text-brand-brown/60"}`}>
                      {dias === 0 ? "¡Es hoy!" : dias < 0 ? `Hace ${Math.abs(dias)} días` : `En ${dias} día${dias === 1 ? "" : "s"}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-brand-brown/10 bg-neutral-50 p-4 text-center">
              <p className="text-xs text-brand-brown/40 italic">Sin fecha de descuento registrada</p>
            </div>
          )}

          {/* Historial de compras */}
          {Number(trabajador.deuda_vigente) > 0 && (
            <div className="rounded-2xl border border-brand-brown/10 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-brown/50">Detalle de deuda</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-brand-brown/70">Cupo usado</span>
                  <span className="font-semibold text-brand-black">
                    {Math.round((Number(trabajador.deuda_vigente) / Number(trabajador.cupo_asignado || 1)) * 100)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-brand-brown/10">
                  <div
                    className={`h-full rounded-full transition-all ${disponible > 0 ? "bg-brand-wine" : "bg-rose-500"}`}
                    style={{ width: `${Math.min(100, Math.round((Number(trabajador.deuda_vigente) / Number(trabajador.cupo_asignado || 1)) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Botón nueva consulta */}
          <button type="button" onClick={limpiar}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-brand-brown/20 h-12 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Nueva consulta
          </button>
        </div>
      )}
    </div>
  );
}
