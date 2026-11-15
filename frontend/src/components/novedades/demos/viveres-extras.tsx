"use client";

import { estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1500, resalta: 0 },
  { objetivo: "extras", dur: 2600, resalta: 1 },
];

const RES = ["ASADO DE TIRA / SANTACRUZ", "CARNE DE OMBLIGO", "HERRADERO/ATRAVESADO", "ESPALDILLA", "MORRILLO/MORRO"];
const VIVERES = ["MASA LISTA X 15 UNDS", "AREPA QUESO MOZZARELA", "MIEL DE ABEJA 100% PURA", "BOLLO LIMPIO"];

function Hoja({ titulo, items, demo, nuevo }: { titulo: string; items: string[]; demo?: string; nuevo?: boolean }) {
  return (
    <div data-demo={demo} className={`flex-1 rounded-lg bg-neutral-900 p-2 text-white shadow-lg ${nuevo ? css.pop : ""}`}>
      <p className="mb-1 text-[11px] font-black tracking-wide text-amber-300">{titulo}</p>
      {items.map((x) => (
        <p key={x} className="truncate text-[8px] leading-[1.6]">{x}</p>
      ))}
    </div>
  );
}

function Escena({ paso }: { paso: number }) {
  return (
    <div className="flex h-full items-start gap-3 p-4">
      <Hoja titulo="CORTES DE RES" items={paso === 0 ? [...RES, ...VIVERES] : RES} />
      {paso >= 1 && <Hoja titulo="EXTRAS" items={VIVERES} demo="extras" nuevo />}
    </div>
  );
}

const demo: DemoDef = { url: "/lista-precios", pasos, Escena };
export default demo;
