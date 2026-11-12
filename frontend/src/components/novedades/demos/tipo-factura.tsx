"use client";

import { estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "fe", clic: true, dur: 1700, resalta: 0 },
  { objetivo: "pago", dur: 1500, resalta: 1 },
  { objetivo: "obs", dur: 2600, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  const elegida = paso >= 1;
  return (
    <div className="relative flex h-full gap-3 p-4">
      <div className="flex-1">
        <p className="mb-1.5 text-[9.5px] font-semibold">¿Cómo se entrega el pedido?</p>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg border border-brand-amber bg-brand-amber/5 px-2 py-1.5 text-[9.5px] font-semibold">🏠 Domicilio</div>
          <div className="rounded-lg border border-brand-brown/10 bg-white px-2 py-1.5 text-[9.5px] font-semibold">Recoge en punto</div>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[8.5px]">
          <span className="font-medium">Factura:</span>
          <span
            data-demo="fe"
            className={`rounded-md border px-1.5 py-0.5 font-semibold ${
              elegida ? "border-brand-amber bg-brand-amber/10 text-brand-wine" : "border-brand-brown/15 bg-white"
            }`}
          >
            Factura Electrónica
          </span>
          <span className="rounded-md border border-brand-brown/15 bg-white px-1.5 py-0.5 font-semibold">Consumidor Final</span>
        </div>
        <p className="mb-1 mt-2.5 text-[9.5px] font-semibold">Método de pago</p>
        <div data-demo="pago" className={`grid grid-cols-2 gap-1 rounded-md ${paso === 2 ? "ring-2 ring-brand-amber/40" : ""}`}>
          {["Efectivo", "QR", "Tarjeta", "Transferencia", "Crédito", "Mixto"].map((m, i) => (
            <div
              key={m}
              className={`rounded-md border px-2 py-0.5 text-[9px] font-semibold ${
                i === 0 ? "border-brand-amber bg-brand-amber/5 text-brand-wine" : "border-brand-brown/10 bg-white"
              }`}
            >
              {m}
            </div>
          ))}
        </div>
      </div>
      {paso >= 3 && (
        <div className={`w-[110px] self-start bg-white px-2 py-1.5 font-mono text-[8px] font-bold leading-snug shadow-lg ${css.pop}`}>
          <p>Total: $ 434.940</p>
          <hr className="my-1 border-black" />
          <p>OBSERVACIÓN</p>
          <p data-demo="obs" className="rounded bg-brand-amber/25 px-0.5 text-[9px]">
            FACTURA ELECTRÓNICA
          </p>
          <p>Entregar 4:30 PM</p>
        </div>
      )}
    </div>
  );
}

const demo: DemoDef = { url: "/pedidos · Nuevo pedido", pasos, Escena };
export default demo;
