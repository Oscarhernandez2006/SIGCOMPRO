"use client";

import { useCallback, useState } from "react";

/**
 * Modal reutilizable que informa al usuario que no tiene permiso para una
 * acción. Se muestra en gris el botón de la acción y, al hacer clic, se abre
 * este modal en vez de ejecutar la operación.
 */
export function ModalSinPermiso({
  abierto,
  onCerrar,
  mensaje = "No tienes permisos para realizar esta acción.",
}: {
  abierto: boolean;
  onCerrar: () => void;
  mensaje?: string;
}) {
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm"
        onClick={onCerrar}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7 text-red-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h2 className="mt-4 font-serif text-xl font-bold text-brand-wine">
          Acción no permitida
        </h2>
        <p className="mt-2 text-sm text-brand-brown/70">{mensaje}</p>
        <button
          onClick={onCerrar}
          title="Entendido, cerrar"
          className="mt-6 w-full rounded-xl bg-brand-wine px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

/** Estado y helpers para mostrar el modal de "sin permiso". */
export function useSinPermiso() {
  const [abierto, setAbierto] = useState(false);
  const mostrar = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => setAbierto(false), []);
  return { abierto, mostrar, cerrar };
}
