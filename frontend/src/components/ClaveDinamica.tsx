"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { obtenerClavesDinamicas, type ClaveDinamicaPunto } from "@/lib/clave-dinamica";

/**
 * Botón "Ver claves dinámicas": abre un modal con la clave vigente de CADA
 * punto de venta. Cada código es de un solo uso y solo sirve en su punto
 * (una clave de un punto no autoriza acciones en otro). Solo se debe
 * renderizar para los roles autorizados (administrador app / desarrollador).
 */
export default function ClaveDinamica() {
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);
  const [claves, setClaves] = useState<ClaveDinamicaPunto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [restantes, setRestantes] = useState<Record<string, number>>({});

  // Necesario para usar createPortal (document solo existe en el cliente).
  useEffect(() => setMontado(true), []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await obtenerClavesDinamicas();
      setClaves(data);
      setRestantes(Object.fromEntries(data.map((c) => [c.puntoVentaId, c.expiraEn])));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  // Mientras el modal está abierto, refresca cada pocos segundos: cualquier
  // otro usuario pudo haber consumido el código de un punto entre tanto.
  useEffect(() => {
    if (!abierto) return;
    cargar();
    const id = setInterval(cargar, 5000);
    return () => clearInterval(id);
  }, [abierto, cargar]);

  // Cuenta regresiva local (segundo a segundo) entre cada refresco del servidor.
  useEffect(() => {
    if (!abierto) return;
    const intervalo = setInterval(() => {
      setRestantes((prev) => {
        const next: Record<string, number> = {};
        for (const [puntoVentaId, s] of Object.entries(prev)) next[puntoVentaId] = Math.max(0, s - 1);
        return next;
      });
    }, 1000);
    return () => clearInterval(intervalo);
  }, [abierto]);

  const copiar = async (puntoVentaId: string, codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(puntoVentaId);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      /* Clipboard no disponible: ignorar. */
    }
  };

  const cerrar = () => {
    setAbierto(false);
    setBusqueda("");
  };

  const normalizar = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const filtro = normalizar(busqueda.trim());
  const clavesFiltradas = filtro
    ? claves.filter((c) => normalizar(c.puntoVentaNombre).includes(filtro))
    : claves;

  const formatTiempo = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-2 rounded-xl border border-brand-wine/20 bg-brand-wine/5 px-3 py-1.5 text-xs font-semibold text-brand-wine transition hover:bg-brand-wine/10"
        title="Ver la clave dinámica vigente de cada punto de venta"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
          />
        </svg>
        Ver claves dinámicas
      </button>

      {montado && abierto && createPortal(
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-brand-black/50 p-4"
          onClick={cerrar}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-brand-brown/10 px-5 py-4">
              <h2 className="font-serif text-lg font-bold text-brand-wine">Claves dinámicas por punto</h2>
              <button
                type="button"
                onClick={cerrar}
                className="rounded-lg p-1 text-brand-brown/50 hover:bg-brand-brown/5"
                aria-label="Cerrar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="border-b border-brand-brown/10 px-4 py-3">
              <div className="relative">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-wine/50">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar punto de venta…"
                  className="w-full rounded-xl border border-brand-wine/20 bg-brand-wine/5 py-1.5 pl-8 pr-3 text-sm text-brand-black placeholder:text-brand-brown/40 focus:border-brand-wine/40 focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
              {error && <p className="text-sm text-red-600">No se pudieron cargar las claves.</p>}
              {!error && !cargando && clavesFiltradas.length === 0 && (
                <p className="text-sm text-brand-brown/60">
                  {claves.length === 0 ? "No hay puntos de venta activos." : "Ningún punto coincide con la búsqueda."}
                </p>
              )}
              {clavesFiltradas.map((c) => {
                const fmt = `${c.codigo.slice(0, 3)} ${c.codigo.slice(3)}`;
                const restante = restantes[c.puntoVentaId] ?? c.expiraEn;
                const porVencer = restante <= 30;
                const progreso = Math.max(0, Math.min(1, restante / (c.duracion || 300)));
                return (
                  <div
                    key={c.puntoVentaId}
                    className="flex items-center gap-3 rounded-xl border border-brand-wine/15 bg-brand-wine/5 px-3 py-2"
                  >
                    {/* Anillo de tiempo restante, mismo estilo del widget clásico */}
                    <div className="relative h-9 w-9 shrink-0" title="Tiempo restante antes de que cambie sola">
                      <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-brand-wine/15" />
                        <circle
                          cx="18"
                          cy="18"
                          r="15"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          className={porVencer ? "text-red-500 transition-all" : "text-brand-wine transition-all"}
                          strokeDasharray={2 * Math.PI * 15}
                          strokeDashoffset={2 * Math.PI * 15 * (1 - progreso)}
                        />
                      </svg>
                      <span
                        className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums ${
                          porVencer ? "text-red-500" : "text-brand-wine"
                        }`}
                      >
                        {formatTiempo(restante)}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-brand-brown/70">{c.puntoVentaNombre}</p>
                      <p className="font-mono text-lg font-bold tracking-[0.15em] text-brand-wine tabular-nums">
                        {fmt}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => copiar(c.puntoVentaId, c.codigo)}
                      title={copiado === c.puntoVentaId ? "¡Copiada!" : "Copiar la clave"}
                      className="shrink-0 rounded-lg border border-brand-wine/20 p-1.5 text-brand-wine transition hover:bg-brand-wine/10"
                    >
                      {copiado === c.puntoVentaId ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 text-emerald-600">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="border-t border-brand-brown/10 px-5 py-3 text-[11px] leading-snug text-brand-brown/50">
              Cada código es de un solo uso y solo sirve en su punto de venta. Cambia automáticamente al usarse o tras 5 minutos sin usarse.
            </p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

