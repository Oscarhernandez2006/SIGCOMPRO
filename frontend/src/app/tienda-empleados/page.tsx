"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Manrope, Playfair_Display } from "next/font/google";
import {
  consultarSaldoPublico,
  listarTiendasPublicas,
  copTienda,
  SESSION_KEY,
  type SaldoTrabajador,
  type TiendaResumen,
} from "@/lib/tienda-empleados";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "700", "800"] });

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

  function salir() {
    sessionStorage.removeItem(SESSION_KEY);
    setSaldo(null);
    setTiendas([]);
    setCedula("");
  }

  return (
    <main className={`${manrope.className} min-h-screen bg-brand-cream-soft text-brand-black`}>
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-wine to-brand-wine-dark px-5 pb-20 pt-10 text-center text-white">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-amber/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-brand-gold/10 blur-3xl" />
        <div className="relative mx-auto max-w-2xl">
          <Image
            src="/LOGOCARNESSANTACRUZ.png"
            alt="Carnes Santacruz"
            width={200}
            height={200}
            priority
            className="mx-auto h-20 w-auto object-contain drop-shadow-lg"
          />
          <h1 className={`${playfair.className} mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl`}>
            Tienda de empleados
          </h1>
          <p className="mt-1 text-sm font-medium text-brand-cream/80">
            Compra con tu crédito · Se descuenta por nómina
          </p>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-5">
        {/* Tarjeta de ingreso (superpuesta al hero) */}
        {!saldo && (
          <div className="-mt-12 rounded-3xl bg-white p-6 shadow-xl ring-1 ring-brand-brown/5 sm:p-7">
            <div className="mx-auto max-w-md">
              <p className="text-center text-xs font-bold uppercase tracking-widest text-brand-brown/50">
                Ingresa con tu cédula
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && identificar(cedula)}
                  inputMode="numeric"
                  placeholder="Número de cédula"
                  className="flex-1 rounded-2xl border border-brand-brown/15 bg-brand-cream-soft/60 px-4 py-3.5 text-base font-medium text-brand-black outline-none transition focus:border-brand-amber focus:bg-white focus:ring-4 focus:ring-brand-amber/15"
                />
                <button
                  onClick={() => identificar(cedula)}
                  disabled={cargando}
                  className="rounded-2xl bg-brand-amber px-6 py-3.5 text-sm font-extrabold uppercase tracking-wide text-white shadow-md shadow-brand-amber/30 transition hover:bg-brand-amber-light active:scale-95 disabled:opacity-50"
                >
                  {cargando ? "…" : "Entrar"}
                </button>
              </div>
              {error && (
                <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">
                  {error}
                </p>
              )}
              <p className="mt-4 text-center text-xs text-brand-brown/45">
                Solo necesitas tu cédula. Te mostraremos tu saldo disponible.
              </p>
            </div>
          </div>
        )}

        {/* Saldo + tiendas */}
        {saldo && (
          <div className="pt-8">
            {/* Tarjeta de saldo */}
            <div className="-mt-16 overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-brand-brown/5">
              <div className="flex items-center justify-between gap-3 border-b border-brand-brown/5 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-wine/10 text-lg font-extrabold text-brand-wine">
                    {(saldo.nombre ?? "U").charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-brand-black">{saldo.nombre}</p>
                    <p className="text-[11px] text-brand-brown/50">C.C. {saldo.cedula}</p>
                  </div>
                </div>
                <button
                  onClick={salir}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand-brown/60 transition hover:bg-brand-cream-soft hover:text-brand-wine"
                >
                  Salir
                </button>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-white px-6 py-6 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-brand-brown/50">
                  Saldo disponible
                </p>
                <p className={`${playfair.className} mt-1 text-4xl font-extrabold text-emerald-600`}>
                  {copTienda(saldo.cupo_disponible)}
                </p>
                <p className="mt-1 text-xs font-medium text-brand-brown/45">
                  Cupo total {copTienda(saldo.cupo_asignado)}
                </p>
              </div>
            </div>

            {/* Tiendas */}
            <div className="mb-16 mt-8">
              <h2 className={`${playfair.className} text-2xl font-extrabold text-brand-wine`}>
                Elige tu punto
              </h2>
              <p className="mb-4 mt-0.5 text-sm text-brand-brown/55">
                Compra en la tienda de tu punto de venta.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {tiendas.length === 0 && (
                  <p className="col-span-full rounded-3xl bg-white px-6 py-10 text-center text-sm text-brand-brown/50 ring-1 ring-brand-brown/5">
                    Aún no hay tiendas publicadas. Vuelve pronto.
                  </p>
                )}
                {tiendas.map((t) => (
                  <button
                    key={t.slug}
                    onClick={() => router.push(`/tienda-empleados/${t.slug}`)}
                    className="group flex items-center gap-4 rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-brand-brown/5 transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-amber to-brand-amber-light text-white shadow-md shadow-brand-amber/25">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-7 w-7">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-extrabold text-brand-black">
                        {t.nombre}
                      </span>
                      {t.ciudad && <span className="block text-xs font-medium text-brand-brown/50">{t.ciudad}</span>}
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-cream-soft text-brand-wine transition group-hover:bg-brand-wine group-hover:text-white">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {!saldo && (
          <p className="py-10 text-center text-xs text-brand-brown/40">
            Para reclamar tu pedido deberás presentar tu cédula física en el punto.
          </p>
        )}
      </div>
    </main>
  );
}
