"use client";

import { MiniBoton, MiniCampo, MiniRadio, MiniToast, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1100, resalta: 0 },
  { objetivo: "radio-fundacion", dur: 950, resalta: 0 },
  { objetivo: "radio-fundacion", clic: true, dur: 1700, resalta: 0 },
  { objetivo: "btn-guardar", dur: 900, resalta: 1 },
  { objetivo: "btn-guardar", clic: true, dur: 1900, resalta: 1 },
  { objetivo: "fila-3", dur: 2800, resalta: 1 },
  { objetivo: "btn-puntos", dur: 1300, resalta: 2 },
  { objetivo: "btn-puntos", clic: true, dur: 3000, resalta: 2 },
];

const ALTERNAS = [
  { nit: "901727043-1", dir: "Cra 8 # 45-12 · Soledad" },
  { nit: "901727043-2", dir: "Calle 30 # 2-80 · Malambo" },
  { nit: "901727043-3", dir: "Cra 54 # 72-14 · Barranquilla" },
  { nit: "901727043-4", dir: "Calle 17 # 9-33 · Puerto Colombia" },
];

function Escena({ paso }: { paso: number }) {
  const fundacion = paso >= 2;

  if (paso <= 4) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className={`w-full max-w-[360px] rounded-xl border border-brand-brown/10 bg-white p-3 shadow-md ${css.aparecer}`}>
          <p className="mb-2 font-serif text-sm font-bold text-brand-wine">Editar cliente</p>
          <div className="grid grid-cols-2 gap-2">
            <MiniCampo etiqueta="NIT / Cédula">901727043</MiniCampo>
            <MiniCampo etiqueta="Nombre">Fundación Sonrisas</MiniCampo>
          </div>
          <div className="mt-2 rounded-lg border border-brand-brown/10 p-2">
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-brand-wine">Clasificación</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <MiniRadio marcado={false}>Cliente hogar</MiniRadio>
              <MiniRadio marcado={!fundacion}>Cliente HORECA</MiniRadio>
              <MiniRadio demo="radio-fundacion" marcado={fundacion}>
                <b>Fundación</b>
              </MiniRadio>
            </div>
            {fundacion && (
              <p className={`mt-1.5 text-[9.5px] leading-snug text-brand-black/70 ${css.aparecer}`}>
                Al guardar, todas las direcciones alternas (901727043-1, -2, …) quedan también como fundación.
              </p>
            )}
          </div>
          <div className="mt-2 flex justify-end gap-1.5">
            <MiniBoton tono="borde">Cancelar</MiniBoton>
            <MiniBoton demo="btn-guardar" tono="ambar" activo={paso === 3}>
              Guardar
            </MiniBoton>
          </div>
        </div>
        {paso === 4 && <MiniToast tono="cielo">✓ 4 direcciones alternas marcadas como fundación</MiniToast>}
      </div>
    );
  }

  if (paso === 5) {
    return (
      <div className="p-4">
        <p className={`mb-2 font-serif text-sm font-bold text-brand-wine ${css.aparecer}`}>Clientes · 901727043</p>
        <div className="overflow-hidden rounded-xl border border-brand-brown/10 bg-white">
          {ALTERNAS.map((a, i) => (
            <div
              key={a.nit}
              data-demo={`fila-${i}`}
              className={`flex items-center justify-between border-b border-brand-brown/5 px-3 py-1.5 last:border-0 ${css.aparecer}`}
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div>
                <p className="font-semibold">Fundación Sonrisas</p>
                <p className="text-[9.5px] text-brand-black/60">
                  {a.nit} · {a.dir}
                </p>
              </div>
              <span
                className={`rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-bold uppercase text-sky-700 ${css.pop}`}
                style={{ animationDelay: `${400 + i * 380}ms` }}
              >
                Fundación
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-start justify-center gap-3 p-4">
      <div className={`w-[180px] shrink-0 rounded-xl border border-brand-brown/10 bg-white p-2.5 shadow-md ${css.aparecer}`}>
        <p className="text-[9px] font-bold uppercase text-brand-black/50">Despacho · 10CS00001702</p>
        <p className="font-semibold">Fundación Sonrisas</p>
        <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-bold uppercase text-sky-700">
          Fundación
        </span>
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1">
          <p className="text-[8.5px] font-bold uppercase text-emerald-700">Domiciliario (Drivin)</p>
          <p className="font-semibold text-emerald-900">Arturo Goez</p>
        </div>
        <MiniBoton demo="btn-puntos" tono="cielo" activo={paso === 6} className="mt-2 w-full">
          📍 Puntos de envío
        </MiniBoton>
        <MiniBoton tono="vino" className="mt-1.5 w-full opacity-60">
          Despachado
        </MiniBoton>
      </div>
      {paso === 7 && (
        <div className={`min-w-0 flex-1 rounded-xl border border-sky-200 bg-white p-2.5 shadow-lg ${css.deslizarDerecha}`}>
          <p className="mb-1.5 font-semibold text-sky-800">Puntos de envío · 4 direcciones</p>
          {ALTERNAS.map((a, i) => (
            <label
              key={a.nit}
              className={`flex items-center gap-1.5 border-b border-brand-brown/5 py-1 last:border-0 ${css.aparecer}`}
              style={{ animationDelay: `${150 + i * 120}ms` }}
            >
              <span className="flex h-3 w-3 items-center justify-center rounded border border-sky-400 bg-sky-500 text-[8px] text-white">✓</span>
              <span className="min-w-0 truncate">
                <b>{a.nit}</b> · {a.dir}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const demo: DemoDef = { url: (p) => (p >= 6 ? "/despacho" : "/clientes"), pasos, Escena };
export default demo;
