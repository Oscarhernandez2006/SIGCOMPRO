"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getToken, getUsuario, limpiarSesion, type Usuario } from "@/lib/auth";
import { panelesAccesibles, puedeAccederApartado } from "@/lib/permisos";

const IcoCart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
  </svg>
);

const IcoUsers = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
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

const IcoSearch = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
  </svg>
);

const navItems = [
  { label: "Compras crédito",     href: "/credito-empleados",             icon: IcoCart   },
  { label: "Consultar crédito",  href: "/credito-empleados/consulta",    icon: IcoSearch },
  { label: "Trabajadores y cupos", href: "/credito-empleados/trabajadores", icon: IcoUsers  },
];

export default function CreditoShell({ children }: { children: ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [usuario, setUsuario]     = useState<Usuario | null>(null);
  const [ready, setReady]         = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/"); return; }
    const u = getUsuario();
    if (!puedeAccederApartado(u, "credito_empleados")) {
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-wine border-t-transparent" />
      </div>
    );
  }

  const iniciales = (usuario?.nombre ?? "U")
    .split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const puedeCambiarPanel = panelesAccesibles(usuario).length > 1;

  function NavList({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-brand-cream/40">
          Menú
        </p>
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/credito-empleados" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-brand-wine-dark text-white shadow-sm"
                  : "text-brand-cream/75 hover:bg-brand-cream/10 hover:text-white"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/70" />
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream-soft text-brand-black">
      {/* Sidebar desktop */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-wine text-brand-cream lg:flex">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5">
          <Image src="/LOGOCARNESSANTACRUZ.png" alt="Carnes Santacruz" width={120} height={120} priority className="h-11 w-auto drop-shadow" />
          <div className="leading-tight">
            <p className="font-serif text-base font-bold text-white">Carnes Santacruz</p>
            <p className="text-[11px] text-brand-cream/70">Panel Crédito</p>
          </div>
        </div>

        <div className="mx-4 mb-3 border-t border-brand-cream/15" />

        {/* User badge */}
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

        {/* Footer */}
        <div className="space-y-0.5 border-t border-brand-cream/15 p-3">
          {puedeCambiarPanel && (
            <Link
              href="/seleccionar-panel"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/75 transition hover:bg-brand-cream/10 hover:text-white"
            >
              {IcoSwitch}
              <span>Cambiar de panel</span>
            </Link>
          )}
          <button
            onClick={cerrarSesion}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/75 transition hover:bg-rose-700/30 hover:text-rose-200"
          >
            {IcoLogout}
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-brand-brown/10 bg-white/90 px-4 backdrop-blur lg:ml-64 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-brown/15 text-brand-brown"
          aria-label="Abrir menú"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-wine/15 text-brand-wine">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
            </svg>
          </div>
          <p className="font-serif text-lg font-bold text-brand-wine">Crédito Empleados</p>
        </div>
        <div className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-brand-wine/10 text-xs font-bold text-brand-wine">
          {iniciales}
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-brand-black/50 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside
          className="absolute inset-y-0 left-0 h-full w-72 bg-brand-wine text-brand-cream"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4">
              <p className="font-serif text-lg font-bold text-white">Crédito Empleados</p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-brand-cream/70 transition hover:bg-brand-cream/10"
                aria-label="Cerrar menú"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mx-3 mb-2 flex items-center gap-3 rounded-xl bg-brand-wine-dark/60 px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-wine-dark text-xs font-bold text-white">
                {iniciales}
              </div>
              <p className="truncate text-xs font-semibold text-white">{usuario?.nombre ?? "Usuario"}</p>
            </div>
            <NavList onNavigate={() => setMobileOpen(false)} />
            <div className="space-y-0.5 border-t border-brand-cream/15 p-3">
              {puedeCambiarPanel && (
                <Link
                  href="/seleccionar-panel"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/75 transition hover:bg-brand-cream/10 hover:text-white"
                >
                  {IcoSwitch}
                  <span>Cambiar de panel</span>
                </Link>
              )}
              <button
                onClick={cerrarSesion}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/75 transition hover:bg-rose-700/30 hover:text-rose-200"
              >
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
