"use client";

import { MiniBoton, MiniToast, Tecleo, estilosNovedades as css, type DemoDef, type PasoDemo } from "../Escenario";

const pasos: PasoDemo[] = [
  { dur: 1300, resalta: 0 },
  { objetivo: "btn-marcar", dur: 1200, resalta: 0 },
  { objetivo: "btn-marcar", clic: true, dur: 1500, resalta: 1 },
  { objetivo: "campo-motivo", dur: 1300, resalta: 1 },
  { objetivo: "campo-desc", dur: 2300, resalta: 1 },
  { objetivo: "btn-registrar", clic: true, dur: 2000, resalta: 2 },
  { objetivo: "persona", clic: true, dur: 1700, resalta: 3 },
  { objetivo: "btn-pdf", clic: true, dur: 2600, resalta: 3 },
];

function Fila({ marcado, activo }: { marcado: boolean; activo: boolean }) {
  return (
    <div className="relative rounded-xl border border-brand-brown/10 bg-white p-2.5 pb-8 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10.5px] font-bold">Edinson Bolivar</p>
          <p className="text-[9px] text-brand-black/55">Carrera 36 # 53-45 · Cabecera</p>
        </div>
        <div className="text-right">
          <p className="text-[8.5px] font-semibold text-brand-wine">Comanda #</p>
          <p className="text-[10.5px] font-bold text-brand-wine">14CS00000027</p>
        </div>
      </div>
      <span className="mt-1 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">PENDIENTE</span>
      <span className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-wine text-[8.5px] font-bold text-white">
        27
      </span>
      {marcado ? (
        <span
          title="No gestionado"
          className={`absolute bottom-2 right-8 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[9px] text-white ${css.pop}`}
        >
          ⚑
        </span>
      ) : (
        <span
          data-demo="btn-marcar"
          className={`absolute bottom-2 right-8 flex h-5 w-5 items-center justify-center rounded-full border border-red-200 text-[9px] text-red-600 transition ${
            activo ? "bg-red-600 text-white" : "bg-white"
          }`}
        >
          ⚑
        </span>
      )}
    </div>
  );
}

function Escena({ paso }: { paso: number }) {
  const modal = paso >= 2 && paso <= 5;
  const informe = paso >= 6;
  return (
    <div className="relative flex h-full flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wide text-brand-black/60">Despacho · 8:15 p. m.</p>
        <span className="rounded-full bg-brand-wine/10 px-2 py-0.5 text-[9px] font-semibold text-brand-wine">Administrador App</span>
      </div>

      {!informe && <Fila marcado={paso >= 5} activo={paso === 1} />}

      {modal && paso < 5 && (
        <div className={`absolute inset-x-6 top-10 rounded-xl border border-brand-brown/10 bg-white p-3 shadow-xl ${css.pop}`}>
          <p className="text-[8px] font-bold uppercase tracking-wider text-red-700">Registro de incumplimiento</p>
          <p className="text-[11px] font-bold text-brand-wine">Marcar pedido no gestionado</p>
          <div className="mt-1.5 h-8 rounded-md bg-brand-cream-soft text-center text-[8px] leading-8 text-brand-black/50">
            📷 Foto de la fila del pedido
          </div>
          <p className="mt-1.5 text-[8.5px] font-semibold">Responsable</p>
          <div className="rounded-md border border-brand-brown/20 px-2 py-1 text-[9px]">Laura Gómez · Despacho</div>
          <p className="mt-1 text-[8.5px] font-semibold">Motivo</p>
          <div
            data-demo="campo-motivo"
            className={`rounded-md border px-2 py-1 text-[9px] ${paso === 3 ? "border-brand-amber" : "border-brand-brown/20"}`}
          >
            Pedido sin gestionar al cierre del turno
          </div>
          <p className="mt-1 text-[8.5px] font-semibold">Descripción</p>
          <div
            data-demo="campo-desc"
            className={`min-h-[26px] rounded-md border px-2 py-1 text-[9px] ${paso === 4 ? "border-brand-amber" : "border-brand-brown/20"}`}
          >
            {paso >= 4 && <Tecleo texto="Quedó en Pendiente a las 8:15 p. m. sin iniciar alistamiento." ms={35} />}
          </div>
          <div className="mt-2 flex justify-end">
            <MiniBoton demo="btn-registrar" className="bg-red-700 text-white">
              Registrar incumplimiento
            </MiniBoton>
          </div>
        </div>
      )}
      {paso === 5 && <MiniToast>✓ Incumplimiento registrado para Laura Gómez</MiniToast>}

      {informe && (
        <div className={`grid flex-1 grid-cols-[110px_1fr] overflow-hidden rounded-xl border border-brand-brown/10 bg-white shadow-md ${css.aparecer}`}>
          <div className="border-r border-brand-brown/10 p-2">
            <p className="mb-1 text-[8.5px] font-bold uppercase text-brand-black/50">Personas</p>
            <div
              data-demo="persona"
              className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 ${paso >= 6 ? "bg-brand-wine/5" : ""}`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[9px] font-bold text-red-700">3</span>
              <span className="text-[9px] font-semibold leading-tight">Laura Gómez</span>
            </div>
            <div className="flex items-center gap-1.5 px-1.5 py-1 opacity-60">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[9px] font-bold text-red-700">1</span>
              <span className="text-[9px] leading-tight">Ana Pérez</span>
            </div>
          </div>
          <div className="p-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold">Laura Gómez · CC 1.098.xxx</p>
              <MiniBoton demo="btn-pdf" tono="vino" activo={paso === 7}>
                Generar informe PDF
              </MiniBoton>
            </div>
            {[1, 2].map((k) => (
              <div key={k} className="mt-1.5 rounded-md border-l-4 border-red-600 bg-red-50/60 px-2 py-1">
                <p className="text-[8.5px] font-bold text-red-700">Pedido sin gestionar al cierre del turno</p>
                <p className="text-[8px] text-brand-black/60">Comanda 14CS0000002{k + 6} · PDV Cabecera</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {paso === 7 && (
        <div className={`absolute bottom-3 right-3 w-[120px] rounded-md border border-brand-brown/15 bg-white p-1.5 shadow-xl ${css.pop}`}>
          <div className="h-1.5 rounded bg-brand-wine" />
          <p className="mt-1 text-[7px] font-bold text-brand-wine">Informe de incumplimientos operativos</p>
          <div className="mt-1 space-y-0.5">
            <div className="h-1 rounded bg-brand-cream-soft" />
            <div className="h-1 w-3/4 rounded bg-brand-cream-soft" />
            <div className="h-6 rounded bg-brand-cream-soft" />
          </div>
        </div>
      )}
    </div>
  );
}

const demo: DemoDef = { url: (paso) => (paso >= 6 ? "/admin/despacho · Incumplimientos" : "/admin/despacho"), pasos, Escena };
export default demo;
