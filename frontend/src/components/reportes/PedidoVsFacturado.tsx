"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import type { PuntoVenta } from "@/lib/puntos-venta";
import {
  detalleFacturacion,
  reporteFacturacion,
  sincronizarFacturacion,
  type EstadoCruce,
  type FilaFacturacion,
  type LineaFactura,
  type ProductoPedido,
  type ReporteFacturacion,
} from "@/lib/reportes";

const fmtCop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const money = (v: number | null | undefined) => (v == null ? "—" : fmtCop.format(Number.isFinite(v) ? v : 0));
const fmtNum = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const POR_PAGINA = 200;

const diaISO = (offset = 0) =>
  new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
const fechaLocal = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";
const codigo = (v: string) => (/^\d+$/.test(v.trim()) ? String(Number(v)) : v.trim().toUpperCase());

const ESTADOS: Record<EstadoCruce, { label: string; clase: string }> = {
  coincide: { label: "Coincide", clase: "bg-emerald-100 text-emerald-700" },
  diferencia: { label: "Con diferencia", clase: "bg-amber-100 text-amber-800" },
  no_encontrada: { label: "No encontrada en Siesa", clase: "bg-red-100 text-red-700" },
  pendiente: { label: "Pendiente de consultar", clase: "bg-sky-100 text-sky-700" },
  sin_facturar: { label: "Sin factura digitada", clase: "bg-neutral-100 text-neutral-600" },
};

/** Cruza los productos del pedido con las líneas de la factura por código. */
function compararProductos(productos: ProductoPedido[], lineas: LineaFactura[]) {
  const mapa = new Map<string, { cod: string; producto: string; pedido?: ProductoPedido; factura?: LineaFactura }>();
  for (const p of productos) {
    const k = codigo(p.cod);
    const x = mapa.get(k);
    if (x?.pedido) {
      x.pedido = { ...x.pedido, cantidad: x.pedido.cantidad + p.cantidad, valor: x.pedido.valor + p.valor };
    } else {
      mapa.set(k, { cod: p.cod, producto: p.producto, ...x, pedido: p });
    }
  }
  for (const l of lineas) {
    const k = codigo(l.cod);
    const x = mapa.get(k);
    if (x) x.factura = l;
    else mapa.set(k, { cod: l.cod, producto: l.producto, factura: l });
  }
  return [...mapa.values()];
}

export default function PedidoVsFacturado({ puntos }: { puntos: PuntoVenta[] }) {
  const [puntoId, setPuntoId] = useState("");
  const [desde, setDesde] = useState(() => diaISO(-6));
  const [hasta, setHasta] = useState(() => diaISO());
  const [data, setData] = useState<ReporteFacturacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busq, setBusq] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoCruce | "">("");
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Record<string, { productos: ProductoPedido[]; lineasFactura: LineaFactura[] } | "cargando">>({});
  const [exportando, setExportando] = useState(false);

  const regenerar = async () => {
    setCargando(true);
    setError(null);
    try {
      setData(await reporteFacturacion({ punto_id: puntoId, desde, hasta }));
      setVisibles(POR_PAGINA);
      setAbierto(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo generar el reporte.");
      setData(null);
    } finally {
      setCargando(false);
    }
  };

  // Carga inicial; después solo se genera al pulsar «Generar».
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void regenerar(); }, []);

  async function traerDeSiesa() {
    setSincronizando(true);
    setAviso(null);
    setError(null);
    try {
      const r = await sincronizarFacturacion(desde, hasta);
      setAviso(
        r.dias.length
          ? `Consultados en Siesa: ${r.dias.join(", ")} · ${r.relacionadas} pedido(s) relacionados.`
          : "Todos los días del rango ya estaban consultados.",
      );
      await regenerar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo consultar Siesa.");
    } finally {
      setSincronizando(false);
    }
  }

  const filas = useMemo(() => {
    const q = busq.trim().toLowerCase();
    return (data?.filas ?? []).filter(
      (f) =>
        (!filtroEstado || f.estadoCruce === filtroEstado) &&
        (!q ||
          `${f.comanda} ${f.cliente} ${f.nit} ${f.facturaDigitada ?? ""} ${f.facturaSiesa ?? ""} ${f.punto}`
            .toLowerCase()
            .includes(q)),
    );
  }, [data, busq, filtroEstado]);

  async function abrir(f: FilaFacturacion) {
    if (abierto === f.id) return setAbierto(null);
    setAbierto(f.id);
    if (detalles[f.id]) return;
    setDetalles((d) => ({ ...d, [f.id]: "cargando" }));
    try {
      const det = await detalleFacturacion(f.id);
      setDetalles((d) => ({ ...d, [f.id]: det }));
    } catch {
      setDetalles((d) => {
        const { [f.id]: _omit, ...resto } = d;
        void _omit;
        return resto;
      });
    }
  }

  async function exportarExcel() {
    if (!data) return;
    setExportando(true);
    try {
      const [completo, ExcelJS] = await Promise.all([
        reporteFacturacion({ punto_id: puntoId, desde, hasta, detalle: true }),
        import("exceljs").then((m) => m.default),
      ]);
      const ids = new Set(filas.map((f) => f.id));
      const lista = completo.filas.filter((f) => ids.has(f.id));
      const wb = new ExcelJS.Workbook();
      wb.creator = "SIGCOMPRO";
      const encabezado = (ws: import("exceljs").Worksheet, cols: { header: string; width: number }[]) => {
        ws.columns = cols.map((c) => ({ header: c.header, width: c.width }));
        const h = ws.getRow(1);
        h.font = { bold: true, color: { argb: "FFFFFFFF" } };
        h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5E1622" } };
        h.height = 22;
        ws.views = [{ state: "frozen", ySplit: 1 }];
      };

      const ws = wb.addWorksheet("Pedido vs facturado");
      encabezado(ws, [
        { header: "Comanda", width: 15 },
        { header: "Fecha pedido", width: 18 },
        { header: "Punto", width: 28 },
        { header: "Cliente", width: 32 },
        { header: "NIT / Cédula", width: 16 },
        { header: "Estado pedido", width: 14 },
        { header: "Pago", width: 14 },
        { header: "Factura digitada", width: 15 },
        { header: "Factura Siesa", width: 16 },
        { header: "Fecha factura", width: 18 },
        { header: "Cajero", width: 18 },
        { header: "Valor pedido", width: 14 },
        { header: "Valor facturado", width: 15 },
        { header: "Diferencia", width: 13 },
        { header: "Resultado", width: 22 },
      ]);
      for (const f of lista) {
        const r = ws.addRow([
          f.comanda,
          new Date(f.fecha),
          f.punto,
          f.cliente,
          f.nit,
          f.estado,
          f.pago,
          f.facturaDigitada ?? "",
          f.facturaSiesa ?? "",
          f.fechaFactura ? new Date(f.fechaFactura) : null,
          f.cajero ?? "",
          f.totalPedido,
          f.totalFacturado,
          f.diferencia,
          ESTADOS[f.estadoCruce].label,
        ]);
        r.getCell(2).numFmt = "dd/mm/yyyy hh:mm";
        r.getCell(10).numFmt = "dd/mm/yyyy hh:mm";
        for (const c of [12, 13, 14]) r.getCell(c).numFmt = '"$"#,##0;[Red]-"$"#,##0';
      }
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 15 } };

      const wd = wb.addWorksheet("Detalle por producto");
      encabezado(wd, [
        { header: "Comanda", width: 15 },
        { header: "Factura Siesa", width: 16 },
        { header: "Código", width: 10 },
        { header: "Producto", width: 40 },
        { header: "Cant. pedido", width: 12 },
        { header: "Valor pedido", width: 14 },
        { header: "Cant. facturada", width: 14 },
        { header: "Valor facturado", width: 15 },
        { header: "Diferencia", width: 13 },
      ]);
      for (const f of lista) {
        for (const x of compararProductos(f.productos ?? [], f.lineasFactura ?? [])) {
          const vp = x.pedido?.valor ?? 0;
          const vf = x.factura?.neto ?? 0;
          const r = wd.addRow([
            f.comanda,
            f.facturaSiesa ?? "",
            x.cod,
            x.producto,
            x.pedido?.cantidad ?? null,
            x.pedido ? vp : null,
            x.factura?.cantidad ?? null,
            x.factura ? vf : null,
            f.facturaSiesa ? vf - vp : null,
          ]);
          for (const c of [6, 8, 9]) r.getCell(c).numFmt = '"$"#,##0;[Red]-"$"#,##0';
        }
      }
      wd.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `pedido-vs-facturado-${desde}_${hasta}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo exportar.");
    } finally {
      setExportando(false);
    }
  }

  const r = data?.resumen;
  const chips: { key: EstadoCruce; n: number }[] = r
    ? [
        { key: "coincide", n: r.coinciden },
        { key: "diferencia", n: r.conDiferencia },
        { key: "no_encontrada", n: r.noEncontradas },
        { key: "pendiente", n: r.pendientes },
        { key: "sin_facturar", n: r.sinFacturar },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-end gap-2 px-4 py-3">
          <div className="min-w-[170px]">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-black">Punto de venta</label>
            <select value={puntoId} onChange={(e) => setPuntoId(e.target.value)}
              className="h-9 w-full rounded-lg border border-brand-brown/20 bg-white px-2.5 text-sm outline-none transition focus:border-brand-wine">
              <option value="">Todos</option>
              {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-black">Desde</label>
            <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)}
              className="h-9 rounded-lg border border-brand-brown/20 px-2.5 text-sm outline-none transition focus:border-brand-wine [color-scheme:light]" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-black">Hasta</label>
            <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)}
              className="h-9 rounded-lg border border-brand-brown/20 px-2.5 text-sm outline-none transition focus:border-brand-wine [color-scheme:light]" />
          </div>
          <button type="button" onClick={() => void regenerar()} disabled={cargando}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-wine px-4 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-60">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" /></svg>
            Generar
          </button>
          <button type="button" onClick={() => void traerDeSiesa()} disabled={sincronizando || cargando}
            title="Consulta ya en Siesa los días del rango que aún no se han traído (máx. 3 por vez)"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-sky-600 px-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:opacity-50">
            {sincronizando ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
            )}
            {sincronizando ? "Consultando Siesa…" : "Traer de Siesa"}
          </button>
        </div>
        <p className="border-t border-brand-brown/8 px-4 py-2 text-[11px] text-brand-black/60">
          Las facturas de Siesa se traen solas cada 5 minutos (hoy y ayer) y el histórico se completa en segundo plano.
          Si un día sale «Pendiente de consultar», usa «Traer de Siesa».
        </p>
      </div>

      {aviso && <div className="rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-800">{aviso}</div>}

      {r && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Pedidos", val: String(r.pedidos) },
            { label: "Valor pedidos", val: money(r.totalPedidos) },
            { label: "Valor facturado (Siesa)", val: money(r.totalFacturado) },
            { label: "Diferencia", val: money(r.totalFacturado - r.totalPedidos) },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-brand-brown/10 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-brand-black">{k.label}</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-brand-black">{k.val}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-brown/8 px-4 py-3">
          <input value={busq} onChange={(e) => { setBusq(e.target.value); setVisibles(POR_PAGINA); }}
            placeholder="Buscar comanda, cliente, NIT o factura…"
            className="h-9 min-w-[200px] flex-1 rounded-lg border border-brand-brown/20 px-2.5 text-sm outline-none transition focus:border-brand-wine" />
          <button type="button" onClick={() => void exportarExcel()} disabled={!data || !filas.length || exportando}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-600 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            {exportando ? "Exportando…" : "Exportar Excel"}
          </button>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-brand-brown/8 px-4 py-2">
            <button type="button" onClick={() => setFiltroEstado("")}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${filtroEstado === "" ? "bg-brand-wine text-white" : "bg-neutral-100 text-brand-black"}`}>
              Todos ({r?.pedidos ?? 0})
            </button>
            {chips.map((c) => (
              <button key={c.key} type="button" onClick={() => { setFiltroEstado(c.key); setVisibles(POR_PAGINA); }}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  filtroEstado === c.key ? "ring-2 ring-brand-wine/40 " : ""
                }${ESTADOS[c.key].clase}`}>
                {ESTADOS[c.key].label} ({c.n})
              </button>
            ))}
          </div>
        )}

        {error && <div className="border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-sm text-rose-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brand-brown/10 bg-neutral-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-brand-black">
                <th className="px-4 py-3">Comanda</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Factura</th>
                <th className="px-4 py-3 text-right">Valor pedido</th>
                <th className="px-4 py-3 text-right">Valor facturado</th>
                <th className="px-4 py-3 text-right">Diferencia</th>
                <th className="px-4 py-3">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-brand-black">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-wine border-t-transparent align-middle" />
                  <span className="ml-2 align-middle">Generando…</span>
                </td></tr>
              ) : filas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-14 text-center text-sm text-brand-black">No hay pedidos para los filtros aplicados.</td></tr>
              ) : (
                filas.slice(0, visibles).map((f) => {
                  const det = detalles[f.id];
                  return (
                    <Fragment key={f.id}>
                      <tr onClick={() => void abrir(f)}
                        className={`cursor-pointer border-b border-brand-brown/8 transition hover:bg-neutral-50/60 ${abierto === f.id ? "bg-brand-cream-soft/50" : ""}`}>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <p className="font-semibold text-brand-wine">{f.comanda}</p>
                          <p className="text-[11px] text-brand-black/60">{fechaCorta(f.fecha)} · {f.punto.replace(/^PDV Carnes Santacruz\s*/i, "")}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium leading-tight text-brand-black">{f.cliente || "—"}</p>
                          <p className="text-[11px] text-brand-black/60">{f.nit}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                          <p className="font-mono font-semibold text-brand-black">{f.facturaSiesa ?? (f.facturaDigitada ? `#${f.facturaDigitada}` : "—")}</p>
                          {f.facturaSiesa && <p className="text-[11px] text-brand-black/60">{fechaLocal(f.fechaFactura)}{f.cajero ? ` · ${f.cajero}` : ""}</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{money(f.totalPedido)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{money(f.totalFacturado)}</td>
                        <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums ${f.diferencia && Math.abs(f.diferencia) > 1 ? "font-semibold text-amber-700" : "text-brand-black/50"}`}>
                          {f.diferencia == null ? "—" : money(f.diferencia)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTADOS[f.estadoCruce].clase}`}>
                            {ESTADOS[f.estadoCruce].label}
                          </span>
                        </td>
                      </tr>
                      {abierto === f.id && (
                        <tr className="border-b border-brand-brown/10 bg-brand-cream-soft/30">
                          <td colSpan={7} className="px-4 py-3">
                            {!det || det === "cargando" ? (
                              <p className="text-xs text-brand-black/60">Cargando detalle…</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-[10px] uppercase tracking-wide text-brand-black/60">
                                    <th className="py-1 pr-3">Código</th>
                                    <th className="py-1 pr-3">Producto</th>
                                    <th className="py-1 pr-3 text-right">Cant. pedido</th>
                                    <th className="py-1 pr-3 text-right">Valor pedido</th>
                                    <th className="py-1 pr-3 text-right">Cant. facturada</th>
                                    <th className="py-1 pr-3 text-right">Valor facturado</th>
                                    <th className="py-1 text-right">Diferencia</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {compararProductos(det.productos, det.lineasFactura).map((x) => {
                                    const dif = f.facturaSiesa ? (x.factura?.neto ?? 0) - (x.pedido?.valor ?? 0) : null;
                                    return (
                                      <tr key={x.cod + x.producto} className="border-t border-brand-brown/8">
                                        <td className="py-1 pr-3 font-mono">{x.cod}</td>
                                        <td className="py-1 pr-3">{x.producto}</td>
                                        <td className="py-1 pr-3 text-right tabular-nums">{x.pedido ? fmtNum.format(x.pedido.cantidad) : "—"}</td>
                                        <td className="py-1 pr-3 text-right tabular-nums">{x.pedido ? money(x.pedido.valor) : "—"}</td>
                                        <td className="py-1 pr-3 text-right tabular-nums">{x.factura ? fmtNum.format(x.factura.cantidad) : "—"}</td>
                                        <td className="py-1 pr-3 text-right tabular-nums">{x.factura ? money(x.factura.neto) : "—"}</td>
                                        <td className={`py-1 text-right tabular-nums ${dif && Math.abs(dif) > 1 ? "font-semibold text-amber-700" : "text-brand-black/50"}`}>
                                          {dif == null ? "—" : money(dif)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filas.length > visibles && (
          <div className="border-t border-brand-brown/8 px-4 py-3 text-center">
            <button type="button" onClick={() => setVisibles((v) => v + POR_PAGINA)}
              className="rounded-lg border border-brand-brown/20 px-4 py-1.5 text-sm font-semibold text-brand-wine hover:bg-brand-cream-soft">
              Mostrar más ({filas.length - visibles} restantes)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
