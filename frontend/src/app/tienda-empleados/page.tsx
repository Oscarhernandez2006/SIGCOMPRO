"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Anton, Oswald } from "next/font/google";
import {
  consultarSaldoPublico,
  listarTiendasPublicas,
  copTienda,
  SESSION_KEY,
  type SaldoTrabajador,
  type TiendaResumen,
} from "@/lib/tienda-empleados";

const anton = Anton({ subsets: ["latin"], weight: "400" });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"] });

export default function TiendaEmpleadosLanding() {
  const router = useRouter();
  const [cedula, setCedula] = useState("");
  const [saldo, setSaldo] = useState<SaldoTrabajador | null>(null);
  const [tiendas, setTiendas] = useState<TiendaResumen[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restaura sesión previa (si el empleado ya se identificó).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { cedula: string };
        if (s?.cedula) {
          setCedula(s.cedula);
          void identificar(s.cedula, true);
        }
      }
    } catch {
      /* sin sesión previa */
    }
  }, []);

  async function identificar(ced: string, silencioso = false) {
    const c = ced.trim();
    if (!c) {
      setError("Ingresa tu número de cédula.");
      return;
    }
    setCargando(true);
    if (!silencioso) setError(null);
    try {
      const s = await consultarSaldoPublico(c);
      if (!s.encontrado) {
        setSaldo(null);
        setError("Tu cédula no está registrada en el crédito de empleados.");
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      if (!s.activo) {
        setSaldo(null);
        setError("Tu crédito no está activo. Comunícate con nómina.");
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      setSaldo(s);
      setError(null);
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ cedula: s.cedula, nombre: s.nombre }),
      );
      const lista = await listarTiendasPublicas();
      setTiendas(lista);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar tu crédito.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-5 py-10 text-[#f2eee6]">
      <div className="mx-auto max-w-3xl">
        {/* Encabezado */}
        <div className="text-center">
          <Image
            src="/LOGOCARNESSANTACRUZ.png"
            alt="Carnes Santacruz"
            width={200}
            height={200}
            priority
            className="mx-auto h-24 w-auto object-contain"
          />
          <h1 className={`${anton.className} mt-4 text-3xl uppercase tracking-wide text-[#e5b24b] sm:text-4xl`}>
            Tienda de empleados
          </h1>
          <p className={`${oswald.className} mt-1 text-sm uppercase tracking-[0.2em] text-[#cfc7b8]`}>
            Compra con tu crédito · Descuento por nómina
          </p>
        </div>

        {/* Ingreso por cédula */}
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-[#e5b24b]/25 bg-[#151515] p-6 shadow-xl">
          <label className={`${oswald.className} mb-2 block text-xs font-semibold uppercase tracking-widest text-[#cfc7b8]`}>
            Ingresa con tu cédula
          </label>
          <div className="flex gap-2">
            <input
              value={cedula}
              onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && identificar(cedula)}
              inputMode="numeric"
              placeholder="Número de cédula"
              className="flex-1 rounded-xl border border-[#3a3a3a] bg-[#0e0e0e] px-4 py-3 text-base text-white outline-none transition focus:border-[#e5b24b]"
            />
            <button
              onClick={() => identificar(cedula)}
              disabled={cargando}
              className="rounded-xl bg-[#e5b24b] px-5 py-3 text-sm font-bold uppercase tracking-wide text-black transition hover:bg-[#f0c260] disabled:opacity-50"
            >
              {cargando ? "..." : "Entrar"}
            </button>
          </div>
          {error && (
            <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>

        {/* Saldo y tiendas */}
        {saldo && (
          <div className="mt-8">
            <div className="mx-auto max-w-md rounded-2xl border border-[#e5b24b]/30 bg-gradient-to-br from-[#1c1710] to-[#151515] p-6 text-center shadow-xl">
              <p className={`${oswald.className} text-xs uppercase tracking-widest text-[#cfc7b8]`}>
                Hola, {saldo.nombre}
              </p>
              <p className={`${oswald.className} mt-3 text-xs uppercase tracking-widest text-[#cfc7b8]`}>
                Saldo disponible
              </p>
              <p className={`${anton.className} mt-1 text-4xl text-[#5fd08a]`}>
                {copTienda(saldo.cupo_disponible)}
              </p>
              <p className="mt-1 text-xs text-[#9a9384]">
                Cupo total {copTienda(saldo.cupo_asignado)}
              </p>
            </div>

            <h2 className={`${anton.className} mt-9 text-center text-2xl uppercase tracking-wide text-[#e5b24b]`}>
              Elige tu punto
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {tiendas.length === 0 && (
                <p className="col-span-full text-center text-sm text-[#9a9384]">
                  Aún no hay tiendas publicadas. Vuelve pronto.
                </p>
              )}
              {tiendas.map((t) => (
                <button
                  key={t.slug}
                  onClick={() => router.push(`/tienda-empleados/${t.slug}`)}
                  className="group flex items-center gap-4 rounded-2xl border border-[#2a2a2a] bg-[#151515] p-4 text-left transition hover:border-[#e5b24b]/60 hover:bg-[#1a1a1a]"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e5b24b]/15 text-[#e5b24b]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`${oswald.className} block truncate text-lg font-semibold text-white`}>
                      {t.nombre}
                    </span>
                    {t.ciudad && <span className="block text-xs text-[#9a9384]">{t.ciudad}</span>}
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-[#e5b24b] transition group-hover:translate-x-0.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-12 text-center text-xs text-[#6b665c]">
          Para reclamar tu pedido deberás presentar tu cédula física en el punto.
        </p>
      </div>
    </main>
  );
}
