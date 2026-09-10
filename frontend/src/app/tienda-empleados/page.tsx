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
  type SesionTrabajador,
} from "@/lib/tienda-empleados";
import TiendaAcceso from "@/components/TiendaAcceso";
import TiendaUserMenu from "@/components/TiendaUserMenu";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "700", "800"] });

export default function TiendaEmpleadosLanding() {
  const router = useRouter();
  const [sesion, setSesion] = useState<SesionTrabajador | null>(null);
  const [saldo, setSaldo] = useState<SaldoTrabajador | null>(null);
  const [tiendas, setTiendas] = useState<TiendaResumen[]>([]);
  const [buscarTienda, setBuscarTienda] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tiendasFiltradas = tiendas.filter((t) => {
    const q = buscarTienda.trim().toLowerCase();
    if (!q) return true;
    return (t.nombre ?? "").toLowerCase().includes(q) || (t.ciudad ?? "").toLowerCase().includes(q);
  });

  // Restaura sesión previa (si el empleado ya se identificó).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as SesionTrabajador;
        if (s?.cedula) { setSesion(s); void cargar(s.cedula); }
      }
    } catch {
      /* sin sesión previa */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar(ced: string) {
    setCargando(true);
    try {
      const s = await consultarSaldoPublico(ced);
      if (!s.encontrado || !s.activo) { salir(); return; }
      setSaldo(s);
      setTiendas(await listarTiendasPublicas());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar tu crédito.");
    } finally {
      setCargando(false);
    }
  }

  function onAutenticado(s: SesionTrabajador) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSesion(s);
    void cargar(s.cedula);
  }

  function salir() {
    sessionStorage.removeItem(SESSION_KEY);
    setSaldo(null);
    setTiendas([]);
    setSesion(null);
  }

  return (
    <main
      style={saldo ? { zoom: 0.8 } : undefined}
      className={`${manrope.className} min-h-screen bg-brand-cream-soft text-brand-black`}
    >
      {/* ============ Estado SIN sesión: hero + tarjeta de ingreso ============ */}
      {!saldo && (
        <>
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
            <div className="-mt-12 rounded-3xl bg-white p-6 shadow-xl ring-1 ring-brand-brown/5 sm:p-7">
              <div className="mx-auto max-w-md">
                <TiendaAcceso onAutenticado={onAutenticado} />
                <p className="mt-4 text-center text-xs text-brand-brown/45">
                  Para reclamar tu pedido presentarás tu cédula física en el punto.
                </p>
                {(error || cargando) && (
                  <p className={`mt-3 text-center text-sm font-medium ${cargando ? "text-brand-brown/50" : "text-red-600"}`}>
                    {cargando ? "Cargando tu información…" : error}
                  </p>
                )}
              </div>
            </div>
            <p className="py-10 text-center text-xs text-brand-brown/40">
              Para reclamar tu pedido deberás presentar tu cédula física en el punto.
            </p>
          </div>
        </>
      )}

      {/* ============ Estado CON sesión: mismo header que la tienda ============ */}
      {saldo && (
        <>
          {/* Header compacto (igual al de la tienda) */}
          <div className="sticky top-0 z-30">
            <header className="bg-gradient-to-br from-brand-wine to-brand-wine-dark shadow-md">
              <div className="mx-auto flex max-w-[1500px] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-5">
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                  <Image
                    src="/LOGOCARNESSANTACRUZ.png"
                    alt="Carnes Santacruz"
                    width={120}
                    height={48}
                    priority
                    className="h-10 w-auto shrink-0 object-contain drop-shadow-sm sm:h-12"
                  />
                  <div className="min-w-0">
                    <p className={`${playfair.className} truncate text-sm font-extrabold text-white sm:text-lg`}>
                      Tienda de empleados
                    </p>
                    <p className="truncate text-[10px] font-medium text-brand-cream/70 sm:text-[11px]">
                      {saldo.nombre}
                    </p>
                  </div>
                </div>
                <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
                  <div className="rounded-2xl bg-white/10 px-3 py-1.5 text-right ring-1 ring-white/15 sm:px-3.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-brand-cream/60">Saldo</p>
                    <p className="text-sm font-extrabold text-emerald-300">
                      {copTienda(saldo.cupo_disponible)}
                    </p>
                  </div>
                  {sesion && (
                    <TiendaUserMenu sesion={sesion} variant="wine" onCerrarSesion={salir} />
                  )}
                </div>
              </div>
            </header>
          </div>

          <div className="mx-auto max-w-[1500px] px-4 pb-16 pt-6 sm:px-5">
            {/* Tarjeta de saldo */}
            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-brand-brown/5">
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

            {/* Elige tu punto + buscador */}
            <div className="mt-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className={`${playfair.className} text-2xl font-extrabold text-brand-wine`}>
                    Elige tu punto
                  </h2>
                  <p className="mt-0.5 text-sm text-brand-brown/55">
                    Compra en la tienda de tu punto de venta.
                  </p>
                </div>
                {/* Buscador de puntos de venta */}
                <div className="relative w-full sm:w-72">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-brown/40">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
                    </svg>
                  </span>
                  <input
                    value={buscarTienda}
                    onChange={(e) => setBuscarTienda(e.target.value)}
                    placeholder="Buscar punto de venta…"
                    className="w-full rounded-2xl bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-brand-black shadow-sm ring-1 ring-brand-brown/10 outline-none transition placeholder:text-brand-brown/40 focus:ring-2 focus:ring-brand-wine/30"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {tiendas.length === 0 && (
                  <p className="col-span-full rounded-3xl bg-white px-6 py-10 text-center text-sm text-brand-brown/50 ring-1 ring-brand-brown/5">
                    Aún no hay tiendas publicadas. Vuelve pronto.
                  </p>
                )}
                {tiendas.length > 0 && tiendasFiltradas.length === 0 && (
                  <p className="col-span-full rounded-3xl bg-white px-6 py-10 text-center text-sm text-brand-brown/50 ring-1 ring-brand-brown/5">
                    No encontramos puntos que coincidan con “{buscarTienda}”.
                  </p>
                )}
                {tiendasFiltradas.map((t) => (
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
        </>
      )}
    </main>
  );
}
