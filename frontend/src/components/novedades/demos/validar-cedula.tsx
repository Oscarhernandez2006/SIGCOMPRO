"use client";

import { MiniBoton, MiniCampo, Tecleo, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1000, resalta: 0 },
  { objetivo: "btn-validar", dur: 900, resalta: 0 },
  { objetivo: "btn-validar", clic: true, dur: 1900, resalta: 0 },
  { dur: 2600, resalta: 0 },
  { objetivo: "btn-corregir", dur: 1300, resalta: 1 },
  { objetivo: "btn-corregir", clic: true, dur: 2400, resalta: 2 },
  { objetivo: "btn-validar", dur: 900, resalta: 2 },
  { objetivo: "btn-validar", clic: true, dur: 1500, resalta: 2 },
  { objetivo: "btn-confirmar", dur: 1500, resalta: 2 },
  { objetivo: "btn-confirmar", clic: true, dur: 2600, resalta: 2 },
];

function Escena({ paso }: { paso: number }) {
  const corregida = paso >= 5;
  const modal = paso >= 2 && paso <= 4 ? "fallo" : paso === 7 || paso === 8 ? "ok" : null;
  const cargando = paso === 2 || paso === 7;

  return (
    <div className="relative flex h-full items-center justify-center p-4">
      <div className="w-full max-w-[360px] rounded-xl border border-brand-brown/10 bg-white p-3 shadow-md">
        <p className="mb-2 font-serif text-sm font-bold text-brand-wine">Nuevo cliente</p>
        <div className="flex items-end gap-1.5">
          <MiniCampo etiqueta="NIT / Cédula *" foco={paso === 5 || paso === 6} className="flex-1">
            {corregida ? <Tecleo key="nuevo" texto="1044616409" inicio={500} ms={80} /> : "32575835"}
          </MiniCampo>
          <MiniBoton demo="btn-validar" tono="borde" activo={paso === 1 || paso === 6}>
            🛡 Validar
          </MiniBoton>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <MiniCampo etiqueta="Nombres">{paso >= 9 ? <span className={css.aparecer}>Oscar David</span> : null}</MiniCampo>
          <MiniCampo etiqueta="Apellidos">{paso >= 9 ? <span className={css.aparecer}>Hernandez Guzman</span> : null}</MiniCampo>
        </div>
      </div>

      {modal && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-brand-black/40 p-4">
          <div className={`w-full max-w-[300px] rounded-xl bg-white p-3 shadow-2xl ${css.pop}`}>
            <p className="font-serif text-[13px] font-bold text-brand-wine">Validar cédula</p>
            <p className="mb-2 text-[9px] text-brand-black/60">
              Validación de identidad · Cédula {modal === "ok" ? "1044616409" : "32575835"}
            </p>
            {cargando ? (
              <div className="flex flex-col items-center gap-1.5 rounded-lg bg-brand-cream-soft py-3">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
                <p className="font-semibold">Validando información…</p>
              </div>
            ) : modal === "fallo" ? (
              <div className={`flex flex-col items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-2.5 text-center ${css.aparecer}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-700 ${css.pop}`}>⚠</span>
                <p className="font-bold text-red-800">La cédula 32575835 no existe en ADRES</p>
                <p className="text-[9.5px] leading-snug text-red-900/80">
                  Puede ser un error al digitarla o una <b>posible estafa</b>. Confírmala con el cliente.
                </p>
                <div className="mt-1 flex gap-1">
                  <MiniBoton demo="btn-corregir" tono="vino" activo={paso === 4}>
                    Corregir la cédula
                  </MiniBoton>
                  <MiniBoton tono="borde">Escribir a mano</MiniBoton>
                </div>
              </div>
            ) : (
              <div className={`rounded-lg border border-brand-brown/10 px-2 py-2.5 text-center ${css.aparecer}`}>
                <p className="text-[9px] uppercase tracking-wide text-brand-black/50">Nombre completo</p>
                <p className="text-sm font-semibold text-brand-wine">Oscar David Hernandez Guzman</p>
                <MiniBoton demo="btn-confirmar" tono="vino" activo={paso === 8} className="mt-1.5">
                  Confirmar
                </MiniBoton>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const demo: DemoDef = { url: "/pedidos", pasos, Escena };
export default demo;
