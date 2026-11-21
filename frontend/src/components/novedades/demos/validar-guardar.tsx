"use client";

import { MiniBoton, MiniToast, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1300, resalta: 0 },
  { objetivo: "guardar", clic: true, dur: 1900, resalta: 1 },
  { objetivo: "confirmar", clic: true, dur: 2300, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="relative h-full p-4">
      <div className="rounded-xl border border-brand-brown/10 bg-white p-3 shadow-md">
        <p className="font-serif text-[12px] font-bold text-brand-wine">Editar cliente</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[9px]">
          <div className="rounded-md border border-brand-brown/15 px-2 py-1">1234092703</div>
          <div />
          <div className="rounded-md border border-brand-brown/15 px-2 py-1">{paso >= 2 ? "Valerie Omara" : "Valeria"}</div>
          <div className="rounded-md border border-brand-brown/15 px-2 py-1">{paso >= 2 ? "Mejia Bula" : "Mejia"}</div>
        </div>
        <div className="mt-2 flex justify-end">
          <MiniBoton demo="guardar" tono="ambar" activo={paso === 0}>
            Guardar
          </MiniBoton>
        </div>
      </div>
      {paso === 1 && (
        <div className={`absolute inset-x-8 top-10 rounded-xl border border-brand-brown/10 bg-white p-3 shadow-2xl ${css.pop}`}>
          <p className="font-serif text-[11px] font-bold text-brand-wine">Validar cédula</p>
          <p className="text-[8px] text-brand-black/55">Se abrió sola porque no se validó antes de guardar</p>
          <p className="mt-1.5 text-center text-[12px] font-semibold text-brand-wine">Valerie Omara Mejia Bula</p>
          <div className="mt-2 flex justify-end gap-1.5">
            <MiniBoton tono="borde">Cancelar y guardar</MiniBoton>
            <MiniBoton demo="confirmar">Confirmar</MiniBoton>
          </div>
        </div>
      )}
      {paso === 2 && <MiniToast>✓ Cliente guardado con el nombre validado</MiniToast>}
    </div>
  );
}

const demo: DemoDef = { url: "/clientes", pasos, Escena };
export default demo;
