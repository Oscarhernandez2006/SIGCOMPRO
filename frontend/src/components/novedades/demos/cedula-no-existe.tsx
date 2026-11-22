"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "aviso", dur: 2200, resalta: 0 },
  { objetivo: "marcar", clic: true, dur: 2200, resalta: 1 },
  { objetivo: "marcado", dur: 2000, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="flex h-full items-start justify-center p-4">
      <div className="w-[240px] space-y-1.5 rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md">
        <p className="text-[9px] font-bold text-brand-wine">Validar cédula · 3765464</p>
        {paso < 3 ? (
          <div
            data-demo="aviso"
            className={`space-y-1 rounded-lg border border-red-200 bg-red-50 p-2 text-center ${paso >= 1 ? css.aparecer : "opacity-0"}`}
          >
            <p className="text-[9px] font-bold text-red-800">La cédula 3765464 no existe en ADRES</p>
            <p className="text-[7.5px] text-red-900/80">Puede ser un error al digitarla o una posible estafa.</p>
            <MiniBoton demo="marcar" tono="vino" className="w-full">
              Marcar cliente no confiable y guardar
            </MiniBoton>
          </div>
        ) : (
          <div data-demo="marcado" className={`rounded-lg border border-brand-brown/10 p-2 ${css.aparecer}`}>
            <p className="text-[9px] font-semibold text-brand-black">
              Luis Echeverri <span className="ml-1 rounded bg-red-100 px-1 text-[7.5px] font-bold text-red-700">No confiable</span>
            </p>
            <p className="text-[7.5px] text-brand-black/60">Motivo: la cédula no existe en ADRES</p>
          </div>
        )}
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/clientes", pasos, Escena };
export default demo;
