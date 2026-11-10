"use client";

import { MiniBoton, MiniToast, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1300, resalta: 0 },
  { objetivo: "btn-importar", clic: true, dur: 1600, resalta: 0 },
  { objetivo: "filas", dur: 2400, resalta: 1 },
  { objetivo: "confirmar", clic: true, dur: 2000, resalta: 2 },
  { objetivo: "btn-exportar", clic: true, dur: 2600, resalta: 3 },
];

const FILAS = [
  { cod: "23063", dir: "Carrera 22 # 1E-116", amarilla: true },
  { cod: "104619", dir: "Calle 59C # 81-72", amarilla: false, cambia: "Calle 59C # 81-74" },
  { cod: "132902", dir: "Carrera 69 # 62-74", amarilla: true },
  { cod: "998877", dir: "Calle 10 # 5-20", amarilla: false, nueva: true },
];

function Escena({ paso }: { paso: number }) {
  return (
    <div className="relative flex h-full flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-serif text-[13px] font-bold text-brand-wine">Direcciones</p>
        <div className="flex gap-1.5">
          <MiniBoton demo="btn-importar" tono="borde" activo={paso === 1}>
            ⬆ Importar Excel
          </MiniBoton>
          <MiniBoton demo="btn-exportar" tono="borde" activo={paso === 4}>
            ⬇ Exportar Excel
          </MiniBoton>
        </div>
      </div>
      <div data-demo="filas" className="overflow-hidden rounded-lg border border-brand-brown/10 bg-white">
        {FILAS.filter((f) => !f.nueva || paso >= 2).map((f) => (
          <div
            key={f.cod}
            className={`flex justify-between border-b border-brand-brown/5 px-2.5 py-1 text-[9.5px] ${
              f.amarilla ? "bg-yellow-100" : ""
            } ${f.nueva ? css.aparecer : ""}`}
          >
            <span className="font-semibold">{f.cod}</span>
            <span className={paso >= 2 && f.cambia ? "font-semibold text-sky-700" : ""}>
              {paso >= 2 && f.cambia ? f.cambia : f.dir}
            </span>
            <span className="w-16 text-right text-[8.5px] text-brand-black/50">
              {f.amarilla ? "respetada" : paso >= 2 ? (f.nueva ? "nueva" : "actualizada") : ""}
            </span>
          </div>
        ))}
        {paso < 3 && (
          <div className="flex justify-between px-2.5 py-1 text-[9.5px] text-red-600 line-through decoration-red-400">
            <span className="font-semibold">55511</span>
            <span>Calle 99 # 1-1</span>
            <span className="w-16 text-right text-[8.5px]">{paso >= 2 ? "ya no está" : ""}</span>
          </div>
        )}
      </div>
      {paso === 2 && (
        <div className={`mx-auto mt-2 w-[230px] rounded-lg border border-red-200 bg-red-50 p-2 text-[9px] text-red-700 ${css.pop}`}>
          1 dirección ya no viene en Drivin y se eliminará.
          <div className="mt-1.5 flex justify-end">
            <MiniBoton demo="confirmar" className="bg-red-600 text-white">
              Importar y eliminar
            </MiniBoton>
          </div>
        </div>
      )}
      {paso === 3 && <MiniToast>✓ Sincronización con Drivin terminada</MiniToast>}
      {paso === 4 && <MiniToast tono="cielo">⬇ Excel con las 66 columnas listo para cargar a Drivin</MiniToast>}
    </div>
  );
}

const demo: DemoDef = { url: "/admin/direcciones", pasos, Escena };
export default demo;
