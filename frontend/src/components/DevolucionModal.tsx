"use client";

import { useMemo, useState } from "react";
import type { Pedido } from "@/app/(panel)/pedidos/page";
import { registrarDevolucionApi, type DespachoMeta, type DevolucionPedido } from "@/lib/pedidos";

const cop = (n: number) => "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");
const cant = (n: number, um: string) => {
  const v = Number.isInteger(n) ? n : Number(n.toFixed(3));
  return `${v} ${(um || "U").toUpperCase()}`;
};

function Marco({ titulo, subtitulo, onCerrar, children }: { titulo: string; subtitulo?: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-brand-black/50 p-4" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-brand-brown/10 px-6 py-4">
          <div>
            <h2 className="font-serif text-xl font-bold text-brand-wine">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-sm text-brand-black">{subtitulo}</p>}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" title="Cerrar" className="rounded-lg p-1.5 text-brand-black hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Registro de una devolución total o parcial, producto a producto. */
export function RegistrarDevolucionModal({
  pedido,
  meta,
  onCerrar,
  onRegistrada,
}: {
  pedido: Pedido;
  meta?: DespachoMeta;
  onCerrar: () => void;
  onRegistrada: (r: { pedido: Pedido; meta: DespachoMeta }) => void;
}) {
  const valorAnterior = Number(meta?.facturaValor ?? pedido.total) || 0;
  const items = useMemo(
    () => (pedido.carrito ?? []).filter((i) => (Number(i.cantidad) || 0) > 0 && i.producto?.referencia !== "0000"),
    [pedido.carrito],
  );
  const [sel, setSel] = useState<Record<string, string>>({});
  const [facturaNumero, setFacturaNumero] = useState("");
  const [valorManual, setValorManual] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegidos = items
    .map((i) => ({ item: i, cantidad: Number(String(sel[i.id] ?? "").replace(",", ".")) }))
    .filter((x) => sel[x.item.id] !== undefined);
  const sugerido = Math.round(
    elegidos.reduce((s, x) => s + (Number.isFinite(x.cantidad) ? x.cantidad : 0) * (Number(x.item.producto.precio) || 0), 0),
  );
  const valorDevuelto = valorManual === null ? sugerido : Math.round(Number(valorManual.replace(/[^\d]/g, "")) || 0);
  const valorNuevo = valorAnterior - valorDevuelto;
  const cantidadInvalida = elegidos.some((x) => !Number.isFinite(x.cantidad) || x.cantidad <= 0 || x.cantidad > Number(x.item.cantidad));

  function alternar(id: string, total: number) {
    setSel((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = String(total);
      return next;
    });
  }

  async function guardar() {
    setError(null);
    if (elegidos.length === 0) return setError("Selecciona al menos un producto devuelto.");
    if (cantidadInvalida) return setError("Revisa las cantidades: deben ser mayores que 0 y no superar lo pedido.");
    if (!facturaNumero.trim()) return setError("Ingresa el número de la factura de la devolución.");
    if (valorDevuelto <= 0) return setError("Ingresa el valor devuelto.");
    if (valorDevuelto > valorAnterior) return setError("El valor devuelto no puede superar el valor facturado.");
    setGuardando(true);
    try {
      const r = await registrarDevolucionApi(pedido.id, {
        facturaNumero: facturaNumero.trim(),
        valorDevuelto,
        motivo: motivo.trim() || undefined,
        productos: elegidos.map((x) => ({ itemId: x.item.id, cantidad: x.cantidad })),
      });
      onRegistrada(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la devolución.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Marco titulo="Registrar devolución" subtitulo={`Comanda #${pedido.comanda} · ${pedido.cliente?.nombre ?? ""}`} onCerrar={onCerrar}>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-brand-black">1. Marca los productos devueltos y su cantidad</p>
          <div className="overflow-x-auto rounded-xl border border-brand-brown/10">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-brand-cream-soft text-left text-[11px] uppercase tracking-wide text-brand-black">
                <tr>
                  <th className="w-10 px-3 py-2"><span className="sr-only">Devuelto</span></th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Pedido</th>
                  <th className="px-3 py-2 text-right">Devuelve</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const activo = i.id in sel;
                  const n = Number(String(sel[i.id] ?? "").replace(",", "."));
                  const invalida = activo && (!Number.isFinite(n) || n <= 0 || n > Number(i.cantidad));
                  return (
                    <tr key={i.id} className={`border-t border-brand-brown/5 ${activo ? "bg-fuchsia-50/60" : ""}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={activo}
                          onChange={() => alternar(i.id, Number(i.cantidad))}
                          aria-label={`Devolver ${i.producto.producto}`}
                          className="h-4 w-4 accent-fuchsia-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-brand-black">{i.producto.producto}</p>
                        <p className="text-xs text-brand-black">Ref. {i.producto.referencia} · {cop(i.producto.precio)}{(i.producto.um || "").toUpperCase() === "KG" ? "/kg" : ""}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-brand-black">{cant(Number(i.cantidad), i.producto.um ?? "")}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={Number(i.cantidad)}
                          step="any"
                          disabled={!activo}
                          value={activo ? sel[i.id] : ""}
                          onChange={(e) => setSel((prev) => ({ ...prev, [i.id]: e.target.value }))}
                          aria-label={`Cantidad devuelta de ${i.producto.producto}`}
                          aria-invalid={invalida}
                          className={`w-24 rounded-lg border px-2 py-1 text-right text-sm outline-none focus:ring-1 focus:ring-fuchsia-500 disabled:bg-brand-cream-soft ${invalida ? "border-red-400" : "border-brand-brown/20"}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-brand-black">
                        {activo && Number.isFinite(n) ? cop(n * (Number(i.producto.precio) || 0)) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-brand-black">
            2. N° de factura de la devolución
            <input
              type="text"
              value={facturaNumero}
              maxLength={60}
              onChange={(e) => setFacturaNumero(e.target.value)}
              placeholder="Ej. NC-1234"
              className="mt-1 w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm font-normal outline-none focus:border-fuchsia-500"
            />
          </label>
          <label className="text-sm font-semibold text-brand-black">
            3. Valor devuelto en dinero
            <input
              type="text"
              inputMode="numeric"
              value={valorManual ?? (sugerido ? String(sugerido) : "")}
              onChange={(e) => setValorManual(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm font-normal outline-none focus:border-fuchsia-500"
            />
            <span className="mt-1 block text-xs font-normal text-brand-black">
              Sugerido por productos: {cop(sugerido)}
              {valorManual !== null && (
                <button type="button" onClick={() => setValorManual(null)} className="ml-2 font-semibold text-fuchsia-700 underline">
                  Usar sugerido
                </button>
              )}
            </span>
          </label>
        </div>
        <label className="block text-sm font-semibold text-brand-black">
          Motivo (opcional)
          <input
            type="text"
            value={motivo}
            maxLength={300}
            onChange={(e) => setMotivo(e.target.value)}
            className="mt-1 w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm font-normal outline-none focus:border-fuchsia-500"
          />
        </label>

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-brand-cream-soft p-3 text-center text-sm">
          <div>
            <p className="text-xs text-brand-black">Facturado</p>
            <p className="font-bold text-brand-black">{cop(valorAnterior)}</p>
          </div>
          <div>
            <p className="text-xs text-brand-black">Devuelto</p>
            <p className="font-bold text-fuchsia-700">− {cop(valorDevuelto)}</p>
          </div>
          <div>
            <p className="text-xs text-brand-black">Nuevo facturado</p>
            <p className={`font-bold ${valorNuevo < 0 ? "text-red-600" : "text-brand-wine"}`}>{cop(valorNuevo)}</p>
          </div>
        </div>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-brand-brown/10 px-6 py-3">
        <button onClick={onCerrar} className="rounded-xl border border-brand-brown/20 px-4 py-2 text-sm font-semibold text-brand-black hover:bg-brand-cream-soft">
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-xl bg-fuchsia-700 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-800 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Registrar devolución"}
        </button>
      </div>
    </Marco>
  );
}

/** Detalle de una devolución: valores antes/después y productos resultantes. */
export function DetalleDevolucionModal({
  pedido,
  devolucion,
  onCerrar,
}: {
  pedido: Pedido;
  devolucion: DevolucionPedido;
  onCerrar: () => void;
}) {
  const devueltos = new Map(devolucion.productos.map((p) => [p.itemId, p]));
  const productosFinales = (pedido.carrito ?? [])
    .filter((i) => i.producto?.referencia !== "0000")
    .map((i) => {
      const d = devueltos.get(i.id);
      return {
        id: i.id,
        producto: i.producto.producto,
        referencia: i.producto.referencia,
        um: i.producto.um ?? "",
        original: Number(i.cantidad) || 0,
        devuelta: d?.cantidadDevuelta ?? 0,
        final: d ? d.cantidadFinal : Number(i.cantidad) || 0,
      };
    });
  return (
    <Marco
      titulo="Detalle de la devolución"
      subtitulo={`Comanda #${pedido.comanda} · Factura devolución ${devolucion.facturaNumero}`}
      onCerrar={onCerrar}
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-brand-cream-soft p-3 text-center text-sm">
          <div>
            <p className="text-xs text-brand-black">Valor anterior</p>
            <p className="font-bold text-brand-black">{cop(devolucion.valorAnterior)}</p>
          </div>
          <div>
            <p className="text-xs text-brand-black">Devuelto</p>
            <p className="font-bold text-fuchsia-700">− {cop(devolucion.valorDevuelto)}</p>
          </div>
          <div>
            <p className="text-xs text-brand-black">Valor nuevo</p>
            <p className="font-bold text-brand-wine">{cop(devolucion.valorNuevo)}</p>
          </div>
        </div>
        <p className="text-xs text-brand-black">
          Registró <b>{devolucion.usuarioNombre ?? "—"}</b> el{" "}
          {new Date(devolucion.fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })} · Estado anterior: {devolucion.estadoAnterior || "—"}
          {devolucion.motivo && <> · Motivo: {devolucion.motivo}</>}
        </p>
        <div className="overflow-x-auto rounded-xl border border-brand-brown/10">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-brand-cream-soft text-left text-[11px] uppercase tracking-wide text-brand-black">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Antes</th>
                <th className="px-3 py-2 text-right">Devuelto</th>
                <th className="px-3 py-2 text-right">Quedó</th>
              </tr>
            </thead>
            <tbody>
              {productosFinales.map((p) => (
                <tr key={p.id} className={`border-t border-brand-brown/5 ${p.devuelta > 0 ? "bg-fuchsia-50/60" : ""}`}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-brand-black">{p.producto}</p>
                    <p className="text-xs text-brand-black">Ref. {p.referencia}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{cant(p.original, p.um)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-fuchsia-700">
                    {p.devuelta > 0 ? `− ${cant(p.devuelta, p.um)}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-brand-black">{cant(p.final, p.um)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-end border-t border-brand-brown/10 px-6 py-3">
        <button onClick={onCerrar} className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90">
          Cerrar
        </button>
      </div>
    </Marco>
  );
}
