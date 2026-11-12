"use client";

import { estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1400, resalta: 0 },
  { objetivo: "x-aviso", clic: true, dur: 1800, resalta: 1 },
  { dur: 2400, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="relative h-full p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-brand-black/50">Despacho</p>
      <div className="mt-2 space-y-1.5">
        {[1, 2, 3].map((k) => (
          <div key={k} className="h-9 rounded-lg border border-brand-brown/10 bg-white" />
        ))}
      </div>
      {paso < 2 && (
        <div className="absolute right-4 top-3 flex items-center overflow-hidden rounded-full bg-red-600 text-white shadow-lg ring-2 ring-white/70">
          <span className="flex items-center gap-1.5 py-1 pl-1.5 pr-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[9px]">⚠</span>
            <span className="leading-tight">
              <span className="block text-[11px] font-bold">1</span>
              <span className="block text-[7px] font-semibold uppercase">pedido en riesgo</span>
            </span>
          </span>
          <span
            data-demo="x-aviso"
            className={`self-stretch border-l border-white/25 px-2 py-2 text-[10px] ${paso === 1 ? "bg-red-700" : ""}`}
          >
            ✕
          </span>
        </div>
      )}
      {paso === 2 && (
        <p className={`absolute inset-x-4 bottom-3 rounded-lg bg-emerald-50 px-2 py-1 text-center text-[9.5px] font-semibold text-emerald-700 ${css.aparecer}`}>
          Aviso oculto · vuelve solo si entra un pedido nuevo en riesgo
        </p>
      )}
    </div>
  );
}

const demo: DemoDef = { url: "/despacho", pasos, Escena };
export default demo;
