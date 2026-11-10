"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Usuario } from "@/lib/auth";
import { NOVEDADES, ROLES_NOVEDADES, type VersionNovedades } from "@/novedades/catalogo";

const NovedadesModal = dynamic(() => import("./NovedadesModal"), { ssr: false });
const IncumplimientosModal = dynamic(() => import("../incumplimientos/IncumplimientosModal"), { ssr: false });

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
  const [listaAbierta, setListaAbierta] = useState(false);
  const [version, setVersion] = useState<VersionNovedades | null>(null);
  const [verIncumplimientos, setVerIncumplimientos] = useState(false);
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
        onClick={() => {
          setAbierto((v) => !v);
          setListaAbierta(false);
        }}
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
            aria-expanded={listaAbierta}
            onClick={() => setListaAbierta((v) => !v)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-brand-black transition hover:bg-brand-cream-soft"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-amber/15 text-base">✨</span>
            <span className="flex-1">
              Novedades
              <span className="block text-[11px] font-normal text-brand-black/55">Elige la actualización que quieres ver</span>
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`h-4 w-4 text-brand-black/50 transition-transform ${listaAbierta ? "rotate-180" : ""}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {listaAbierta && (
            <div className="max-h-64 overflow-y-auto border-t border-brand-brown/10 bg-brand-cream-soft/40 py-1">
              {[...NOVEDADES].reverse().map((v) => (
                <button
                  key={v.version}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAbierto(false);
                    setListaAbierta(false);
                    setVersion(v);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2 pl-14 text-left text-xs text-brand-black transition hover:bg-brand-cream-soft"
                >
                  <span className="font-semibold">{v.fecha}</span>
                  <span className="shrink-0 rounded-full bg-brand-wine/10 px-2 py-0.5 text-[10px] font-bold text-brand-wine">
                    {v.novedades.length}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              setListaAbierta(false);
              setVerIncumplimientos(true);
            }}
            className="flex w-full items-center gap-3 border-t border-brand-brown/10 px-4 py-2.5 text-left text-sm font-medium text-brand-black transition hover:bg-brand-cream-soft"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V4m0 0 2-.5a8 8 0 0 1 5.5.6 6 6 0 0 0 4.2.4L19 4v10l-3.3.8a6 6 0 0 1-4.2-.4 8 8 0 0 0-5.5-.6L4 14.3" />
              </svg>
            </span>
            <span className="flex-1">
              Incumplimientos del personal
              <span className="block text-[11px] font-normal text-brand-black/55">Pedidos no gestionados e informes</span>
            </span>
          </button>
        </div>
      )}

      {verIncumplimientos && (
        <IncumplimientosModal emitidoPor={usuario?.nombre} onCerrar={() => setVerIncumplimientos(false)} />
      )}

      {version && (
        <NovedadesModal
          versiones={[version]}
          nombre={usuario?.nombre}
          repaso
          onCerrar={() => setVersion(null)}
        />
      )}
    </div>
  );
}
