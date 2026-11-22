"use client";

import { estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "pdv", dur: 2200, resalta: 0 },
  { objetivo: "varios", dur: 2200, resalta: 1 },
];

const personas = [
  { nombre: "Suad Diaz Mirando", pdv: ["Calle 30"], total: 9 },
  { nombre: "Shakira Herrera Tamara", pdv: ["Manga", "Bocagrande"], total: 7 },
  { nombre: "Andrea Garnica Jiménez", pdv: ["Turbaco"], total: 4 },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="flex h-full items-start justify-center p-4">
      <div className="w-[300px] rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md">
        <p className="mb-1.5 text-[9px] font-bold text-brand-wine">Personas con más incumplimientos</p>
        {personas.map((p, i) => (
          <div key={p.nombre} className="flex items-center gap-1.5 border-b border-brand-brown/10 py-1.5">
            <span className="w-3 text-[8px] text-brand-black/40">{i + 1}</span>
            <span className="min-w-0 flex-1 text-[9px] font-medium text-brand-black">{p.nombre}</span>
            <span
              data-demo={i === 0 ? "pdv" : i === 1 ? "varios" : undefined}
              className={`flex flex-wrap justify-end gap-0.5 ${paso >= 1 ? css.aparecer : "opacity-0"}`}
            >
              {p.pdv.map((x) => (
                <span key={x} className="rounded bg-brand-cream-soft px-1 py-0.5 text-[7.5px] text-brand-black/70">📍 {x}</span>
              ))}
            </span>
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-700">{p.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/despacho", pasos, Escena };
export default demo;
