"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, CheckCircle2, Clock3, LayoutDashboard, MapPin, Package, RefreshCw, Scale, Send, ShieldAlert, Truck, UserRound, Users, XCircle } from "lucide-react";
import { getDashboardRunErrands, getPuntosVenta, type DashboardRunErrands, type PuntoVenta } from "@/lib/runErrandsApi";
import { EmptyState, ErrorBanner, fieldClass, IconAction, Metric, PageHeader, tableClass } from "@/components/RunErrandsUI";

const fecha = (dias = 0) => new Date(Date.now() - dias * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const etiquetas: Record<string, string> = { REVISADO: "Revisado", EN_PROCESO: "En proceso", ENTREGADO: "Entregado", CANCELADO: "Cancelado", approved: "Entregado", rejected: "Rechazado", pending: "Pendiente", "in-transit": "En ruta", partial: "Entrega parcial", "sin confirmar": "Sin confirmar" };
const colores = ["#7b1e3b", "#0284c7", "#059669", "#d97706", "#e11d48", "#0d9488"];

function Ranking({ title, items, total }: { title: string; items: { label: string; value: number }[]; total: number }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return <section className="min-w-0 border-t border-brand-brown/15 pt-5"><h2 className="mb-5 text-sm font-bold text-brand-black">{title}</h2>
    {!items.length ? <EmptyState /> : <div className="space-y-4">{items.slice(0, 8).map((item, index) => <div key={item.label}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate text-brand-black/75" title={item.label}>{etiquetas[item.label] ?? item.label}</span><span className="shrink-0 font-semibold tabular-nums text-brand-black">{item.value.toLocaleString("es-CO")} <span className="ml-2 font-normal text-brand-black/45">{total ? Math.round(item.value / total * 100) : 0}%</span></span></div>
      <div className="h-2 overflow-hidden rounded-sm bg-brand-brown/5"><div className="h-full rounded-sm" style={{ width: `${item.value / max * 100}%`, background: colores[index % colores.length] }} /></div>
    </div>)}</div>}
  </section>;
}

export default function DashboardRunErrandsPage() {
  const [data, setData] = useState<DashboardRunErrands | null>(null);
  const [pdvs, setPdvs] = useState<PuntoVenta[]>([]);
  const [desde, setDesde] = useState(() => fecha(6));
  const [hasta, setHasta] = useState(() => fecha());
  const [pdv, setPdv] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getPuntosVenta(true).then(setPdvs).catch(() => undefined); }, []);
  useEffect(() => {
    let activo = true;
    getDashboardRunErrands(desde || undefined, hasta || undefined, pdv || undefined)
      .then((resultado) => { if (activo) { setData(resultado); setError(null); } })
      .catch((e) => { if (activo) setError(e instanceof Error ? e.message : "No se pudo cargar el dashboard."); })
      .finally(() => { if (activo) setLoading(false); });
    return () => { activo = false; };
  }, [desde, hasta, pdv, revision]);
  function periodo(dias: number) { setLoading(true); setDesde(fecha(dias - 1)); setHasta(fecha()); setRevision((value) => value + 1); }
  const maxDia = Math.max(1, ...(data?.porDia ?? []).map((dia) => dia.value));

  return <div className="mx-auto max-w-[1500px] pb-6">
    <PageHeader title="Dashboard" icon={<LayoutDashboard className="h-6 w-6" />}>
      <Link href="/run-errands/despacho" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-wine">Ir a despacho <ArrowUpRight className="h-4 w-4" /></Link>
      <IconAction label="Actualizar dashboard" onClick={() => { setLoading(true); setRevision((value) => value + 1); }} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></IconAction>
    </PageHeader>
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div className="flex gap-1"><button onClick={() => periodo(1)} className="rounded-md border border-brand-brown/15 bg-white px-3 py-2 text-xs font-semibold text-brand-black">Hoy</button><button onClick={() => periodo(7)} className="rounded-md border border-brand-brown/15 bg-white px-3 py-2 text-xs font-semibold text-brand-black">7 días</button><button onClick={() => periodo(30)} className="rounded-md border border-brand-brown/15 bg-white px-3 py-2 text-xs font-semibold text-brand-black">30 días</button></div>
      <label className="text-xs font-medium text-brand-black/65">Desde<input type="date" aria-label="Desde" value={desde} max={hasta || undefined} onChange={(e) => { setLoading(true); setDesde(e.target.value); }} className={`ml-2 ${fieldClass}`} /></label>
      <label className="text-xs font-medium text-brand-black/65">Hasta<input type="date" aria-label="Hasta" value={hasta} min={desde || undefined} onChange={(e) => { setLoading(true); setHasta(e.target.value); }} className={`ml-2 ${fieldClass}`} /></label>
      <select aria-label="Punto de venta" value={pdv} onChange={(e) => { setLoading(true); setPdv(e.target.value); }} className={`${fieldClass} sm:ml-auto`}><option value="">Todos los puntos</option>{pdvs.map((punto) => <option key={punto.id} value={punto.id}>{punto.nombre}</option>)}</select>
    </div>
    <ErrorBanner message={error} />
    {!data ? (loading ? <div className="flex min-h-64 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-brand-wine" /></div> : <EmptyState text="No se pudo cargar el resumen." />) : <div className={loading ? "opacity-60" : ""} aria-busy={loading}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric title="Run-Errands del periodo" value={data.totalPedidos} detail={`${data.clientesAtendidos} clientes atendidos`} icon={<Package className="h-5 w-5" />} />
        <Metric title="Pendientes en Drivin" value={data.pendientesDrivin} detail={`${data.pendientesAnteriores} con más de 24 horas`} icon={<Clock3 className="h-5 w-5" />} tone="amber" />
        <Metric title="Entregados confirmados" value={data.entregadosDrivin} detail={`${data.tasaEntrega}% de los cierres confirmados`} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <Metric title="Rechazados en Drivin" value={data.rechazadosDrivin} icon={<XCircle className="h-5 w-5" />} tone="red" />
        <Metric title="Carga transportada" value={`${data.totalKilos.toLocaleString("es-CO", { maximumFractionDigits: 1 })} kg`} detail={`${data.promedioKilos} kg por mandado`} icon={<Scale className="h-5 w-5" />} tone="blue" />
        <Metric title="Sin domiciliario" value={data.sinDomiciliario} detail="Pendientes por asignar" icon={<UserRound className="h-5 w-5" />} tone="amber" />
        <Metric title="Errores de envío" value={data.erroresEnvio} detail="Requieren revisión" icon={<ShieldAlert className="h-5 w-5" />} tone="red" />
        <Metric title="Domiciliarios activos" value={data.totalDomiciliarios} detail={`${data.totalClientes} clientes · ${data.totalPuntosVenta} puntos activos`} icon={<Users className="h-5 w-5" />} tone="teal" />
      </div>
      <div className="mt-8 grid min-w-0 gap-8 xl:grid-cols-[1.65fr_1fr]">
        <section className="min-w-0 border-t border-brand-brown/15 pt-5"><div className="mb-5 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold text-brand-black"><Activity className="h-4 w-4 text-sky-600" />Volumen diario</h2><span className="text-xs text-brand-black/55">{data.porDia.length} días</span></div>
          <div className="overflow-x-auto"><div className="flex h-56 min-w-[400px] items-end gap-2 border-b border-brand-brown/15 px-1 pb-1">{data.porDia.map((dia) => <div key={dia.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${dia.label}: ${dia.value} mandados`}><span className="text-[10px] font-semibold tabular-nums text-brand-black/65">{dia.value || ""}</span><div className="w-full max-w-10 rounded-t-sm bg-sky-600" style={{ height: `${Math.max(1, dia.value / maxDia * 72)}%` }} /><span className="whitespace-nowrap text-[9px] text-brand-black/50">{dia.label}</span></div>)}</div></div>
        </section>
        <Ranking title="Confirmación de entregas en Drivin" items={data.porDrivin} total={data.totalPedidos} />
        <Ranking title="Actividad por punto de venta" items={data.porPdv} total={data.totalPedidos} />
        <Ranking title="Clientes con mayor actividad" items={data.porCliente} total={data.totalPedidos} />
      </div>
      <section className="mt-8 border-t border-brand-brown/15 pt-5"><h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-brand-black"><Truck className="h-4 w-4 text-teal-700" />Carga por domiciliario</h2>
        <div className="overflow-x-auto rounded-lg border border-brand-brown/10 bg-white"><table className={`${tableClass} min-w-[640px]`}><thead className="bg-brand-cream-soft/50"><tr><th>Domiciliario</th><th>Mandados</th><th>Entregados</th><th>Pendientes</th><th>Rechazados</th><th>Kg</th></tr></thead><tbody>{data.porDomiciliario.map((dom) => <tr key={dom.label}><td className="font-semibold">{dom.label}</td><td className="tabular-nums">{dom.value}</td><td className="text-emerald-700">{dom.entregados}</td><td className="text-amber-700">{dom.pendientes}</td><td className="text-rose-700">{dom.rechazados}</td><td className="tabular-nums">{dom.kilos.toLocaleString("es-CO", { maximumFractionDigits: 1 })}</td></tr>)}</tbody></table>{!data.porDomiciliario.length && <EmptyState />}</div>
      </section>
      {data.incidencias.length > 0 && <section className="mt-8 border-t border-brand-brown/15 pt-5"><h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-brand-black"><Send className="h-4 w-4 text-rose-600" />Pendientes de atención</h2><div className="divide-y divide-brand-brown/10">{data.incidencias.map((item) => <Link key={item.id} href={`/run-errands/despacho?buscar=${encodeURIComponent(item.numeroPedido)}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:bg-white/60"><div><span className="font-semibold text-brand-wine">{item.numeroPedido}</span><span className="ml-3 text-brand-black">{item.cliente}</span><span className="ml-3 inline-flex items-center gap-1 text-xs text-brand-black/55"><MapPin className="h-3 w-3" />{item.punto}</span></div><span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">{item.motivo}</span></Link>)}</div></section>}
      <p className="mt-6 text-right text-xs text-brand-black/45">Última sincronización Drivin: {data.ultimaSincronizacion ? new Date(data.ultimaSincronizacion).toLocaleString("es-CO") : "Sin sincronización"}</p>
    </div>}
  </div>;
}
