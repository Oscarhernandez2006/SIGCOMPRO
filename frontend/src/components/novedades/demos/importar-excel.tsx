"use client";

import { MiniBoton, Tecleo, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 900, resalta: 0 },
  { objetivo: "btn-descargar", dur: 900, resalta: 0 },
  { objetivo: "btn-descargar", clic: true, dur: 1500, resalta: 0 },
  { objetivo: "celda-apellido", dur: 1000, resalta: 1 },
  { objetivo: "celda-apellido", clic: true, dur: 1700, resalta: 1 },
  { objetivo: "celda-direccion", dur: 900, resalta: 1 },
  { objetivo: "celda-direccion", clic: true, dur: 2300, resalta: 1 },
  { objetivo: "btn-importar", dur: 1100, resalta: 2 },
  { objetivo: "btn-importar", clic: true, dur: 1600, resalta: 2 },
  { dur: 3600, resalta: 3 },
];

function Sigcompro({ paso }: { paso: number }) {
  const importando = paso === 8;
  const resultado = paso >= 9;
  return (
    <div className={`p-4 ${css.aparecer}`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="font-serif text-sm font-bold text-brand-wine">Clientes</p>
          <p className="text-[9px] text-brand-black/60">Directorio de clientes del negocio</p>
        </div>
        <MiniBoton demo="btn-descargar" tono="borde" activo={paso === 1}>
          ⬇ Descargar Excel
        </MiniBoton>
      </div>
      <div className="rounded-xl border border-brand-amber/30 bg-white p-2.5">
        <div className="flex items-center gap-2">
          <MiniBoton demo="btn-importar" tono="borde" activo={paso === 7} className="border-brand-wine/40 text-brand-wine">
            ⬆ Importar DB
          </MiniBoton>
          <span className="text-[9.5px] text-brand-black/60">Sube el Excel de clientes: crea los nuevos y actualiza los que cambiaron.</span>
        </div>
        {importando && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-cream">
            <div className={`h-full rounded-full bg-brand-amber ${css.barraProgreso}`} />
          </div>
        )}
        {resultado && (
          <div className={`mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-emerald-800 ${css.aparecer}`}>
            <b>Importación completada:</b> 0 creados · <b>2 actualizados</b> · 35.832 sin cambios
          </div>
        )}
      </div>
      {resultado && (
        <div className="mt-2 space-y-1">
          <p className={`rounded-md bg-white px-2 py-1 ${css.deslizarDerecha}`} style={{ animationDelay: "350ms" }}>
            ✓ <b>32575835</b> · Apellido «Orozco» · <span className="text-emerald-700">coordenadas conservadas</span>
          </p>
          <p className={`rounded-md bg-white px-2 py-1 ${css.deslizarDerecha}`} style={{ animationDelay: "700ms" }}>
            ✓ <b>1044616409</b> · Dirección nueva · <span className="text-amber-700">queda «sin verificar»</span>
          </p>
        </div>
      )}
      {paso === 2 && (
        <div className={`absolute right-4 top-14 rounded-lg border border-brand-brown/10 bg-white px-2.5 py-1.5 shadow-lg ${css.pop}`}>
          📄 clientes_2026-11-08.xlsx <span className="text-emerald-700">descargado</span>
        </div>
      )}
    </div>
  );
}

function Hoja({ paso }: { paso: number }) {
  const th = "border border-emerald-900/10 bg-emerald-50 px-1.5 py-1 text-left text-[9px] font-bold text-emerald-900";
  const td = "border border-emerald-900/10 px-1.5 py-1 whitespace-nowrap";
  const editaApellido = paso === 4;
  const editaDireccion = paso === 6;
  return (
    <div className={`p-3 ${css.aparecer}`}>
      <div className="mb-1.5 flex items-center gap-1.5 rounded-md bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white">
        <span className="rounded bg-white px-1 text-[9px] font-black text-emerald-700">X</span> clientes_2026-11-08.xlsx
      </div>
      <table className="w-full border-collapse bg-white">
        <thead>
          <tr>
            <th className={th}>NIT/Cédula</th>
            <th className={th}>Nombre</th>
            <th className={th}>Apellidos</th>
            <th className={th}>Dirección</th>
            <th className={th}>Fundación</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={td}>32575835</td>
            <td className={td}>Loraine</td>
            <td
              data-demo="celda-apellido"
              className={`${td} ${editaApellido ? "outline outline-2 -outline-offset-2 outline-emerald-600" : ""} ${paso === 5 ? css.destello : ""}`}
            >
              {paso >= 4 ? editaApellido ? <Tecleo texto="Orozco" ms={110} inicio={300} /> : "Orozco" : "orozco"}
            </td>
            <td className={td}>Calle 112 # 42-19</td>
            <td className={td}>No</td>
          </tr>
          <tr>
            <td className={td}>1044616409</td>
            <td className={td}>Oscar David</td>
            <td className={td}>Hernandez</td>
            <td
              data-demo="celda-direccion"
              className={`${td} ${editaDireccion ? "outline outline-2 -outline-offset-2 outline-emerald-600" : ""}`}
            >
              {paso >= 6 ? <Tecleo texto="Calle 50 # 10-20" ms={70} inicio={250} /> : "Cra 1 # 2-3"}
            </td>
            <td className={td}>No</td>
          </tr>
          <tr>
            <td className={td}>901727043</td>
            <td className={td}>Fundación Sonrisas</td>
            <td className={td}>—</td>
            <td className={td}>Calle 30 # 2-80</td>
            <td className={td}>Sí</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Escena({ paso }: { paso: number }) {
  return paso >= 3 && paso <= 6 ? <Hoja paso={paso} /> : <Sigcompro paso={paso} />;
}

const demo: DemoDef = { url: (p) => (p >= 3 && p <= 6 ? "Excel · clientes_2026-11-08.xlsx" : "/clientes"), pasos, Escena };
export default demo;
