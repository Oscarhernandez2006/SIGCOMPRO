"use client";

import { MiniBoton, MiniToast, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1300, resalta: 0 },
  { objetivo: "zona-acciones", dur: 1900, resalta: 0 },
  { dur: 1500, resalta: 1 },
  { objetivo: "btn-reenviar", dur: 1000, resalta: 1 },
  { objetivo: "btn-reenviar", clic: true, dur: 2600, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  const admin = paso >= 2;
  return (
    <div className="relative flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-end">
        <span
          key={admin ? "admin" : "op"}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${css.pop} ${
            admin ? "border-brand-wine/30 bg-brand-wine/10 text-brand-wine" : "border-brand-brown/15 bg-white text-brand-brown"
          }`}
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-wine text-[8px] font-bold text-white">
            {admin ? "CM" : "MJ"}
          </span>
          {admin ? "Carlos · Administrador App" : "Maria Jose · Facturación"}
        </span>
      </div>
      <div className="flex flex-1 items-start justify-center">
        <div className="w-[230px] rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold uppercase text-brand-black/50">Despacho · 1CS00006640</p>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">Facturado</span>
          </div>
          <p className="font-semibold">Hotel Puerta del Sol</p>
          <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-[9.5px] text-red-700">La comanda no aparece en Drivin</p>
          <div data-demo="zona-acciones" className="mt-2 min-h-[54px] space-y-1.5">
            <MiniBoton tono="borde" className="w-full border-red-300 text-red-700">
              ↩ Devolución
            </MiniBoton>
            {admin ? (
              <MiniBoton demo="btn-reenviar" tono="cielo" activo={paso === 3} className={`w-full ${css.pop}`}>
                ⟳ Reenviar a Drivin
              </MiniBoton>
            ) : (
              <p className={`text-center text-[9.5px] text-brand-black/45 ${css.aparecer}`}>Sin botón «Reenviar a Drivin»</p>
            )}
          </div>
        </div>
      </div>
      {paso === 4 && <MiniToast tono="cielo">✓ Pedido reenviado al escenario de hoy en Drivin</MiniToast>}
    </div>
  );
}

const demo: DemoDef = { url: "/despacho", pasos, Escena };
export default demo;
