"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import css from "./novedades.module.css";

/** Un paso de la animación: a dónde va el cursor, si hace clic y cuánto dura. */
export interface PasoDemo {
  /** Valor `data-demo` del elemento al que se mueve el cursor. */
  objetivo?: string;
  clic?: boolean;
  /** Duración del paso en ms. */
  dur: number;
  /** Índice del punto de la explicación que se resalta. */
  resalta?: number;
  cursor?: "flecha" | "bloqueado";
}

export interface DemoDef {
  /** Ruta mostrada en la barra (con "/" se antepone el dominio) o función del paso. */
  url: string | ((paso: number) => string);
  pasos: PasoDemo[];
  Escena: (props: { paso: number }) => ReactNode;
}

/** Avanza los pasos en bucle, como un video. */
export function useLineaDeTiempo(pasos: PasoDemo[]) {
  const [paso, setPaso] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setPaso((p) => (p + 1) % pasos.length), pasos[paso]?.dur ?? 1000);
    return () => clearTimeout(t);
  }, [paso, pasos]);
  return paso;
}

/**
 * Ventana simulada de SIGCOMPRO con un cursor que viaja al elemento
 * `[data-demo=objetivo]` de cada paso y "hace clic" con una onda.
 */
export function Escenario({
  url,
  pasos,
  paso,
  children,
}: {
  url: string;
  pasos: PasoDemo[];
  paso: number;
  children: ReactNode;
}) {
  const cuerpoRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const flechaRef = useRef<HTMLDivElement>(null);
  const ondaRef = useRef<HTMLDivElement>(null);
  const actual = pasos[paso];

  const ubicar = useCallback(() => {
    const cuerpo = cuerpoRef.current;
    const cursor = cursorRef.current;
    if (!cuerpo || !cursor) return null;
    const caja = cuerpo.getBoundingClientRect();
    let x = caja.width * 0.62;
    let y = caja.height * 0.72;
    if (actual?.objetivo) {
      const el = cuerpo.querySelector<HTMLElement>(`[data-demo="${actual.objetivo}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        x = r.left - caja.left + Math.min(r.width / 2, 40);
        y = r.top - caja.top + r.height / 2;
      }
    } else if (paso !== 0) {
      return null;
    }
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    return { x, y };
  }, [actual, paso]);

  useLayoutEffect(() => {
    const pos = ubicar();
    if (!actual?.clic || !pos) return;
    // El clic llega cuando el cursor termina de moverse.
    const t = setTimeout(() => {
      const onda = ondaRef.current;
      const flecha = flechaRef.current;
      if (onda) {
        onda.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        onda.firstElementChild?.classList.remove(css.ondaActiva);
        void (onda.firstElementChild as HTMLElement | null)?.offsetWidth;
        onda.firstElementChild?.classList.add(css.ondaActiva);
      }
      if (flecha) {
        flecha.classList.remove(css.presion);
        void flecha.offsetWidth;
        flecha.classList.add(css.presion);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [ubicar, actual]);

  useEffect(() => {
    const cuerpo = cuerpoRef.current;
    if (!cuerpo || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => ubicar());
    ro.observe(cuerpo);
    return () => ro.disconnect();
  }, [ubicar]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand-brown/15 bg-white shadow-xl shadow-brand-brown/10">
      <div className="flex items-center gap-2 border-b border-brand-brown/10 bg-brand-cream-soft px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-2 min-w-0 flex-1 truncate rounded-md bg-white px-2 py-0.5 text-[10px] text-brand-black/60">
          {url.startsWith("/") ? `sigcompro.grupo-santacruz.com${url}` : url}
        </span>
      </div>
      <div ref={cuerpoRef} className="relative min-h-0 flex-1 overflow-hidden bg-brand-cream/40 text-[11px] text-brand-black">
        {children}
        <div ref={ondaRef} className="pointer-events-none absolute left-0 top-0 z-[39]">
          <div className={css.onda} />
        </div>
        <div ref={cursorRef} className={css.cursor}>
          <div ref={flechaRef}>
            {actual?.cursor === "bloqueado" ? (
              <svg viewBox="0 0 24 24" className="h-6 w-6 -translate-x-1/2 -translate-y-1/2">
                <circle cx="12" cy="12" r="9" fill="white" stroke="#dc2626" strokeWidth="2.5" />
                <path d="M6 18 18 6" stroke="#dc2626" strokeWidth="2.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-6 w-6">
                <path d="M4 2.5v17.2l4.6-4.4 3 6.7 3.1-1.4-3-6.6h6.4L4 2.5Z" fill="#1a1614" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Texto que se escribe letra por letra al montarse. */
export function Tecleo({ texto, ms = 70, inicio = 150 }: { texto: string; ms?: number; inicio?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let i = 0;
    let intervalo: ReturnType<typeof setInterval> | undefined;
    const arranque = setTimeout(() => {
      intervalo = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= texto.length && intervalo) clearInterval(intervalo);
      }, ms);
    }, inicio);
    return () => {
      clearTimeout(arranque);
      if (intervalo) clearInterval(intervalo);
    };
  }, [texto, ms, inicio]);
  return (
    <span>
      {texto.slice(0, n)}
      <span className={css.caret} />
    </span>
  );
}

export function MiniBoton({
  demo,
  children,
  tono = "vino",
  activo,
  deshabilitado,
  className = "",
}: {
  demo?: string;
  children: ReactNode;
  tono?: "vino" | "ambar" | "borde" | "cielo";
  activo?: boolean;
  deshabilitado?: boolean;
  className?: string;
}) {
  const tonos = {
    vino: "bg-brand-wine text-white",
    ambar: "bg-brand-amber text-white",
    borde: "border border-brand-brown/20 bg-white text-brand-brown",
    cielo: "border border-sky-200 bg-sky-50 text-sky-700",
  } as const;
  return (
    <span
      data-demo={demo}
      className={`inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition ${tonos[tono]} ${
        activo ? `ring-2 ring-brand-amber ring-offset-1 ${css.pulso}` : ""
      } ${deshabilitado ? "opacity-40" : ""} ${className}`}
    >
      {children}
    </span>
  );
}

export function MiniRadio({ demo, marcado, children }: { demo?: string; marcado: boolean; children: ReactNode }) {
  return (
    <span data-demo={demo} className="inline-flex items-center gap-1.5">
      <span
        className={`flex h-3 w-3 items-center justify-center rounded-full border transition ${
          marcado ? "border-brand-amber" : "border-brand-black/40"
        }`}
      >
        {marcado && <span className={`h-1.5 w-1.5 rounded-full bg-brand-amber ${css.pop}`} />}
      </span>
      {children}
    </span>
  );
}

export function MiniCampo({
  etiqueta,
  children,
  demo,
  foco,
  className = "",
}: {
  etiqueta: string;
  children?: ReactNode;
  demo?: string;
  foco?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-black/60">{etiqueta}</p>
      <div
        data-demo={demo}
        className={`min-h-[22px] rounded-md border bg-white px-2 py-1 transition ${
          foco ? "border-brand-amber ring-2 ring-brand-amber/30" : "border-brand-brown/15"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function MiniToast({ children, tono = "verde" }: { children: ReactNode; tono?: "verde" | "cielo" }) {
  return (
    <div
      className={`absolute bottom-3 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-xl border px-3 py-2 font-semibold shadow-lg ${
        tono === "verde" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-200 bg-sky-50 text-sky-800"
      }`}
    >
      <span className={`block ${css.pop}`}>{children}</span>
    </div>
  );
}

export { css as estilosNovedades };
