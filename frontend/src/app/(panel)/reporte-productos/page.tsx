"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { listarPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";
import { reporteProductos, type ReporteProductos } from "@/lib/reportes";

const fmtCop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const money = (v: number) => fmtCop.format(Number.isFinite(v) ? v : 0);
const fmtNum = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export default function ReporteProductosPage() {
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [codigo, setCodigo] = useState("");
  const [puntoId, setPuntoId] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [data, setData] = useState<ReporteProductos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busq, setBusq] = useState("");

  useEffect(() => {
    listarPuntosVenta().then(setPuntos).catch(() => setPuntos([]));
  }, []);

  const generar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setData(await reporteProductos({ codigo, punto_id: puntoId, desde, hasta }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo generar el reporte.");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [codigo, puntoId, desde, hasta]);

  useEffect(() => { void generar(); }, [generar]);

  const filas = useMemo(() => {
    const q = busq.trim().toLowerCase();
    const base = data?.filas ?? [];
    if (!q) return base;
    return base.filter((f) =>
      `${f.cliente} ${f.nit} ${f.producto} ${f.codigo} ${f.punto}`.toLowerCase().includes(q),
    );
  }, [data, busq]);

  async function exportarExcel() {
    if (!data || filas.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "SIGCOMPRO";
    wb.created = new Date();
    const ws = wb.addWorksheet("Reporte", {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
    });

    const columnas = [
      { header: "Cliente", key: "cliente", width: 34 },
      { header: "NIT / Cédula", key: "nit", width: 16 },
      { header: "Punto", key: "punto", width: 22 },
      { header: "Código", key: "codigo", width: 12 },
      { header: "Producto", key: "producto", width: 40 },
      { header: "Cantidad", key: "cantidad", width: 12 },
      { header: "N° pedidos", key: "n_pedidos", width: 12 },
      { header: "Monto", key: "monto", width: 16 },
      { header: "Última compra", key: "ultima", width: 15 },
    ];
    const nCols = columnas.length;

    // Fila 1: título
    ws.mergeCells(1, 1, 1, nCols);
    const tCell = ws.getCell(1, 1);
    tCell.value = "Reporte de productos por cliente";
    tCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    tCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    tCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7A1E2B" } };
    ws.getRow(1).height = 30;

    // Fila 2: filtros aplicados
    ws.mergeCells(2, 1, 2, nCols);
    const fCell = ws.getCell(2, 1);
    const partes: string[] = [];
    partes.push(codigo ? `Código: ${codigo}` : "Todos los productos");
    partes.push(puntoId ? `Punto: ${puntos.find((p) => p.id === puntoId)?.nombre ?? puntoId}` : "Todos los puntos");
    if (desde) partes.push(`Desde: ${desde}`);
    if (hasta) partes.push(`Hasta: ${hasta}`);
    partes.push(`Generado: ${new Date().toLocaleString("es-CO")}`);
    fCell.value = partes.join("    ·    ");
    fCell.font = { size: 10, italic: true, color: { argb: "FF6B4F3A" } };
    fCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    fCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6EFE7" } };
    ws.getRow(2).height = 20;

    // Fila 3: vacía (separador)
    ws.getRow(3).height = 6;

    // Fila 4: encabezados
    const headerRow = ws.getRow(4);
    columnas.forEach((c, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = c.header;
      cell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", horizontal: idx >= 5 && idx <= 7 ? "right" : "left" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5E1622" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FF7A1E2B" } } };
    });
    headerRow.height = 26;
    columnas.forEach((c, idx) => { ws.getColumn(idx + 1).width = c.width; });

    // Filas de datos
    filas.forEach((f, i) => {
      const r = ws.addRow([
        f.cliente, f.nit, f.punto, f.codigo, f.producto,
        f.cantidad, f.n_pedidos, f.monto,
        f.ultima_compra ? new Date(`${f.ultima_compra}T00:00:00`) : null,
      ]);
      r.height = 18;
      r.eachCell((cell, col) => {
        cell.font = { size: 11, color: { argb: "FF2B2320" } };
        cell.alignment = { vertical: "middle", horizontal: col >= 6 && col <= 8 ? "right" : "left" };
        cell.border = { bottom: { style: "hair", color: { argb: "FFE3D8CC" } } };
      });
      if (i % 2 === 1) {
        r.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBF7F2" } }; });
      }
      r.getCell(6).numFmt = "#,##0.##";
      r.getCell(8).numFmt = '"$"#,##0';
      r.getCell(9).numFmt = "dd/mm/yyyy";
    });

    // Fila de totales
    const totalRow = ws.addRow([
      "TOTAL", "", "", "", "",
      data.resumen.cantidad, "", data.resumen.monto, "",
    ]);
    totalRow.height = 22;
    totalRow.eachCell((cell, col) => {
      cell.font = { bold: true, size: 11, color: { argb: "FF5E1622" } };
      cell.alignment = { vertical: "middle", horizontal: col >= 6 && col <= 8 ? "right" : "left" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1E4D6" } };
      cell.border = { top: { style: "thin", color: { argb: "FF7A1E2B" } } };
    });
    totalRow.getCell(6).numFmt = "#,##0.##";
    totalRow.getCell(8).numFmt = '"$"#,##0';

    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: nCols } };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-productos${codigo ? `-${codigo}` : ""}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hayFiltros = !!(codigo || puntoId || desde || hasta);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Encabezado */}
      <div>
        <h1 className="font-serif text-2xl font-bold text-brand-wine">Reporte de productos por cliente</h1>
        <p className="mt-0.5 text-sm text-brand-brown/60">
          Consulta qué clientes han comprado un producto. Filtra por punto de venta, por código específico o consúltalo general.
        </p>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-end gap-2 px-4 py-3">
          <div className="min-w-[150px]">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Código del producto</label>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value.trim())}
              placeholder="Ej: 9016 (vacío = todos)"
              className="h-9 w-full rounded-lg border border-brand-brown/20 px-2.5 text-sm outline-none transition focus:border-brand-wine" />
          </div>
          <div className="min-w-[170px]">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Punto de venta</label>
            <select value={puntoId} onChange={(e) => setPuntoId(e.target.value)}
              className="h-9 w-full rounded-lg border border-brand-brown/20 bg-white px-2.5 text-sm outline-none transition focus:border-brand-wine">
              <option value="">Todos</option>
              {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="h-9 rounded-lg border border-brand-brown/20 px-2.5 text-sm outline-none transition focus:border-brand-wine [color-scheme:light]" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="h-9 rounded-lg border border-brand-brown/20 px-2.5 text-sm outline-none transition focus:border-brand-wine [color-scheme:light]" />
          </div>
          <button type="button" onClick={() => void generar()}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-wine px-4 text-sm font-semibold text-white transition hover:bg-brand-wine/90">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" /></svg>
            Generar
          </button>
          {hayFiltros && (
            <button type="button" onClick={() => { setCodigo(""); setPuntoId(""); setDesde(""); setHasta(""); }}
              className="h-9 rounded-lg border border-brand-brown/20 px-3 text-sm text-brand-brown/60 transition hover:bg-brand-cream-soft">
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Resumen */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Clientes", val: String(data.resumen.clientes) },
            { label: "Filas", val: String(data.resumen.filas) },
            { label: "Cantidad total", val: fmtNum.format(data.resumen.cantidad) },
            { label: "Monto total", val: money(data.resumen.monto) },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-brand-brown/10 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-brand-brown/55">{k.label}</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-brand-black">{k.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div className="flex-1 overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-brown/8 px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-brown/35">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
            </svg>
            <input value={busq} onChange={(e) => setBusq(e.target.value)}
              placeholder="Buscar en resultados (cliente, producto…)"
              className="h-9 w-full rounded-lg border border-brand-brown/20 pl-8 pr-2.5 text-sm outline-none transition focus:border-brand-wine" />
          </div>
          <button type="button" onClick={exportarExcel} disabled={!data || filas.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-600 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            Exportar Excel
          </button>
        </div>

        {error && (
          <div className="border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-sm text-rose-700">{error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brand-brown/10 bg-neutral-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Punto</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Pedidos</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="whitespace-nowrap px-4 py-3">Última compra</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-brand-brown/50">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-wine border-t-transparent align-middle" />
                    <span className="ml-2 align-middle">Generando…</span>
                  </td>
                </tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center text-sm text-brand-brown/50">
                    No hay compras para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filas.map((f, idx) => (
                  <tr key={`${f.nit}-${f.codigo}-${f.punto}-${idx}`} className="border-b border-brand-brown/8 transition hover:bg-neutral-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight text-brand-black">{f.cliente}</p>
                      <p className="text-[11px] text-brand-brown/50">{f.nit}</p>
                    </td>
                    <td className="px-4 py-3 text-brand-brown/75">{f.punto || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-brand-brown/80">{f.codigo}</td>
                    <td className="px-4 py-3 text-brand-black">{f.producto || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-brand-black">{fmtNum.format(f.cantidad)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-brand-brown/70">{f.n_pedidos}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-brand-black">{money(f.monto)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-brand-brown/65">
                      {f.ultima_compra
                        ? new Date(`${f.ultima_compra}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
