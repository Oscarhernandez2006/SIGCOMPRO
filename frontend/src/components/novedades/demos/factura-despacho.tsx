"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "numero", clic: true, dur: 1700, resalta: 0 },
  { objetivo: "valor", clic: true, dur: 2000, resalta: 1 },
  { objetivo: "facturado", dur: 2200, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="flex h-full items-start justify-center p-4">
      <div className="w-[200px] space-y-1.5 rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md">
        <p className="text-[8px] font-bold uppercase text-brand-black/50">Facturación</p>
        <div data-demo="numero" className={`rounded-md border px-2 py-1 text-[9.5px] ${paso === 1 ? "border-brand-amber" : "border-brand-brown/15"}`}>
          {paso >= 1 ? "10269" : <span className="text-brand-black/30">N° factura</span>}
        </div>
        <div data-demo="valor" className={`flex items-center justify-between rounded-md border px-2 py-1 text-[9.5px] ${paso === 2 ? "border-brand-amber" : "border-brand-brown/15"}`}>
          {paso >= 2 ? "466681" : <span className="text-brand-black/30">Valor factura</span>}
          <span className={`text-[8px] text-brand-black/30 line-through ${paso >= 2 ? css.aparecer : "opacity-0"}`}>⇅</span>
        </div>
        {paso >= 3 && (
          <p className={`text-[8.5px] font-semibold text-emerald-700 ${css.aparecer}`}>
            ✓ El número sigue en 10269 y el valor no tiene flechas
          </p>
        )}
        <MiniBoton demo="facturado" tono="ambar" className="w-full">
          Facturado
        </MiniBoton>
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/despacho", pasos, Escena };
export default demo;
