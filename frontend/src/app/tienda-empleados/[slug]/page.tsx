"use client";

import { use, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Manrope, Playfair_Display } from "next/font/google";
import {
  consultarSaldoPublico,
  obtenerTiendaPublica,
  crearPedidoTiendaPublico,
  copTienda,
  SESSION_KEY,
  type SaldoTrabajador,
  type TiendaCatalogoPublico,
  type PedidoTienda,
} from "@/lib/tienda-empleados";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "700", "800"] });

interface LineaCarrito {
  referencia: string;
  producto: string;
  um: string;
  precio: number;
  cantidad: number;
}

export default function TiendaEmpleadosStore({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [cedula, setCedula] = useState<string | null>(null);
  const [inputCedula, setInputCedula] = useState("");
  const [saldo, setSaldo] = useState<SaldoTrabajador | null>(null);
  const [tienda, setTienda] = useState<TiendaCatalogoPublico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [carrito, setCarrito] = useState<Record<string, LineaCarrito>>({});
  const [modal, setModal] = useState<"cerrado" | "carrito" | "datos">("cerrado");
  const [entrega, setEntrega] = useState<"recoge" | "domicilio">("recoge");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState<PedidoTienda | null>(null);

  // Cédula desde la sesión.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { cedula: string };
        if (s?.cedula) setCedula(s.cedula);
      }
    } catch {
      /* sin sesión */
    }
  }, []);

  // Carga catálogo + saldo cuando hay cédula.
  useEffect(() => {
    if (!cedula) {
      setCargando(false);
      return;
    }
    let vivo = true;
    setCargando(true);
    Promise.all([obtenerTiendaPublica(slug), consultarSaldoPublico(cedula)])
      .then(([t, s]) => {
        if (!vivo) return;
        setTienda(t);
        setSaldo(s);
        setError(null);
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar la tienda."))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [cedula, slug]);

  const lineas = useMemo(() => Object.values(carrito), [carrito]);
  const total = useMemo(() => lineas.reduce((s, l) => s + l.precio * l.cantidad, 0), [lineas]);
  const nItems = useMemo(() => lineas.reduce((s, l) => s + l.cantidad, 0), [lineas]);
  const disponible = saldo?.cupo_disponible ?? 0;
  const excede = total > disponible;
  const restante = disponible - total;

  function setCantidad(p: { referencia: string; producto: string; um: string; precio: number }, cant: number) {
    setCarrito((prev) => {
      const next = { ...prev };
      if (cant <= 0) delete next[p.referencia];
      else next[p.referencia] = { ...p, cantidad: cant };
      return next;
    });
  }

  async function identificar() {
    const c = inputCedula.trim();
    if (!c) return;
    setCargando(true);
    try {
      const s = await consultarSaldoPublico(c);
      if (!s.encontrado) {
        setError("Tu cédula no está registrada en el crédito de empleados.");
        return;
      }
      if (!s.activo) {
        setError("Tu crédito no está activo. Comunícate con nómina.");
        return;
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ cedula: s.cedula, nombre: s.nombre }));
      setError(null);
      setCedula(s.cedula);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar tu crédito.");
    } finally {
      setCargando(false);
    }
  }

  async function confirmar() {
    if (lineas.length === 0 || excede) return;
    if (entrega === "domicilio" && (!direccion.trim() || !telefono.trim())) {
      setError("Para domicilio ingresa la dirección y el teléfono.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const pedido = await crearPedidoTiendaPublico({
        cedula: cedula!,
        slug,
        items: lineas.map((l) => ({
          referencia: l.referencia,
          producto: l.producto,
          um: l.um,
          precio: l.precio,
          cantidad: l.cantidad,
        })),
        entrega,
        direccion: entrega === "domicilio" ? direccion.trim() : undefined,
        telefono: entrega === "domicilio" ? telefono.trim() : undefined,
        observacion: observacion.trim() || undefined,
      });
      setExito(pedido);
      setCarrito({});
      setModal("cerrado");
      // Refresca el saldo tras la compra.
      consultarSaldoPublico(cedula!).then(setSaldo).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el pedido.");
    } finally {
      setEnviando(false);
    }
  }

  // ---- Pantalla: pedir cédula si no hay sesión ----
  if (!cedula) {
    return (
      <main className={`${manrope.className} flex min-h-screen flex-col items-center justify-center bg-brand-cream-soft px-5 text-brand-black`}>
        <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-xl ring-1 ring-brand-brown/5">
          <Image src="/LOGOCARNESSANTACRUZ.png" alt="Carnes Santacruz" width={160} height={160} className="mx-auto h-16 w-auto object-contain" />
          <h1 className={`${playfair.className} mt-4 text-2xl font-extrabold text-brand-wine`}>Identifícate</h1>
          <p className="mt-1 text-xs font-medium text-brand-brown/55">Ingresa tu cédula para comprar</p>
          <div className="mt-5 flex gap-2">
            <input
              value={inputCedula}
              onChange={(e) => setInputCedula(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && identificar()}
              inputMode="numeric"
              placeholder="Cédula"
              className="flex-1 rounded-2xl border border-brand-brown/15 bg-brand-cream-soft/60 px-4 py-3 text-brand-black outline-none transition focus:border-brand-amber focus:bg-white focus:ring-4 focus:ring-brand-amber/15"
            />
            <button onClick={identificar} className="rounded-2xl bg-brand-amber px-5 py-3 font-extrabold text-white shadow-md shadow-brand-amber/30 transition hover:bg-brand-amber-light active:scale-95">
              Entrar
            </button>
          </div>
          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
          <Link href="/tienda-empleados" className="mt-5 inline-block text-xs font-semibold text-brand-brown/50 underline">
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  if (cargando && !tienda) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-cream-soft text-brand-black">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand-amber border-t-transparent" />
      </main>
    );
  }

  if (error && !tienda) {
    return (
      <main className={`${manrope.className} flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-cream-soft px-5 text-center text-brand-black`}>
        <p className="text-lg font-semibold text-red-600">{error}</p>
        <Link href="/tienda-empleados" className="rounded-2xl bg-brand-amber px-5 py-2.5 font-extrabold text-white shadow-md shadow-brand-amber/30">
          Volver al inicio
        </Link>
      </main>
    );
  }

  return (
    <main className={`${manrope.className} min-h-screen bg-brand-cream-soft pb-32 text-brand-black`}>
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-brand-brown/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/tienda-empleados" className="flex h-9 w-9 items-center justify-center rounded-full text-brand-wine transition hover:bg-brand-cream-soft" title="Volver">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <p className={`${playfair.className} truncate text-lg font-extrabold text-brand-wine`}>
              {tienda?.nombre}
            </p>
            <p className="truncate text-[11px] font-medium text-brand-brown/50">{saldo?.nombre}</p>
          </div>
          <div className="rounded-2xl bg-brand-cream-soft px-3.5 py-1.5 text-right ring-1 ring-brand-brown/5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-brand-brown/45">Saldo</p>
            <p className={`text-sm font-extrabold ${excede ? "text-red-500" : "text-emerald-600"}`}>
              {copTienda(restante < 0 ? disponible : restante)}
            </p>
          </div>
        </div>
      </header>

      {/* Catálogo */}
      <div className="mx-auto max-w-5xl px-4 py-6">
        {tienda?.categorias.map((cat) => (
          <section key={cat.categoria} className="mb-8">
            <div className="mb-4 flex items-center gap-3">
              <h2 className={`${playfair.className} text-xl font-extrabold text-brand-wine`}>
                {cat.categoria}
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-brand-amber/40 to-transparent" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cat.productos.map((p) => {
                const enCarro = carrito[p.referencia]?.cantidad ?? 0;
                return (
                  <div
                    key={p.referencia}
                    className={`flex flex-col justify-between rounded-3xl bg-white p-4 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-lg ${
                      enCarro > 0 ? "ring-2 ring-brand-amber" : "ring-brand-brown/5"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-wine/5 text-brand-wine">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-1.657 0-3 1.343-3 3 0 .69.234 1.326.626 1.833C7.06 8.41 5.25 10.51 5.25 13.5c0 .966.28 1.867.762 2.628C4.79 16.79 3.75 18.06 3.75 19.5c0 .414.336.75.75.75h15a.75.75 0 0 0 .75-.75c0-1.44-1.04-2.71-2.262-3.372.482-.76.762-1.662.762-2.628 0-2.99-1.81-5.09-4.376-5.667C14.766 7.326 15 6.69 15 6c0-1.657-1.343-3-3-3Z" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-snug text-brand-black">
                          {p.producto || p.referencia}
                        </p>
                        <span className="mt-1 inline-block rounded-full bg-brand-cream-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-brown/55">
                          {p.um || "UND"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-lg font-extrabold text-brand-wine">
                        {copTienda(p.precio)}
                      </span>
                      {enCarro === 0 ? (
                        <button
                          onClick={() => setCantidad(p, 1)}
                          className="flex items-center gap-1 rounded-full bg-brand-amber px-3.5 py-2 text-xs font-extrabold uppercase text-white shadow-sm shadow-brand-amber/30 transition hover:bg-brand-amber-light active:scale-95"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                          Agregar
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 rounded-full bg-brand-amber p-1 shadow-sm shadow-brand-amber/30">
                          <button
                            onClick={() => setCantidad(p, enCarro - 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white transition active:scale-90"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-extrabold text-white">{enCarro}</span>
                          <button
                            onClick={() => setCantidad(p, enCarro + 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white transition active:scale-90"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Barra inferior del carrito */}
      {nItems > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
          <div className="mx-auto max-w-2xl rounded-3xl bg-brand-wine p-3 shadow-2xl shadow-brand-wine/30">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
                <span className="relative">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                  </svg>
                  <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-amber px-1 text-[10px] font-extrabold text-white">{nItems}</span>
                </span>
              </span>
              <div className="flex-1">
                <p className="text-[11px] font-medium uppercase tracking-widest text-brand-cream/70">Total del pedido</p>
                <p className={`text-lg font-extrabold ${excede ? "text-red-300" : "text-white"}`}>
                  {copTienda(total)}
                </p>
              </div>
              <button
                onClick={() => setModal("carrito")}
                className="rounded-2xl bg-brand-amber px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-md shadow-black/20 transition hover:bg-brand-amber-light active:scale-95"
              >
                Ver carrito
              </button>
            </div>
            {excede && (
              <p className="mt-1.5 text-center text-[11px] font-semibold text-red-200">
                Superas tu saldo por {copTienda(total - disponible)}. Quita productos para continuar.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal carrito / datos */}
      {modal !== "cerrado" && (
        <div className={`${manrope.className} fixed inset-0 z-40 flex items-end justify-center bg-brand-black/50 backdrop-blur-sm sm:items-center`} onClick={() => setModal("cerrado")}>
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className={`${playfair.className} text-xl font-extrabold text-brand-wine`}>
                {modal === "carrito" ? "Tu carrito" : "Datos de entrega"}
              </h3>
              <button onClick={() => setModal("cerrado")} className="flex h-8 w-8 items-center justify-center rounded-full text-brand-brown/50 transition hover:bg-brand-cream-soft">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {modal === "carrito" && (
              <>
                <div className="space-y-2">
                  {lineas.map((l) => (
                    <div key={l.referencia} className="flex items-center gap-3 rounded-2xl bg-brand-cream-soft/60 p-3 ring-1 ring-brand-brown/5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-brand-black">{l.producto || l.referencia}</p>
                        <p className="text-[11px] font-medium text-brand-brown/50">{copTienda(l.precio)} · {l.um || "UND"}</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-brand-amber p-1">
                        <button onClick={() => setCantidad(l, l.cantidad - 1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-base font-bold text-white active:scale-90">−</button>
                        <span className="w-5 text-center text-sm font-extrabold text-white">{l.cantidad}</span>
                        <button onClick={() => setCantidad(l, l.cantidad + 1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-base font-bold text-white active:scale-90">+</button>
                      </div>
                      <span className="w-20 shrink-0 text-right text-sm font-extrabold text-brand-wine">
                        {copTienda(l.precio * l.cantidad)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-1.5 rounded-2xl bg-brand-cream-soft/60 p-4 text-sm ring-1 ring-brand-brown/5">
                  <div className="flex justify-between text-brand-brown/70">
                    <span>Total del pedido</span>
                    <span className="font-extrabold text-brand-black">{copTienda(total)}</span>
                  </div>
                  <div className="flex justify-between text-brand-brown/70">
                    <span>Saldo disponible</span>
                    <span className="font-semibold">{copTienda(disponible)}</span>
                  </div>
                  <div className="flex justify-between border-t border-brand-brown/10 pt-1.5">
                    <span className={`font-semibold ${excede ? "text-red-500" : "text-emerald-600"}`}>
                      {excede ? "Te faltan" : "Te queda"}
                    </span>
                    <span className={`font-extrabold ${excede ? "text-red-500" : "text-emerald-600"}`}>
                      {copTienda(Math.abs(restante))}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setModal("datos")}
                  disabled={excede || lineas.length === 0}
                  className="mt-4 w-full rounded-2xl bg-brand-amber py-3.5 text-sm font-extrabold uppercase tracking-wide text-white shadow-md shadow-brand-amber/30 transition hover:bg-brand-amber-light active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continuar
                </button>
              </>
            )}

            {modal === "datos" && (
              <>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-brown/50">¿Cómo recibes tu pedido?</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["recoge", "domicilio"] as const).map((op) => (
                    <button
                      key={op}
                      onClick={() => setEntrega(op)}
                      className={`rounded-2xl border-2 p-3.5 text-sm font-bold transition ${
                        entrega === op ? "border-brand-amber bg-brand-amber/10 text-brand-wine" : "border-brand-brown/10 bg-white text-brand-brown/60"
                      }`}
                    >
                      {op === "recoge" ? "Recoger en el punto" : "Domicilio"}
                    </button>
                  ))}
                </div>

                {entrega === "recoge" ? (
                  <p className="mt-3 rounded-2xl bg-brand-cream-soft/60 p-3.5 text-xs text-brand-brown/70 ring-1 ring-brand-brown/5">
                    Recoges en <b className="text-brand-wine">{tienda?.nombre}</b>. Presenta tu cédula física para reclamar.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    <input
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder="Dirección de entrega"
                      className="w-full rounded-2xl border border-brand-brown/15 bg-brand-cream-soft/60 px-4 py-3 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:bg-white"
                    />
                    <input
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      inputMode="numeric"
                      placeholder="Teléfono de contacto"
                      className="w-full rounded-2xl border border-brand-brown/15 bg-brand-cream-soft/60 px-4 py-3 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:bg-white"
                    />
                  </div>
                )}

                <textarea
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  placeholder="Observaciones (opcional)"
                  rows={2}
                  className="mt-2 w-full rounded-2xl border border-brand-brown/15 bg-brand-cream-soft/60 px-4 py-3 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:bg-white"
                />

                <div className="mt-3 flex items-center justify-between rounded-2xl bg-brand-wine px-4 py-3.5 text-white">
                  <span className="text-sm font-medium text-brand-cream/80">Total a crédito</span>
                  <span className="text-xl font-extrabold">{copTienda(total)}</span>
                </div>
                <p className="mt-1.5 text-center text-[11px] font-medium text-brand-brown/50">
                  Se descuenta de tu nómina.
                </p>

                {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}

                <div className="mt-4 flex gap-2">
                  <button onClick={() => setModal("carrito")} className="rounded-2xl border border-brand-brown/15 px-5 py-3.5 text-sm font-bold text-brand-brown/70 transition hover:bg-brand-cream-soft">
                    Atrás
                  </button>
                  <button
                    onClick={confirmar}
                    disabled={enviando || excede}
                    className="flex-1 rounded-2xl bg-brand-amber py-3.5 text-sm font-extrabold uppercase tracking-wide text-white shadow-md shadow-brand-amber/30 transition hover:bg-brand-amber-light active:scale-[0.99] disabled:opacity-40"
                  >
                    {enviando ? "Enviando…" : "Confirmar pedido"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Éxito */}
      {exito && (
        <div className={`${manrope.className} fixed inset-0 z-50 flex items-center justify-center bg-brand-black/50 px-5 backdrop-blur-sm`}>
          <div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-9 w-9 text-emerald-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h3 className={`${playfair.className} mt-4 text-2xl font-extrabold text-brand-wine`}>¡Pedido confirmado!</h3>
            <p className="mt-2 text-sm text-brand-brown/70">
              Tu pedido por <b className="text-brand-black">{copTienda(exito.total)}</b> quedó registrado en{" "}
              <b className="text-brand-black">{exito.punto_nombre}</b>.
            </p>
            <div className="mt-4 rounded-2xl bg-brand-amber/10 p-4 text-sm text-brand-brown ring-1 ring-brand-amber/20">
              {exito.entrega === "domicilio" ? (
                <>Te contactaremos para coordinar el <b className="text-brand-wine">domicilio</b>. Ten a la mano tu <b className="text-brand-wine">cédula física</b> al recibir.</>
              ) : (
                <>Para reclamar tus productos, acércate al punto y <b className="text-brand-wine">presenta tu cédula física</b>.</>
              )}
            </div>
            <p className="mt-3 text-xs font-medium text-brand-brown/45">Se descontará de tu nómina.</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setExito(null)}
                className="flex-1 rounded-2xl bg-brand-amber py-3.5 text-sm font-extrabold uppercase text-white shadow-md shadow-brand-amber/30 transition hover:bg-brand-amber-light active:scale-[0.99]"
              >
                Seguir comprando
              </button>
              <Link href="/tienda-empleados" className="rounded-2xl border border-brand-brown/15 px-5 py-3.5 text-sm font-bold text-brand-brown/70 transition hover:bg-brand-cream-soft">
                Salir
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
