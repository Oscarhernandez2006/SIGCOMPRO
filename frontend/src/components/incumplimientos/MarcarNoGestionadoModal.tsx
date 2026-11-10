"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  MOTIVOS_INCUMPLIMIENTO,
  crearIncumplimiento,
  responsablesPunto,
  type Responsable,
} from "@/lib/incumplimientos";

export interface PedidoAMarcar {
  id: string;
  comanda: string;
  cliente: string;
  estado: string;
  puntoId: string;
  puntoNombre: string;
  numeroDia?: number | string | null;
}

/** Foto de la fila del pedido en Despacho (sin los controles marcados con data-no-captura). */
export async function capturarFilaPedido(fila: HTMLElement | null): Promise<string | null> {
  if (!fila) return null;
  try {
    const { toJpeg } = await import("html-to-image");
    return await toJpeg(fila, {
      backgroundColor: "#ffffff",
      quality: 0.9,
      pixelRatio: 1.5,
      filter: (n) => !(n instanceof HTMLElement && n.dataset.noCaptura !== undefined),
    });
  } catch {
    return null;
  }
}

export default function MarcarNoGestionadoModal({
  pedido,
  fila,
  onCerrar,
  onGuardado,
}: {
  pedido: PedidoAMarcar;
  fila: HTMLElement | null;
  onCerrar: () => void;
  onGuardado: (pedidoId: string) => void;
}) {
  const [responsables, setResponsables] = useState<Responsable[] | null>(null);
  const [usuarioId, setUsuarioId] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS_INCUMPLIMIENTO[0]);
  const [otroMotivo, setOtroMotivo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [imagen, setImagen] = useState<string | null>(null);
  const [capturando, setCapturando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    responsablesPunto(pedido.puntoId)
      .then((r) => {
        if (!vigente) return;
        setResponsables(r);
        if (r.length === 1) setUsuarioId(r[0].id);
      })
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "No se pudo cargar el personal del punto"));
    capturarFilaPedido(fila).then((img) => {
      if (!vigente) return;
      setImagen(img);
      setCapturando(false);
    });
    return () => {
      vigente = false;
    };
  }, [pedido.puntoId, fila]);

  const motivoFinal = motivo === "Otro" ? otroMotivo.trim() : motivo;
  const valido = !!usuarioId && !!motivoFinal && descripcion.trim().length >= 10 && !capturando;

  async function guardar() {
    if (!valido || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await crearIncumplimiento({
        pedidoId: pedido.id,
        usuarioId,
        motivo: motivoFinal,
        descripcion: descripcion.trim(),
        imagen,
      });
      onGuardado(pedido.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
      setGuardando(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-black/55 p-4">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-brand-brown/10 bg-red-50/60 px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">Registro de incumplimiento</p>
            <h2 className="font-serif text-lg font-bold text-brand-wine">Marcar pedido no gestionado</h2>
            <p className="text-xs text-brand-black/70">
              Comanda <b>{pedido.comanda}</b>
              {pedido.numeroDia != null ? ` · N° ${pedido.numeroDia}` : ""} · {pedido.cliente} · {pedido.puntoNombre}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-brand-black hover:bg-white"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <div>
            <p className="mb-1 text-xs font-semibold text-brand-black">Evidencia del pedido</p>
            <div className="flex min-h-[90px] items-center justify-center overflow-hidden rounded-xl border border-brand-brown/15 bg-brand-cream-soft/40">
              {capturando ? (
                <span className="flex items-center gap-2 text-xs text-brand-black/60">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
                  Capturando la fila del pedido…
                </span>
              ) : imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagen} alt={`Pedido ${pedido.comanda}`} className="max-h-56 w-full object-contain" />
              ) : (
                <span className="px-3 py-4 text-xs text-amber-800">
                  No se pudo capturar la imagen; se guardará igual toda la información del pedido.
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-brand-black/55">
              Estado al marcar: <b>{pedido.estado}</b>. Se guarda una copia fija del pedido (cliente, productos, valores y
              datos de despacho).
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-black">Responsable del pedido *</label>
            {responsables === null ? (
              <p className="text-xs text-brand-black/60">Cargando personal del punto…</p>
            ) : responsables.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                El punto no tiene personal asignado. Asigna usuarios al punto de venta para poder registrar el incumplimiento.
              </p>
            ) : (
              <select
                value={usuarioId}
                onChange={(e) => setUsuarioId(e.target.value)}
                className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber"
              >
                <option value="">Selecciona la persona…</option>
                {responsables.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre} · CC {r.cedula} · {r.rol}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-black">Motivo del incumplimiento *</label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber"
            >
              {MOTIVOS_INCUMPLIMIENTO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {motivo === "Otro" && (
              <input
                value={otroMotivo}
                onChange={(e) => setOtroMotivo(e.target.value)}
                maxLength={200}
                placeholder="Escribe el motivo"
                className="mt-2 w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber"
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-black">Descripción de lo ocurrido *</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Detalla qué quedó sin gestionar, a qué hora se verificó y cualquier observación relevante para el informe."
              className="w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber"
            />
            <p className="mt-0.5 text-right text-[11px] text-brand-black/50">
              {descripcion.trim().length < 10 ? "Mínimo 10 caracteres" : `${descripcion.length}/4000`}
            </p>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-brand-brown/10 px-5 py-3">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!valido || guardando}
            className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:opacity-50"
          >
            {guardando ? "Registrando…" : "Registrar incumplimiento"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
