"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

interface AvisoPlanes {
  activa: boolean;
  id?: string;
  fecha?: string;
  estado?: "en_curso" | "terminado" | "error" | "interrumpida";
  total?: number;
  listos?: number;
  actual?: { esquemaCodigo: string; puntos: string[]; paso: string } | null;
  pendientes?: number;
}

const PASO: Record<string, string> = {
  creando: "Creando",
  optimizando: "Optimizando",
  aprobando: "Aprobando",
};

/**
 * Aviso global: cuando corre la generación AUTOMÁTICA de planes de Drivin (al
 * cambiar de día, 12:01 a. m.), muestra en cualquier pantalla un modal
 * "Iniciando procesos de planes" con su avance. Se consulta cada 15 s (cada
 * 2 s mientras está activa) y se cierra solo al terminar.
 */
export default function AvisoProcesoPlanes() {
  const [aviso, setAviso] = useState<AvisoPlanes | null>(null);
  const [minimizado, setMinimizado] = useState(false);
  // Corrida que el usuario ya vio terminar (no se vuelve a mostrar).
  const vistaRef = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let t: ReturnType<typeof setTimeout>;
    let enVuelo = false;
    const consultar = async () => {
      if (!vivo) return;
      let siguiente = 15_000;
      if (!enVuelo && getToken() && document.visibilityState === "visible") {
        enVuelo = true;
        try {
          const a = await apiFetch<AvisoPlanes>("/planes-aviso");
          if (!vivo) return;
          if (a.activa && a.id && a.id === vistaRef.current && a.estado !== "en_curso") {
            setAviso(null);
          } else {
            setAviso(a.activa ? a : null);
          }
          if (a.activa && a.estado === "en_curso") siguiente = 2000;
        } catch {
          /* sin sesión o sin red: se reintenta luego */
        } finally {
          enVuelo = false;
        }
      }
      t = setTimeout(consultar, siguiente);
    };
    consultar();
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, []);

  // Al terminar, se muestra el resultado unos segundos y se cierra solo.
  useEffect(() => {
    if (!aviso?.id || aviso.estado === "en_curso") return;
    const id = aviso.id;
    const t = setTimeout(() => {
      vistaRef.current = id;
      setAviso(null);
      setMinimizado(false);
    }, 6000);
    return () => clearTimeout(t);
  }, [aviso?.id, aviso?.estado]);

  if (!aviso?.activa) return null;
  const enCurso = aviso.estado === "en_curso";
  const total = aviso.total ?? 0;
  const listos = aviso.listos ?? 0;
  const pct = total ? Math.round((listos / total) * 100) : 0;
  const fecha = aviso.fecha
    ? new Date(`${aviso.fecha}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
    : "";

  if (minimizado && enCurso) {
    return (
      <button
        onClick={() => setMinimizado(false)}
        title="Ver el proceso de planes"
        className="fixed bottom-24 right-6 z-[95] flex items-center gap-2 rounded-full bg-brand-wine px-4 py-2.5 text-sm font-semibold text-white shadow-xl"
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        Procesos de planes {listos}/{total}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-brand-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-amber/10">
          {enCurso ? (
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-amber border-t-transparent" />
          ) : aviso.estado === "terminado" && !aviso.pendientes ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-9 w-9 text-emerald-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-9 w-9 text-amber-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          )}
        </div>
        <h2 className="mt-4 font-serif text-xl font-bold text-brand-wine">
          {enCurso
            ? "Iniciando procesos de planes"
            : aviso.estado === "terminado" && !aviso.pendientes
              ? "Planes del día listos"
              : "Procesos de planes terminados con pendientes"}
        </h2>
        <p className="mt-1 text-sm capitalize text-brand-black/70">{fecha}</p>
        <p className="mt-3 min-h-[1.25rem] text-sm text-brand-black">
          {enCurso
            ? aviso.actual
              ? `${PASO[aviso.actual.paso] ?? "Procesando"} el plan ${aviso.actual.esquemaCodigo} · ${aviso.actual.puntos.join(", ")}`
              : "Consultando esquemas en Drivin…"
            : aviso.pendientes
              ? `${aviso.pendientes} plan(es) quedaron con algún paso pendiente. Revisa Planes y esquemas.`
              : "Se crearon, optimizaron y aprobaron los planes en Drivin."}
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-brand-cream-soft">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              enCurso ? "bg-brand-amber" : aviso.pendientes ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${enCurso ? Math.max(pct, 5) : 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-brand-black/60">
          {listos}/{total} esquemas
        </p>
        {enCurso ? (
          <button
            onClick={() => setMinimizado(true)}
            className="mt-5 w-full rounded-xl border border-brand-brown/15 px-4 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
          >
            Seguir trabajando (minimizar)
          </button>
        ) : (
          <button
            onClick={() => {
              vistaRef.current = aviso.id ?? null;
              setAviso(null);
            }}
            className="mt-5 w-full rounded-xl bg-brand-wine px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90"
          >
            Entendido
          </button>
        )}
      </div>
    </div>
  );
}
