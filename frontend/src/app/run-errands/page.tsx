"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// La raíz del panel redirige a Pedidos (vista principal), igual que en
// SIGROUTE. El layout ya valida la sesión/permiso antes de llegar acá.
export default function RunErrandsRootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/run-errands/pedidos");
  }, [router]);
  return null;
}
