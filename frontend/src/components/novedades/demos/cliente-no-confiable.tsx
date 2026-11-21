"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1300, resalta: 0 },
  { objetivo: "marcar", clic: true, dur: 1800, resalta: 1 },
  { objetivo: "cliente", dur: 2800, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="relative h-full p-4">
      {paso < 2 ? (
        <div className={`rounded-xl border border-brand-brown/10 bg-white p-3 shadow-xl ${css.pop}`}>
          <p className="font-serif text-[11px] font-bold text-brand-wine">Validar cédula</p>
          <p className="mt-1 text-center text-[12px] font-semibold text-brand-wine">Valerie Omara Mejia Bula</p>
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[8.5px] text-amber-900">
            El nombre registrado <b>«Valeria Mejia»</b> no corresponde a esta cédula.
            <div className="mt-1.5">
              <MiniBoton demo="marcar" className="bg-red-700 text-white" activo={paso === 1}>
                Marcar cliente no confiable
              </MiniBoton>
            </div>
          </div>
        </div>
      ) : (
        <div className={`${css.aparecer}`}>
          <p className="mb-1.5 text-[9px] font-semibold text-brand-black/60">Nuevo pedido · ¿Para quién es el pedido?</p>
          <div className="mb-2 rounded-md border border-brand-brown/20 bg-white px-2 py-1 text-[9.5px]">🔍 1234092703</div>
          <div data-demo="cliente" className="rounded-lg border border-red-200 bg-white p-2 text-[9px] shadow-sm">
            <div className="flex items-center gap-1.5">
              <b>Valeria Mejia</b>
              <span className="rounded-full bg-red-600 px-1.5 text-[7.5px] font-bold text-white">⚠ NO CONFIABLE</span>
            </div>
            <p className="mt-1 rounded bg-red-50 px-1.5 py-1 text-[8px] text-red-800">
              El nombre registrado no corresponde a la cédula (validación: Valerie Omara Mejia Bula). Verifica la identidad antes de tomar el pedido.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const demo: DemoDef = { url: (p) => (p >= 2 ? "/pedidos · Nuevo pedido" : "/clientes"), pasos, Escena };
export default demo;
