"use client";

import { useEffect, useState } from "react";
import { getDashboardRunErrands, type DashboardRunErrands } from "@/lib/runErrandsApi";

function Barra({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs font-medium text-brand-black/70">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-brand-cream-soft">
        <div className="h-full rounded-full bg-brand-amber transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-brand-black">{value}</span>
    </div>
  );
}

export default function DashboardRunErrandsPage() {
  const [data, setData] = useState<DashboardRunErrands | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardRunErrands()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return <div className="p-6 text-center text-sm text-brand-black/50">Cargando…</div>;
  }

  const maxDia = Math.max(1, ...data.porDia.map((d) => d.value));

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-serif text-2xl font-bold text-brand-wine">Dashboard — Run Errands</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Mandados", value: data.totalPedidos },
          { label: "Kilos", value: Math.round(data.totalKilos) },
          { label: "Clientes activos", value: data.totalClientes },
          { label: "PDV activos", value: data.totalPuntosVenta },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-brand-brown/10 bg-white p-4">
            <p className="text-2xl font-bold text-brand-wine">{k.value.toLocaleString("es-CO")}</p>
            <p className="text-xs text-brand-black/60">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-brand-brown/10 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-brand-wine">Mandados por día (14 días)</h2>
          <div className="flex h-32 items-end gap-1">
            {data.porDia.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full overflow-hidden rounded-t bg-brand-cream-soft" style={{ height: "80px" }}>
                  <div className="w-full rounded-t bg-brand-amber" style={{ height: `${(d.value / maxDia) * 100}%`, marginTop: `${100 - (d.value / maxDia) * 100}%` }} />
                </div>
                <span className="text-[9px] text-brand-black/50">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-brand-brown/10 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-brand-wine">Mandados por estado</h2>
          <div className="flex flex-col gap-2">
            {data.porEstado.map((e) => (
              <Barra key={e.label} label={e.label} value={e.value} max={Math.max(1, ...data.porEstado.map((x) => x.value))} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-brand-brown/10 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-brand-wine">Mandados por punto de venta</h2>
          <div className="flex flex-col gap-2">
            {data.porPdv.length === 0 ? (
              <p className="text-xs text-brand-black/50">Sin datos.</p>
            ) : (
              data.porPdv.map((p) => (
                <Barra key={p.label} label={p.label} value={p.value} max={Math.max(1, ...data.porPdv.map((x) => x.value))} />
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-brand-brown/10 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-brand-wine">Top 10 clientes</h2>
          <div className="flex flex-col gap-2">
            {data.porCliente.length === 0 ? (
              <p className="text-xs text-brand-black/50">Sin datos.</p>
            ) : (
              data.porCliente.map((c) => (
                <Barra key={c.label} label={c.label} value={c.value} max={Math.max(1, ...data.porCliente.map((x) => x.value))} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
