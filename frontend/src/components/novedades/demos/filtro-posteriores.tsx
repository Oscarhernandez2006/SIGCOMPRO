"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1300, resalta: 0 },
  { objetivo: "btn-posteriores", clic: true, dur: 2300, resalta: 1 },
  { objetivo: "btn-posteriores", clic: true, dur: 1900, resalta: 2 },
];

const PEDIDOS = [
  { com: "1CS00006922", cli: "Jesica Blanco", post: null },
  { com: "1CS00006921", cli: "Elvira Martinez", post: "13/11/2026" },
  { com: "1CS00006920", cli: "Diego Mendez", post: null },
  { com: "1CS00006919", cli: "Yadira Castilla", post: "14/11/2026" },
];

function Escena({ paso }: { paso: number }) {
  const activo = paso === 1;
  const lista = activo ? PEDIDOS.filter((p) => p.post) : PEDIDOS;
  return (
    <div className="relative flex h-full flex-col p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <div className="flex-1 rounded-lg border border-brand-brown/15 bg-white px-2 py-1 text-[9px] text-brand-black/40">
          Buscar por consecutivo, comanda…
        </div>
        <span className="rounded-lg border border-brand-brown/15 bg-white px-2 py-1 text-[9px]">dd/mm/aaaa</span>
        <MiniBoton tono="borde">Hoy</MiniBoton>
        <span
          data-demo="btn-posteriores"
          className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-semibold transition ${
            activo ? "border-indigo-600 bg-indigo-600 text-white" : "border-brand-brown/15 bg-white text-indigo-600"
          }`}
        >
          📅 Posteriores
          <span className={`rounded-full px-1 text-[8px] ${activo ? "bg-white/25" : "bg-indigo-100"}`}>2</span>
        </span>
      </div>
      <div key={activo ? "f" : "t"} className={`overflow-hidden rounded-lg border border-brand-brown/10 bg-white ${css.aparecer}`}>
        {lista.map((p) => (
          <div key={p.com} className="flex justify-between border-b border-brand-brown/5 px-2.5 py-1.5 text-[9.5px]">
            <span className="font-semibold text-brand-wine">{p.com}</span>
            <span>{p.cli}</span>
            <span className={p.post ? "font-semibold text-indigo-600" : "text-brand-black/40"}>
              {p.post ? `Programado ${p.post}` : "Hoy"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/pedidos", pasos, Escena };
export default demo;
