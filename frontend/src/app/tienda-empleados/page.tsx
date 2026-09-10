"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listarTiendasPublicas } from "@/lib/tienda-empleados";

/**
 * Ya no hay landing propia: /tienda-empleados solo redirige a la primera tienda.
 * Desde el header de la tienda el empleado puede cambiar de punto de venta.
 */
export default function TiendaEmpleadosIndex() {
  const router = useRouter();
  const [sinTiendas, setSinTiendas] = useState(false);

  useEffect(() => {
    let vivo = true;
    listarTiendasPublicas()
      .then((tiendas) => {
        if (!vivo) return;
        if (tiendas.length > 0) router.replace(`/tienda-empleados/${tiendas[0].slug}`);
        else setSinTiendas(true);
      })
      .catch(() => vivo && setSinTiendas(true));
    return () => {
      vivo = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-cream-soft px-5 text-center text-brand-black">
      {sinTiendas ? (
        <>
          <p className="text-lg font-semibold text-brand-brown/70">Aún no hay tiendas publicadas.</p>
          <Link href="/" className="rounded-2xl bg-brand-amber px-5 py-2.5 font-extrabold text-white shadow-md shadow-brand-amber/30">
            Volver al inicio
          </Link>
        </>
      ) : (
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand-amber border-t-transparent" />
      )}
    </main>
  );
}
