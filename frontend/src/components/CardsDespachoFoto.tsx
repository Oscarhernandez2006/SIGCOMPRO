import type { ReactNode } from "react";
import type { ClaveCard, ResumenDespacho } from "@/lib/resumen-despacho";

/* Mismos iconos (heroicons outline) y colores que las cards de Despacho. */
const I = {
  reloj: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  engranaje: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </>
  ),
  caja: <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />,
  recibo: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 3.75h3M3.375 19.5V6.108c0-.668.46-1.247 1.11-1.394a48.6 48.6 0 0 1 1.123-.238m13.917 0a48.6 48.6 0 0 1 1.123.238c.65.147 1.11.726 1.11 1.394V19.5l-3-1.5-3 1.5-3-1.5-3 1.5-3-1.5-3 1.5Zm9.75-12.75h.008v.008H12V6.75Z" />,
  camion: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.834 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />,
  xcirculo: <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  alerta: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />,
  calendario: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />,
  tarjeta: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />,
  check: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
};

interface Def {
  key: ClaveCard;
  label: string;
  sub: string;
  icon: ReactNode;
  chip: string;
  alerta?: boolean;
}

const TOP: Def[] = [
  { key: "total", label: "Total", sub: "Activos de hoy", icon: I.caja, chip: "bg-brand-wine/10 text-brand-wine" },
  { key: "entregados", label: "Entregados", sub: "Entregados (Drivin)", icon: I.check, chip: "bg-green-100 text-green-600" },
];

const GRID: Def[] = [
  { key: "pendientes", label: "Pendientes", sub: "Sin finalizar", icon: I.reloj, chip: "bg-brand-amber/12 text-brand-amber" },
  { key: "atrasados", label: "Atrasados", sub: "No finalizados", icon: I.alerta, chip: "bg-red-100 text-red-600", alerta: true },
  { key: "retenido", label: "Retenido", sub: "Cartera", icon: I.tarjeta, chip: "bg-brand-gold/20 text-brand-amber" },
  { key: "cancelados", label: "Cancelados", sub: "Anulados", icon: I.xcirculo, chip: "bg-red-100 text-red-500" },
  { key: "posteriores", label: "Posteriores", sub: "Programados", icon: I.calendario, chip: "bg-indigo-100 text-indigo-600" },
  { key: "produccion", label: "En producción", sub: "En preparación", icon: I.engranaje, chip: "bg-orange-100 text-orange-600" },
  { key: "alistados", label: "Alistados", sub: "Listos para facturar", icon: I.caja, chip: "bg-violet-100 text-violet-600" },
  { key: "facturados", label: "Facturados", sub: "Con factura", icon: I.recibo, chip: "bg-emerald-100 text-emerald-600" },
  { key: "despachados", label: "Despachados", sub: "En ruta", icon: I.camion, chip: "bg-teal-100 text-teal-600" },
  { key: "transito", label: "En tránsito", sub: "En reparto (Drivin)", icon: I.camion, chip: "bg-sky-100 text-sky-600" },
];

function Card({ def, cantidad, kg, texto }: { def: Def; cantidad: number; kg?: number; texto?: string }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-2.5 text-left shadow-sm ${
        def.alerta && cantidad > 0 ? "border-red-200 bg-white ring-1 ring-red-100" : "border-brand-brown/10 bg-white"
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${def.chip}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
          {def.icon}
        </svg>
      </span>
      <div className="min-w-0 pr-1">
        <p className="text-xs font-semibold text-brand-black">{def.label}</p>
        <p className="text-[10px] text-brand-black">{def.sub}</p>
      </div>
      {kg !== undefined ? (
        <div className="ml-auto flex items-end gap-4">
          <div className="text-center">
            <span className="block text-2xl font-extrabold leading-none text-brand-black">{cantidad}</span>
            <span className="text-[10px] font-semibold text-brand-wine">pedidos</span>
          </div>
          <div className="text-center">
            <span className="block text-2xl font-extrabold leading-none text-brand-black">
              {Number(kg.toFixed(2)).toLocaleString("es-CO")}
            </span>
            <span className="text-[10px] font-semibold text-brand-wine">kilos</span>
          </div>
        </div>
      ) : (
        <span className="ml-auto text-2xl font-extrabold leading-none text-brand-black">{texto ?? cantidad}</span>
      )}
    </div>
  );
}

/** Cards que suman al Total de la foto (lo que aún está por despachar en el punto). */
const SUMAN_TOTAL: ClaveCard[] = ["pendientes", "atrasados", "retenido", "produccion", "alistados", "facturados"];

/** Cards de Despacho (solo lectura) a partir de la foto guardada en la solicitud. */
export default function CardsDespachoFoto({ resumen }: { resumen: ResumenDespacho }) {
  const base = (k: ClaveCard) => resumen[k] ?? { cantidad: 0, kg: 0 };
  const total = SUMAN_TOTAL.reduce(
    (acc, k) => ({ cantidad: acc.cantidad + base(k).cantidad, kg: acc.kg + base(k).kg }),
    { cantidad: 0, kg: 0 },
  );
  const v = (k: ClaveCard) => (k === "total" ? total : base(k));
  // Fotos antiguas no tienen "todos": su "total" era el de todos los pedidos del día.
  const todos = resumen.todos ?? resumen.total ?? { cantidad: 0, kg: 0 };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TOP.map((d) => (
          <Card
            key={d.key}
            def={d}
            cantidad={v(d.key).cantidad}
            kg={d.key === "total" ? v(d.key).kg : undefined}
            texto={d.key === "entregados" ? `${v(d.key).cantidad}/${todos.cantidad}` : undefined}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {GRID.map((d) => (
          <Card key={d.key} def={d} cantidad={v(d.key).cantidad} />
        ))}
      </div>
    </div>
  );
}
