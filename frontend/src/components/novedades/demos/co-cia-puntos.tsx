"use client";

import type { ReactNode } from "react";
import { MiniBoton, MiniToast, Tecleo, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "co", clic: true, dur: 1700, resalta: 0 },
  { objetivo: "cia", clic: true, dur: 1500, resalta: 1 },
  { objetivo: "guardar", clic: true, dur: 2400, resalta: 2 },
];

function Campo({ demo, label, activo, children }: { demo?: string; label: string; activo?: boolean; children: ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-[7.5px] font-medium text-brand-brown">{label}</p>
      <div
        data-demo={demo}
        className={`h-[18px] rounded-md border bg-brand-cream-soft px-1.5 font-mono text-[9px] leading-[16px] ${
          activo ? "border-brand-amber ring-1 ring-brand-amber/40" : "border-brand-brown/15"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Escena({ paso }: { paso: number }) {
  return (
    <div className="relative flex h-full items-start justify-center p-4">
      <div className="w-[250px] rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md">
        <p className="text-[8px] font-bold uppercase tracking-wider text-brand-amber">Admin · Puntos de venta</p>
        <p className="mb-1.5 text-[11px] font-bold text-brand-wine">Editar punto · PDV La 93</p>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="col-span-2">
            <Campo label="Nombre"><span className="font-sans">PDV Carnes Santacruz La 93</span></Campo>
          </div>
          <Campo demo="co" label="Centro de operación (C.O.)" activo={paso === 1}>
            {paso === 0 ? <span className="text-brand-black/30">Ej. 405</span> : paso === 1 ? <Tecleo texto="413" ms={160} /> : "413"}
          </Campo>
          <Campo demo="cia" label="Compañía (CIA)" activo={paso === 2}>
            {paso < 2 ? <span className="text-brand-black/30">Ej. 4</span> : paso === 2 ? <Tecleo texto="4" ms={160} /> : "4"}
          </Campo>
        </div>
        <div className="mt-2 flex justify-end">
          <MiniBoton demo="guardar" className="text-[9px]" activo={paso === 3}>
            Guardar
          </MiniBoton>
        </div>
      </div>
      {paso === 3 && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <MiniToast>C.O. 413 · CIA 4 guardados</MiniToast>
        </div>
      )}
    </div>
  );
}

const demo: DemoDef = { url: "/admin/puntos-venta", pasos, Escena };
export default demo;
