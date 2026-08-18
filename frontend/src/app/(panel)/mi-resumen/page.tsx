"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getUsuario, tieneAccesoAdministrativo, type Usuario } from "@/lib/auth";
import { puedeVerModulo, rutaOperativaInicial } from "@/lib/permisos";
import { cargarEstadoPedidos, type DespachoMeta } from "@/lib/pedidos";
import { objetivoDespacho, colorEstado } from "@/lib/despacho";
import type { Pedido } from "@/app/(panel)/pedidos/page";

const cop = (n: number) => "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");
const num = (n: number) => (Number(n) || 0).toLocaleString("es-CO");
const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

type Periodo = 1 | 7 | 30 | 0; // 0 = todo
const DIA = 86400000;

function tsPedido(p: Pedido): number {
  const t = new Date(p.fecha).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Card de estadística (mismo estilo que el dashboard general). */
function Stat({
  titulo,
  valor,
  sub,
  color = "text-brand-black",
}: {
  titulo: string;
  valor: ReactNode;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-brand-brown/10 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">{titulo}</p>
      <p className={`mt-1 text-2xl font-extrabold leading-tight ${color}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-brand-brown/55">{sub}</p>}
    </div>
  );
}



/** Barras simples de "por día" (sin dependencias de gráficas). */
function BarrasPorDia({ datos, formato }: { datos: { dia: string; valor: number }[]; formato: (n: number) => string }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  if (!datos.length) {
    return <p className="text-sm text-brand-brown/50">Sin datos en el periodo.</p>;
  }
  return (
    <div className="space-y-1.5">
      {datos.map((d) => (
        <div key={d.dia} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-[11px] text-brand-brown/60">{d.dia}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-brand-cream-soft">
            <div
              className="h-full rounded bg-brand-wine/70"
              style={{ width: `${(d.valor / max) * 100}%` }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-[11px] font-semibold text-brand-black">{formato(d.valor)}</span>
        </div>
      ))}
    </div>
  );
}

/** Sección expandible (para televendedores). */
function ExpandibleSection({
  titulo,
  icono,
  contenido,
  expanded,
  onToggle,
}: {
  titulo: string;
  icono: React.ReactNode;
  contenido: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-brand-brown/10 bg-white shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-sm font-semibold text-brand-wine hover:bg-brand-cream-soft/30 transition text-left"
      >
        <span className="flex-1">{titulo}</span>
        {icono}
        <svg
          className={`w-5 h-5 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
      {expanded && <div className="px-4 py-3 border-t border-brand-brown/10">{contenido}</div>}
    </div>
  );
}

function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function diaCorto(clave: string): string {
  const [y, m, d] = clave.split("-");
  return `${d}/${m}/${String(y).slice(2)}`;
}

/** ¿El pedido es un "posterior" (programado para un día futuro)? */
function esPosteriorFuturo(p: Pedido): boolean {
  const hoy = diaLocal(new Date().toISOString());
  return Boolean(p.entregaProgramada && p.fechaProgramada && p.fechaProgramada > hoy);
}

/** Calcula métricas de Hogar vs Horeca para un conjunto de pedidos. */
function calcularHogarVsHoreca(pedidos: Pedido[], metaMap: Record<string, DespachoMeta>) {
  const validos = pedidos.filter(p => !p.anulado);
  
  const hogar = validos.filter(p => !p.cliente?.horeca);
  const horeca = validos.filter(p => p.cliente?.horeca);
  
  const hogarValor = hogar.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const horecaValor = horeca.reduce((s, p) => s + (Number(p.total) || 0), 0);
  
  const hogarKg = hogar.reduce((s, p) => s + pesoPedidoKg(p), 0);
  const horecaKg = horeca.reduce((s, p) => s + pesoPedidoKg(p), 0);
  
  return {
    hogar: { pedidos: hogar.length, valor: hogarValor, kilos: hogarKg },
    horeca: { pedidos: horeca.length, valor: horecaValor, kilos: horecaKg },
    total: { pedidos: validos.length, valor: hogarValor + horecaValor, kilos: hogarKg + horecaKg },
  };
}

/** Peso total del pedido en kilos (suma los ítems vendidos por KG). */
function pesoPedidoKg(p: Pedido): number {
  return (p.carrito ?? []).reduce((s, i) => {
    const esKilo = (i.producto?.um || "").trim().toUpperCase() === "KG";
    return s + (esKilo ? Number(i.cantidad) || 0 : 0);
  }, 0);
}

/** Ranking de productos más vendidos. */
function rankingProductos(pedidos: Pedido[], topN = 10) {
  const mapa = new Map<string, { nombre: string; cantidad: number; valor: number }>();
  for (const p of pedidos.filter(p => !p.anulado)) {
    for (const item of p.carrito || []) {
      const clave = item.producto?.producto ?? "—";
      const actual = mapa.get(clave) || { nombre: clave, cantidad: 0, valor: 0 };
      actual.cantidad += Number(item.cantidad) || 0;
      actual.valor += Number(item.producto?.precio || 0) * (Number(item.cantidad) || 0);
      mapa.set(clave, actual);
    }
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor).slice(0, topN);
}

/** Top clientes por valor gastado. */
function topClientes(pedidos: Pedido[], topN = 10) {
  const mapa = new Map<string, { nombre: string; pedidos: number; valor: number }>();
  for (const p of pedidos.filter(p => !p.anulado)) {
    const nit = p.cliente?.nit_cedula ?? "—";
    const nombre = p.cliente?.nombre ?? "Cliente sin nombre";
    const actual = mapa.get(nit) || { nombre, pedidos: 0, valor: 0 };
    actual.pedidos += 1;
    actual.valor += Number(p.total) || 0;
    mapa.set(nit, actual);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor).slice(0, topN);
}

/** Resumen de métodos de pago usados. */
function resumenMetodoPago(pedidos: Pedido[], metaMap: Record<string, DespachoMeta>) {
  const mapa = new Map<string, number>();
  for (const p of pedidos.filter(p => !p.anulado)) {
    const pago = (p.pago ?? "—").trim();
    mapa.set(pago, (mapa.get(pago) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([pago, count]) => ({ pago, count }))
    .sort((a, b) => b.count - a.count);
}

/** Resumen de tipos de entrega. */
function resumenTipoEntrega(pedidos: Pedido[]) {
  const domicilio = pedidos.filter(p => !p.anulado && p.entrega === "domicilio").length;
  const recoge = pedidos.filter(p => !p.anulado && p.entrega === "recoge").length;
  const total = pedidos.filter(p => !p.anulado).length;
  return { domicilio, recoge, total };
}

export default function MiResumenPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [meta, setMeta] = useState<Record<string, DespachoMeta>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>(30);
  // Rango de fechas personalizado (YYYY-MM-DD). Si hay alguno, manda sobre el
  // preset (Hoy/7/30/Todo).
  const [rangoDesde, setRangoDesde] = useState("");
  const [rangoHasta, setRangoHasta] = useState("");
  const usaRango = Boolean(rangoDesde || rangoHasta);
  // Solo los roles con acceso total pueden ver el resumen de OTRA televendedora
  // (vacío = mi propio resumen).
  const [vendedoraSel, setVendedoraSel] = useState("");
  const esAdmin = tieneAccesoAdministrativo(usuario?.rol);
  // Para televendedores: mostrar secciones expandibles (ranking, top clientes, etc.)
  const [seccionesExpand, setSeccionesExpand] = useState<Record<string, boolean>>({});

  // "Mi resumen" es un permiso: si el usuario no lo tiene, no puede entrar
  // (ni por URL directa); se le manda a su primer módulo disponible.
  useEffect(() => {
    const u = getUsuario();
    if (!puedeVerModulo(u, "mi_resumen")) {
      router.replace(rutaOperativaInicial(u) ?? "/seleccionar-panel");
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
        const estado = await cargarEstadoPedidos();
        if (cancelado) return;
        setPedidos(estado.pedidos ?? []);
        setMeta(estado.meta ?? {});
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : "No se pudo cargar la información");
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [usuario]);

  // Nombre del que se está viendo: para roles con acceso total puede ser otra
  // televendedora seleccionada; para el resto, siempre el propio.
  const nombreMostrado = (esAdmin && vendedoraSel) || usuario?.nombre || "";
  const nombre = useMemo(() => norm(nombreMostrado), [nombreMostrado]);

  // Lista de televendedoras (por vendedorNombre) para el selector de admin.
  const vendedoras = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pedidos) {
      const v = (p.vendedorNombre ?? "").trim();
      if (v) m.set(norm(v), v);
    }
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [pedidos]);

  // Ventana de tiempo del periodo elegido.
  const desde = useMemo(() => {
    if (periodo === 0) return null;
    const hoy0 = new Date();
    hoy0.setHours(0, 0, 0, 0);
    return hoy0.getTime() - (periodo - 1) * DIA;
  }, [periodo]);

  const enPeriodo = useMemo(() => {
    // Rango personalizado (desde/hasta) tiene prioridad sobre el preset.
    if (usaRango) {
      const min = rangoDesde ? new Date(`${rangoDesde}T00:00:00`).getTime() : -Infinity;
      const max = rangoHasta ? new Date(`${rangoHasta}T23:59:59.999`).getTime() : Infinity;
      return pedidos.filter((p) => {
        const t = tsPedido(p);
        return t >= min && t <= max;
      });
    }
    if (desde == null) return pedidos;
    return pedidos.filter((p) => tsPedido(p) >= desde);
  }, [pedidos, desde, usaRango, rangoDesde, rangoHasta]);

  // --- VENTAS: pedidos que YO creé (vendedorNombre === mi nombre) ---
  const misVentas = useMemo(
    () => enPeriodo.filter((p) => norm(p.vendedorNombre) === nombre),
    [enPeriodo, nombre],
  );
  const ventas = useMemo(() => {
    const validos = misVentas.filter((p) => !p.anulado);
    const total = validos.reduce((s, p) => s + (Number(p.total) || 0), 0);
    const facturado = validos.reduce((s, p) => s + (Number(meta[p.id]?.facturaValor) || 0), 0);
    const anulados = misVentas.filter((p) => p.anulado || norm(p.estado) === "anulado" || norm(p.estado) === "cancelado").length;
    const porDiaMap = new Map<string, number>();
    for (const p of validos) {
      const k = diaLocal(p.fecha);
      porDiaMap.set(k, (porDiaMap.get(k) ?? 0) + (Number(p.total) || 0));
    }
    const porDia = [...porDiaMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, valor]) => ({ dia: diaCorto(dia), valor }));
    return {
      pedidos: validos.length,
      total,
      facturado,
      ticket: validos.length ? total / validos.length : 0,
      anulados,
      pctBaja: misVentas.length ? (anulados / misVentas.length) * 100 : 0,
      porDia,
    };
  }, [misVentas, meta]);

  // --- DESPACHO: pedidos donde YO participé (facturé/despaché/alisté/entregué) ---
  const facture = useMemo(
    () => enPeriodo.filter((p) => norm(meta[p.id]?.facturadoPor) === nombre),
    [enPeriodo, meta, nombre],
  );
  const despache = useMemo(
    () => enPeriodo.filter((p) => norm(meta[p.id]?.despachadoPor) === nombre),
    [enPeriodo, meta, nombre],
  );
  const aliste = useMemo(
    () => enPeriodo.filter((p) => norm(meta[p.id]?.porcionador) === nombre),
    [enPeriodo, meta, nombre],
  );
  const domicilios = useMemo(
    () => enPeriodo.filter((p) => norm(meta[p.id]?.domiciliario) === nombre),
    [enPeriodo, meta, nombre],
  );

  const despacho = useMemo(() => {
    const valorFacturado = facture.reduce((s, p) => s + (Number(meta[p.id]?.facturaValor) || 0), 0);
    // Entregas a tiempo: de lo que despaché, cuántas quedaron dentro del objetivo.
    let conDato = 0;
    let aTiempo = 0;
    for (const p of despache) {
      const dm = meta[p.id];
      if (!dm?.despachoFin) continue;
      conDato += 1;
      if (new Date(dm.despachoFin).getTime() <= objetivoDespacho(p, dm.pagoConfirmado)) aTiempo += 1;
    }
    return {
      facturados: facture.length,
      valorFacturado,
      despachados: despache.length,
      alistados: aliste.length,
      domicilios: domicilios.length,
      pctEntrega: conDato ? (aTiempo / conDato) * 100 : 0,
    };
  }, [facture, despache, aliste, domicilios, meta]);

  const tieneVentas = misVentas.length > 0;
  const tieneDespacho = facture.length + despache.length + aliste.length + domicilios.length > 0;

  // Métricas de Hogar vs Horeca
  const hogarVsHoreca = useMemo(() => calcularHogarVsHoreca(misVentas, meta), [misVentas, meta]);
  const ranking = useMemo(() => rankingProductos(misVentas, 15), [misVentas]);
  const topClient = useMemo(() => topClientes(misVentas, 15), [misVentas]);
  const resumenPago = useMemo(() => resumenMetodoPago(misVentas, meta), [misVentas, meta]);
  const resumenEntrega = useMemo(() => resumenTipoEntrega(misVentas), [misVentas]);
  
  // ¿Es televendedor? (rol específico que no es admin)
  const esTelevendedor = usuario?.rol?.trim().toLowerCase() === "televendedor" && !esAdmin;

  // Últimos pedidos (para la lista) según la actividad del usuario.
  const ultimos = useMemo(() => {
    const base = tieneVentas ? misVentas : [...facture, ...despache];
    const vistos = new Set<string>();
    return base
      .filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)))
      .sort((a, b) => tsPedido(b) - tsPedido(a));
  }, [tieneVentas, misVentas, facture, despache]);

  const periodoLabel = usaRango
    ? `${rangoDesde || "el inicio"} a ${rangoHasta || "hoy"}`
    : periodo === 0
      ? "todo el histórico"
      : periodo === 1
        ? "hoy"
        : `los últimos ${periodo} días`;

  return (
    <div className="pb-4">
      {/* Encabezado */}
      <div className="mb-6 overflow-hidden rounded-3xl border border-brand-brown/10 bg-gradient-to-br from-brand-wine to-brand-wine-dark p-6 text-white shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Mi resumen</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
          {esAdmin && vendedoraSel ? nombreMostrado : `Hola, ${usuario?.nombre ?? ""}`}
        </h1>
        <p className="mt-1 text-sm text-white/70">
          {esAdmin && vendedoraSel ? "Resumen" : "Tu información personal"} de {periodoLabel}
          {esAdmin && vendedoraSel ? "" : usuario?.rol ? ` · ${usuario.rol}` : ""}
        </p>
        {/* Fila: televendedora (solo admin) + rango de fechas, lado a lado. */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {esAdmin && vendedoras.length > 0 && !esTelevendedor && (
            <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-brand-gold/90">
              Ver resumen de
              <select
                value={vendedoraSel}
                onChange={(e) => setVendedoraSel(e.target.value)}
                className="mt-0.5 w-full max-w-xs rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm font-semibold text-white outline-none backdrop-blur focus:border-white/50 sm:w-auto"
              >
                <option className="text-brand-black" value="">Yo ({usuario?.nombre ?? ""})</option>
                {vendedoras.map((v) => (
                  <option className="text-brand-black" key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
          )}
          {/* Rango de fechas personalizado. */}
          <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-brand-gold/90">
            Desde
            <input
              type="date"
              value={rangoDesde}
              max={rangoHasta || undefined}
              onChange={(e) => setRangoDesde(e.target.value)}
              className="mt-0.5 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm font-semibold text-white outline-none backdrop-blur focus:border-white/50 [color-scheme:dark]"
            />
          </label>
          <label className="flex flex-col text-[10px] font-semibold uppercase tracking-wide text-brand-gold/90">
            Hasta
            <input
              type="date"
              value={rangoHasta}
              min={rangoDesde || undefined}
              onChange={(e) => setRangoHasta(e.target.value)}
              className="mt-0.5 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm font-semibold text-white outline-none backdrop-blur focus:border-white/50 [color-scheme:dark]"
            />
          </label>
          {usaRango && (
            <button
              onClick={() => {
                setRangoDesde("");
                setRangoHasta("");
              }}
              title="Quitar el rango de fechas"
              className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm font-semibold text-white/80 transition hover:bg-white/20"
            >
              Limpiar
            </button>
          )}
          {/* Presets rápidos, en la misma fila. */}
          <div className="inline-flex rounded-xl border border-white/15 bg-white/10 p-0.5 backdrop-blur">
            {([[1, "Hoy"], [7, "7 días"], [30, "30 días"], [0, "Todo"]] as [Periodo, string][]).map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => {
                  setPeriodo(v);
                  setRangoDesde("");
                  setRangoHasta("");
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  periodo === v && !usaRango ? "bg-white text-brand-wine shadow-sm" : "text-white/70 hover:bg-white/10"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 py-10 text-center text-sm text-red-600">{error}</div>
      ) : !tieneVentas && !tieneDespacho ? (
        <div className="rounded-2xl border border-brand-brown/10 bg-white py-16 text-center text-sm text-brand-brown/60 shadow-sm">
          {esAdmin && vendedoraSel
            ? `${nombreMostrado} no tiene actividad registrada en ${periodoLabel}.`
            : `No tienes actividad registrada en ${periodoLabel}.`}
        </div>
      ) : (
        <div className="space-y-8">
          {/* SECCIÓN VENTAS */}
          {tieneVentas && (
            <section>
              <h2 className="mb-3 font-serif text-lg font-bold text-brand-wine">Mis ventas</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Stat titulo="Mis pedidos" valor={num(ventas.pedidos)} sub="No anulados" />
                <Stat titulo="Mis ventas" valor={cop(ventas.total)} color="text-brand-wine" />
                <Stat titulo="Total facturado" valor={cop(ventas.facturado)} sub="Según factura" color="text-emerald-600" />
                <Stat titulo="Ticket promedio" valor={cop(ventas.ticket)} />
                <Stat titulo="Anulados / Cancelados" valor={num(ventas.anulados)} sub={`${ventas.pctBaja.toFixed(1)}% de bajas`} color="text-red-600" />
              </div>
              <div className="mt-4 rounded-2xl border border-brand-brown/10 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-brand-black">Ventas por día</p>
                <BarrasPorDia datos={ventas.porDia} formato={cop} />
              </div>

              {/* Desglose Hogar vs Horeca - AMPLIADO Y PROMINENTE */}
              <div className="mt-6 rounded-2xl border border-brand-brown/10 bg-white p-6 shadow-sm">
                <p className="mb-5 font-serif text-lg font-bold text-brand-wine">Hogar vs HORECA (Hotel, Restaurante, Café)</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-5">
                    <p className="text-sm font-bold uppercase tracking-wide text-blue-900">Hogar</p>
                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-[11px] text-blue-700">Pedidos</p>
                        <p className="mt-0.5 font-display text-2xl font-extrabold text-blue-900">{num(hogarVsHoreca.hogar.pedidos)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-blue-700">Valor total</p>
                        <p className="mt-0.5 font-display text-2xl font-extrabold text-blue-900">{cop(hogarVsHoreca.hogar.valor)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-blue-700">Kilos vendidos</p>
                        <p className="mt-0.5 font-display text-2xl font-extrabold text-blue-900">{hogarVsHoreca.hogar.kilos.toFixed(1)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-5">
                    <p className="text-sm font-bold uppercase tracking-wide text-orange-900">HORECA</p>
                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-[11px] text-orange-700">Pedidos</p>
                        <p className="mt-0.5 font-display text-2xl font-extrabold text-orange-900">{num(hogarVsHoreca.horeca.pedidos)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-orange-700">Valor total</p>
                        <p className="mt-0.5 font-display text-2xl font-extrabold text-orange-900">{cop(hogarVsHoreca.horeca.valor)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-orange-700">Kilos vendidos</p>
                        <p className="mt-0.5 font-display text-2xl font-extrabold text-orange-900">{hogarVsHoreca.horeca.kilos.toFixed(1)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-5">
                    <p className="text-sm font-bold uppercase tracking-wide text-purple-900">Total</p>
                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-[11px] text-purple-700">Pedidos</p>
                        <p className="mt-0.5 font-display text-2xl font-extrabold text-purple-900">{num(hogarVsHoreca.total.pedidos)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-purple-700">Valor total</p>
                        <p className="mt-0.5 font-display text-2xl font-extrabold text-purple-900">{cop(hogarVsHoreca.total.valor)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-purple-700">Kilos vendidos</p>
                        <p className="mt-0.5 font-display text-2xl font-extrabold text-purple-900">{hogarVsHoreca.total.kilos.toFixed(1)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Secciones expandibles para televendedores */}
              {esTelevendedor && (
                <div className="mt-4 space-y-3">
                  {/* Ranking de productos */}
                  <ExpandibleSection
                    titulo="📊 Ranking de productos vendidos"
                    icono={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>}
                    expanded={seccionesExpand["ranking"] || false}
                    onToggle={() => setSeccionesExpand(s => ({ ...s, ranking: !s.ranking }))}
                    contenido={
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {ranking.length > 0 ? ranking.map((prod, i) => (
                          <div key={i} className="flex justify-between items-start text-[12px]">
                            <div className="flex-1">
                              <p className="font-semibold text-brand-wine">#{i + 1} {prod.nombre}</p>
                              <p className="text-brand-brown/60">{prod.cantidad.toLocaleString("es-CO")} unidades</p>
                            </div>
                            <p className="font-bold text-brand-wine">{cop(prod.valor)}</p>
                          </div>
                        )) : <p className="text-sm text-brand-brown/50">Sin datos</p>}
                      </div>
                    }
                  />

                  {/* Top clientes */}
                  <ExpandibleSection
                    titulo="👥 Top 15 clientes"
                    icono={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10.5 1.5H5.75A2.25 2.25 0 003.5 3.75v12.5A2.25 2.25 0 005.75 18.5h8.5a2.25 2.25 0 002.25-2.25V9M10.5 1.5v4.5a2 2 0 002 2h4.5M10.5 1.5L16.5 7.5" /></svg>}
                    expanded={seccionesExpand["topClientes"] || false}
                    onToggle={() => setSeccionesExpand(s => ({ ...s, topClientes: !s.topClientes }))}
                    contenido={
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {topClient.length > 0 ? topClient.map((c, i) => (
                          <div key={i} className="flex justify-between items-start text-[12px]">
                            <div className="flex-1">
                              <p className="font-semibold text-brand-wine">#{i + 1} {c.nombre}</p>
                              <p className="text-brand-brown/60">{c.pedidos} pedidos</p>
                            </div>
                            <p className="font-bold text-brand-wine">{cop(c.valor)}</p>
                          </div>
                        )) : <p className="text-sm text-brand-brown/50">Sin datos</p>}
                      </div>
                    }
                  />

                  {/* Métodos de pago */}
                  <ExpandibleSection
                    titulo="💳 Métodos de pago utilizados"
                    icono={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 4a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4zm3.5 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /></svg>}
                    expanded={seccionesExpand["pago"] || false}
                    onToggle={() => setSeccionesExpand(s => ({ ...s, pago: !s.pago }))}
                    contenido={
                      <div className="space-y-2">
                        {resumenPago.length > 0 ? resumenPago.map((p, i) => (
                          <div key={i} className="flex justify-between items-center text-[12px]">
                            <p className="font-semibold text-brand-wine">{p.pago || "Sin especificar"}</p>
                            <p className="font-bold text-brand-wine">{num(p.count)} transacciones</p>
                          </div>
                        )) : <p className="text-sm text-brand-brown/50">Sin datos</p>}
                      </div>
                    }
                  />

                  {/* Tipo de entrega */}
                  <ExpandibleSection
                    titulo="🚚 Tipo de entrega"
                    icono={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" /></svg>}
                    expanded={seccionesExpand["entrega"] || false}
                    onToggle={() => setSeccionesExpand(s => ({ ...s, entrega: !s.entrega }))}
                    contenido={
                      <div className="space-y-2">
                        <div className="flex justify-between text-[12px]">
                          <p className="font-semibold">Domicilio</p>
                          <p className="font-bold text-brand-wine">{num(resumenEntrega.domicilio)} ({resumenEntrega.total > 0 ? ((resumenEntrega.domicilio / resumenEntrega.total) * 100).toFixed(1) : 0}%)</p>
                        </div>
                        <div className="flex justify-between text-[12px]">
                          <p className="font-semibold">Recoge en punto</p>
                          <p className="font-bold text-brand-wine">{num(resumenEntrega.recoge)} ({resumenEntrega.total > 0 ? ((resumenEntrega.recoge / resumenEntrega.total) * 100).toFixed(1) : 0}%)</p>
                        </div>
                      </div>
                    }
                  />
                </div>
              )}
            </section>
          )}

          {/* SECCIÓN DESPACHO */}
          {tieneDespacho && (
            <section>
              <h2 className="mb-3 font-serif text-lg font-bold text-brand-wine">Mi despacho</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Stat titulo="Facturados por mí" valor={num(despacho.facturados)} sub={cop(despacho.valorFacturado)} color="text-emerald-600" />
                <Stat titulo="Despachados por mí" valor={num(despacho.despachados)} color="text-teal-600" />
                <Stat titulo="Alistados por mí" valor={num(despacho.alistados)} color="text-violet-600" />
                <Stat titulo="Domicilios" valor={num(despacho.domicilios)} color="text-sky-600" />
                <Stat titulo="Entregas a tiempo" valor={`${despacho.pctEntrega.toFixed(0)}%`} sub="De lo que despaché" color="text-green-600" />
              </div>
            </section>
          )}

          {/* ÚLTIMOS PEDIDOS */}
          {ultimos.length > 0 && (
            <section>
              <h2 className="mb-3 font-serif text-lg font-bold text-brand-wine">
                Pedidos del periodo ({num(ultimos.length)})
              </h2>
              <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-brand-cream-soft/60 text-[11px] uppercase tracking-wide text-brand-brown/60">
                    <tr>
                      <th className="px-4 py-2.5">Factura / Comanda</th>
                      <th className="px-4 py-2.5">Cliente</th>
                      <th className="px-4 py-2.5">Estado</th>
                      <th className="px-4 py-2.5 text-right">Facturado / Total</th>
                      <th className="px-4 py-2.5">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultimos.map((p) => (
                      <tr key={p.id} className="border-t border-brand-brown/5">
                        <td className="px-4 py-2.5 font-semibold text-brand-wine">
                          {meta[p.id]?.facturaNumero?.trim() ? (
                            <>
                              <div className="text-green-600">Fact. {meta[p.id]!.facturaNumero}</div>
                              <div className="text-[11px] font-semibold text-brand-brown/60">{p.comanda}</div>
                            </>
                          ) : (
                            <div>{p.comanda}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">{p.cliente?.nombre || p.cliente?.nit_cedula || "—"}</td>
                        <td className="px-4 py-2.5">
                          <div className="inline-flex flex-col items-center">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colorEstado(p.estado)}`}>
                              {p.anulado ? (p.estado || "Anulado") : (p.estado || "En proceso")}
                            </span>
                            {!p.anulado && esPosteriorFuturo(p) && (
                              <span className="mt-0.5 text-[11px] font-semibold text-indigo-600">Posterior</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {typeof meta[p.id]?.facturaValor === "number" && (meta[p.id]!.facturaValor as number) > 0 ? (
                            <>
                              <div className="font-semibold text-green-600">{cop(meta[p.id]!.facturaValor as number)}</div>
                              <div className="text-[11px] text-brand-brown/55">{cop(p.total)}</div>
                            </>
                          ) : (
                            <div>{cop(p.total)}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-brand-brown/60">{new Date(p.fecha).toLocaleDateString("es-CO")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
