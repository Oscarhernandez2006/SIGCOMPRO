"use client";

import { MiniBoton, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1200, resalta: 0 },
  { objetivo: "btn-imprimir", dur: 1000, resalta: 0 },
  { objetivo: "btn-imprimir", clic: true, dur: 1600, resalta: 1 },
  { objetivo: "total-kilos", dur: 2800, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  const impresa = paso >= 2;
  return (
    <div className="relative flex h-full flex-col items-center p-4">
      {!impresa ? (
        <div className="w-[230px] rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md">
          <p className="text-[9px] font-bold uppercase text-brand-black/50">Pedido · 1CS00006712</p>
          <p className="font-semibold">Sandra Ramírez</p>
          <p className="text-[9.5px] text-brand-black/60">Molida especial · 3 kilos</p>
          <p className="text-[9.5px] text-brand-black/60">Costilla de res · 2 kilos</p>
          <MiniBoton demo="btn-imprimir" tono="vino" activo={paso === 1} className="mt-2 w-full">
            🖨 Imprimir comanda
          </MiniBoton>
        </div>
      ) : (
        <div className={`w-[200px] bg-white px-3 py-2 font-mono text-[9.5px] font-bold leading-snug text-black shadow-lg ${css.pop}`}>
          <p className="text-center text-[11px]">Detalle del pedido</p>
          <hr className="my-1 border-black" />
          <p>MOLIDA ESPECIAL</p>
          <p>Cantidad/Peso: 3 kilos (6 libras)</p>
          <p className="mt-1">COSTILLA DE RES</p>
          <p>Cantidad/Peso: 2 kilos (4 libras)</p>
          <hr className="my-1 border-black" />
          <p>Subtotal: $ 434.940</p>
          <p>Domicilio: $ 0</p>
          <p className="text-[11px]">Total: $ 434.940</p>
          <p
            data-demo="total-kilos"
            className={`text-[11px] transition ${paso === 3 ? "rounded bg-brand-amber/25 px-1" : ""}`}
          >
            Total kilos: 5 kilos (10 libras)
          </p>
        </div>
      )}
    </div>
  );
}

const demo: DemoDef = { url: "/pedidos", pasos, Escena };
export default demo;
