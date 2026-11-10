"use client";

import { Tecleo, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "buscador", clic: true, dur: 2200, resalta: 0 },
  { objetivo: "lista", dur: 2400, resalta: 1 },
  { objetivo: "alterna-10", dur: 2600, resalta: 2 },
];

const NITS = ["800232814", "800232814-1", "800232814-2", "800232814-3", "800232814-9", "800232814-10", "800232814-11"];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="relative flex h-full flex-col p-4">
      <p className="mb-2 text-[10px] font-semibold text-brand-black/70">¿Para quién es el pedido?</p>
      <div
        data-demo="buscador"
        className="flex items-center gap-2 rounded-lg border border-brand-brown/20 bg-white px-2.5 py-1.5 text-[10.5px]"
      >
        <span className="text-brand-black/40">🔍</span>
        {paso >= 1 ? <Tecleo texto="800232814" /> : <span className="text-brand-black/30">Buscar cliente…</span>}
      </div>
      {paso >= 2 && (
        <div data-demo="lista" className={`mt-2 space-y-1 ${css.aparecer}`}>
          {NITS.map((nit, i) => (
            <div
              key={nit}
              data-demo={nit === "800232814-10" ? "alterna-10" : undefined}
              className={`flex items-center justify-between rounded-md border bg-white px-2.5 py-1 text-[9.5px] transition ${
                paso === 3 && nit === "800232814-10" ? "border-brand-amber/60 bg-brand-amber/10" : "border-brand-brown/10"
              } ${i === 4 ? "mt-2" : ""}`}
            >
              <span className="font-semibold">{nit}</span>
              <span className="rounded-full bg-sky-50 px-1.5 text-[8px] font-bold text-sky-700">FUNDACIÓN</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const demo: DemoDef = { url: "/pedidos", pasos, Escena };
export default demo;
