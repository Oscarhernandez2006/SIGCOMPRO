"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  getToken,
  getUsuario,
  limpiarSesion,
  tieneAccesoAdministrativo,
  puedeVerDashboard,
  puedeVerClaveDinamica,
  type Usuario,
} from "@/lib/auth";
import { panelesAccesibles } from "@/lib/permisos";
import ClaveDinamica from "./ClaveDinamica";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  /** Si es true, solo lo ven administrador app / desarrollador. */
  soloDashboard?: boolean;
  /** Sub-opciones desplegables (menú anidado). Si existen, el ítem es un grupo. */
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    soloDashboard: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h12M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
      </svg>
    ),
  },
  {
    label: "Pedidos",
    href: "/admin/pedidos",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9h6m-6 4h4" />
      </svg>
    ),
  },
  {
    label: "Despacho",
    href: "/admin/despacho",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.834 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
  {
    label: "Clientes",
    href: "/admin/clientes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    label: "Productos y precios",
    href: "/admin/productos",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="m7.5 4.27 9 5.15M21 8.25l-9 5.25-9-5.25 9-5.25 9 5.25Zm0 0v7.5L12 21m0 0L3 15.75v-7.5M12 21v-7.5" />
      </svg>
    ),
  },
  {
    label: "Configuración",
    href: "/admin/configuracion",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
    children: [
      {
        label: "Administración de usuarios",
        href: "/admin/usuarios",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
        ),
      },
      {
        label: "Gestión de recursos",
        href: "/admin/configuracion",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
          </svg>
        ),
      },
      {
        label: "Tipos de corte",
        href: "/admin/cortes",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
          </svg>
        ),
      },
      {
        label: "Motivos",
        href: "/admin/motivos",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 17.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM7.5 6.75h12M7.5 12h12m-12 5.25h12" />
          </svg>
        ),
      },
      {
        label: "Valor domicilio",
        href: "/admin/domicilios",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
        ),
      },
      {
        label: "Puntos de venta",
        href: "/admin/puntos-venta",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75h18M4.5 9.75 5.7 5.25A1.5 1.5 0 0 1 7.14 4.2h9.72a1.5 1.5 0 0 1 1.44 1.05l1.2 4.5M5.25 9.75v9.75A1.5 1.5 0 0 0 6.75 21h10.5a1.5 1.5 0 0 0 1.5-1.5V9.75M9.75 21v-5.25a1.5 1.5 0 0 1 1.5-1.5h1.5a1.5 1.5 0 0 1 1.5 1.5V21" />
          </svg>
        ),
      },
    ],
  },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Grupos del menú expandidos (por label). "Configuración" es un grupo.
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/");
      return;
    }
    const u = getUsuario();
    // El panel administrativo es exclusivo de los roles con acceso total.
    if (!tieneAccesoAdministrativo(u?.rol)) {
      router.replace("/");
      return;
    }
    setUsuario(u);
    setReady(true);
  }, [router]);

  function cerrarSesion() {
    limpiarSesion();
    router.replace("/");
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-cream-soft">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-wine border-t-transparent" />
      </div>
    );
  }

  const iniciales = (usuario?.nombre ?? "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Mostrar "Cambiar de panel" solo si hay acceso a más de un panel.
  const puedeCambiarPanel = panelesAccesibles(usuario).length > 1;

  function NavList({ onNavigate }: { onNavigate?: () => void }) {
    const items = navItems.filter(
      (item) => !item.soloDashboard || puedeVerDashboard(usuario?.rol),
    );
    const esActivo = (href: string) => pathname.startsWith(href);
    return (
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {items.map((item) => {
          // Grupo con sub-opciones (ej. Configuración).
          if (item.children && item.children.length > 0) {
            const algunHijoActivo = item.children.some((h) => esActivo(h.href));
            const abierto = gruposAbiertos[item.label] ?? algunHijoActivo;
            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() =>
                    setGruposAbiertos((prev) => ({
                      ...prev,
                      [item.label]: !(prev[item.label] ?? algunHijoActivo),
                    }))
                  }
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    algunHijoActivo
                      ? "text-brand-cream"
                      : "text-brand-cream/80 hover:bg-brand-cream/10 hover:text-brand-cream"
                  }`}
                >
                  {item.icon}
                  <span className="flex-1 text-left">{item.label}</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {abierto && (
                  <div className="mt-1 space-y-1 border-l border-brand-cream/10 pl-3">
                    {item.children.map((hijo) => {
                      const active = esActivo(hijo.href);
                      return (
                        <Link
                          key={hijo.label}
                          href={hijo.href}
                          onClick={onNavigate}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                            active
                              ? "bg-brand-amber text-white shadow-sm"
                              : "text-brand-cream/70 hover:bg-brand-cream/10 hover:text-brand-cream"
                          }`}
                        >
                          {hijo.icon}
                          <span>{hijo.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-brand-amber text-white shadow-sm"
                  : "text-brand-cream/80 hover:bg-brand-cream/10 hover:text-brand-cream"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream-soft text-brand-black">
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-wine-dark text-brand-cream lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <Image
            src="/LOGOCARNESSANTACRUZ.png"
            alt="Carnes Santacruz"
            width={120}
            height={120}
            priority
            className="h-11 w-auto drop-shadow"
          />
          <div className="leading-tight">
            <p className="font-serif text-base font-bold">Carnes Santacruz</p>
            <p className="text-[11px] text-brand-amber">Panel administrativo</p>
          </div>
        </div>
        <div className="mx-3 mb-2 border-t border-brand-cream/10" />
        <NavList />
        <div className="space-y-1 border-t border-brand-cream/10 p-3">
          {puedeCambiarPanel && (
            <Link
              href="/seleccionar-panel"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/80 transition hover:bg-brand-cream/10 hover:text-brand-cream"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
              Cambiar de panel
            </Link>
          )}
          <button
            onClick={cerrarSesion}
            title="Cerrar sesión"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/80 transition hover:bg-brand-cream/10 hover:text-brand-cream"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H3m12 0-4-4m4 4-4 4m6-13h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ---------- Sidebar (móvil) ---------- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-brand-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-brand-wine-dark text-brand-cream shadow-2xl">
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-3">
                <Image
                  src="/LOGOCARNESSANTACRUZ.png"
                  alt="Carnes Santacruz"
                  width={120}
                  height={120}
                  className="h-10 w-auto"
                />
                <p className="font-serif text-sm font-bold">Carnes Santacruz</p>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1 text-brand-cream/70 hover:bg-brand-cream/10"
                aria-label="Cerrar menú"
                title="Cerrar menú"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="mx-3 mb-2 border-t border-brand-cream/10" />
            <NavList onNavigate={() => setMobileOpen(false)} />
            <div className="space-y-1 border-t border-brand-cream/10 p-3">
              {puedeCambiarPanel && (
                <Link
                  href="/seleccionar-panel"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/80 transition hover:bg-brand-cream/10"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  Cambiar de panel
                </Link>
              )}
              <button
                onClick={cerrarSesion}
                title="Cerrar sesión"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-cream/80 transition hover:bg-brand-cream/10"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H3m12 0-4-4m4 4-4 4m6-13h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2" />
                </svg>
                Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ---------- Contenido ---------- */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-brand-wine-dark/15 bg-brand-cream/90 px-4 py-3 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-brand-wine hover:bg-brand-wine/10 lg:hidden"
            aria-label="Abrir menú"
            title="Abrir menú"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <span className="hidden rounded-full bg-brand-wine/10 px-3 py-1 text-xs font-semibold text-brand-wine sm:inline-block">
            Administración
          </span>

          <div className="ml-auto flex items-center gap-3">
            {puedeVerClaveDinamica(usuario?.rol) && <ClaveDinamica />}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-brand-black">
                {usuario?.nombre ?? "Usuario"}
              </p>
              <p className="text-xs capitalize text-brand-brown/60">
                {usuario?.rol ?? ""}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-wine text-sm font-bold text-white">
              {iniciales}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
