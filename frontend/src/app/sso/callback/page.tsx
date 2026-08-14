"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { guardarSesion } from "@/lib/auth";
import { panelesAccesibles } from "@/lib/permisos";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Punto de entrada del SSO desde la suite (SCTOOLS).
 * La suite redirige aquí con "?ticket=...". Canjeamos el ticket contra el
 * backend, que valida al usuario por su cédula y devuelve un JWT propio.
 */
function SsoCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  // Evita canjear el ticket dos veces (StrictMode monta el efecto 2 veces).
  const intentado = useRef(false);

  useEffect(() => {
    if (intentado.current) return;
    intentado.current = true;

    const ticket = params.get("ticket");
    if (!ticket) {
      setError("Falta el ticket de acceso.");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/sso`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data?.message ?? "No se pudo iniciar sesión desde la suite.");
          return;
        }

        guardarSesion(data.accessToken, data.user);

        const paneles = panelesAccesibles(data.user ?? null);
        if (paneles.length >= 2) {
          router.replace("/seleccionar-panel");
        } else if (paneles.length === 1) {
          router.replace(paneles[0].href);
        } else {
          router.replace("/pedidos");
        }
      } catch {
        setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
      }
    })();
  }, [params, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        {error ? (
          <>
            <h1 className="mb-2 text-lg font-semibold text-neutral-800">
              No se pudo entrar
            </h1>
            <p className="mb-6 text-sm text-neutral-500">{error}</p>
            <button
              className="text-sm font-medium text-red-600 underline"
              onClick={() => router.replace("/")}
            >
              Ir al inicio de sesión
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-red-600" />
            <h1 className="mb-2 text-lg font-semibold text-neutral-800">
              Iniciando sesión…
            </h1>
            <p className="text-sm text-neutral-500">
              Validando tu acceso desde la suite.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense fallback={null}>
      <SsoCallback />
    </Suspense>
  );
}
