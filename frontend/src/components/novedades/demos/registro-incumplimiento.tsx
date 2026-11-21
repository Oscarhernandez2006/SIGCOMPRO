"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1300, resalta: 0 },
  { objetivo: "switch", clic: true, dur: 1800, resalta: 0 },
  { objetivo: "motivo", clic: true, dur: 1800, resalta: 1 },
  { objetivo: "boton", dur: 2200, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  const anular = paso >= 1;
  const conMotivo = paso >= 2;
  return (
    <div className="flex h-full items-start justify-center p-3">
      <div className={`w-full max-w-[300px] rounded-xl border border-brand-brown/10 bg-white shadow-xl ${css.pop}`}>
        <div className="border-b border-brand-brown/10 bg-red-50/60 px-3 py-2">
          <p className="text-[11px] font-bold text-brand-wine">Marcar pedido no gestionado</p>
        </div>
        <div className="space-y-1 px-3 py-2 text-[8.5px]">
          <p className="font-semibold">Descripción de lo ocurrido</p>
          <div className="h-6 rounded-md border border-brand-brown/15 px-1.5 py-1">Quedó facturado sin asignar en Drivin…</div>
        </div>
        {anular && (
          <div className={`flex items-center gap-1 border-t border-red-100 bg-red-50/70 px-3 py-1.5 text-[8.5px] ${css.aparecer}`}>
            <span className="font-semibold text-red-800">Motivo de anulación *</span>
            <span
              data-demo="motivo"
              className={`flex-1 rounded border bg-white px-1 py-0.5 ${conMotivo ? "border-red-200" : "border-red-400 text-brand-black/40"}`}
            >
              {conMotivo ? "Sin gestión del día" : "Selecciona el motivo…"}
            </span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-brand-brown/10 px-3 py-1.5 text-[8.5px]">
          {anular && !conMotivo && <span className="text-red-700">Falta: motivo de anulación</span>}
          <span data-demo="switch" className="flex items-center gap-1 font-semibold">
            <span className={`h-3 w-5 rounded-full ${anular ? "bg-emerald-500" : "bg-neutral-300"}`} />
            Anular pedido
          </span>
          <span data-demo="boton">
            <MiniBoton className={`bg-red-700 text-white ${anular && !conMotivo ? "opacity-50" : ""}`}>
              {anular ? "Registrar y anular" : "Confirmar"}
            </MiniBoton>
          </span>
        </div>
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/admin/despacho", pasos, Escena };
export default demo;
