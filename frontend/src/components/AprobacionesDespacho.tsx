"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { UtensilsCrossed, Activity } from "lucide-react";
import { puedeVerDashboard, tieneAccesoAdministrativo, type Usuario } from "@/lib/auth";
import { puedeVerModulo } from "@/lib/permisos";
import { resumenPendientesExtension } from "@/lib/extensiones";
import AlmuerzosPage from "@/app/(panel)/almuerzos/page";
import SolicitudesExtensionPage from "@/app/admin/solicitudes-extension/page";
import MonitoreoPage from "@/app/admin/monitoreo/page";

type Vista = "almuerzos" | "extensiones" | "monitoreo";

const ROLES_ALMUERZO = ["despacho", "supervisor general", "supervisor_general", "administrador pdv"];

/** Mismas reglas de acceso que usa la página de Aprobación almuerzo. */
export function puedeAprobarAlmuerzos(u: Usuario | null | undefined): boolean {
  const rol = (u?.rol ?? "").trim().toLowerCase();
  if (tieneAccesoAdministrativo(u?.rol)) return true;
  if (!ROLES_ALMUERZO.includes(rol)) return false;
  return ["supervisor general", "supervisor_general"].includes(rol) || puedeVerModulo(u ?? null, "despacho") || puedeVerModulo(u ?? null, "almuerzos");
}

/**
 * Botones "Aprobación almuerzo", "Aprobación extensión" y "Monitoreo" para la barra superior
 * del módulo de Despacho. Abren la misma vista de cada módulo en un modal, así
 * no hay que salir de Despacho para aprobar.
 */
export default function AprobacionesDespacho({
  usuario,
  pendientesExt,
}: {
  usuario: Usuario | null | undefined;
  /** Conteo de extensiones pendientes; si no se pasa, el componente lo consulta. */
  pendientesExt?: number;
}) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [pendientesLocal, setPendientesLocal] = useState(0);

  const veAlmuerzos = puedeAprobarAlmuerzos(usuario);
  const veExtensiones = puedeVerDashboard(usuario?.rol);
  const veMonitoreo = puedeVerModulo(usuario ?? null, "monitoreo");
  const consultarPendientes = veExtensiones && pendientesExt === undefined;

  useEffect(() => {
    if (!consultarPendientes) return;
    let activo = true;
    const revisar = () =>
      resumenPendientesExtension()
        .then((r) => activo && setPendientesLocal(r.pendientes))
        .catch(() => {});
    revisar();
    const id = setInterval(revisar, 30000);
    return () => {
      activo = false;
      clearInterval(id);
    };
  }, [consultarPendientes]);

  useEffect(() => {
    if (!vista) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setVista(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vista]);

  if (!veAlmuerzos && !veExtensiones && !veMonitoreo) return null;

  const pendientes = pendientesExt ?? pendientesLocal;

  return (
    <>
      {veAlmuerzos && (
        <Boton onClick={() => setVista("almuerzos")} title="Aprobar, reprogramar o rechazar almuerzos de domiciliarios">
          <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
          <span className="hidden md:inline">Aprobación almuerzo</span>
        </Boton>
      )}
      {veExtensiones && (
        <Boton onClick={() => setVista("extensiones")} title="Aprobar o rechazar extensiones de domiciliarios">
          <span className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            {pendientes > 0 && (
              <span
                title={`${pendientes} solicitud(es) pendiente(s)`}
                className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white"
              >
                {pendientes}
              </span>
            )}
          </span>
          <span className="hidden md:inline">Aprobación extensión</span>
        </Boton>
      )}
      {veMonitoreo && (
        <Boton onClick={() => setVista("monitoreo")} title="Pedidos retrasados o por vencerse en cada punto de venta">
          <Activity className="h-4 w-4" aria-hidden="true" />
          <span className="hidden md:inline">Monitoreo</span>
        </Boton>
      )}

      {vista &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-black/50 p-3 sm:p-6" onClick={() => setVista(null)}>
            <div
              role="dialog"
              aria-modal="true"
              className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-brand-cream shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-end border-b border-brand-brown/10 bg-white px-4 py-2">
                <button
                  type="button"
                  onClick={() => setVista(null)}
                  className="rounded-lg p-1.5 text-brand-black hover:bg-brand-cream-soft"
                  aria-label="Cerrar"
                  title="Cerrar"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                {vista === "almuerzos" ? <AlmuerzosPage /> : vista === "extensiones" ? <SolicitudesExtensionPage /> : <MonitoreoPage />}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Boton({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center gap-2 rounded-xl border border-brand-wine/20 bg-brand-wine/5 px-3 py-1.5 text-xs font-semibold text-brand-wine transition hover:bg-brand-wine/10"
    >
      {children}
    </button>
  );
}
