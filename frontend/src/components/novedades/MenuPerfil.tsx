"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Usuario } from "@/lib/auth";
import { NOVEDADES, ROLES_NOVEDADES } from "@/novedades/catalogo";

const NovedadesModal = dynamic(() => import("./NovedadesModal"), { ssr: false });

/** Avatar del topbar con menú de perfil (opción «Novedades» para repasar las funciones nuevas). */
export default function MenuPerfil({
  usuario,
  iniciales,
  colorAvatar,
}: {
  usuario: Usuario | null;
  iniciales: string;
  colorAvatar: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [verNovedades, setVerNovedades] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const rol = (usuario?.rol ?? "").trim().toLowerCase();
  const aplica = !!usuario && ROLES_NOVEDADES.includes(rol) && NOVEDADES.length > 0;
  const titulo = `${usuario?.nombre ?? "Usuario"}${usuario?.rol ? ` · ${usuario.rol}` : ""}`;

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const claseAvatar = `flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${colorAvatar}`;

  if (!aplica) {
    return (
      <div className={claseAvatar} title={titulo}>
        {iniciales}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`${claseAvatar} transition hover:ring-2 hover:ring-brand-amber/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-amber`}
        title={titulo}
        aria-haspopup="menu"
        aria-expanded={abierto}
      >
        {iniciales}
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-xl"
        >
          <div className="border-b border-brand-brown/10 px-4 py-3">
            <p className="truncate text-sm font-semibold text-brand-black">{usuario?.nombre ?? "Usuario"}</p>
            <p className="truncate text-xs capitalize text-brand-black/60">{usuario?.rol ?? ""}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              setVerNovedades(true);
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-brand-black transition hover:bg-brand-cream-soft"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-amber/15 text-base">✨</span>
            <span>
              Novedades
              <span className="block text-[11px] font-normal text-brand-black/55">Ver de nuevo las funciones nuevas</span>
            </span>
          </button>
        </div>
      )}

      {verNovedades && (
        <NovedadesModal
          versiones={[...NOVEDADES].reverse()}
          nombre={usuario?.nombre}
          repaso
          onCerrar={() => setVerNovedades(false)}
        />
      )}
    </div>
  );
}
