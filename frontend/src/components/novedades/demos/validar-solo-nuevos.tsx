"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "editar", clic: true, dur: 1800, resalta: 0 },
  { objetivo: "guardar", clic: true, dur: 2200, resalta: 1 },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="flex h-full items-start justify-center p-4">
      <div className="w-[230px] space-y-1.5 rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold text-brand-wine">Clientes</p>
          <MiniBoton demo="editar" tono="borde">Editar cliente</MiniBoton>
        </div>
        {paso >= 1 && (
          <div className={`space-y-1 rounded-lg border border-brand-brown/10 p-2 ${css.aparecer}`}>
            <p className="text-[8px] font-bold uppercase text-brand-black/50">Editar cliente</p>
            <div className="rounded-md border border-brand-brown/15 px-2 py-1 text-[9px]">1234092703 · Valeria Mejia</div>
            <p className="text-[8px] font-semibold text-emerald-700">✓ No se abre la validación al entrar</p>
            <div className="flex justify-end">
              <MiniBoton demo="guardar" tono="ambar">Guardar</MiniBoton>
            </div>
          </div>
        )}
        {paso >= 2 && (
          <p className={`text-[8.5px] font-semibold text-emerald-700 ${css.aparecer}`}>
            ✓ Guardado directo. La validación al guardar es solo para clientes nuevos.
          </p>
        )}
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/clientes", pasos, Escena };
export default demo;
