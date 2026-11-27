"use client";

import { Tecleo, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "numero", clic: true, dur: 2300, resalta: 0 },
  { objetivo: "numero", dur: 1500, resalta: 1 },
  { objetivo: "total", dur: 2400, resalta: 1 },
  { objetivo: "estado", dur: 2400, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  const facturado = paso >= 3;
  return (
    <div className="flex h-full items-start justify-center p-4">
      <div className="w-[230px] overflow-hidden rounded-xl border border-brand-brown/10 bg-white shadow-md">
        <div className="flex items-center justify-between border-b border-brand-brown/10 px-2.5 py-1.5">
          <div>
            <p className="text-[9.5px] font-bold text-brand-wine">1CS00007755</p>
            <p className="text-[7.5px] text-brand-black/55">PDV La 93 · Marco Mojica</p>
          </div>
          <span
            data-demo="estado"
            className={`rounded-full border px-1.5 py-0.5 text-[7px] font-bold uppercase transition ${
              facturado
                ? `border-sky-200 bg-sky-100 text-sky-700 ${css.pop}`
                : "border-violet-200 bg-violet-100 text-violet-600"
            }`}
          >
            {facturado ? "Facturado" : "Alistado"}
          </span>
        </div>
        <div className="space-y-1.5 p-2.5">
          <p className="text-[8px] font-bold uppercase text-brand-black/50">Facturación</p>
          <div
            data-demo="numero"
            className={`flex items-center justify-between rounded-md border px-2 py-1 font-mono text-[9.5px] ${
              paso === 1 || paso === 2 ? "border-brand-amber ring-1 ring-brand-amber/40" : "border-brand-brown/15"
            } ${facturado ? "opacity-60" : ""}`}
          >
            {paso === 0 ? (
              <span className="font-sans text-brand-black/30">N° factura + Enter</span>
            ) : paso === 1 ? (
              <Tecleo texto="933C10585" ms={110} />
            ) : (
              <span>933C10585</span>
            )}
            {paso === 2 && (
              <span className={`rounded bg-brand-brown/10 px-1 font-sans text-[7px] font-bold text-brand-brown ${css.pop}`}>
                Enter ⏎
              </span>
            )}
          </div>
          {paso === 2 && (
            <p className={`text-[8.5px] font-medium text-brand-black/60 ${css.aparecer}`}>Consultando factura en Siesa…</p>
          )}
          <p
            data-demo="total"
            className={`text-[9.5px] font-semibold text-brand-wine ${facturado ? css.aparecer : "opacity-0"}`}
          >
            Total Factura: $ 31.681
          </p>
          <div className="rounded-md border border-dashed border-brand-brown/15 px-2 py-1 text-center text-[7.5px] text-brand-black/40">
            Sin campo de valor ni botón «Facturado»
          </div>
        </div>
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/despacho", pasos, Escena };
export default demo;
