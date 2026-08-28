"use client";

import { useEffect, useState } from "react";
import { dashboardMetrics, type DashboardMetrics } from "@/lib/credito-empleados";

const fmtCop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const money = (v: number) => fmtCop.format(Number.isFinite(v) ? v : 0);

const ESTADO_COLOR: Record<string, string> = {
  pendiente: "bg-amber-400",
  facturado: "bg-brand-wine",
  anulado:   "bg-neutral-300",
};
const ESTADO_TEXT: Record<string, string> = {
  pendiente: "text-amber-700",
  facturado: "text-brand-wine",
  anulado:   "text-neutral-500",
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  facturado: "Facturado",
  anulado:   "Anulado",
};

function mesLabel(yyyymm: string) {
  const [y, m] = yyyymm.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
}

export default function DashboardComprasPage() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    dashboardMetrics()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar el dashboard"))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-wine border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-sm text-rose-600">
        {error ?? "Sin datos disponibles."}
      </div>
    );
  }

  const { kpis, top_compradores, por_punto, por_estado, por_mes, top_productos } = data;

  // Porcentaje para barras relativas
  const maxComprador = Math.max(...top_compradores.map((x) => x.total), 1);
  const maxMes = Math.max(...por_mes.map((x) => x.total), 1);
  const maxPunto = Math.max(...por_punto.map((x) => x.total), 1);
  const totalEstados = por_estado.reduce((s, x) => s + x.n, 0) || 1;

  const kpiCards = [
    { label: "Total compras",      val: String(kpis.total_pedidos),   sub: "pedidos activos",        color: "text-brand-black",  bg: "bg-brand-brown/8"  },
    { label: "Colaboradores",      val: String(kpis.total_trabajadores), sub: "con compras",          color: "text-brand-black",  bg: "bg-brand-brown/8"  },
    { label: "Monto total",        val: money(kpis.total_monto),      sub: "facturado + pendiente",  color: "text-brand-black",  bg: "bg-brand-brown/8"  },
    { label: "Pendiente cobro",    val: money(kpis.total_pendiente),  sub: "aún sin facturar",       color: "text-amber-700",    bg: "bg-amber-50"       },
    { label: "Facturado",          val: money(kpis.total_facturado),  sub: "ya descontado",          color: "text-brand-wine",   bg: "bg-brand-wine/5"   },
    { label: "Promedio por compra",val: money(kpis.promedio),         sub: "por pedido activo",      color: "text-brand-black",  bg: "bg-brand-brown/8"  },
  ];

  return (
    <div className="flex flex-col gap-5 p-5">
      <div>
        <h1 className="font-serif text-2xl font-bold text-brand-wine">Dashboard de compras</h1>
        <p className="mt-0.5 text-sm text-brand-brown/60">Métricas y tendencias de las compras de colaboradores.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((k) => (
          <div key={k.label} className="rounded-2xl border border-brand-brown/10 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-brand-brown/55">{k.label}</p>
            <p className={`mt-0.5 truncate text-lg font-bold tabular-nums ${k.color}`}>{k.val}</p>
            <p className="mt-0.5 text-[10px] text-brand-brown/40">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Tendencia mensual + distribución por estado */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Tendencia por mes */}
        <div className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-brand-black">Tendencia mensual (últimos 6 meses)</p>
          {por_mes.length === 0 ? (
            <p className="text-xs italic text-brand-brown/40">Sin datos de los últimos 6 meses.</p>
          ) : (
            <div className="flex items-end gap-2 h-36">
              {por_mes.map((m) => {
                const pct = Math.max((m.total / maxMes) * 100, 4);
                return (
                  <div key={m.mes} className="flex flex-1 flex-col items-center gap-1">
                    <p className="text-[10px] font-semibold text-brand-wine tabular-nums">{money(m.total).replace("$", "$")}</p>
                    <div className="w-full rounded-t-lg bg-brand-wine/20 transition-all" style={{ height: `${pct}%` }}>
                      <div className="w-full rounded-t-lg bg-brand-wine" style={{ height: "100%" }} />
                    </div>
                    <p className="text-[10px] text-brand-brown/55">{mesLabel(m.mes)}</p>
                    <p className="text-[9px] text-brand-brown/35">{m.n} ped.</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Distribución por estado */}
        <div className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-brand-black">Distribución por estado</p>
          {/* Bar stacked visual */}
          <div className="flex h-5 w-full overflow-hidden rounded-full">
            {por_estado.map((e) => (
              <div
                key={e.estado}
                title={`${ESTADO_LABEL[e.estado] ?? e.estado}: ${e.n}`}
                className={`${ESTADO_COLOR[e.estado] ?? "bg-brand-brown/30"} transition-all`}
                style={{ width: `${(e.n / totalEstados) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {por_estado.map((e) => (
              <div key={e.estado} className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ESTADO_COLOR[e.estado] ?? "bg-brand-brown/30"}`} />
                <span className="flex-1 text-sm text-brand-brown/70">{ESTADO_LABEL[e.estado] ?? e.estado}</span>
                <span className={`text-sm font-semibold ${ESTADO_TEXT[e.estado] ?? "text-brand-brown"}`}>{e.n} pedidos</span>
                <span className="text-xs text-brand-brown/50 tabular-nums">{money(e.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top compradores + Por punto */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Top compradores */}
        <div className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-brand-black">Top 10 colaboradores por monto</p>
          {top_compradores.length === 0 ? (
            <p className="text-xs italic text-brand-brown/40">Sin datos.</p>
          ) : (
            <div className="space-y-2.5">
              {top_compradores.map((c, i) => (
                <div key={c.cedula} className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-right text-xs font-bold text-brand-brown/30">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-black">{c.nombre}</p>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-brand-brown/10">
                      <div className="h-full rounded-full bg-brand-wine" style={{ width: `${(c.total / maxComprador) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums text-brand-wine">{money(c.total)}</p>
                    <p className="text-[10px] text-brand-brown/45">{c.n} compra{c.n !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Por punto de venta */}
        <div className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-brand-black">Compras por punto de venta</p>
          {por_punto.length === 0 ? (
            <p className="text-xs italic text-brand-brown/40">Sin datos.</p>
          ) : (
            <div className="space-y-2.5">
              {por_punto.map((p) => (
                <div key={p.punto} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-black">{p.punto}</p>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-brand-brown/10">
                      <div className="h-full rounded-full bg-brand-amber" style={{ width: `${(p.total / maxPunto) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums text-brand-amber">{money(p.total)}</p>
                    <p className="text-[10px] text-brand-brown/45">{p.n} compra{p.n !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top productos (OCR) */}
      <div className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-brand-black">Productos más comprados</p>
          <span className="rounded-full bg-brand-brown/8 px-2.5 py-1 text-[11px] text-brand-brown/55">
            Extraído de fotos de facturas (OCR)
          </span>
        </div>
        {top_productos.length === 0 ? (
          <div className="rounded-xl border border-brand-brown/10 bg-brand-cream-soft/40 px-4 py-8 text-center">
            <p className="text-sm text-brand-brown/50">Sin datos de productos aún.</p>
            <p className="mt-1 text-xs text-brand-brown/35">Los productos aparecen cuando se suben fotos de facturas al registrar compras.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-brown/10 text-left text-[11px] font-bold uppercase tracking-wide text-brand-brown/50">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Producto</th>
                  <th className="py-2 pr-4 text-right">Pedidos</th>
                  <th className="py-2 pr-4 text-right">Cantidad total</th>
                  <th className="py-2 text-right">Monto total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-brown/5">
                {top_productos.map((p, i) => (
                  <tr key={i} className="hover:bg-brand-cream-soft/30">
                    <td className="py-2.5 pr-4 font-bold text-brand-brown/30">{i + 1}</td>
                    <td className="py-2.5 pr-4 font-medium text-brand-black">{p.descripcion}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-brand-brown/70">{p.n_pedidos}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-brand-brown/70">
                      {Number.isInteger(p.cantidad_total) ? p.cantidad_total : p.cantidad_total.toFixed(2)}
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums text-brand-wine">{money(p.monto_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
