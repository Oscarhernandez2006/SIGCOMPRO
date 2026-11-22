"use client";

import { estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "modulo", clic: true, dur: 2000, resalta: 0 },
  { objetivo: "agotado", clic: true, dur: 2000, resalta: 1 },
  { objetivo: "menu", dur: 2200, resalta: 2 },
];

function Casilla({ on }: { on: boolean }) {
  return (
    <span className={`inline-flex h-3 w-3 items-center justify-center rounded-sm border text-[7px] ${on ? "border-brand-wine bg-brand-wine text-white" : "border-brand-brown/30"}`}>
      {on ? "✓" : ""}
    </span>
  );
}

function Escena({ paso }: { paso: number }) {
  return (
    <div className="flex h-full items-start justify-center gap-3 p-4">
      <div className="w-[190px] space-y-1.5 rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md">
        <p className="text-[8px] font-bold uppercase text-brand-black/50">Permisos · Supervisor</p>
        <div className="rounded-lg border border-brand-brown/10 p-1.5">
          <p data-demo="modulo" className="flex items-center gap-1 text-[9px] font-semibold text-brand-black">
            <Casilla on={paso >= 1} /> Productos y precios
          </p>
          <p data-demo="agotado" className="mt-1 flex items-center gap-1 pl-3 text-[8px] text-brand-black/80">
            <Casilla on={paso >= 2} /> Marcar productos agotados / disponibles
          </p>
        </div>
      </div>
      <div data-demo="menu" className={`w-[120px] space-y-1 rounded-xl bg-brand-wine p-2 text-[8.5px] text-white/80 shadow-md ${paso >= 3 ? css.aparecer : "opacity-40"}`}>
        <p>Pedidos</p>
        <p>Lista de precios</p>
        <p className={paso >= 3 ? "rounded bg-white/15 px-1 font-semibold text-white" : ""}>Productos y precios</p>
        <p>Clientes</p>
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/admin/usuarios", pasos, Escena };
export default demo;
