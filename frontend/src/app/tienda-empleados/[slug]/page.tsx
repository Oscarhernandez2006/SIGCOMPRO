"use client";

import { use, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Anton, Oswald } from "next/font/google";
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

const anton = Anton({ subsets: ["latin"], weight: "400" });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"] });

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
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-5 text-[#f2eee6]">
        <Image src="/LOGOCARNESSANTACRUZ.png" alt="Carnes Santacruz" width={160} height={160} className="h-20 w-auto object-contain" />
        <h1 className={`${anton.className} mt-4 text-2xl uppercase tracking-wide text-[#e5b24b]`}>Identifícate</h1>
        <p className={`${oswald.className} mt-1 text-xs uppercase tracking-widest text-[#cfc7b8]`}>Ingresa tu cédula para comprar</p>
        <div className="mt-6 flex w-full max-w-xs gap-2">
          <input
            value={inputCedula}
            onChange={(e) => setInputCedula(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && identificar()}
            inputMode="numeric"
            placeholder="Cédula"
            className="flex-1 rounded-xl border border-[#3a3a3a] bg-[#0e0e0e] px-4 py-3 text-white outline-none focus:border-[#e5b24b]"
          />
          <button onClick={identificar} className="rounded-xl bg-[#e5b24b] px-5 py-3 font-bold text-black hover:bg-[#f0c260]">
            Entrar
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <Link href="/tienda-empleados" className="mt-6 text-xs text-[#9a9384] underline">
          Volver al inicio
        </Link>
      </main>
    );
  }

  if (cargando && !tienda) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-[#f2eee6]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#e5b24b] border-t-transparent" />
      </main>
    );
  }

  if (error && !tienda) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-5 text-center text-[#f2eee6]">
        <p className="text-lg text-red-300">{error}</p>
        <Link href="/tienda-empleados" className="rounded-xl bg-[#e5b24b] px-5 py-2.5 font-bold text-black">
          Volver al inicio
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] pb-28 text-[#f2eee6]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[#222] bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/tienda-empleados" className="rounded-lg p-1.5 text-[#cfc7b8] transition hover:bg-white/5" title="Volver">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <p className={`${oswald.className} truncate text-base font-semibold uppercase tracking-wide text-white`}>
              {tienda?.nombre}
            </p>
            <p className="truncate text-[11px] text-[#9a9384]">{saldo?.nombre}</p>
          </div>
          <div className="rounded-xl border border-[#e5b24b]/30 bg-[#151515] px-3 py-1.5 text-right">
            <p className="text-[9px] uppercase tracking-widest text-[#9a9384]">Saldo</p>
            <p className={`${oswald.className} text-sm font-bold ${excede ? "text-red-400" : "text-[#5fd08a]"}`}>
              {copTienda(restante < 0 ? disponible : restante)}
            </p>
          </div>
        </div>
      </header>

      {/* Catálogo */}
      <div className="mx-auto max-w-5xl px-4 py-6">
        {tienda?.categorias.map((cat) => (
          <section key={cat.categoria} className="mb-8">
            <h2 className={`${anton.className} mb-3 text-xl uppercase tracking-wide text-[#e5b24b]`}>
              {cat.categoria}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cat.productos.map((p) => {
                const enCarro = carrito[p.referencia]?.cantidad ?? 0;
                return (
                  <div
                    key={p.referencia}
                    className={`flex flex-col justify-between rounded-2xl border p-4 transition ${
                      enCarro > 0 ? "border-[#e5b24b]/60 bg-[#171512]" : "border-[#242424] bg-[#141414]"
                    }`}
                  >
                    <div>
                      <p className={`${oswald.className} text-sm font-semibold uppercase leading-tight text-white`}>
                        {p.producto || p.referencia}
                      </p>
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-[#9a9384]">
                        {p.um || "UND"}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className={`${oswald.className} text-lg font-bold text-[#e5b24b]`}>
                        {copTienda(p.precio)}
                      </span>
                      {enCarro === 0 ? (
                        <button
                          onClick={() => setCantidad(p, 1)}
                          className="rounded-lg bg-[#e5b24b] px-3 py-1.5 text-xs font-bold uppercase text-black transition hover:bg-[#f0c260]"
                        >
                          Agregar
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 rounded-lg border border-[#e5b24b]/50 bg-[#0e0e0e] px-1">
                          <button
                            onClick={() => setCantidad(p, enCarro - 1)}
                            className="flex h-7 w-7 items-center justify-center text-lg font-bold text-[#e5b24b]"
                          >
                            −
                          </button>
                          <span className="w-5 text-center text-sm font-bold text-white">{enCarro}</span>
                          <button
                            onClick={() => setCantidad(p, enCarro + 1)}
                            className="flex h-7 w-7 items-center justify-center text-lg font-bold text-[#e5b24b]"
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
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#222] bg-[#0e0e0e]/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-widest text-[#9a9384]">
                {nItems} {nItems === 1 ? "producto" : "productos"}
              </p>
              <p className={`${oswald.className} text-lg font-bold ${excede ? "text-red-400" : "text-white"}`}>
                {copTienda(total)}
              </p>
            </div>
            <button
              onClick={() => setModal("carrito")}
              className="rounded-xl bg-[#e5b24b] px-6 py-3 text-sm font-bold uppercase tracking-wide text-black transition hover:bg-[#f0c260]"
            >
              Ver carrito
            </button>
          </div>
          {excede && (
            <p className="mx-auto mt-1 max-w-5xl text-center text-[11px] font-semibold text-red-400">
              Superas tu saldo por {copTienda(total - disponible)}. Quita productos para continuar.
            </p>
          )}
        </div>
      )}

      {/* Modal carrito / datos */}
      {modal !== "cerrado" && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setModal("cerrado")}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[#141414] p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className={`${anton.className} text-xl uppercase tracking-wide text-[#e5b24b]`}>
                {modal === "carrito" ? "Tu carrito" : "Datos de entrega"}
              </h3>
              <button onClick={() => setModal("cerrado")} className="rounded-lg p-1.5 text-[#9a9384] hover:bg-white/5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {modal === "carrito" && (
              <>
                <div className="space-y-2">
                  {lineas.map((l) => (
                    <div key={l.referencia} className="flex items-center gap-3 rounded-xl border border-[#242424] bg-[#0e0e0e] p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{l.producto || l.referencia}</p>
                        <p className="text-[11px] text-[#9a9384]">{copTienda(l.precio)} · {l.um || "UND"}</p>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg border border-[#333] px-1">
                        <button onClick={() => setCantidad(l, l.cantidad - 1)} className="flex h-7 w-7 items-center justify-center text-lg font-bold text-[#e5b24b]">−</button>
                        <span className="w-5 text-center text-sm font-bold text-white">{l.cantidad}</span>
                        <button onClick={() => setCantidad(l, l.cantidad + 1)} className="flex h-7 w-7 items-center justify-center text-lg font-bold text-[#e5b24b]">+</button>
                      </div>
                      <span className={`${oswald.className} w-20 shrink-0 text-right text-sm font-bold text-white`}>
                        {copTienda(l.precio * l.cantidad)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-1 rounded-xl bg-[#0e0e0e] p-4 text-sm">
                  <div className="flex justify-between text-[#cfc7b8]">
                    <span>Total del pedido</span>
                    <span className={`${oswald.className} font-bold text-white`}>{copTienda(total)}</span>
                  </div>
                  <div className="flex justify-between text-[#cfc7b8]">
                    <span>Saldo disponible</span>
                    <span>{copTienda(disponible)}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#242424] pt-1">
                    <span className={excede ? "text-red-400" : "text-[#5fd08a]"}>
                      {excede ? "Te faltan" : "Te queda"}
                    </span>
                    <span className={`font-bold ${excede ? "text-red-400" : "text-[#5fd08a]"}`}>
                      {copTienda(Math.abs(restante))}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setModal("datos")}
                  disabled={excede || lineas.length === 0}
                  className="mt-4 w-full rounded-xl bg-[#e5b24b] py-3 text-sm font-bold uppercase tracking-wide text-black transition hover:bg-[#f0c260] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continuar
                </button>
              </>
            )}

            {modal === "datos" && (
              <>
                <p className="mb-3 text-xs uppercase tracking-widest text-[#9a9384]">¿Cómo recibes tu pedido?</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["recoge", "domicilio"] as const).map((op) => (
                    <button
                      key={op}
                      onClick={() => setEntrega(op)}
                      className={`rounded-xl border p-3 text-sm font-semibold transition ${
                        entrega === op ? "border-[#e5b24b] bg-[#e5b24b]/10 text-[#e5b24b]" : "border-[#2a2a2a] bg-[#0e0e0e] text-[#cfc7b8]"
                      }`}
                    >
                      {op === "recoge" ? "Recoger en el punto" : "Domicilio"}
                    </button>
                  ))}
                </div>

                {entrega === "recoge" ? (
                  <p className="mt-3 rounded-xl border border-[#242424] bg-[#0e0e0e] p-3 text-xs text-[#cfc7b8]">
                    Recoges en <b className="text-white">{tienda?.nombre}</b>. Presenta tu cédula física para reclamar.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    <input
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder="Dirección de entrega"
                      className="w-full rounded-xl border border-[#2a2a2a] bg-[#0e0e0e] px-4 py-3 text-sm text-white outline-none focus:border-[#e5b24b]"
                    />
                    <input
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      inputMode="numeric"
                      placeholder="Teléfono de contacto"
                      className="w-full rounded-xl border border-[#2a2a2a] bg-[#0e0e0e] px-4 py-3 text-sm text-white outline-none focus:border-[#e5b24b]"
                    />
                  </div>
                )}

                <textarea
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  placeholder="Observaciones (opcional)"
                  rows={2}
                  className="mt-2 w-full rounded-xl border border-[#2a2a2a] bg-[#0e0e0e] px-4 py-3 text-sm text-white outline-none focus:border-[#e5b24b]"
                />

                <div className="mt-3 flex items-center justify-between rounded-xl bg-[#0e0e0e] p-4">
                  <span className="text-sm text-[#cfc7b8]">Total a crédito</span>
                  <span className={`${oswald.className} text-xl font-bold text-[#e5b24b]`}>{copTienda(total)}</span>
                </div>
                <p className="mt-1 text-[11px] text-[#9a9384]">
                  Se descuenta de tu nómina{saldo ? "." : "."}
                </p>

                {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

                <div className="mt-4 flex gap-2">
                  <button onClick={() => setModal("carrito")} className="rounded-xl border border-[#333] px-4 py-3 text-sm font-semibold text-[#cfc7b8]">
                    Atrás
                  </button>
                  <button
                    onClick={confirmar}
                    disabled={enviando || excede}
                    className="flex-1 rounded-xl bg-[#e5b24b] py-3 text-sm font-bold uppercase tracking-wide text-black transition hover:bg-[#f0c260] disabled:opacity-40"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-5">
          <div className="w-full max-w-md rounded-2xl border border-[#e5b24b]/30 bg-[#141414] p-7 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#5fd08a]/15">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-9 w-9 text-[#5fd08a]">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h3 className={`${anton.className} mt-4 text-2xl uppercase tracking-wide text-[#e5b24b]`}>¡Pedido confirmado!</h3>
            <p className="mt-2 text-sm text-[#cfc7b8]">
              Tu pedido por <b className="text-white">{copTienda(exito.total)}</b> quedó registrado en{" "}
              <b className="text-white">{exito.punto_nombre}</b>.
            </p>
            <div className="mt-4 rounded-xl border border-[#e5b24b]/30 bg-[#e5b24b]/5 p-4 text-sm text-[#f2eee6]">
              {exito.entrega === "domicilio" ? (
                <>Te contactaremos para coordinar el <b>domicilio</b>. Ten a la mano tu <b>cédula física</b> al recibir.</>
              ) : (
                <>Para reclamar tus productos, acércate al punto y <b>presenta tu cédula física</b>.</>
              )}
            </div>
            <p className="mt-3 text-xs text-[#9a9384]">Se descontará de tu nómina.</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setExito(null)}
                className="flex-1 rounded-xl bg-[#e5b24b] py-3 text-sm font-bold uppercase text-black hover:bg-[#f0c260]"
              >
                Seguir comprando
              </button>
              <Link href="/tienda-empleados" className="rounded-xl border border-[#333] px-4 py-3 text-sm font-semibold text-[#cfc7b8]">
                Salir
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
