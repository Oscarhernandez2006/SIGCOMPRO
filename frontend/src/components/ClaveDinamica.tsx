"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { obtenerClaveDinamica } from "@/lib/clave-dinamica";

/**
 * Clave dinámica tipo Nequi: muestra un código de 6 dígitos que rota cada
 * minuto, con un contador regresivo y un botón para copiarlo. Solo se debe
 * renderizar para los roles autorizados (administrador app / desarrollador).
 */
export default function ClaveDinamica() {
  const [codigo, setCodigo] = useState<string>("······");
  const [restante, setRestante] = useState<number>(60);
  const [periodo, setPeriodo] = useState<number>(60);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState(false);
  const cargandoRef = useRef(false);

  const cargar = useCallback(async () => {
    if (cargandoRef.current) return;
    cargandoRef.current = true;
    try {
      const data = await obtenerClaveDinamica();
      setCodigo(data.codigo);
      setRestante(data.expiraEn);
      setPeriodo(data.periodo || 60);
      setError(false);
    } catch {
      setError(true);
    } finally {
      cargandoRef.current = false;
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Contador regresivo: al llegar a 0 recarga la nueva clave.
  useEffect(() => {
    const id = setInterval(() => {
      setRestante((s) => {
        if (s <= 1) {
          cargar();
          return periodo;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [cargar, periodo]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* Clipboard no disponible: ignorar. */
    }
  };

  const fmt = codigo.length === 6 ? `${codigo.slice(0, 3)} ${codigo.slice(3)}` : codigo;
  const progreso = Math.max(0, Math.min(1, restante / periodo));

  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-brand-wine/20 bg-brand-wine/5 px-2.5 py-1.5"
      title="Clave dinámica de autorización (cambia cada minuto)"
    >
      {/* Anillo de tiempo restante */}
      <div className="relative h-8 w-8 shrink-0">
        <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-brand-wine/15" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className={restante <= 10 ? "text-red-500 transition-all" : "text-brand-wine transition-all"}
            strokeDasharray={2 * Math.PI * 15}
            strokeDashoffset={2 * Math.PI * 15 * (1 - progreso)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-brand-wine">
          {error ? "!" : restante}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase leading-none tracking-wide text-brand-brown/60">
          Clave dinámica
        </p>
        <p className="font-mono text-base font-bold leading-tight tracking-[0.15em] text-brand-wine tabular-nums">
          {error ? "——— ———" : fmt}
        </p>
      </div>

      <button
        type="button"
        onClick={copiar}
        disabled={error}
        title={copiado ? "¡Copiada!" : "Copiar la clave"}
        aria-label="Copiar la clave dinámica"
        className="shrink-0 rounded-lg border border-brand-wine/20 p-1.5 text-brand-wine transition hover:bg-brand-wine/10 disabled:opacity-40"
      >
        {copiado ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 text-emerald-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
          </svg>
        )}
      </button>
    </div>
  );
}
