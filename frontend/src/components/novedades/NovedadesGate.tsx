"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Usuario } from "@/lib/auth";
import { novedadesVistas } from "@/lib/novedades";
import { NOVEDADES, ROLES_NOVEDADES, type VersionNovedades } from "@/novedades/catalogo";

// El modal y sus animaciones solo se descargan si hay novedades pendientes.
const NovedadesModal = dynamic(() => import("./NovedadesModal"), { ssr: false });

/** Máximo de versiones atrasadas que se muestran de una vez. */
const MAX_VERSIONES = 3;

export default function NovedadesGate({ usuario }: { usuario: Usuario | null }) {
  const [pendientes, setPendientes] = useState<VersionNovedades[]>([]);
  const rol = (usuario?.rol ?? "").trim().toLowerCase();
  const aplica = !!usuario && ROLES_NOVEDADES.includes(rol);

  useEffect(() => {
    if (!aplica) return;
    let activo = true;
    novedadesVistas()
      .then((vistas) => {
        if (!activo) return;
        const vistasSet = new Set(vistas);
        setPendientes(NOVEDADES.filter((v) => !vistasSet.has(v.version)).slice(-MAX_VERSIONES));
      })
      .catch(() => {
        /* sin conexión: se intentará en la próxima carga */
      });
    return () => {
      activo = false;
    };
  }, [aplica, usuario?.id]);

  if (!aplica || pendientes.length === 0) return null;
  return <NovedadesModal versiones={pendientes} nombre={usuario?.nombre} onCerrar={() => setPendientes([])} />;
}
