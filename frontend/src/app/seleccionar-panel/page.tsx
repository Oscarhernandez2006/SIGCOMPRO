"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getToken,
  getUsuario,
  limpiarSesion,
  type Usuario,
} from "@/lib/auth";
import { panelesAccesibles, type PanelAccesible } from "@/lib/permisos";

/** Presentación visual de cada apartado en el selector. */
const PRESENTACION: Record<
  string,
  { descripcion: string; acento: string; hover: string; link: string; icon: React.ReactNode }
> = {
  operativo: {
    descripcion: "Gestión diaria: pedidos y operación del negocio.",
    acento: "bg-brand-amber/15 text-brand-amber",
    hover: "hover:border-brand-amber",
    link: "text-brand-amber",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9h6m-6 4h4" />
      </svg>
    ),
  },
  administrativo: {
    descripcion: "Administra el panel operativo, usuarios y configuración.",
    acento: "bg-brand-wine/10 text-brand-wine",
    hover: "hover:border-brand-wine",
    link: "text-brand-wine",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
};

export default function SeleccionarPanelPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [paneles, setPaneles] = useState<PanelAccesible[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/");
      return;
    }
    const u = getUsuario();
    const accesibles = panelesAccesibles(u);
    // Con un solo panel accesible no hace falta elegir: vamos directo.
    if (accesibles.length === 1) {
      router.replace(accesibles[0].href);
      return;
    }
    setUsuario(u);
    setPaneles(accesibles);
    setReady(true);
  }, [router]);

  function cerrarSesion() {
    limpiarSesion();
    router.replace("/");
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-cream-soft">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-brand-wine p-6">
      {/* Fondo de marca */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,_var(--color-brand-amber)_0%,_var(--color-brand-amber)_18%,_var(--color-brand-wine)_60%,_var(--color-brand-wine-dark)_100%)]" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(45deg,#000_0_2px,transparent_2px_14px)]" />

      <div className="relative z-10 w-full max-w-3xl">
        {/* Encabezado */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/LOGOCARNESSANTACRUZ.png"
            alt="Carnes Santacruz"
            width={170}
            height={170}
            priority
            className="h-16 w-auto drop-shadow-md"
          />
          <h1 className="mt-4 font-serif text-3xl font-bold text-brand-cream">
            Hola, {usuario?.nombre?.split(" ")[0] ?? "usuario"}
          </h1>
          <p className="mt-1 text-sm text-brand-cream/70">
            ¿A qué panel deseas ingresar?
          </p>
        </div>

        {/* Tarjetas de selección (solo paneles accesibles) */}
        <div className="grid gap-5 sm:grid-cols-2">
          {paneles.map((panel) => {
            const p = PRESENTACION[panel.key];
            if (!p) return null;
            return (
              <button
                key={panel.key}
                onClick={() => router.push(panel.href)}
                className={`group flex flex-col items-start rounded-3xl border border-white/30 bg-brand-cream/95 p-6 text-left shadow-2xl shadow-brand-wine-dark/50 backdrop-blur-md transition hover:-translate-y-1 ${p.hover}`}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${p.acento}`}
                >
                  {p.icon}
                </span>
                <h2 className="mt-4 font-serif text-xl font-bold text-brand-black">
                  {panel.label}
                </h2>
                <p className="mt-1 text-sm text-brand-brown/70">
                  {p.descripcion}
                </p>
                <span
                  className={`mt-4 inline-flex items-center gap-1 text-sm font-medium ${p.link}`}
                >
                  Ingresar
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 transition group-hover:translate-x-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>

        {/* Cerrar sesión */}
        <div className="mt-8 text-center">
          <button
            onClick={cerrarSesion}
            className="text-sm font-medium text-brand-cream/70 underline-offset-4 transition hover:text-brand-cream hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </main>
  );
}
