"use client";

import { estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1300, resalta: 0 },
  { objetivo: "tab", clic: true, dur: 1700, resalta: 0 },
  { objetivo: "tabla", dur: 2300, resalta: 1 },
  { objetivo: "fila", clic: true, dur: 2800, resalta: 2 },
];

const FILAS = [
  { com: "1CS00006921", cli: "Elvira Martinez", fac: "07F-00009762", ped: "$ 208.800", fact: "$ 208.800", dif: "—", est: "Coincide", cls: "bg-emerald-100 text-emerald-700" },
  { com: "1CS00006919", cli: "Yadira Castilla", fac: "07F-00009761", ped: "$ 135.900", fact: "$ 144.995", dif: "$ 9.095", est: "Con diferencia", cls: "bg-amber-100 text-amber-800" },
  { com: "1CS00006917", cli: "Andres Oliveros", fac: "07F-00009763", ped: "$ 195.900", fact: "$ 195.900", dif: "—", est: "Coincide", cls: "bg-emerald-100 text-emerald-700" },
];

function Escena({ paso }: { paso: number }) {
  const vista = paso >= 1;
  return (
    <div className="relative flex h-full flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-serif text-[12px] font-bold text-brand-wine">{vista ? "Pedido vs facturado" : "Productos por cliente"}</p>
        <div className="flex rounded-md border border-brand-brown/15 bg-white p-0.5 text-[8.5px] font-semibold">
          <span className={`rounded px-1.5 py-0.5 ${!vista ? "bg-brand-wine text-white" : ""}`}>Productos por cliente</span>
          <span data-demo="tab" className={`rounded px-1.5 py-0.5 ${vista ? "bg-brand-wine text-white" : ""}`}>Pedido vs facturado</span>
        </div>
      </div>
      {vista && (
        <div data-demo="tabla" className={`overflow-hidden rounded-lg border border-brand-brown/10 bg-white ${css.aparecer}`}>
          <div className="grid grid-cols-[1.1fr_1fr_1fr_0.8fr_0.8fr_0.6fr_0.9fr] gap-1 bg-neutral-50 px-2 py-1 text-[7.5px] font-bold uppercase text-brand-black/60">
            <span>Comanda</span><span>Cliente</span><span>Factura</span><span>Pedido</span><span>Facturado</span><span>Dif.</span><span>Resultado</span>
          </div>
          {FILAS.map((f, i) => (
            <div key={f.com}>
              <div
                data-demo={i === 1 ? "fila" : undefined}
                className={`grid grid-cols-[1.1fr_1fr_1fr_0.8fr_0.8fr_0.6fr_0.9fr] items-center gap-1 border-t border-brand-brown/5 px-2 py-1 text-[8px] ${
                  paso === 3 && i === 1 ? "bg-brand-cream-soft" : ""
                }`}
              >
                <span className="font-semibold text-brand-wine">{f.com}</span>
                <span className="truncate">{f.cli}</span>
                <span className="font-mono">{f.fac}</span>
                <span>{f.ped}</span>
                <span className="font-semibold">{f.fact}</span>
                <span className={f.dif !== "—" ? "font-semibold text-amber-700" : "text-brand-black/40"}>{f.dif}</span>
                <span className={`rounded-full px-1 text-center text-[7px] font-semibold ${f.cls}`}>{f.est}</span>
              </div>
              {paso === 3 && i === 1 && (
                <div className={`border-t border-brand-brown/5 bg-brand-cream-soft/50 px-3 py-1 text-[7.5px] ${css.aparecer}`}>
                  <div className="grid grid-cols-[0.5fr_1.6fr_0.7fr_0.7fr_0.7fr] gap-1 font-bold uppercase text-brand-black/50">
                    <span>Cód.</span><span>Producto</span><span>Pedido</span><span>Facturado</span><span>Dif.</span>
                  </div>
                  <div className="grid grid-cols-[0.5fr_1.6fr_0.7fr_0.7fr_0.7fr] gap-1">
                    <span>1012</span><span>POSTA / TETAFULA</span><span>1,5 kg · $61.600</span><span>1,7 kg · $70.695</span><span className="font-semibold text-amber-700">$ 9.095</span>
                  </div>
                  <div className="grid grid-cols-[0.5fr_1.6fr_0.7fr_0.7fr_0.7fr] gap-1">
                    <span>2020</span><span>LOMO DE CERDO</span><span>1 kg · $74.300</span><span>1 kg · $74.300</span><span className="text-brand-black/40">—</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const demo: DemoDef = { url: "/admin/reporte-productos", pasos, Escena };
export default demo;
