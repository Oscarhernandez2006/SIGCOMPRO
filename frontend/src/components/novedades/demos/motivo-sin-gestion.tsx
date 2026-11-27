"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1300, resalta: 0 },
  { objetivo: "switch-anular", clic: true, dur: 1500, resalta: 0 },
  { objetivo: "motivo-anular", dur: 2300, resalta: 0 },
  { objetivo: "motivo-anular", clic: true, dur: 2200, resalta: 1 },
  { objetivo: "btn-registrar", dur: 1600, resalta: 1 },
];

const OTROS = ["Pedido Doble", "Inventario Agotado", "Items Modificado - Ajuste en Pedido"];

function Escena({ paso }: { paso: number }) {
  const anulando = paso >= 2;
  const lista = paso === 3;
  return (
    <div className="flex h-full items-start justify-center p-4">
      <div className={`w-[250px] rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-xl ${css.pop}`}>
        <p className="text-[7.5px] font-bold uppercase tracking-wider text-red-700">Registro de incumplimiento</p>
        <p className="font-serif text-[11px] font-bold text-brand-wine">Marcar pedido no gestionado</p>
        <div className="mt-1.5 rounded-md bg-brand-cream-soft px-2 py-1 text-[8px] text-brand-black/60">
          Motivo del incumplimiento: <span className="font-semibold text-brand-black">Pedido sin gestionar al cierre del turno</span>
        </div>

        <div
          className={`relative mt-1.5 rounded-md border border-red-200 bg-red-50 p-1.5 transition ${
            anulando ? css.aparecer : "opacity-0"
          }`}
        >
          <p className="mb-0.5 text-[7.5px] font-semibold text-red-800">Motivo de anulación *</p>
          <div
            data-demo="motivo-anular"
            className={`flex items-center justify-between rounded border bg-white px-1.5 py-0.5 text-[8.5px] font-semibold ${
              paso === 2 ? "border-red-400 ring-1 ring-red-300" : "border-red-200"
            }`}
          >
            <span>Sin Gestión del Dia</span>
            <span className="text-[7px] text-brand-black/40">▾</span>
          </div>
          {lista && (
            <div className={`absolute inset-x-1.5 top-[38px] z-10 rounded border border-brand-brown/15 bg-white text-[8px] shadow-lg ${css.aparecer}`}>
              <p className="bg-red-50 px-1.5 py-0.5 font-semibold text-red-800">✓ Sin Gestión del Dia</p>
              {OTROS.map((o) => (
                <p key={o} className="px-1.5 py-0.5 text-brand-black/70">{o}</p>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span data-demo="switch-anular" className="flex items-center gap-1 text-[8px] font-semibold text-red-700">
            <span className={`relative h-2.5 w-5 rounded-full transition ${anulando ? "bg-red-600" : "bg-brand-brown/20"}`}>
              <span className={`absolute top-0.5 h-1.5 w-1.5 rounded-full bg-white transition-all ${anulando ? "left-3" : "left-0.5"}`} />
            </span>
            Anular pedido
          </span>
          <MiniBoton demo="btn-registrar" className="text-[8.5px]" activo={paso === 4}>
            {anulando ? "Registrar y anular" : "Confirmar"}
          </MiniBoton>
        </div>
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/despacho", pasos, Escena };
export default demo;
