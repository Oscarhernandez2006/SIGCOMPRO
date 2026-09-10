"use client";

import { useState } from "react";
import {
  cambiarClaveTrabajador,
  actualizarTelefonoTrabajador,
  type SesionTrabajador,
} from "@/lib/tienda-empleados";

/**
 * Ícono de usuario con menú para el trabajador en la tienda: cambiar
 * contraseña, actualizar teléfono y cerrar sesión. Reutilizable en ambos navs.
 */
export default function TiendaUserMenu({
  sesion,
  variant = "wine",
  onCerrarSesion,
}: {
  sesion: SesionTrabajador;
  /** "wine" para header vino (texto claro); "cream" para fondos claros. */
  variant?: "wine" | "cream";
  onCerrarSesion: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modal, setModal] = useState<null | "clave" | "telefono">(null);

  const trigger =
    variant === "wine"
      ? "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20"
      : "bg-brand-wine/10 text-brand-wine ring-1 ring-brand-wine/15 hover:bg-brand-wine/15";

  const iniciales = (sesion.nombre ?? "U")
    .split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold transition ${trigger}`}
          title="Mi cuenta"
          aria-label="Mi cuenta"
        >
          {iniciales}
        </button>

        {abierto && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
            <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-brand-brown/10">
              <div className="border-b border-brand-brown/10 px-4 py-3">
                <p className="truncate text-sm font-bold text-brand-black">{sesion.nombre}</p>
                <p className="text-[11px] text-brand-brown/50">C.C. {sesion.cedula}</p>
              </div>
              <div className="p-1.5">
                <MenuItem onClick={() => { setModal("clave"); setAbierto(false); }} label="Cambiar contraseña"
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 0h10.5a2.25 2.25 0 0 1 2.25 2.25v6a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 18.75v-6a2.25 2.25 0 0 1 2.25-2.25Z" />
                <MenuItem onClick={() => { setModal("telefono"); setAbierto(false); }} label="Actualizar teléfono"
                  d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                <button onClick={() => { setAbierto(false); onCerrarSesion(); }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" /></svg>
                  Cerrar sesión
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {modal && (
        <CuentaModal tipo={modal} sesion={sesion} onClose={() => setModal(null)} />
      )}
    </>
  );
}

function MenuItem({ onClick, label, d }: { onClick: () => void; label: string; d: string }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-brand-brown/80 transition hover:bg-brand-cream-soft">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 text-brand-brown/50"><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
      {label}
    </button>
  );
}

function CuentaModal({ tipo, sesion, onClose }: {
  tipo: "clave" | "telefono";
  sesion: SesionTrabajador;
  onClose: () => void;
}) {
  const [claveActual, setClaveActual] = useState("");
  const [claveNueva, setClaveNueva] = useState("");
  const [claveNueva2, setClaveNueva2] = useState("");
  const [telefono, setTelefono] = useState(sesion.telefono ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const input =
    "w-full rounded-xl border border-brand-brown/20 px-3 py-2.5 text-sm outline-none transition focus:border-brand-wine";

  async function guardar() {
    setGuardando(true); setError(null);
    try {
      if (tipo === "clave") {
        if (claveNueva.length < 4) { setError("La nueva contraseña debe tener al menos 4 caracteres."); setGuardando(false); return; }
        if (claveNueva !== claveNueva2) { setError("Las contraseñas no coinciden."); setGuardando(false); return; }
        await cambiarClaveTrabajador({ cedula: sesion.cedula, clave_actual: claveActual, clave_nueva: claveNueva });
      } else {
        await actualizarTelefonoTrabajador({ cedula: sesion.cedula, clave: claveActual, telefono });
      }
      setOk(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !guardando && onClose()} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="font-serif text-lg font-bold text-brand-wine">
          {tipo === "clave" ? "Cambiar contraseña" : "Actualizar teléfono"}
        </h3>
        {ok ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
            ¡Listo! Cambios guardados.
          </p>
        ) : (
          <>
            <div className="mt-4 space-y-2">
              <input value={claveActual} onChange={(e) => setClaveActual(e.target.value)} type="password" placeholder="Tu contraseña actual" className={input} />
              {tipo === "clave" ? (
                <>
                  <input value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} type="password" placeholder="Nueva contraseña" className={input} />
                  <input value={claveNueva2} onChange={(e) => setClaveNueva2(e.target.value)} type="password" placeholder="Repite la nueva contraseña" className={input} />
                </>
              ) : (
                <input value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="Teléfono de contacto" className={input} />
              )}
            </div>
            {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} disabled={guardando} className="h-9 rounded-xl border border-brand-brown/25 px-4 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-50">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="h-9 rounded-xl bg-brand-wine px-4 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-50">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
