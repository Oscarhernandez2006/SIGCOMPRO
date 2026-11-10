"use client";

import { estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1100, resalta: 0 },
  { objetivo: "nombre", clic: true, dur: 1700, resalta: 0 },
  { dur: 1900, resalta: 1 },
  { dur: 2200, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  const desplazado = paso >= 2;
  const abierta = paso === 1 || paso === 2;
  return (
    <div className="relative h-full overflow-hidden p-4">
      <div
        className="space-y-2 transition-transform duration-[1500ms] ease-in-out"
        style={{ transform: desplazado ? "translateY(-210px)" : "translateY(0)" }}
      >
        {["Adelia Rosa Nuñez", "Victor Hernandez", "Paula Navarro", "Edinson Bolivar", "Jose Almeida"].map((n, i) => (
          <div key={n} className="relative rounded-lg border border-brand-brown/10 bg-white p-2.5 text-[10px] shadow-sm">
            <span data-demo={i === 0 ? "nombre" : undefined} className="font-bold underline decoration-dotted">
              {n} ▾
            </span>
            <p className="text-[9px] text-brand-black/55">Calle 50 # 42{i}-15 · Barranquilla</p>
            {i === 0 && abierta && (
              <div className={`absolute left-2 top-7 z-10 w-44 rounded-lg border border-brand-brown/20 bg-white p-2 text-[9px] shadow-xl ${css.pop}`}>
                <p className="font-bold">Adelia Rosa Nuñez</p>
                <p>NIT/Cédula: 32790923</p>
                <p>Dirección: Carrera 43 # 93-52</p>
                <p>Teléfono: 3045382157</p>
              </div>
            )}
          </div>
        ))}
      </div>
      {paso === 3 && (
        <p className={`absolute inset-x-4 bottom-3 rounded-lg bg-emerald-50 px-2 py-1 text-center text-[9.5px] font-semibold text-emerald-700 ${css.aparecer}`}>
          ✓ Al volver arriba la ficha ya está cerrada
        </p>
      )}
    </div>
  );
}

const demo: DemoDef = { url: "/despacho", pasos, Escena };
export default demo;
