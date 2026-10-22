"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function PendientesCreditoBadge() {
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    let vigente = true;
    let cargando = false;
    const cargar = async () => {
      if (cargando) return;
      cargando = true;
      try {
        const data = await apiFetch<{ total: number }>("/tienda-empleados/pedidos/pendientes");
        if (vigente) setTotal(data.total);
      } catch { if (vigente) setTotal(null); }
      finally { cargando = false; }
    };
    void cargar();
    const intervalo = setInterval(cargar, 5000);
    window.addEventListener("credito-actualizado", cargar);
    return () => { vigente = false; clearInterval(intervalo); window.removeEventListener("credito-actualizado", cargar); };
  }, []);
  return <span aria-live="polite" aria-label={total === null ? "Pendientes sin actualizar" : `${total} pedidos pendientes`} title={total === null ? "No se pudo actualizar el contador" : `${total} pedidos pendientes`} className={`absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-brand-wine-dark ${total ? "bg-red-600" : "bg-neutral-600"}`}>{total === null ? "?" : total > 99 ? "99+" : total}</span>;
}