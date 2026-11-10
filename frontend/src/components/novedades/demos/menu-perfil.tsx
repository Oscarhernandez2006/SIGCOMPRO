"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "avatar", dur: 1100, resalta: 0 },
  { objetivo: "avatar", clic: true, dur: 1500, resalta: 1 },
  { objetivo: "item-novedades", dur: 1000, resalta: 1 },
  { objetivo: "item-novedades", clic: true, dur: 2800, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  const menu = paso >= 2 && paso < 4;
  return (
    <div className="relative flex h-full flex-col p-4">
      <div className="flex items-center justify-end gap-2">
        <div className="text-right">
          <p className="text-[10px] font-semibold">Carlos Mejia Peña</p>
          <p className="text-[9px] text-brand-black/55">Administrador App</p>
        </div>
        <span
          data-demo="avatar"
          className={`flex h-7 w-7 items-center justify-center rounded-full bg-brand-wine text-[10px] font-bold text-white transition ${
            paso === 1 ? "ring-2 ring-brand-amber/60" : ""
          }`}
        >
          CM
        </span>
      </div>

      {menu && (
        <div className={`absolute right-4 top-12 w-[170px] overflow-hidden rounded-xl border border-brand-brown/10 bg-white shadow-lg ${css.pop}`}>
          <div className="border-b border-brand-brown/10 px-3 py-2">
            <p className="text-[10px] font-semibold">Carlos Mejia Peña</p>
            <p className="text-[9px] text-brand-black/55">administrador app</p>
          </div>
          <div
            data-demo="item-novedades"
            className={`flex items-center gap-2 px-3 py-2 text-[10px] font-medium ${paso === 3 ? "bg-brand-cream-soft" : ""}`}
          >
            <span>✨</span>
            <span>
              Novedades
              <span className="block text-[8.5px] font-normal text-brand-black/55">Ver de nuevo las funciones nuevas</span>
            </span>
          </div>
        </div>
      )}

      {paso >= 4 && (
        <div className={`mx-auto mt-6 w-[250px] overflow-hidden rounded-xl bg-white shadow-xl ${css.pop}`}>
          <div className="bg-brand-wine px-3 py-2 text-white">
            <p className="text-[8px] uppercase tracking-wider text-white/80">Novedades de SIGCOMPRO</p>
            <p className="text-[11px] font-bold">Hola, Carlos: esto es lo nuevo</p>
          </div>
          <div className="space-y-1.5 p-3">
            <div className="h-14 rounded-md bg-brand-cream-soft" />
            <p className="text-[9.5px] font-semibold text-brand-wine">Nueva clasificación: Fundación</p>
            <div className="flex justify-end">
              <MiniBoton tono="vino">Entendido →</MiniBoton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const demo: DemoDef = { url: "/admin/dashboard", pasos, Escena };
export default demo;
