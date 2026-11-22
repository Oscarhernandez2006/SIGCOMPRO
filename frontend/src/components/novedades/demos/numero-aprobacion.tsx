"use client";

import { estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "aprob", clic: true, dur: 2000, resalta: 0 },
  { objetivo: "guardado", dur: 2000, resalta: 1 },
  { objetivo: "efectivo", dur: 2000, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  const th = "border-b border-brand-brown/10 px-1.5 py-1 text-left text-[7.5px] font-bold uppercase text-brand-black/60";
  const td = "border-b border-brand-brown/10 px-1.5 py-1.5 text-[9px]";
  return (
    <div className="flex h-full items-start justify-center p-4">
      <div className="w-[300px] rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md">
        <p className="mb-1.5 text-[8px] font-bold uppercase text-brand-black/50">Cuadre de caja</p>
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Factura</th>
              <th className={th}>Método de pago</th>
              <th className={`${th} text-brand-wine`}>No. Aprob.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>10269</td>
              <td className={td}>Transferencia</td>
              <td className={td}>
                <div data-demo="aprob" className={`rounded-md border px-1.5 py-0.5 tabular-nums ${paso === 1 ? "border-brand-amber" : "border-brand-brown/15"}`}>
                  {paso >= 1 ? "458712" : <span className="text-brand-black/30">Número</span>}
                </div>
              </td>
            </tr>
            <tr>
              <td className={td}>10270</td>
              <td className={td}>Efectivo</td>
              <td data-demo="efectivo" className={`${td} text-brand-black/40 ${paso === 3 ? "rounded bg-brand-cream-soft" : ""}`}>—</td>
            </tr>
          </tbody>
        </table>
        <p data-demo="guardado" className={`mt-2 text-[8.5px] font-semibold text-emerald-700 ${paso >= 2 ? css.aparecer : "opacity-0"}`}>
          ✓ Guardado al salir del campo
        </p>
      </div>
    </div>
  );
}

const demo: DemoDef = { url: "/cuadre-caja", pasos, Escena };
export default demo;
