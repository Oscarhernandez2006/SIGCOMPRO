"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { obtenerComprobanteApi, type ComprobantePago } from "@/lib/pedidos";
import ZoomImagen from "./ZoomImagen";

export default function ComprobantePagoModal({ pedidoId, comanda, onCerrar }: {
  pedidoId: string; comanda?: string; onCerrar: () => void;
}) {
  const [comprobante, setComprobante] = useState<ComprobantePago | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);
  useEffect(() => {
    let vigente = true;
    obtenerComprobanteApi(pedidoId)
      .then((datos) => { if (vigente) setComprobante(datos); })
      .catch((e) => { if (vigente) setError(e instanceof Error ? e.message : "No se pudo consultar el comprobante."); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [pedidoId]);
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const teclado = (event: KeyboardEvent) => { if (event.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", teclado);
    return () => { document.body.style.overflow = previo; document.removeEventListener("keydown", teclado); };
  }, [onCerrar]);
  const imagenes = comprobante?.imagenes ?? [];
  const posicion = Math.min(indice, Math.max(0, imagenes.length - 1));
  return createPortal(<div className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-black/70 p-3 sm:p-4" onClick={onCerrar}>
    <div role="dialog" aria-modal="true" aria-label="Comprobante de pago" className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between gap-3 border-b border-brand-brown/10 px-4 py-3"><div><h2 className="font-serif text-lg font-bold text-brand-wine">Comprobante de pago</h2>{comanda && <p className="text-xs text-brand-black/60">Comanda {comanda}</p>}</div><button type="button" title="Cerrar" aria-label="Cerrar comprobante" onClick={onCerrar} className="rounded-lg p-2 text-brand-black hover:bg-brand-cream-soft"><X className="h-5 w-5" /></button></header>
      <div className="border-b border-brand-brown/10 px-4 py-3"><p className="text-xs text-brand-black/60">Transacción / referencia / aprobación</p><p className="break-all text-base font-semibold text-brand-black">{comprobante?.referencia || "Sin referencia registrada"}</p>
        {comprobante?.ocr && <span title="Lectura orientativa, no es una verificación bancaria." className={`mt-2 inline-block rounded-md px-2 py-1 text-[11px] font-medium ${comprobante.ocr.estado === "positivo" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{comprobante.ocr.estado === "positivo" ? "Compatible con transferencia" : comprobante.ocr.estado === "dudoso" ? "Posible no transferencia" : "Lectura no disponible"}</span>}
      </div>
      <div className="min-h-0 overflow-y-auto bg-brand-cream-soft/30 p-3">
        {cargando ? <p role="status" className="py-16 text-center text-sm text-brand-black/60">Cargando comprobante...</p> : error ? <p role="alert" className="p-4 text-sm text-red-700">{error}</p> : imagenes.length ? <ZoomImagen key={`${pedidoId}-${posicion}`} src={imagenes[posicion].imagen} alt={`Comprobante ${posicion + 1}`} alto="62vh" /> : <p className="py-12 text-center text-sm text-brand-black/60">No hay comprobante adjunto.</p>}
      </div>
      {imagenes.length > 1 && <div className="flex items-center justify-center gap-4 border-t border-brand-brown/10 p-3"><button type="button" aria-label="Imagen anterior" title="Imagen anterior" onClick={() => setIndice((posicion - 1 + imagenes.length) % imagenes.length)} className="rounded-md p-2 hover:bg-brand-cream-soft"><ChevronLeft className="h-4 w-4" /></button><span className="text-xs text-brand-black">{posicion + 1} / {imagenes.length}</span><button type="button" aria-label="Imagen siguiente" title="Imagen siguiente" onClick={() => setIndice((posicion + 1) % imagenes.length)} className="rounded-md p-2 hover:bg-brand-cream-soft"><ChevronRight className="h-4 w-4" /></button></div>}
    </div>
  </div>, document.body);
}