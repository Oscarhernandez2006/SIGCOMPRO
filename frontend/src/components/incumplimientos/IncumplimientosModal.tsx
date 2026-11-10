"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  eliminarIncumplimiento,
  fichaPersona,
  personasIncumplimientos,
  type FichaPersona,
  type PersonaResumen,
} from "@/lib/incumplimientos";
import { generarInformeIncumplimientos } from "@/lib/informe-incumplimientos";

const diaBogota = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

/** Incumplimientos del personal: personas con pedidos no gestionados, su detalle e informe PDF. */
export default function IncumplimientosModal({ emitidoPor, onCerrar }: { emitidoPor?: string; onCerrar: () => void }) {
  const [personas, setPersonas] = useState<PersonaResumen[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [ficha, setFicha] = useState<FichaPersona | null>(null);
  const [cargandoFicha, setCargandoFicha] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarPersonas = () =>
    personasIncumplimientos()
      .then(setPersonas)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar"));

  useEffect(() => {
    void cargarPersonas();
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  useEffect(() => {
    if (!sel) return;
    let vigente = true;
    fichaPersona(sel)
      .then((f) => vigente && setFicha(f))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "No se pudo cargar la persona"))
      .finally(() => vigente && setCargandoFicha(false));
    return () => {
      vigente = false;
    };
  }, [sel]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (personas ?? []).filter(
      (p) => !q || p.nombre.toLowerCase().includes(q) || p.cedula.includes(q) || p.puntos.join(" ").toLowerCase().includes(q),
    );
  }, [personas, busqueda]);

  const registros = useMemo(
    () =>
      (ficha?.incumplimientos ?? []).filter((r) => {
        const d = diaBogota(r.creadoEn);
        return (!desde || d >= desde) && (!hasta || d <= hasta);
      }),
    [ficha, desde, hasta],
  );

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este registro de incumplimiento? Esta acción no se puede deshacer.")) return;
    try {
      await eliminarIncumplimiento(id);
      setFicha((f) => (f ? { ...f, incumplimientos: f.incumplimientos.filter((r) => r.id !== id) } : f));
      void cargarPersonas();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-brand-black/55 p-2 sm:p-4">
      <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h2 className="font-serif text-xl font-bold text-brand-wine">Incumplimientos del personal</h2>
            <p className="text-xs text-brand-black/60">
              Pedidos marcados como no gestionados al cierre del turno · evidencia para informes
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-brand-black hover:bg-brand-cream-soft"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {error && (
          <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}{" "}
            <button type="button" className="underline" onClick={() => setError(null)}>
              Cerrar
            </button>
          </p>
        )}

        <div className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr]">
          <aside className="flex min-h-0 flex-col border-b border-brand-brown/10 md:border-b-0 md:border-r">
            <div className="p-3">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar persona, cédula o punto"
                className="w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {personas === null ? (
                <p className="px-3 py-6 text-center text-xs text-brand-black/60">Cargando…</p>
              ) : filtradas.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-brand-black/60">
                  {personas.length === 0 ? "Aún no hay incumplimientos registrados." : "Sin resultados."}
                </p>
              ) : (
                filtradas.map((p) => (
                  <button
                    key={p.usuarioId}
                    type="button"
                    onClick={() => {
                      if (sel === p.usuarioId) return;
                      setFicha(null);
                      setCargandoFicha(true);
                      setSel(p.usuarioId);
                    }}
                    className={`mb-1 flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      sel === p.usuarioId
                        ? "border-brand-wine/40 bg-brand-wine/5"
                        : "border-transparent hover:bg-brand-cream-soft"
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700">
                      {p.total}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-brand-black">{p.nombre}</span>
                      <span className="block text-[11px] text-brand-black/60">CC {p.cedula}</span>
                      <span className="block truncate text-[11px] text-brand-black/50">{p.puntos.join(", ")}</span>
                      <span className="block text-[10px] text-brand-black/45">Último: {fechaHora(p.ultimo)}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto bg-brand-cream-soft/30 p-4">
            {!sel ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-brand-black/60">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 h-10 w-10 text-brand-black/30">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.1a7.5 7.5 0 0 1 15 0A17.9 17.9 0 0 1 12 21.75c-2.7 0-5.2-.6-7.5-1.65Z" />
                </svg>
                Selecciona una persona para ver sus registros y generar el informe.
              </div>
            ) : cargandoFicha || !ficha ? (
              <p className="py-10 text-center text-sm text-brand-black/60">Cargando registros…</p>
            ) : (
              <>
                <div className="rounded-2xl border border-brand-brown/10 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-brand-black">{ficha.persona.nombre}</p>
                      <p className="text-xs text-brand-black/60">
                        CC {ficha.persona.cedula} · <span className="capitalize">{ficha.persona.rol || "—"}</span> ·{" "}
                        {ficha.persona.activo ? "Activo" : "Inactivo"}
                      </p>
                      <p className="text-xs text-brand-black/60">Puntos: {ficha.persona.puntos.join(", ") || "—"}</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-[11px] font-semibold text-brand-black">
                        Desde
                        <input
                          type="date"
                          value={desde}
                          onChange={(e) => setDesde(e.target.value)}
                          className="mt-0.5 block rounded-lg border border-brand-brown/20 px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="text-[11px] font-semibold text-brand-black">
                        Hasta
                        <input
                          type="date"
                          value={hasta}
                          onChange={(e) => setHasta(e.target.value)}
                          className="mt-0.5 block rounded-lg border border-brand-brown/20 px-2 py-1 text-xs"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={registros.length === 0}
                        onClick={() => generarInformeIncumplimientos(ficha, registros, { desde, hasta, emitidoPor })}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-wine/90 disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.6a3.4 3.4 0 0 0-3.4-3.4h-1.5A1.1 1.1 0 0 1 13.5 7.1V5.6a3.4 3.4 0 0 0-3.4-3.4H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.6c-.6 0-1.1.5-1.1 1.1v17.3c0 .6.5 1.1 1.1 1.1h12.8c.6 0 1.1-.5 1.1-1.1V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                        Generar informe PDF
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-red-700">
                    {registros.length} incumplimiento{registros.length === 1 ? "" : "s"} en el periodo
                  </p>
                </div>

                <div className="mt-3 space-y-3">
                  {registros.map((r) => (
                    <article key={r.id} className="rounded-2xl border border-brand-brown/10 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-brand-black">
                            Comanda {r.comanda}{" "}
                            <span className="ml-1 rounded-full bg-brand-cream-soft px-2 py-0.5 text-[10px] font-semibold text-brand-brown">
                              {r.estadoPedido}
                            </span>
                          </p>
                          <p className="text-[11px] text-brand-black/60">
                            {fechaHora(r.creadoEn)} · {r.puntoNombre} · Cliente: {r.pedido?.cliente?.nombre || "—"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => eliminar(r.id)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                          title="Eliminar este registro"
                        >
                          Eliminar
                        </button>
                      </div>
                      <div className="mt-2 rounded-xl border-l-4 border-red-600 bg-red-50/60 px-3 py-2">
                        <p className="text-xs font-bold text-red-700">{r.motivo}</p>
                        <p className="mt-0.5 whitespace-pre-line text-xs text-brand-black">{r.descripcion}</p>
                      </div>
                      {r.imagen && (
                        <button type="button" onClick={() => setAmpliada(r.imagen)} className="mt-2 block w-full" title="Ampliar evidencia">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r.imagen} alt={`Evidencia ${r.comanda}`} className="max-h-48 w-full rounded-lg border border-brand-brown/10 object-contain" />
                        </button>
                      )}
                      <p className="mt-2 text-right text-[10px] text-brand-black/50">Registrado por {r.registradoPorNombre}</p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {ampliada && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" onClick={() => setAmpliada(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ampliada} alt="Evidencia ampliada" className="max-h-full max-w-full rounded-lg bg-white" />
        </div>
      )}
    </div>,
    document.body,
  );
}
