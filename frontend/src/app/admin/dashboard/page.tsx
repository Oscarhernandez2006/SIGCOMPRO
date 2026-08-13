"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getUsuario, tieneAccesoAdministrativo, type Usuario } from "@/lib/auth";
import { puedeVerModulo } from "@/lib/permisos";
import {
  listarPuntosVenta,
  misPuntosVenta,
  type PuntoVenta,
} from "@/lib/puntos-venta";
import { cargarEstadoPedidos, type DespachoMeta } from "@/lib/pedidos";
import { objetivoDespacho, deadlinePreparacion, msRestantesDespacho, yaDespachado } from "@/lib/despacho";
import type { Pedido } from "@/app/(panel)/pedidos/page";

const cop = (n: number) => "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");
const num = (n: number) => (Number(n) || 0).toLocaleString("es-CO");

/** Peso total del pedido en kilos (suma los ítems vendidos por KG). */
function pesoPedidoKg(p: Pedido): number {
  return (p.carrito ?? []).reduce((s, i) => {
    const esKilo = (i.producto?.um || "").trim().toUpperCase() === "KG";
    return s + (esKilo ? Number(i.cantidad) || 0 : 0);
  }, 0);
}

/** Formatea una duración promedio en milisegundos: "45s", "7m 12s", "1h 3m". */
function fmtPromDuracion(ms: number): string {
  if (!ms || ms <= 0) return "\u2014";
  const totalSeg = Math.round(ms / 1000);
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  if (min < 1) return `${seg}s`;
  if (min < 60) return `${min}m ${seg}s`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

const DAY = 86400000;
const PALETA = ["#7b1e3b", "#d98c2b", "#2e7d63", "#2b6cb0", "#8e44ad", "#c0392b", "#16a085", "#e67e22"];

const COLOR_ESTADO: Record<string, string> = {
  "En proceso": "#d98c2b",
  "En producción": "#2b6cb0",
  Alistado: "#8e44ad",
  Facturado: "#16a085",
  Despachado: "#2e7d63",
  "En tránsito": "#2b6cb0",
  Entregado: "#2e7d63",
  Anulado: "#c0392b",
  Cancelado: "#e67e22",
};

/** Iconos (heroicons outline) para las cards de movimientos, igual que Despacho. */
const IC_MOV = {
  caja: <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />,
  reloj: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  alerta: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />,
  tarjeta: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />,
  calendario: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />,
  engranaje: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </>
  ),
  recibo: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 3.75h3M3.375 19.5V6.108c0-.668.46-1.247 1.11-1.394a48.6 48.6 0 0 1 1.123-.238m13.917 0a48.6 48.6 0 0 1 1.123.238c.65.147 1.11.726 1.11 1.394V19.5l-3-1.5-3 1.5-3-1.5-3 1.5-3-1.5-3 1.5Zm9.75-12.75h.008v.008H12V6.75Z" />,
  camion: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.834 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />,
  xcirculo: <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
} as const;

/** Cards de "movimientos": mismo set, orden e iconos que la vista de Despacho. */
const MOV_DEFS: { key: string; label: string; sub: string; color: string; icon: React.ReactNode }[] = [
  { key: "pendientes", label: "Pendientes", sub: "Sin finalizar", color: "#d98c2b", icon: IC_MOV.reloj },
  { key: "atrasados", label: "Atrasados", sub: "No finalizados", color: "#c0392b", icon: IC_MOV.alerta },
  { key: "retenidos", label: "Retenidos", sub: "Cartera", color: "#caa54a", icon: IC_MOV.tarjeta },
  { key: "posteriores", label: "Posteriores", sub: "Programados", color: "#6366f1", icon: IC_MOV.calendario },
  { key: "produccion", label: "En producción", sub: "En preparación", color: "#2b6cb0", icon: IC_MOV.engranaje },
  { key: "alistados", label: "Alistados", sub: "Listos para facturar", color: "#8e44ad", icon: IC_MOV.caja },
  { key: "facturados", label: "Facturados", sub: "Con factura", color: "#16a085", icon: IC_MOV.recibo },
  { key: "despachados", label: "Despachados", sub: "En ruta o entregados", color: "#2e7d63", icon: IC_MOV.camion },
  { key: "cancelados", label: "Cancelados", sub: "Anulados", color: "#c0392b", icon: IC_MOV.xcirculo },
];

/* --- Helpers de clasificación de movimientos (idénticos a la vista Despacho) --- */
function normEstado(s?: string | null): string {
  return (s ?? "").trim().toLowerCase();
}
function hoyISOd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Día de entrega efectivo (YYYY-MM-DD): el programado o el de creación. */
function diaEntregaISOd(p: Pedido): string {
  if (p.entregaProgramada && p.fechaProgramada) return p.fechaProgramada;
  const d = new Date(p.fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** ¿El pedido es para HOY? Incluye arrastrados activos de días anteriores. */
function esDeHoyd(p: Pedido): boolean {
  const dia = diaEntregaISOd(p);
  const hoy = hoyISOd();
  if (dia === hoy) return true;
  if (dia < hoy) {
    const e = normEstado(p.estado);
    return !p.anulado && !yaDespachado(p.estado) && e !== "anulado";
  }
  return false;
}
/** ¿Es un "posterior" (programado para un día futuro)? */
function esPosteriorFuturod(p: Pedido): boolean {
  return Boolean(p.entregaProgramada && p.fechaProgramada && p.fechaProgramada > hoyISOd());
}

/**
 * Cuenta los movimientos por estado replicando EXACTAMENTE la vista de Despacho:
 *  - "Hoy": pedidos de hoy (entrega de hoy + arrastrados activos) + posteriores.
 *  - Otros periodos: pedidos cuyo día de entrega cae en la ventana, por estado.
 * Un pedido atrasado se cuenta solo en "Atrasados" (no en su card de proceso).
 */
function calcularMovimientos(
  pedidos: Pedido[],
  metaMap: Record<string, DespachoMeta>,
  enHoy: boolean,
  desde: number | null,
  hasta: number | null,
): Record<string, number> {
  const base = pedidos.filter((p) => {
    if (enHoy) return esDeHoyd(p);
    const t = new Date(`${diaEntregaISOd(p)}T00:00:00`).getTime();
    if (desde != null && t < desde) return false;
    if (hasta != null && t > hasta) return false;
    return true;
  });
  const ahora = Date.now();
  const esAtrasado = (p: Pedido) => {
    if (p.anulado) return false;
    const e = normEstado(p.estado);
    if (yaDespachado(p.estado) || e === "anulado") return false;
    return msRestantesDespacho(p, ahora, metaMap[p.id]?.pagoConfirmado) <= 0;
  };
  const atrasadosSet = new Set(base.filter(esAtrasado).map((p) => p.id));
  const cuenta = (pred: (p: Pedido) => boolean) =>
    base.filter((p) => pred(p) && !atrasadosSet.has(p.id)).length;
  const cards: Record<string, number> = {
    pendientes: cuenta((p) => !p.anulado && normEstado(p.estado) === "en proceso"),
    atrasados: atrasadosSet.size,
    retenidos: cuenta((p) => normEstado(p.estado) === "liberación"),
    posteriores: pedidos.filter(esPosteriorFuturod).length,
    produccion: cuenta((p) => normEstado(p.estado) === "en producción"),
    alistados: cuenta((p) => normEstado(p.estado) === "alistado"),
    facturados: cuenta((p) => normEstado(p.estado) === "facturado"),
    despachados: cuenta((p) => yaDespachado(p.estado)),
    cancelados: cuenta((p) => p.anulado || normEstado(p.estado) === "anulado"),
  };
  cards.total = MOV_DEFS.reduce((s, d) => s + (cards[d.key] ?? 0), 0);
  return cards;
}

type Periodo = 1 | 7 | 30 | 0; // 0 = todo

function tsPedido(p: Pedido): number {
  const t = new Date(p.fecha).getTime();
  return Number.isFinite(t) ? t : 0;
}

export default function DashboardPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [meta, setMeta] = useState<Record<string, DespachoMeta>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [puntoSel, setPuntoSel] = useState<string>("todos");
  const [periodo, setPeriodo] = useState<Periodo>(30);
  // Rango de fechas personalizado (YYYY-MM-DD). Si hay alguno, manda sobre el
  // preset (Hoy/7/30/Todo) y desactiva la comparación con el periodo anterior.
  const [rangoDesde, setRangoDesde] = useState("");
  const [rangoHasta, setRangoHasta] = useState("");
  const usaRango = Boolean(rangoDesde || rangoHasta);
  // Muestra las cards de "movimientos" (conteo por estado del periodo elegido).
  const [verMovimientos, setVerMovimientos] = useState(false);

  const esAdmin = tieneAccesoAdministrativo(usuario?.rol);

  useEffect(() => {
    const u = getUsuario();
    // Solo entran quienes tengan el permiso "dashboard" (o acceso total).
    if (!puedeVerModulo(u, "dashboard")) {
      router.replace("/");
      return;
    }
    setUsuario(u);
  }, [router]);

  useEffect(() => {
    if (usuario === null) return;
    let cancelado = false;
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const cargaPuntos = esAdmin ? listarPuntosVenta() : misPuntosVenta();
        const [ps, estado] = await Promise.all([cargaPuntos, cargarEstadoPedidos()]);
        if (cancelado) return;
        setPuntos(ps);
        setPedidos(estado.pedidos ?? []);
        setMeta(estado.meta ?? {});
        // Si solo hay un punto, se selecciona por defecto.
        if (ps.length === 1) setPuntoSel(String(ps[0].id));
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : "No se pudo cargar la información");
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, esAdmin]);

  // IDs de puntos que el usuario puede ver (para acotar los pedidos).
  const idsVisibles = useMemo(() => new Set(puntos.map((p) => String(p.id))), [puntos]);

  // Pedidos acotados a los puntos visibles y al punto seleccionado.
  const pedidosBase = useMemo(() => {
    const visibles = esAdmin
      ? pedidos
      : pedidos.filter((p) => idsVisibles.has(String(p.punto?.id)));
    if (puntoSel === "todos") return visibles;
    return visibles.filter((p) => String(p.punto?.id) === puntoSel);
  }, [pedidos, esAdmin, idsVisibles, puntoSel]);

  // Ventanas de tiempo (periodo actual y anterior, para comparar).
  const { desde, prevDesde } = useMemo(() => {
    if (usaRango) {
      const d = rangoDesde ? new Date(`${rangoDesde}T00:00:00`).getTime() : null;
      return { desde: d, prevDesde: null as number | null };
    }
    if (periodo === 0) return { desde: null as number | null, prevDesde: null as number | null };
    const hoy0 = new Date();
    hoy0.setHours(0, 0, 0, 0);
    const d = hoy0.getTime() - (periodo - 1) * DAY;
    return { desde: d, prevDesde: d - periodo * DAY };
  }, [periodo, usaRango, rangoDesde]);

  // Fin del rango personalizado (ms). null = sin tope.
  const hastaMs = useMemo(() => {
    if (!usaRango || !rangoHasta) return null;
    return new Date(`${rangoHasta}T23:59:59.999`).getTime();
  }, [usaRango, rangoHasta]);

  const enPeriodo = useMemo(() => {
    return pedidosBase.filter((p) => {
      const t = tsPedido(p);
      if (desde != null && t < desde) return false;
      if (hastaMs != null && t > hastaMs) return false;
      return true;
    });
  }, [pedidosBase, desde, hastaMs]);

  const enPrevio = useMemo(() => {
    if (desde == null || prevDesde == null) return [];
    return pedidosBase.filter((p) => {
      const t = tsPedido(p);
      return t >= prevDesde && t < desde;
    });
  }, [pedidosBase, desde, prevDesde]);

  // Días exactos que deben aparecer en el eje de la gráfica (rellena con 0 los
  // días sin ventas). Para "Todo" se deja null (se rellena entre min y max).
  const rangoDias = useMemo(() => {
    if (usaRango) {
      if (!rangoDesde || !rangoHasta) return null;
      const arr: string[] = [];
      const end = new Date(`${rangoHasta}T00:00:00`);
      for (let d = new Date(`${rangoDesde}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) {
        arr.push(diaLocalDate(new Date(d)));
      }
      return arr;
    }
    if (periodo === 0) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (periodo - 1));
    const arr: string[] = [];
    for (let i = 0; i < periodo; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push(diaLocalDate(d));
    }
    return arr;
  }, [periodo, usaRango, rangoDesde, rangoHasta]);

  // Métricas principales.
  const m = useMemo(() => métricas(enPeriodo, meta, rangoDias), [enPeriodo, meta, rangoDias]);
  const mPrev = useMemo(() => métricas(enPrevio, meta), [enPrevio, meta]);

  // Movimientos por estado (misma clasificación que Despacho), según periodo.
  const mov = useMemo(
    () => calcularMovimientos(pedidosBase, meta, periodo === 1 && !usaRango, desde, hastaMs),
    [pedidosBase, meta, periodo, usaRango, desde, hastaMs],
  );

  // Serie de la gráfica de tendencia: SIEMPRE del primer día con actividad a
  // hoy (independiente del periodo, para que "Hoy" no muestre un solo punto).
  const ventasSerie = useMemo(() => serieVentasDiarias(pedidosBase), [pedidosBase]);

  const nombrePunto =
    puntoSel === "todos"
      ? esAdmin
        ? "Todos los puntos"
        : "Todos mis puntos"
      : puntos.find((p) => String(p.id) === puntoSel)?.nombre ?? "Punto";

  const sinAcceso = usuario && !puedeVerModulo(usuario, "dashboard");

  if (sinAcceso) {
    return (
      <div className="rounded-2xl border border-brand-brown/10 bg-white py-16 text-center text-sm text-brand-brown/60 shadow-sm">
        No tienes acceso al Dashboard.
      </div>
    );
  }

  return (
    <div className="pb-4">
      {/* Encabezado comercial + filtros */}
      <div className="mb-6 overflow-hidden rounded-3xl border border-brand-brown/10 bg-gradient-to-br from-brand-wine to-brand-wine-dark text-white shadow-sm">
        <div className="flex flex-col gap-5 p-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">
              Panel comercial
            </p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-white/70">
              Ventas y operación de <b className="text-white">{nombrePunto}</b>
              {periodo !== 0 && ` · últimos ${periodo === 1 ? "1 día" : `${periodo} días`}`}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 lg:flex-nowrap">
            <label className="flex flex-col text-[11px] font-semibold uppercase tracking-wide text-white/60">
              Punto de venta
              <div className="relative mt-1">
                <select
                  value={puntoSel}
                  onChange={(e) => setPuntoSel(e.target.value)}
                  className="w-full min-w-[8rem] max-w-[11rem] appearance-none rounded-xl border border-white/15 bg-white/10 px-3 py-2 pr-9 text-sm font-semibold text-white outline-none backdrop-blur transition focus:border-brand-gold [&>option]:text-brand-black"
                >
                  <option value="todos">
                    {esAdmin ? "Todos los puntos" : "Todos mis puntos"}
                  </option>
                  {puntos.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </label>
            <div className="flex flex-col text-[11px] font-semibold uppercase tracking-wide text-white/60">
              Periodo
              <div className="mt-1 inline-flex rounded-xl border border-white/15 bg-white/10 p-0.5 backdrop-blur">
                {(
                  [
                    [1, "Hoy"],
                    [7, "7 días"],
                    [30, "30 días"],
                    [0, "Todo"],
                  ] as [Periodo, string][]
                ).map(([v, lbl]) => (
                  <button
                    key={v}
                    onClick={() => {
                      setPeriodo(v);
                      setRangoDesde("");
                      setRangoHasta("");
                    }}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      periodo === v && !usaRango
                        ? "bg-white text-brand-wine shadow-sm"
                        : "text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col text-[11px] font-semibold uppercase tracking-wide text-white/60">
              Desde
              <input
                type="date"
                value={rangoDesde}
                max={rangoHasta || undefined}
                onChange={(e) => setRangoDesde(e.target.value)}
                className="mt-1 w-[8.5rem] rounded-xl border border-white/15 bg-white/10 px-2.5 py-2 text-sm font-semibold text-white outline-none backdrop-blur focus:border-brand-gold [color-scheme:dark]"
              />
            </label>
            <label className="flex flex-col text-[11px] font-semibold uppercase tracking-wide text-white/60">
              Hasta
              <input
                type="date"
                value={rangoHasta}
                min={rangoDesde || undefined}
                onChange={(e) => setRangoHasta(e.target.value)}
                className="mt-1 w-[8.5rem] rounded-xl border border-white/15 bg-white/10 px-2.5 py-2 text-sm font-semibold text-white outline-none backdrop-blur focus:border-brand-gold [color-scheme:dark]"
              />
            </label>
            {usaRango && (
              <button
                onClick={() => {
                  setRangoDesde("");
                  setRangoHasta("");
                }}
                title="Quitar el rango de fechas"
                className="self-end rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white/80 backdrop-blur transition hover:bg-white/20"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-3 text-sm text-brand-wine">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Botón para ver los movimientos (conteo por estado) del periodo */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setVerMovimientos((v) => !v)}
              aria-pressed={verMovimientos}
              title="Ver el conteo de pedidos por estado según el periodo y punto elegidos"
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                verMovimientos
                  ? "border-brand-wine bg-brand-wine text-white shadow-sm"
                  : "border-brand-wine/25 bg-white text-brand-wine hover:bg-brand-wine/5"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
              {verMovimientos ? "Ocultar movimientos" : "Ver movimientos"}
            </button>
          </div>

          {/* Movimientos: conteo de pedidos por estado en el periodo elegido */}
          {verMovimientos && (
            <section>
              <Eyebrow>Movimientos del periodo</Eyebrow>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <MovCard
                  label="Total"
                  sub={periodo === 1 ? "Activos de hoy" : "Movimientos del periodo"}
                  value={mov.total ?? 0}
                  color="#7b1e3b"
                  icon={IC_MOV.caja}
                />
                {MOV_DEFS.map((d) => (
                  <MovCard
                    key={d.key}
                    label={d.label}
                    sub={d.sub}
                    value={mov[d.key] ?? 0}
                    color={d.color}
                    icon={d.icon}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Rendimiento del periodo */}
          <section>
            <Eyebrow>Rendimiento del periodo</Eyebrow>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                titulo="Ventas (pedidos)"
                valor={cop(m.ventas)}
                delta={periodo === 0 || usaRango ? null : delta(m.ventas, mPrev.ventas)}
                color="wine"
                icon="M2.25 18 9 11.25l4.306 4.307a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.28m5.94 2.28-2.28 5.941"
              />
              <Kpi
                titulo="Facturado"
                valor={cop(m.facturado)}
                delta={periodo === 0 || usaRango ? null : delta(m.facturado, mPrev.facturado)}
                color="amber"
                icon="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"
              />
              <Kpi
                titulo="Pedidos"
                valor={num(m.numPedidos)}
                delta={periodo === 0 || usaRango ? null : delta(m.numPedidos, mPrev.numPedidos)}
                color="green"
                icon="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9h6m-6 4h4"
              />
              <Kpi
                titulo="Ticket promedio"
                valor={cop(m.ticket)}
                delta={periodo === 0 || usaRango ? null : delta(m.ticket, mPrev.ticket)}
                color="blue"
                icon="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MiniStat titulo="Unidades vendidas" valor={num(Math.round(m.unidades))} icon="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
              <MiniStat titulo="Domicilios" valor={`${num(m.domicilios)}`} sub={cop(m.valorDomicilios)} icon="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.834 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              <MiniStat titulo="Anulados / Cancelados" valor={`${num(m.anulados)} / ${num(m.cancelados)}`} sub={`${m.pctBaja.toFixed(1)}%`} icon="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              <MiniStat titulo="Clientes atendidos" valor={num(m.clientes)} icon="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </div>
          </section>

          {/* Cumplimiento de despacho */}
          <section>
            <Eyebrow>Cumplimiento de despacho</Eyebrow>
            <div className="grid gap-4 md:grid-cols-3">
              <Panel>
                <CardHead titulo="Despachados" desc="Pedidos entregados en el periodo" />
                <p className="font-display text-3xl font-extrabold tabular-nums text-brand-black">
                  {num(m.despachados)}
                  <span className="ml-2 text-base font-bold text-brand-brown/50">
                    de {num(m.numPedidos)}
                  </span>
                </p>
                <p className="mt-1 text-sm text-brand-brown/60">
                  {m.pctDespachados.toFixed(1)}% del total · {cop(m.valorDespachado)}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-cream-soft">
                  <div className="h-full rounded-full bg-brand-wine" style={{ width: `${Math.min(100, m.pctDespachados)}%` }} />
                </div>
              </Panel>
              <Cumplimiento
                titulo="Entregas a tiempo"
                desc="Despachados dentro del tiempo"
                pct={m.pctEntrega}
                aTiempo={m.entregaATiempo}
                total={m.entregaConDato}
              />
              <Cumplimiento
                titulo="Alistados a tiempo"
                desc="Alistamiento dentro del tiempo"
                pct={m.pctAlistado}
                aTiempo={m.alistadosATiempo}
                total={m.alistadosCount}
              />
            </div>
          </section>

          {/* Tendencia y distribución */}
          <section>
            <Eyebrow>Tendencia y distribución</Eyebrow>
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel className="lg:col-span-2">
                <CardHead titulo="Ventas por día" desc="Total facturado (pedidos válidos)" />
                <LineChart data={ventasSerie} />
              </Panel>
              <Panel>
                <CardHead titulo="Pedidos por estado" desc="Distribución del periodo" />
                <DonutLeyenda data={m.porEstado} totalLabel="pedidos" />
              </Panel>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <Panel>
                <CardHead titulo="Métodos de pago" desc="Por número de pedidos válidos" />
                <DonutLeyenda data={m.porPago} totalLabel="pedidos" />
                <div className="mt-16 border-t border-brand-brown/10 pt-6">
                  <h4 className="mb-4 text-[11px] font-bold uppercase tracking-wide text-brand-brown/55">
                    Tipo de entrega
                  </h4>
                  <DonutLeyenda
                    data={[
                      { label: "Domicilio", value: m.domicilios, color: "#d9772e" },
                      { label: "Recoge en punto", value: m.recoge, color: "#6e1a2b" },
                    ]}
                    totalLabel="pedidos"
                  />
                </div>
              </Panel>
              <Panel className="lg:col-span-2">
                <CardHead titulo="Top 10 productos" desc="Por valor vendido en el periodo" />
                <TablaTop
                  filas={m.topProductos}
                  col1="Producto"
                  render={(f) => (
                    <>
                      <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-brand-brown/70">{num(Math.round(f.kilos ?? 0))} kg</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right font-display font-bold tabular-nums text-brand-black">{cop(f.total)}</td>
                    </>
                  )}
                  cabeceras={["Kilos", "Total"]}
                  max={m.topProductos[0]?.total ?? 0}
                  valor={(f) => f.total}
                />
              </Panel>
            </div>
          </section>

          {/* Rankings y control */}
          <section>
            <Eyebrow>Rankings y control</Eyebrow>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel>
                <CardHead titulo="Ranking de televendedoras" desc="Por valor vendido en el periodo" />
                <TablaTop
                  filas={m.topVendedoras}
                  col1="Televendedora"
                  render={(f) => (
                    <>
                      <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-brand-brown/70">{num(f.unidades)}</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right font-display font-bold tabular-nums text-brand-black">{cop(f.total)}</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right font-display font-bold tabular-nums text-emerald-700">{cop(f.facturado ?? 0)}</td>
                    </>
                  )}
                  cabeceras={["Pedidos", "Vendido", "Facturado"]}
                  max={m.topVendedoras[0]?.total ?? 0}
                  valor={(f) => f.total}
                />
              </Panel>
              <Panel>
                <CardHead titulo="Top clientes" desc="Por valor comprado en el periodo" />
                <TablaTop
                  filas={m.topClientes}
                  col1="Cliente"
                  render={(f) => (
                    <>
                      <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-brand-brown/70">{num(f.unidades)}</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-brand-brown/70">{num(Math.round(f.kilos ?? 0))} kg</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right font-display font-bold tabular-nums text-brand-black">{cop(f.total)}</td>
                    </>
                  )}
                  cabeceras={["Pedidos", "Kilos", "Total"]}
                  max={m.topClientes[0]?.total ?? 0}
                  valor={(f) => f.total}
                />
              </Panel>
              <Panel>
                <CardHead titulo="Ranking de porcionadores" desc="Pedidos, kilos y tiempo promedio de preparación" />
                <TablaTop
                  filas={m.topPorcionadores}
                  col1="Porcionador"
                  render={(f) => (
                    <>
                      <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-brand-brown/70">{num(f.unidades)}</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-brand-brown/70">{num(Math.round(f.kilos ?? 0))} kg</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-brand-brown/70">{f.prepCount ? fmtPromDuracion((f.prepMs ?? 0) / f.prepCount) : "\u2014"}</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right font-display font-bold tabular-nums text-brand-black">{cop(f.total)}</td>
                    </>
                  )}
                  cabeceras={["Pedidos", "Kilos", "T. prom", "Valor"]}
                  max={m.topPorcionadores[0]?.total ?? 0}
                  valor={(f) => f.total}
                />
              </Panel>
              <Panel>
                <CardHead titulo="Ranking de domiciliarios" desc="Pedidos, kilos y valor entregado en el periodo" />
                <TablaTop
                  filas={m.topDomiciliarios}
                  col1="Domiciliario"
                  render={(f) => (
                    <>
                      <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-brand-brown/70">{num(f.unidades)}</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-brand-brown/70">{num(Math.round(f.kilos ?? 0))} kg</td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right font-display font-bold tabular-nums text-brand-black">{cop(f.total)}</td>
                    </>
                  )}
                  cabeceras={["Pedidos", "Kilos", "Valor"]}
                  max={m.topDomiciliarios[0]?.total ?? 0}
                  valor={(f) => f.total}
                />
              </Panel>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cálculo de métricas                                                        */
/* -------------------------------------------------------------------------- */

interface FilaTop {
  nombre: string;
  unidades: number;
  total: number;
  /** Valor facturado (suma de facturaValor de despacho). Solo televendedoras. */
  facturado?: number;
  /** Kilos porcionados (suma del peso KG de los pedidos). Solo porcionadores. */
  kilos?: number;
  /** Suma de tiempos de preparación (fin - inicio) en ms. Solo porcionadores. */
  prepMs?: number;
  /** Número de pedidos con tiempo de preparación registrado. */
  prepCount?: number;
}

function diaLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diaLocal(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return diaLocalDate(d);
}

/**
 * Serie de ventas diarias para la gráfica de tendencia. SIEMPRE va desde el
 * primer día con actividad (cualquier pedido, incluidos anulados) hasta hoy,
 * rellenando con 0 los días sin ventas válidas. No depende del periodo elegido
 * (así, aunque se seleccione "Hoy", la línea sigue mostrándose completa).
 */
function serieVentasDiarias(lista: Pedido[]): { dia: string; valor: number }[] {
  const validos = lista.filter((p) => p.anulado !== true);
  const porDiaMap = new Map<string, number>();
  for (const p of validos) {
    const dia = diaLocal(p.fecha);
    if (dia) porDiaMap.set(dia, (porDiaMap.get(dia) ?? 0) + (Number(p.total) || 0));
  }
  let primerDia = "";
  for (const p of lista) {
    const d = diaLocal(p.fecha);
    if (d && (!primerDia || d < primerDia)) primerDia = d;
  }
  if (!primerDia) return [];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const out: { dia: string; valor: number }[] = [];
  for (let d = new Date(primerDia + "T00:00"); d <= hoy; d.setDate(d.getDate() + 1)) {
    const key = diaLocalDate(d);
    out.push({ dia: key, valor: porDiaMap.get(key) ?? 0 });
  }
  return out;
}

function métricas(
  lista: Pedido[],
  metaMap: Record<string, DespachoMeta> = {},
  rangoDias: string[] | null = null,
) {
  const validos = lista.filter((p) => p.anulado !== true);
  const ventas = validos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  // Valor facturado: lo que la despachadora registra en la factura de cada
  // pedido (DespachoMeta.facturaValor). Puede diferir del total del pedido.
  const facturado = validos.reduce(
    (s, p) => s + (Number(metaMap[p.id]?.facturaValor) || 0),
    0,
  );
  const numPedidos = validos.length;
  const ticket = numPedidos ? ventas / numPedidos : 0;

  // --- Cumplimiento de despacho (usa la metadata de despacho) ---
  let despachados = 0;
  let valorDespachado = 0;
  let entregaConDato = 0; // despachados con hora de despacho registrada
  let entregaATiempo = 0;
  let alistadosCount = 0; // pedidos marcados como alistados (m.fin)
  let alistadosATiempo = 0;
  for (const p of validos) {
    const dm = metaMap[p.id];
    const pc = dm?.pagoConfirmado;
    if (p.estado === "Despachado" || dm?.despachoFin) {
      despachados += 1;
      valorDespachado += Number(p.total) || 0;
    }
    if (dm?.despachoFin) {
      entregaConDato += 1;
      if (new Date(dm.despachoFin).getTime() <= objetivoDespacho(p, pc)) entregaATiempo += 1;
    }
    if (dm?.fin) {
      alistadosCount += 1;
      if (new Date(dm.fin).getTime() <= deadlinePreparacion(p, pc)) alistadosATiempo += 1;
    }
  }
  const pctEntrega = entregaConDato ? (entregaATiempo / entregaConDato) * 100 : 0;
  const pctAlistado = alistadosCount ? (alistadosATiempo / alistadosCount) * 100 : 0;
  const pctDespachados = numPedidos ? (despachados / numPedidos) * 100 : 0;

  const anulados = lista.filter((p) => p.estado === "Anulado").length;
  const cancelados = lista.filter((p) => p.estado === "Cancelado").length;
  const pctBaja = lista.length ? ((anulados + cancelados) / lista.length) * 100 : 0;

  let unidades = 0;
  const domicilios = validos.filter((p) => p.entrega === "domicilio");
  const valorDomicilios = domicilios.reduce((s, p) => s + (Number(p.valorDomicilio) || 0), 0);
  const recoge = validos.filter((p) => p.entrega === "recoge").length;

  const clientesSet = new Set<string>();

  // Ventas por día.
  const porDiaMap = new Map<string, number>();
  // Estados.
  const estadoMap = new Map<string, number>();
  // Pagos.
  const pagoMap = new Map<string, number>();
  // Productos.
  const prodMap = new Map<string, FilaTop>();
  // Clientes.
  const cliMap = new Map<string, FilaTop>();
  // Televendedoras.
  const vendMap = new Map<string, FilaTop>();
  // Personal de despacho.
  const porcMap = new Map<string, FilaTop>();
  const domiMap = new Map<string, FilaTop>();

  for (const p of validos) {
    const dia = diaLocal(p.fecha);
    if (dia) porDiaMap.set(dia, (porDiaMap.get(dia) ?? 0) + (Number(p.total) || 0));

    const est = p.estado || "En proceso";
    estadoMap.set(est, (estadoMap.get(est) ?? 0) + 1);

    const pago = p.pago || "Sin definir";
    pagoMap.set(pago, (pagoMap.get(pago) ?? 0) + 1);

    const cli = p.cliente;
    const cliKey = cli?.nit_cedula || cli?.nombre || "—";
    clientesSet.add(cliKey);
    const cliNombre = cli?.nombre || cli?.nit_cedula || "Sin cliente";
    const ce = cliMap.get(cliKey) ?? { nombre: cliNombre, unidades: 0, total: 0, kilos: 0 };
    ce.unidades += 1;
    ce.total += Number(p.total) || 0;
    ce.kilos = (ce.kilos ?? 0) + pesoPedidoKg(p);
    cliMap.set(cliKey, ce);

    // Televendedora que creó el pedido.
    const vendNombre = p.vendedorNombre || p.vendedorCedula || "Sin vendedora";
    const vendKey = p.vendedorCedula || p.vendedorNombre || "\u2014";
    const ve = vendMap.get(vendKey) ?? { nombre: vendNombre, unidades: 0, total: 0, facturado: 0 };
    ve.unidades += 1; // número de pedidos
    ve.total += Number(p.total) || 0;
    ve.facturado = (ve.facturado ?? 0) + (Number(metaMap[p.id]?.facturaValor) || 0);
    vendMap.set(vendKey, ve);

    // Personal de despacho (porcionador / domiciliario) desde la metadata.
    const dm = metaMap[p.id];
    const porc = (dm?.porcionador || "").trim();
    if (porc) {
      const e = porcMap.get(porc) ?? { nombre: porc, unidades: 0, total: 0, kilos: 0, prepMs: 0, prepCount: 0 };
      e.unidades += 1;
      e.total += Number(p.total) || 0;
      e.kilos = (e.kilos ?? 0) + pesoPedidoKg(p);
      if (dm?.inicio && dm?.fin) {
        const ms = new Date(dm.fin).getTime() - new Date(dm.inicio).getTime();
        if (Number.isFinite(ms) && ms > 0) {
          e.prepMs = (e.prepMs ?? 0) + ms;
          e.prepCount = (e.prepCount ?? 0) + 1;
        }
      }
      porcMap.set(porc, e);
    }
    const domi = (dm?.domiciliario || "").trim();
    if (domi) {
      const e = domiMap.get(domi) ?? { nombre: domi, unidades: 0, total: 0, kilos: 0 };
      e.unidades += 1;
      e.total += Number(p.total) || 0;
      e.kilos = (e.kilos ?? 0) + pesoPedidoKg(p);
      domiMap.set(domi, e);
    }

    for (const it of p.carrito ?? []) {
      const cant = Number(it.cantidad) || 0;
      unidades += cant;
      const prod = it.producto;
      const nombre = prod?.producto || prod?.referencia || "Producto";
      const precio = Number(prod?.precio) || 0;
      const esKilo = (prod?.um || "").trim().toUpperCase() === "KG";
      const pe = prodMap.get(nombre) ?? { nombre, unidades: 0, total: 0, kilos: 0 };
      pe.unidades += cant;
      pe.kilos = (pe.kilos ?? 0) + (esKilo ? cant : 0);
      pe.total += precio * cant;
      prodMap.set(nombre, pe);
    }
  }

  // Serie de ventas por día. Si hay un rango fijo (7/30 días) se rellenan los
  // días sin ventas con 0. Para "Todo" se rellena entre el primer y último día.
  let ventasPorDia: { dia: string; valor: number }[];
  if (rangoDias && rangoDias.length) {
    ventasPorDia = rangoDias.map((dia) => ({ dia, valor: porDiaMap.get(dia) ?? 0 }));
  } else {
    const dias = [...porDiaMap.keys()].sort();
    if (dias.length <= 1) {
      ventasPorDia = dias.map((dia) => ({ dia, valor: porDiaMap.get(dia) ?? 0 }));
    } else {
      ventasPorDia = [];
      const end = new Date(dias[dias.length - 1] + "T00:00");
      for (let d = new Date(dias[0] + "T00:00"); d <= end; d.setDate(d.getDate() + 1)) {
        const key = diaLocalDate(d);
        ventasPorDia.push({ dia: key, valor: porDiaMap.get(key) ?? 0 });
      }
    }
  }
  // Arranca la serie desde el primer día con ACTIVIDAD (cualquier pedido,
  // incluidos anulados). Así no se ven muchos días en cero al inicio, pero sí
  // los días posteriores (aunque tengan 0 ventas válidas), y avanza hacia hoy.
  let primerDiaActividad = "";
  for (const p of lista) {
    const d = diaLocal(p.fecha);
    if (d && (!primerDiaActividad || d < primerDiaActividad)) primerDiaActividad = d;
  }
  if (primerDiaActividad) {
    ventasPorDia = ventasPorDia.filter((d) => d.dia >= primerDiaActividad);
  }

  const porEstado = [...estadoMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: COLOR_ESTADO[label] ?? PALETA[i % PALETA.length] }));

  const porPago = [...pagoMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: PALETA[i % PALETA.length] }));

  const topProductos = [...prodMap.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  const topClientes = [...cliMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  const topVendedoras = [...vendMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  const topPorcionadores = [...porcMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  const topDomiciliarios = [...domiMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  // Motivos de baja (anulados + cancelados) agrupados.
  const motivoMap = new Map<string, { motivo: string; tipo: string; count: number }>();
  for (const p of lista) {
    if (p.estado !== "Anulado" && p.estado !== "Cancelado") continue;
    const motivo = p.motivo || "Sin motivo";
    const key = `${p.estado}|${motivo}`;
    const e = motivoMap.get(key) ?? { motivo, tipo: p.estado, count: 0 };
    e.count += 1;
    motivoMap.set(key, e);
  }
  const motivos = [...motivoMap.values()].sort((a, b) => b.count - a.count);

  return {
    ventas,
    facturado,
    numPedidos,
    ticket,
    despachados,
    valorDespachado,
    pctDespachados,
    entregaConDato,
    entregaATiempo,
    pctEntrega,
    alistadosCount,
    alistadosATiempo,
    pctAlistado,
    anulados,
    cancelados,
    pctBaja,
    unidades,
    domicilios: domicilios.length,
    valorDomicilios,
    recoge,
    clientes: clientesSet.size,
    ventasPorDia,
    porEstado,
    porPago,
    topProductos,
    topClientes,
    topVendedoras,
    topPorcionadores,
    topDomiciliarios,
    motivos,
  };
}

function delta(actual: number, previo: number): { pct: number; positivo: boolean } | null {
  if (!previo) {
    if (!actual) return null;
    return { pct: 100, positivo: true };
  }
  const pct = ((actual - previo) / previo) * 100;
  return { pct, positivo: pct >= 0 };
}

/* -------------------------------------------------------------------------- */
/* Componentes de UI                                                          */
/* -------------------------------------------------------------------------- */

const COLOR_KPI: Record<string, { chip: string; barra: string }> = {
  wine: { chip: "bg-brand-wine/10 text-brand-wine", barra: "bg-brand-wine" },
  amber: { chip: "bg-amber-100 text-amber-700", barra: "bg-brand-amber" },
  green: { chip: "bg-emerald-100 text-emerald-700", barra: "bg-emerald-500" },
  blue: { chip: "bg-blue-100 text-blue-700", barra: "bg-blue-500" },
  red: { chip: "bg-red-100 text-red-600", barra: "bg-red-500" },
};

/** Etiqueta superior de sección (estilo "eyebrow" comercial). */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="h-4 w-1 rounded-full bg-brand-amber" />
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-brown/60">
        {children}
      </h2>
    </div>
  );
}

/** Tarjeta contenedora blanca reutilizable. */
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

/** Cabecera de una tarjeta (título + descripción). */
function CardHead({ titulo, desc }: { titulo: string; desc?: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-display text-base font-bold tracking-tight text-brand-black">{titulo}</h3>
      {desc && <p className="mt-0.5 text-xs text-brand-brown/55">{desc}</p>}
    </div>
  );
}

/** Tarjeta de cumplimiento con anillo de porcentaje (verde/ámbar/rojo). */
function Cumplimiento({
  titulo,
  desc,
  pct,
  aTiempo,
  total,
}: {
  titulo: string;
  desc: string;
  pct: number;
  aTiempo: number;
  total: number;
}) {
  const color = total === 0 ? "#c9bfb3" : pct >= 90 ? "#2e7d63" : pct >= 70 ? "#d98c2b" : "#c0392b";
  const R = 42;
  const C = 2 * Math.PI * R;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * C;
  return (
    <Panel>
      <CardHead titulo={titulo} desc={desc} />
      {total === 0 ? (
        <p className="rounded-xl bg-brand-cream-soft px-3 py-6 text-center text-sm text-brand-brown/50">
          Sin datos en el periodo.
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative h-28 w-28 shrink-0">
            <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
              <circle cx="50" cy="50" r={R} fill="none" stroke="#f1eae2" strokeWidth="12" />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={color}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${C - dash}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-xl font-extrabold tabular-nums text-brand-black">
                {pct.toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="font-display text-2xl font-bold tabular-nums text-brand-black">
              {num(aTiempo)}
              <span className="ml-1.5 text-sm font-semibold text-brand-brown/50">de {num(total)}</span>
            </p>
            <p className="mt-1 text-xs text-brand-brown/60">a tiempo</p>
            {total - aTiempo > 0 && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-500">
                {num(total - aTiempo)} fuera de tiempo
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Kpi({
  titulo,
  valor,
  delta,
  sub,
  color,
  icon,
  labelPrincipal,
  valorSec,
  labelSec,
}: {
  titulo: string;
  valor: string;
  delta?: { pct: number; positivo: boolean } | null;
  sub?: string;
  color: keyof typeof COLOR_KPI;
  icon: string;
  labelPrincipal?: string;
  valorSec?: string;
  labelSec?: string;
}) {
  const c = COLOR_KPI[color];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-sm transition hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-1 ${c.barra}`} />
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">{titulo}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.chip}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </span>
      </div>
      {labelPrincipal && (
        <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-brand-brown/45">{labelPrincipal}</p>
      )}
      <p className={`${labelPrincipal ? "mt-0" : "mt-2"} font-display text-[1.7rem] font-extrabold leading-tight tracking-tight text-brand-black tabular-nums`}>
        {valor}
      </p>
      {valorSec !== undefined && (
        <p className="mt-1 flex items-baseline gap-1.5 text-xs">
          {labelSec && <span className="font-medium uppercase tracking-wide text-brand-brown/45">{labelSec}</span>}
          <span className="font-display text-sm font-bold tabular-nums text-brand-brown/75">{valorSec}</span>
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {delta && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold tabular-nums ${
              delta.positivo ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3 w-3">
              <path strokeLinecap="round" strokeLinejoin="round" d={delta.positivo ? "M4.5 15.75l7.5-7.5 7.5 7.5" : "M19.5 8.25l-7.5 7.5-7.5-7.5"} />
            </svg>
            {Math.abs(delta.pct).toFixed(1)}%
          </span>
        )}
        {sub ? (
          <span className="text-brand-brown/50">{sub}</span>
        ) : delta ? (
          <span className="text-brand-brown/40">vs periodo anterior</span>
        ) : null}
      </div>
    </div>
  );
}

/** Card compacta de "movimientos": icono + nombre + número en una sola línea. */
function MovCard({ label, sub, value, color, icon }: { label: string; sub: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-brand-brown/10 bg-white p-3 shadow-sm">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}1f`, color }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          {icon}
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight text-brand-black">{label}</p>
        <p className="truncate text-[11px] text-brand-brown/50">{sub}</p>
      </div>
      <p className="shrink-0 font-display text-xl font-extrabold tabular-nums text-brand-black">{num(value)}</p>
    </div>
  );
}

function MiniStat({ titulo, valor, sub, icon }: { titulo: string; valor: string; sub?: string; icon: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-brown/10 bg-white px-5 py-4 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-cream-soft text-brand-wine">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">{titulo}</p>
        <p className="truncate font-display text-lg font-bold tabular-nums text-brand-black">
          {valor}
          {sub && <span className="ml-1.5 text-xs font-medium text-brand-brown/50">{sub}</span>}
        </p>
      </div>
    </div>
  );
}

function LineChart({ data }: { data: { dia: string; valor: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-brand-brown/40">
        Sin ventas en el periodo.
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.valor), 1);
  const n = data.length;
  const padX = 4;
  const puntos = data.map((d, i) => {
    const x = n === 1 ? 50 : padX + (i / (n - 1)) * (100 - 2 * padX);
    const y = 8 + (1 - d.valor / max) * 88; // rango 8..96
    return { ...d, x, y };
  });
  const linePath = puntos.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${puntos[n - 1].x} 100 L ${puntos[0].x} 100 Z`;
  const mostrarCada = Math.ceil(n / 12);
  return (
    <div className="w-full">
      <div className="relative h-56 w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id="areaVentas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d9772e" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#d9772e" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((g) => (
            <line key={g} x1="0" y1={g} x2="100" y2={g} stroke="#3d211c" strokeOpacity="0.06" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={areaPath} fill="url(#areaVentas)" />
          <path d={linePath} fill="none" stroke="#d9772e" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Puntos como HTML para que queden redondos y con tooltip */}
        {puntos.map((p) => {
          const etiqueta = new Date(p.dia + "T00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
          return (
            <div
              key={p.dia}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <div className="h-2.5 w-2.5 rounded-full border-2 border-brand-amber bg-white transition group-hover:h-3.5 group-hover:w-3.5 group-hover:bg-brand-amber" />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-brand-black px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">
                {etiqueta}: {cop(p.valor)}
              </div>
            </div>
          );
        })}
      </div>
      {/* Etiquetas del eje X */}
      <div className="relative mt-2 h-4">
        {puntos.map((p, i) =>
          i % mostrarCada === 0 ? (
            <span
              key={p.dia}
              className="absolute -translate-x-1/2 text-[10px] tabular-nums text-brand-brown/50"
              style={{ left: `${p.x}%` }}
            >
              {new Date(p.dia + "T00:00").getDate()}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function DonutLeyenda({
  data,
  totalLabel,
}: {
  data: { label: string; value: number; color: string }[];
  totalLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-brand-brown/40">Sin datos.</div>
    );
  }
  const R = 42;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 100 100" className="h-40 w-40 -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="#f1eae2" strokeWidth="14" />
          {data.map((d) => {
            const frac = d.value / total;
            const dash = frac * C;
            const el = (
              <circle
                key={d.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={d.color}
                strokeWidth="14"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-acc * C}
              />
            );
            acc += frac;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl font-extrabold tabular-nums text-brand-black">{num(total)}</span>
          <span className="text-[11px] uppercase tracking-wide text-brand-brown/50">{totalLabel}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 sm:flex-1">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="min-w-0 flex-1 truncate text-brand-brown/80">{d.label}</span>
            <span className="shrink-0 font-display font-bold tabular-nums text-brand-black">{num(d.value)}</span>
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-brand-brown/50">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TablaTop({
  filas,
  col1,
  cabeceras,
  render,
  max,
  valor,
}: {
  filas: FilaTop[];
  col1: string;
  cabeceras: string[];
  render: (f: FilaTop) => React.ReactNode;
  max: number;
  valor: (f: FilaTop) => number;
}) {
  if (filas.length === 0) {
    return (
      <p className="rounded-xl bg-brand-cream-soft px-3 py-6 text-center text-sm text-brand-brown/50">
        Sin datos en el periodo.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-brand-brown/10 text-left text-[11px] uppercase tracking-wide text-brand-brown/50">
          <th className="pb-2 font-semibold">{col1}</th>
          {cabeceras.map((c) => (
            <th key={c} className="whitespace-nowrap pb-2 pl-3 text-right font-semibold">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={`${f.nombre}-${i}`} className="border-b border-brand-brown/5 last:border-0">
            <td className="w-full max-w-0 py-2 pr-3">
              <div className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-right text-xs font-bold tabular-nums text-brand-brown/40">{i + 1}</span>
                <span className="truncate font-medium text-brand-black">{f.nombre}</span>
              </div>
              <div className="mt-1 ml-6 h-1.5 overflow-hidden rounded-full bg-brand-cream-soft">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-amber to-brand-amber-light"
                  style={{ width: `${max ? (valor(f) / max) * 100 : 0}%` }}
                />
              </div>
            </td>
            {render(f)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
