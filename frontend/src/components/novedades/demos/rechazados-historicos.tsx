"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { objetivo: "rechazado", dur: 2200, resalta: 0 },
  { objetivo: "historicos", clic: true, dur: 2600, resalta: 1 },
];

const filasHoy = [
  { comanda: "2CS00010931", cliente: "Ana Gómez", estado: "Facturado", color: "bg-emerald-100 text-emerald-600" },
  { comanda: "2CS00010935", cliente: "Luis Pérez", estado: "Pendiente", color: "bg-amber-100 text-amber-700" },
];

function Escena({ paso }: { paso: number }) {
  const enHistoricos = paso >= 1;
  return (
    <div className="flex h-full items-start justify-center p-4">
      <div className="w-[270px] space-y-1.5 rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md">
        <div className="flex items-center justify-between">
          <p className="font-serif text-[11px] font-bold text-brand-wine">{enHistoricos ? "Históricos" : "Pedidos · Hoy"}</p>
          <MiniBoton demo="historicos" tono="borde">Históricos</MiniBoton>
        </div>
        {!enHistoricos && (
          <div className="space-y-1">
            {filasHoy.map((f) => (
              <div key={f.comanda} className="flex items-center justify-between rounded-md border border-brand-brown/10 px-2 py-1 text-[8px]">
                <span className="font-semibold">{f.comanda} · <span className="font-normal">{f.cliente}</span></span>
                <span className={`rounded-full px-1.5 py-0.5 text-[7px] font-bold ${f.color}`}>{f.estado}</span>
              </div>
            ))}
            <div
              data-demo="rechazado"
              className="flex items-center justify-between rounded-md border border-dashed border-rose-200 px-2 py-1 text-[8px] line-through opacity-40"
            >
              <span>2CS00009210 · 13/11/2026</span>
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[7px] font-bold text-rose-600">Rechazado</span>
            </div>
            <p className="text-[7.5px] text-brand-black/60">Los rechazados de días anteriores ya no se quedan en Pedidos.</p>
          </div>
        )}
        {enHistoricos && (
          <div className={`space-y-1 ${css.aparecer}`}>
            <div className="flex items-center justify-between rounded-md border border-rose-200 bg-rose-50/50 px-2 py-1 text-[8px]">
              <span className="font-semibold">2CS00009210 · <span className="font-normal">13/11/2026</span></span>
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[7px] font-bold text-rose-600">Rechazado</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-brand-brown/10 px-2 py-1 text-[8px]">
              <span className="font-semibold">2CS00009179 · <span className="font-normal">12/11/2026</span></span>
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[7px] font-bold text-rose-600">Rechazado</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const demo: DemoDef = { url: (paso) => (paso >= 1 ? "/historicos" : "/pedidos"), pasos, Escena };
export default demo;
