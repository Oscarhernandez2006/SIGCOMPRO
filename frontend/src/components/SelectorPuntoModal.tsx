"use client";

import { useEffect, useState } from "react";
import { listarListasPrecio } from "@/lib/productos";
import type { PuntoVenta } from "@/lib/puntos-venta";

/**
 * Modal para que los roles con selector (administrador app / desarrollador)
 * elijan el punto de venta cuya información quieren ver en Pedidos y Despacho.
 * Muestra los puntos asignados al usuario; al elegir uno se filtra la vista.
 */
export default function SelectorPuntoModal({
  puntos,
  seleccionadoId,
  onSeleccionar,
  onCerrar,
}: {
  puntos: PuntoVenta[];
  seleccionadoId: string | null;
  onSeleccionar: (id: string) => void;
  /** Si se puede cerrar sin elegir (solo cuando ya hay un punto activo). */
  onCerrar?: () => void;
}) {
  const [descripciones, setDescripciones] = useState<Record<string, string>>({});

  useEffect(() => {
    listarListasPrecio()
      .then((ls) => {
        const m: Record<string, string> = {};
        for (const l of ls) if (l.desc_lista) m[l.lista_precio] = l.desc_lista;
        setDescripciones(m);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm"
        onClick={onCerrar}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        {onCerrar && (
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            title="Cerrar"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-brand-brown/50 transition hover:bg-brand-cream-soft hover:text-brand-brown"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <h2 className="font-serif text-xl font-bold text-brand-wine">
          Elige el punto de venta
        </h2>
        <p className="mt-1 text-sm text-brand-brown/70">
          Verás la información de Pedidos y Despacho del punto que selecciones.
          Puedes cambiarlo cuando quieras.
        </p>

        {puntos.length === 0 ? (
          <p className="mt-6 rounded-xl bg-brand-cream-soft px-4 py-6 text-center text-sm text-brand-brown/50">
            No tienes puntos de venta asignados.
          </p>
        ) : (
          <div className="mt-4 grid max-h-[55vh] gap-2 overflow-y-auto sm:grid-cols-2">
            {puntos.map((p) => {
              const activo = String(p.id) === seleccionadoId;
              return (
                <button
                  key={p.id}
                  onClick={() => onSeleccionar(String(p.id))}
                  title={`Ver ${p.nombre}`}
                  className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left transition hover:bg-brand-cream-soft/40 ${
                    activo
                      ? "border-brand-amber ring-1 ring-brand-amber/40"
                      : "border-brand-brown/10 hover:border-brand-amber/50"
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-wine/10 text-brand-wine">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-brand-black">
                        {p.nombre}
                      </span>
                      {activo && (
                        <span className="shrink-0 rounded-full bg-brand-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-amber">
                          Activo
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-brand-brown/60">
                      {p.lista_precio
                        ? descripciones[p.lista_precio] ?? `Lista ${p.lista_precio}`
                        : "Sin lista asignada"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
