"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1000, resalta: 0 },
  { objetivo: "btn-r2", dur: 900, resalta: 0 },
  { objetivo: "btn-r2", dur: 2600, resalta: 0, cursor: "bloqueado" },
  { objetivo: "chip-r1", dur: 2300, resalta: 1 },
  { objetivo: "btn-r2", dur: 900, resalta: 1 },
  { objetivo: "btn-r2", clic: true, dur: 2800, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  const r1Asignada = paso >= 3;
  const r2Creada = paso >= 5;
  const bloqueado = !r1Asignada;
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className={`w-full max-w-[300px] rounded-xl border border-brand-brown/10 bg-white p-3 shadow-md ${css.aparecer}`}>
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase text-brand-black/50">Despacho · 4CS00005901</p>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-bold text-indigo-700">Despachado</span>
        </div>
        <p className="font-semibold">Restaurante El Puerto</p>
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1">
          <p className="text-[8.5px] font-bold uppercase text-emerald-700">Domiciliario (Drivin)</p>
          <p className="font-semibold text-emerald-900">Arturo de Jesus Goez Rivas</p>
        </div>

        <p className="mb-1 mt-2.5 text-[9px] font-bold uppercase tracking-wide text-brand-black/60">Réplicas (mismo pedido por partes)</p>
        <div className="relative flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const usada = n === 1 || (n === 2 && r2Creada);
            const deshab = n > 2 || (n === 2 && (bloqueado || r2Creada));
            return (
              <span
                key={n}
                data-demo={`btn-r${n}`}
                className={`flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-bold transition ${
                  usada
                    ? "border-brand-wine bg-brand-wine text-white"
                    : deshab
                      ? "border-brand-brown/15 text-brand-black/30"
                      : `border-brand-amber text-brand-amber ${css.pulso}`
                }`}
              >
                {n}
              </span>
            );
          })}
          {paso === 2 && (
            <div className={`absolute -top-9 left-4 z-20 whitespace-nowrap rounded-lg bg-brand-black px-2 py-1 text-[9.5px] text-white shadow-lg ${css.pop}`}>
              Espera a que Drivin asigne la réplica 1
            </div>
          )}
        </div>

        <div className="mt-2 space-y-1">
          <div data-demo="chip-r1" className="flex items-center justify-between rounded-md bg-brand-cream-soft px-2 py-1">
            <span className="font-semibold">Réplica 1 · 4CS00005901-1</span>
            {r1Asignada ? (
              <span key="asig" className={`rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700 ${css.pop}`}>
                Asignada · Carlos M.
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">En espera</span>
            )}
          </div>
          {r2Creada && (
            <div className={`flex items-center justify-between rounded-md bg-brand-cream-soft px-2 py-1 ${css.aparecer}`}>
              <span className="font-semibold">Réplica 2 · 4CS00005901-2</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">Enviada a Drivin</span>
            </div>
          )}
        </div>
        <MiniBoton tono="vino" className="mt-2 w-full opacity-60">
          Despachado
        </MiniBoton>
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/despacho", pasos, Escena };
export default demo;
