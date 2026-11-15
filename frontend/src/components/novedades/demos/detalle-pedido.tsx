"use client";

import { estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "vendedor", dur: 1800, resalta: 0 },
  { objetivo: "nota", dur: 2000, resalta: 1 },
  { objetivo: "kilos", dur: 2300, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="relative flex h-full items-start justify-center p-3">
      <div className={`w-full max-w-[330px] rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-xl ${css.pop}`}>
        <p className="font-serif text-[11px] font-bold text-brand-wine">Pedido 1CS00006896</p>
        <p className="text-[8px] text-brand-black/55">10/11/2026, 5:04 p. m. · PDV Carnes Santacruz La 93</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <div className="space-y-1 rounded-lg border border-brand-brown/10 p-1.5 text-[8px]">
            <p className="text-[7px] font-bold uppercase text-brand-black/50">Pedido</p>
            <p>Comanda: <b>1CS00006896</b> · En proceso</p>
            <p>Entrega: Domicilio · Efectivo</p>
            <p data-demo="vendedor" className={`rounded px-1 ${paso === 1 ? "bg-brand-amber/20" : ""}`}>
              Vendedor: <b>1045718044 - Yuleidys Peña Llerana</b>
            </p>
            <div
              data-demo="nota"
              className={`rounded-md border border-brand-amber/30 bg-brand-amber/5 px-1.5 py-1 ${paso >= 2 ? css.aparecer : "opacity-0"}`}
            >
              <p className="text-[7px] font-bold uppercase text-brand-black/50">Nota del pedido</p>
              <p className="font-semibold text-brand-wine">Factura Electrónica</p>
              <p>Entregar 4:30 p. m. · Domi $6.000 empresa paga</p>
            </div>
          </div>
          <div className="rounded-lg border border-brand-brown/10 p-1.5 text-[8px]">
            <p className="text-[7px] font-bold uppercase text-brand-black/50">Productos (4)</p>
            <p>Capón cecina · 1,5 kg</p>
            <p>Capón bollo · 1,5 kg</p>
            <p>Lomo ancho · 1 kg</p>
            <p>Goulash especial · 1 kg</p>
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-end gap-3 text-[8.5px]">
          <span data-demo="kilos" className={`mr-auto rounded px-1 font-semibold ${paso >= 3 ? "bg-brand-amber/20" : ""}`}>
            Total kilos: 5 kilos (10 libras)
          </span>
          <span>Domicilio: $ 0</span>
          <span className="font-bold text-brand-wine">Total: $ 205.050</span>
        </div>
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/pedidos · Ver pedido", pasos, Escena };
export default demo;
