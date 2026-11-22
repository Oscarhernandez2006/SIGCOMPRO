"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "actualizar", clic: true, dur: 2200, resalta: 0 },
  { objetivo: "descargar", clic: true, dur: 2200, resalta: 1 },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="flex h-full items-start justify-center p-4">
      <div className="w-[250px] space-y-1.5 rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md">
        <p className="text-[8px] font-bold uppercase text-brand-black/50">NIT / Cédula</p>
        <div className="flex items-center gap-1">
          <div className="flex-1 rounded-md border border-brand-brown/15 px-2 py-1 text-[9px]">1002317279</div>
          <MiniBoton demo="validar" tono="borde">Validar</MiniBoton>
          <span data-demo="actualizar" className="rounded-lg border border-amber-300 bg-amber-50 px-1.5 py-1 text-[8px] font-semibold text-amber-800">
            Actualizar extensión
          </span>
        </div>
        {paso >= 1 && (
          <div className={`space-y-1 rounded-lg border border-brand-brown/10 p-2 ${css.aparecer}`}>
            <p className="text-[9px] font-bold text-brand-wine">Actualizar extensión de validación</p>
            <p className="text-[7.5px] text-brand-black/60">versión 1.10.0 (instalada: 1.8.0)</p>
            <MiniBoton demo="descargar" tono="ambar" className="w-full">Descargar extensión (.zip)</MiniBoton>
          </div>
        )}
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/clientes", pasos, Escena };
export default demo;
