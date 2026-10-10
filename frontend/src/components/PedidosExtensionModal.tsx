"use client";

import { useEffect, useState } from "react";
import { pedidosDeExtension, type PedidoExtension, type SolicitudExtension } from "@/lib/extensiones";

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });

export default function PedidosExtensionModal({
  solicitud,
  onCerrar,
}: {
  solicitud: SolicitudExtension;
  onCerrar: () => void;
}) {
  const [pedidos, setPedidos] = useState<PedidoExtension[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pedidosDeExtension(solicitud.id)
      .then(setPedidos)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los pedidos"));
  }, [solicitud.id]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-brand-wine">Pedidos en extensión</h3>
            <p className="text-xs text-brand-black">
              {solicitud.domiciliario} · {solicitud.punto_nombre ?? "—"} · {solicitud.dia}
            </p>
          </div>
          <button onClick={onCerrar} title="Cerrar" className="rounded-lg p-1.5 text-brand-black hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : pedidos === null ? (
            <p className="text-sm text-brand-brown/60">Cargando…</p>
          ) : pedidos.length === 0 ? (
            <p className="text-sm text-brand-brown/60">
              Aún no hay pedidos asignados a este domiciliario dentro de la extensión.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-brand-brown/60">
                  <th className="pb-2">Consecutivo</th>
                  <th className="pb-2">Comanda</th>
                  <th className="pb-2">Cliente</th>
                  <th className="pb-2">Estado</th>
                  <th className="pb-2">Asignado</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={`${p.pedido_id}-${p.replica}`} className="border-t border-brand-brown/10">
                    <td className="py-2 font-semibold">{p.consecutivo ?? "—"}</td>
                    <td className="py-2">{p.comanda ?? "—"}</td>
                    <td className="py-2">
                      {p.cliente_nombre ?? "—"}
                      {p.cliente_nit && <span className="block text-[11px] text-brand-brown/60">{p.cliente_nit}</span>}
                    </td>
                    <td className="py-2">{p.estado_final ?? "—"}</td>
                    <td className="py-2 whitespace-nowrap">{fmtHora(p.asignado_en)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
