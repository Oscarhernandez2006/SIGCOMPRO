"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getToken, getUsuario, limpiarSesion, type Usuario } from "@/lib/auth";
import { panelesAccesibles, puedeAccederApartado } from "@/lib/permisos";

const IcoDashboard = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
  </svg>
);
const IcoPedidos = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.001M12 5.432v13.318m0-13.318c1.246.265 2.437.715 3.546 1.323M12 5.432c-1.246.265-2.437.715-3.546 1.323m0 0a18.72 18.72 0 0 0-3.213 9.193 1.125 1.125 0 0 0 1.09 1.124H6.75" />
  </svg>
);
const IcoUsers = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
  </svg>
);
const IcoCliente = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);
const IcoStore = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M4.5 9.75V21h15V9.75M2.25 9.75h19.5" />
  </svg>
);
const IcoSwitch = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
  </svg>
);
const IcoLogout = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
  </svg>
);

const navItems = [
  { label: "Dashboard", href: "/run-errands/dashboard", icon: IcoDashboard },
  { label: "Pedidos", href: "/run-errands/pedidos", icon: IcoPedidos },
  { label: "Domiciliarios", href: "/run-errands/domiciliarios", icon: IcoUsers },
  { label: "Clientes", href: "/run-errands/clientes", icon: IcoCliente },
  { label: "Puntos de venta", href: "/run-errands/pdv", icon: IcoStore },
];

export default function RunErrandsShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/"); return; }
    const u = getUsuario();
    if (!puedeAccederApartado(u, "run_errands")) {
      router.replace(panelesAccesibles(u)[0]?.href ?? "/");
      return;
    }
    setUsuario(u);
    setReady(true);
  }, [router]);

  function cerrarSesion() { limpiarSesion(); router.replace("/"); }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-cream-soft">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
      </div>
    );
  }

  const iniciales = (usuario?.nombre ?? "U").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const puedeCambiarPanel = panelesAccesibles(usuario).length > 1;

  function NavList({ onNavigate }: { onNavigate?: () => void }) {
    const hrefActivo = navItems
      .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
      .reduce<string | null>((mejor, i) => (i.href.length > (mejor?.length ?? -1) ? i.href : mejor), null);
    return (
      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-brand-cream/40">Menú</p>
        {navItems.map((item) => {
          const active = item.href === hrefActivo;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-brand-amber/80 text-white shadow-sm" : "text-brand-cream/75 hover:bg-brand-cream/10 hover:text-white"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/70" />}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream-soft text-brand-black">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-wine text-brand-cream lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <Image src="/LOGOCARNESSANTACRUZ.png" alt="Carnes Santacruz" width={120} height={120} priority className="h-11 w-auto drop-shadow" />
          <div className="leading-tight">
            <p className="font-serif text-base font-bold text-white">Carnes Santacruz</p>
            <p className="text-[11px] text-brand-cream/70">Run Errands</p>
          </div>
        </div>
        <div className="mx-4 mb-3 border-t border-brand-cream/15" />
        <div className="mx-3 mb-3 flex items-center gap-3 rounded-xl bg-brand-wine-dark/60 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-wine-dark text-xs font-bold text-white">
            {iniciales}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{usuario?.nombre ?? "Usuario"}</p>
            <p className="text-[10px] text-brand-cream/70">{usuario?.rol ?? ""}</p>
          </div>
        </div>
        <NavList />
        <div className="space-y-0.5 border-t border-brand-cream/15 p-3">
          {puedeCambiarPanel && (
            <Link href="/seleccionar-panel" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/75 transition hover:bg-brand-cream/10 hover:text-white">
              {IcoSwitch}
              <span>Cambiar de panel</span>
            </Link>
          )}
          <button onClick={cerrarSesion} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/75 transition hover:bg-rose-700/30 hover:text-rose-200">
            {IcoLogout}
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-brand-brown/10 bg-white/90 px-4 backdrop-blur lg:ml-64 lg:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-brown/15 text-brand-brown" aria-label="Abrir menú">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <p className="font-serif text-lg font-bold text-brand-wine">Run Errands</p>
        <div className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-brand-wine/10 text-xs font-bold text-brand-wine">
          {iniciales}
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-brand-black/50 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="absolute inset-y-0 left-0 h-full w-72 bg-brand-wine text-brand-cream" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4">
              <p className="font-serif text-lg font-bold text-white">Run Errands</p>
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-brand-cream/70 transition hover:bg-brand-cream/10" aria-label="Cerrar menú">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <NavList onNavigate={() => setMobileOpen(false)} />
            <div className="space-y-0.5 border-t border-brand-cream/15 p-3">
              {puedeCambiarPanel && (
                <Link href="/seleccionar-panel" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/75 transition hover:bg-brand-cream/10 hover:text-white">
                  {IcoSwitch}
                  <span>Cambiar de panel</span>
                </Link>
              )}
              <button onClick={cerrarSesion} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/75 transition hover:bg-rose-700/30 hover:text-rose-200">
                {IcoLogout}
                <span>Cerrar sesión</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="p-4 lg:ml-64 lg:p-6">{children}</main>
    </div>
  );
}
