"use client";

import { useEffect, useRef, useState } from "react";

const MIN = 1;
const MAX = 6;
const PASO = 1.25;

/**
 * Imagen con zoom y desplazamiento (para comprobantes de pago):
 * rueda del mouse = acercar/alejar donde está el cursor, arrastrar = mover,
 * doble clic = acercar/restablecer, y botones +/−/100 %/pantalla completa.
 */
export default function ZoomImagen({
  src,
  alt,
  className = "",
  alto = "55vh",
}: {
  src: string;
  alt: string;
  className?: string;
  /** Alto del visor (CSS). */
  alto?: string;
}) {
  const [completa, setCompleta] = useState(false);
  useEffect(() => {
    if (!completa) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setCompleta(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [completa]);
  return (
    <>
      <Visor src={src} alt={alt} alto={alto} className={className} onPantallaCompleta={() => setCompleta(true)} />
      {completa && (
        <div
          className="fixed inset-0 z-[90] flex flex-col bg-black/90 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setCompleta(false)}
              title="Cerrar pantalla completa"
              aria-label="Cerrar pantalla completa"
              className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <Visor src={src} alt={alt} alto="100%" className="flex-1" oscuro />
        </div>
      )}
    </>
  );
}

function Visor({
  src,
  alt,
  alto,
  className = "",
  oscuro = false,
  onPantallaCompleta,
}: {
  src: string;
  alt: string;
  alto: string;
  className?: string;
  oscuro?: boolean;
  onPantallaCompleta?: () => void;
}) {
  const contRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const vista = useRef({ escala: 1, pos: { x: 0, y: 0 } });
  const arrastre = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  function aplicar(nuevaEscala: number, nuevaPos: { x: number; y: number }) {
    const e = Math.min(MAX, Math.max(MIN, nuevaEscala));
    const p = e === MIN ? { x: 0, y: 0 } : nuevaPos;
    vista.current = { escala: e, pos: p };
    setEscala(e);
    setPos(p);
  }

  /** Zoom manteniendo fijo el punto (cx, cy) relativo al centro del visor. */
  function zoomEn(factor: number, cx = 0, cy = 0) {
    const { escala: s, pos: o } = vista.current;
    const s2 = Math.min(MAX, Math.max(MIN, s * factor));
    aplicar(s2, { x: cx - ((cx - o.x) * s2) / s, y: cy - ((cy - o.y) * s2) / s });
  }

  function puntoRelativo(clientX: number, clientY: number) {
    const r = contRef.current?.getBoundingClientRect();
    if (!r) return { cx: 0, cy: 0 };
    return { cx: clientX - (r.left + r.width / 2), cy: clientY - (r.top + r.height / 2) };
  }

  // La rueda se escucha de forma NO pasiva para poder evitar el scroll de la página.
  useEffect(() => {
    const el = contRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - (r.left + r.width / 2);
      const cy = e.clientY - (r.top + r.height / 2);
      const { escala: s, pos: o } = vista.current;
      const s2 = Math.min(MAX, Math.max(MIN, s * (e.deltaY < 0 ? PASO : 1 / PASO)));
      const p = s2 === MIN ? { x: 0, y: 0 } : { x: cx - ((cx - o.x) * s2) / s, y: cy - ((cy - o.y) * s2) / s };
      vista.current = { escala: s2, pos: p };
      setEscala(s2);
      setPos(p);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const ampliada = escala > MIN;
  const boton = oscuro
    ? "bg-white/15 text-white hover:bg-white/25"
    : "bg-white/90 text-brand-brown shadow hover:bg-white";

  return (
    <div className={`relative ${className}`}>
      <div
        ref={contRef}
        style={{ height: alto }}
        className={`relative flex touch-none select-none items-center justify-center overflow-hidden rounded-lg ${
          ampliada ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
        }`}
        onPointerDown={(e) => {
          if (!ampliada) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          arrastre.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
          setArrastrando(true);
        }}
        onPointerMove={(e) => {
          const a = arrastre.current;
          if (!a) return;
          aplicar(escala, { x: a.px + e.clientX - a.x, y: a.py + e.clientY - a.y });
        }}
        onPointerUp={() => {
          arrastre.current = null;
          setArrastrando(false);
        }}
        onPointerCancel={() => {
          arrastre.current = null;
          setArrastrando(false);
        }}
        onDoubleClick={(e) => {
          if (ampliada) return aplicar(MIN, { x: 0, y: 0 });
          const { cx, cy } = puntoRelativo(e.clientX, e.clientY);
          zoomEn(2.5, cx, cy);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})`,
            transition: arrastrando ? "none" : "transform 80ms ease-out",
          }}
          className="max-h-full max-w-full origin-center object-contain"
        />
      </div>
      <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1">
        <button type="button" onClick={() => zoomEn(1 / PASO)} disabled={!ampliada} title="Alejar" aria-label="Alejar" className={`h-8 w-8 rounded-lg text-lg font-bold leading-none transition disabled:opacity-40 ${boton}`}>
          −
        </button>
        <button type="button" onClick={() => aplicar(MIN, { x: 0, y: 0 })} title="Restablecer (100 %)" className={`h-8 min-w-[3.25rem] rounded-lg px-1.5 text-xs font-semibold transition ${boton}`}>
          {Math.round(escala * 100)} %
        </button>
        <button type="button" onClick={() => zoomEn(PASO)} disabled={escala >= MAX} title="Acercar" aria-label="Acercar" className={`h-8 w-8 rounded-lg text-lg font-bold leading-none transition disabled:opacity-40 ${boton}`}>
          +
        </button>
        {onPantallaCompleta && (
          <button type="button" onClick={onPantallaCompleta} title="Ver en pantalla completa" aria-label="Ver en pantalla completa" className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${boton}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        )}
      </div>
      {!ampliada && (
        <p className={`pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded-md px-2 py-0.5 text-[10px] font-medium sm:block ${oscuro ? "bg-white/15 text-white" : "bg-white/85 text-brand-black/70"}`}>
          Rueda del mouse o doble clic para acercar
        </p>
      )}
    </div>
  );
}
