"use client";

import { estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1000, resalta: 0 },
  { objetivo: "estado-por-vencer", dur: 2200, resalta: 0 },
  { objetivo: "estado-vencido", dur: 2200, resalta: 1 },
];

const porVencer = [
  { comanda: "3CS00010916", cliente: "Don Carlos Parrilla", estado: "Alistado", color: "border-violet-200 bg-violet-100 text-violet-600", tiempo: "0:06:27" },
  { comanda: "3CS00010922", cliente: "Isabela Davaro", estado: "Pendiente", color: "border-amber-200 bg-amber-100 text-amber-700", tiempo: "0:35:37" },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="flex h-full items-start justify-center p-4">
      <div className="w-[280px] overflow-hidden rounded-xl border border-brand-brown/10 bg-white shadow-md">
        <div className="bg-red-50 px-2.5 py-1.5">
          <p className="font-serif text-[10px] font-bold text-red-700">Alerta de despacho</p>
          <p className="text-[7px] text-red-600/80">Tienes 2 horas para despachar cada pedido desde que ingresa.</p>
        </div>
        <div className="space-y-1 p-2">
          <p className="text-[7px] font-bold uppercase text-brand-amber">Por vencer · queda 1 hora o menos</p>
          {porVencer.map((p, i) => (
            <div key={p.comanda} className="flex items-center gap-1.5 rounded-md border border-brand-amber/30 bg-brand-amber/5 px-1.5 py-1 text-[7.5px]">
              <span className="min-w-0 flex-1 truncate font-semibold">{p.comanda} · <span className="font-normal">{p.cliente}</span></span>
              <span
                data-demo={i === 0 ? "estado-por-vencer" : undefined}
                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[6.5px] font-bold uppercase ${p.color} ${paso >= 1 ? css.aparecer : "opacity-0"}`}
              >
                {p.estado}
              </span>
              <span className="w-9 shrink-0 text-right font-bold tabular-nums text-brand-amber">{p.tiempo}</span>
            </div>
          ))}
          <p className="pt-0.5 text-[7px] font-bold uppercase text-red-600">Vencidos · superaron las 2 horas</p>
          <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-1.5 py-1 text-[7.5px]">
            <span className="min-w-0 flex-1 truncate font-semibold">3CS00010920 · <span className="font-normal">Roberto Maldonado</span></span>
            <span
              data-demo="estado-vencido"
              className={`shrink-0 rounded-full border border-orange-200 bg-orange-100 px-1.5 py-0.5 text-[6.5px] font-bold uppercase text-orange-600 ${paso >= 1 ? css.aparecer : "opacity-0"}`}
            >
              En producción
            </span>
            <span className="w-9 shrink-0 text-right font-bold tabular-nums text-red-600">-0:05:52</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/despacho", pasos, Escena };
export default demo;
