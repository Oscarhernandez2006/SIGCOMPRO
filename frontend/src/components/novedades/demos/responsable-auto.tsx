"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1300, resalta: 0 },
  { objetivo: "auto", dur: 2600, resalta: 1 },
  { objetivo: "btn-anular", clic: true, dur: 1500, resalta: 2 },
  { objetivo: "confirmar", clic: true, dur: 2200, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="relative flex h-full items-start justify-center p-3">
      <div className={`w-full max-w-[290px] rounded-xl border border-brand-brown/10 bg-white shadow-xl ${css.pop}`}>
        <div className="border-b border-brand-brown/10 bg-red-50/60 px-3 py-2">
          <p className="text-[7.5px] font-bold uppercase tracking-wider text-red-700">Registro de incumplimiento</p>
          <p className="text-[11px] font-bold text-brand-wine">Marcar pedido no gestionado</p>
          <p className="text-[8px] text-brand-black/60">Comanda 10CS00001833 · Alistado · PDV La Granja</p>
        </div>
        <div className="space-y-1.5 px-3 py-2">
          <p className="text-[8.5px] font-semibold">Responsable del pedido</p>
          <div
            data-demo="auto"
            className={`rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[8.5px] text-emerald-800 ${
              paso >= 1 ? css.aparecer : "opacity-0"
            }`}
          >
            <b>Asignado automáticamente:</b> Maura Muñoz · Asignó el porcionador y no continuó la gestión.
          </div>
          <div className="rounded-md border border-brand-brown/20 px-2 py-1 text-[9px]">Maura Muñoz Diaz · Despacho</div>
          <div className="h-6 rounded-md border border-brand-brown/15" />
        </div>
        {paso >= 3 && (
          <div className={`flex items-center gap-1 border-t border-red-100 bg-red-50/70 px-3 py-1.5 text-[8.5px] ${css.aparecer}`}>
            <span className="font-semibold text-red-800">Motivo:</span>
            <span className="flex-1 rounded border border-red-200 bg-white px-1 py-0.5">Sin gestión del día</span>
            <MiniBoton demo="confirmar" className="bg-red-700 text-white">
              Confirmar
            </MiniBoton>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-brand-brown/10 px-3 py-1.5">
          <span
            data-demo="btn-anular"
            className={`rounded-md border border-red-300 px-2 py-0.5 text-[9px] font-semibold text-red-700 ${
              paso === 2 ? "bg-red-50" : ""
            }`}
          >
            ⊘ Anular pedido
          </span>
          <MiniBoton className="bg-red-700 text-white">Registrar incumplimiento</MiniBoton>
        </div>
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/admin/despacho", pasos, Escena };
export default demo;
