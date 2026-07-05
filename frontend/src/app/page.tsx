"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { panelesAccesibles } from "@/lib/permisos";
import { guardarSesion } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ cedula: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<string | null>(null);

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWelcome(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula: form.cedula, password: form.password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message ?? "No se pudo iniciar sesión.");
        return;
      }

      // Guardamos el token y los datos del usuario para futuras peticiones.
      guardarSesion(data.accessToken, data.user);
      setWelcome(`¡Bienvenido, ${data.user?.nombre ?? "usuario"}!`);
      // Redirigimos según los paneles a los que el usuario tiene acceso:
      // - 2 o más  -> selector de panel
      // - 1        -> directo a ese panel
      // - 0        -> panel operativo (mostrará "sin módulos")
      const paneles = panelesAccesibles(data.user ?? null);
      if (paneles.length >= 2) {
        router.push("/seleccionar-panel");
      } else if (paneles.length === 1) {
        router.push(paneles[0].href);
      } else {
        router.push("/pedidos");
      }
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-brand-wine p-6">
      {/* Fondo: degradado de marca */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,_var(--color-brand-amber)_0%,_var(--color-brand-amber)_18%,_var(--color-brand-wine)_60%,_var(--color-brand-wine-dark)_100%)]" />
      {/* Textura sutil */}
      <div className="absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(45deg,#000_0_2px,transparent_2px_14px)]" />
      {/* Logo grande de fondo, centrado */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Image
          src="/LOGOCARNESSANTACRUZ.png"
          alt=""
          aria-hidden
          width={900}
          height={900}
          priority
          className="w-[min(85vw,680px)] max-w-none opacity-20 drop-shadow-2xl"
        />
      </div>

      {/* ---------- Card de login ---------- */}
      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/40 bg-brand-cream/95 p-6 shadow-2xl shadow-brand-wine-dark/50 backdrop-blur-md sm:p-7">
        {/* Logo dentro de la card */}
        <div className="mb-3 flex justify-center">
          <Image
            src="/LOGOCARNESSANTACRUZ.png"
            alt="Carnes Santacruz — Vendemos Vida"
            width={170}
            height={170}
            priority
            className="h-16 w-auto drop-shadow-md"
          />
        </div>

        <div className="mb-5 text-center">
          <h2 className="font-serif text-2xl font-bold text-brand-black">
            Bienvenido
          </h2>
          <p className="mt-1 text-sm text-brand-brown/70">
            Ingresa tus credenciales para acceder al sistema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Mensajes de estado */}
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-3 text-sm text-brand-wine"
              >
                {error}
              </div>
            )}
            {welcome && (
              <div
                role="status"
                className="rounded-xl border border-brand-amber/40 bg-brand-amber/10 px-4 py-3 text-sm font-medium text-brand-brown"
              >
                {welcome}
              </div>
            )}

            {/* Cédula */}
            <div>
              <label
                htmlFor="cedula"
                className="mb-1.5 block text-sm font-medium text-brand-brown"
              >
                Cédula
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-brand-brown/40">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.6}
                    stroke="currentColor"
                    className="h-5 w-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0ZM10.5 15.75a3 3 0 0 0-6 0v.75h6v-.75Z"
                    />
                  </svg>
                </span>
                <input
                  id="cedula"
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  required
                  value={form.cedula}
                  onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                  placeholder="Número de cédula"
                  className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft py-2.5 pl-10 pr-3 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-brand-brown"
              >
                Contraseña
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-brand-brown/40">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.6}
                    stroke="currentColor"
                    className="h-5 w-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 0h10.5a2.25 2.25 0 0 1 2.25 2.25v6a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 18.75v-6a2.25 2.25 0 0 1 2.25-2.25Z"
                    />
                  </svg>
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft py-2.5 pl-10 pr-11 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  title={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-brand-brown/40 transition hover:text-brand-amber"
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.6}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.6}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Botón */}
            <button
              type="submit"
              disabled={loading}
              title="Iniciar sesión"
              className="group relative w-full overflow-hidden rounded-xl bg-brand-wine py-2.5 font-semibold text-brand-cream shadow-lg shadow-brand-wine/20 transition hover:bg-brand-wine-dark focus:outline-none focus:ring-2 focus:ring-brand-amber/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-brand-amber/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>

        <p className="mt-5 text-center text-xs text-brand-brown/50">
          ¿Problemas para acceder? Contacta al administrador del sistema.
        </p>
      </div>
    </main>
  );
}

