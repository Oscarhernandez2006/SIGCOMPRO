"use client";

import type { ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/* Gráficas minimalistas reutilizables para "Mi resumen".                     */
/* Mismo lenguaje visual que el Dashboard administrativo (SVG puro, sin libs).*/
/* -------------------------------------------------------------------------- */

export const cop = (n: number) => "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");
export const num = (n: number) => (Number(n) || 0).toLocaleString("es-CO");

/** Paleta de colores para series (donuts, leyendas). */
export const PALETA = ["#7b1e3b", "#d98c2b", "#2e7d63", "#2b6cb0", "#8e44ad", "#c0392b", "#16a085", "#e67e22"];

/** Colores fijos por método de pago frecuente (coincide con el dashboard). */
export const COLOR_PAGO: Record<string, string> = {
  transferencia: "#7b1e3b",
  efectivo: "#d98c2b",
  tarjeta: "#2e7d63",
  qr: "#2b6cb0",
  credito: "#8e44ad",
  crédito: "#8e44ad",
  mixto: "#c0392b",
};

/** Etiqueta de sección con barra ámbar (eyebrow). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="h-4 w-1 rounded-full bg-brand-amber" />
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-brown/60">{children}</h2>
    </div>
  );
}

/** Tarjeta contenedora blanca reutilizable. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-sm ${className}`}>{children}</div>
  );
}

/** Cabecera de una tarjeta (título + descripción). */
export function CardHead({ titulo, desc }: { titulo: string; desc?: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-display text-base font-bold tracking-tight text-brand-black">{titulo}</h3>
      {desc && <p className="mt-0.5 text-xs text-brand-brown/55">{desc}</p>}
    </div>
  );
}

/** Donut con leyenda lateral (métodos de pago, tipo de entrega, etc.). */
export function DonutLeyenda({
  data,
  totalLabel,
}: {
  data: { label: string; value: number; color: string }[];
  totalLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-brand-brown/40">Sin datos.</div>;
  }
  const R = 42;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 100 100" className="h-40 w-40 -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="#f1eae2" strokeWidth="14" />
          {data.map((d) => {
            const frac = d.value / total;
            const dash = frac * C;
            const el = (
              <circle
                key={d.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={d.color}
                strokeWidth="14"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-acc * C}
              />
            );
            acc += frac;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl font-extrabold tabular-nums text-brand-black">{num(total)}</span>
          <span className="text-[11px] uppercase tracking-wide text-brand-brown/50">{totalLabel}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 sm:flex-1">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="min-w-0 flex-1 truncate text-brand-brown/80">{d.label}</span>
            <span className="shrink-0 font-display font-bold tabular-nums text-brand-black">{num(d.value)}</span>
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-brand-brown/50">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Anillo de cumplimiento con porcentaje (verde/ámbar/rojo). */
export function AnilloCumplimiento({
  titulo,
  desc,
  pct,
  aTiempo,
  total,
}: {
  titulo: string;
  desc: string;
  pct: number;
  aTiempo: number;
  total: number;
}) {
  const color = total === 0 ? "#c9bfb3" : pct >= 90 ? "#2e7d63" : pct >= 70 ? "#d98c2b" : "#c0392b";
  const R = 42;
  const C = 2 * Math.PI * R;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * C;
  return (
    <Panel>
      <CardHead titulo={titulo} desc={desc} />
      {total === 0 ? (
        <p className="rounded-xl bg-brand-cream-soft px-3 py-6 text-center text-sm text-brand-brown/50">
          Sin datos en el periodo.
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative h-28 w-28 shrink-0">
            <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
              <circle cx="50" cy="50" r={R} fill="none" stroke="#f1eae2" strokeWidth="12" />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={color}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${C - dash}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-xl font-extrabold tabular-nums text-brand-black">{pct.toFixed(0)}%</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="font-display text-2xl font-bold tabular-nums text-brand-black">
              {num(aTiempo)}
              <span className="ml-1.5 text-sm font-semibold text-brand-brown/50">de {num(total)}</span>
            </p>
            <p className="mt-1 text-xs text-brand-brown/60">a tiempo</p>
            {total - aTiempo > 0 && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-500">
                {num(total - aTiempo)} fuera de tiempo
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

export interface FilaBarra {
  nombre: string;
  valor: number;
  /** Métrica secundaria opcional (ej: kilos, pedidos). */
  sub?: string;
}

/** Tabla-ranking con barra de progreso ámbar (productos, clientes, etc.). */
export function TablaTopBarras({
  filas,
  col1,
  colValor,
  formatoValor = cop,
}: {
  filas: FilaBarra[];
  col1: string;
  colValor: string;
  formatoValor?: (n: number) => string;
}) {
  if (filas.length === 0) {
    return (
      <p className="rounded-xl bg-brand-cream-soft px-3 py-6 text-center text-sm text-brand-brown/50">
        Sin datos en el periodo.
      </p>
    );
  }
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-brand-brown/10 text-left text-[11px] uppercase tracking-wide text-brand-brown/50">
          <th className="pb-2 font-semibold">{col1}</th>
          <th className="whitespace-nowrap pb-2 pl-3 text-right font-semibold">{colValor}</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={`${f.nombre}-${i}`} className="border-b border-brand-brown/5 last:border-0">
            <td className="w-full max-w-0 py-2 pr-3">
              <div className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-right text-xs font-bold tabular-nums text-brand-brown/40">{i + 1}</span>
                <span className="truncate font-medium text-brand-black">{f.nombre}</span>
              </div>
              <div className="mt-1 ml-6 h-1.5 overflow-hidden rounded-full bg-brand-cream-soft">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-amber to-brand-amber-light"
                  style={{ width: `${(f.valor / max) * 100}%` }}
                />
              </div>
            </td>
            <td className="py-2 pl-3 text-right align-top">
              <div className="font-display font-bold tabular-nums text-brand-black">{formatoValor(f.valor)}</div>
              {f.sub && <div className="text-[11px] tabular-nums text-brand-brown/50">{f.sub}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Barras horizontales simples de "por día". */
export function BarrasPorDia({
  datos,
  formato,
}: {
  datos: { dia: string; valor: number }[];
  formato: (n: number) => string;
}) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  if (!datos.length) {
    return <p className="text-sm text-brand-brown/50">Sin datos en el periodo.</p>;
  }
  return (
    <div className="space-y-1.5">
      {datos.map((d) => (
        <div key={d.dia} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-[11px] text-brand-brown/60">{d.dia}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-brand-cream-soft">
            <div className="h-full rounded bg-gradient-to-r from-brand-wine to-brand-wine/70" style={{ width: `${(d.valor / max) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right text-[11px] font-semibold text-brand-black">{formato(d.valor)}</span>
        </div>
      ))}
    </div>
  );
}
