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
  type ProductoTienda,
  type PedidoTienda,
} from "@/lib/tienda-empleados";
import DireccionInput from "@/components/DireccionInput";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "700", "800"] });

interface LineaCarrito {
  referencia: string;
  producto: string;
  um: string;
  precio: number;
  cantidad: number;
  observacion?: string;
}

/** Imagen de producto con placeholder de marca (cae al logo si aún no existe). */
function ProductoImg({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/producto-placeholder.jpg"
      alt=""
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.dataset.fallback) {
          img.dataset.fallback = "1";
          img.src = "/LOGOCARNESSANTACRUZ.png";
          img.classList.remove("object-cover");
          img.classList.add("object-contain", "p-3", "opacity-80");
        }
      }}
      className={`h-full w-full object-cover ${className ?? ""}`}
    />
  );
}

/** Limpia el nombre de la categoría (quita códigos como "0010 - "). */
function limpiarCategoria(cat: string): string {
  return (cat ?? "").replace(/^\s*\d+\s*[-–—]\s*/, "").trim() || (cat ?? "").trim() || "Otros";
}

/** Slug para anclas de categoría. */
function slugCat(cat: string): string {
  return (
    "cat-" +
    limpiarCategoria(cat)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

/** Icono SVG profesional según la categoría. */
function iconoCategoria(cat: string, cls = "h-5 w-5") {
  const s = cat.toLowerCase();
  if (/(bebida|agua|jugo|gaseosa|refresco|hidrat|del valle|fuze|ekii|pepsi|cola)/.test(s))
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={cls}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    );
  if (/(carbon|asado|brasa|parrilla|restaurante|asader)/.test(s))
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={cls}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.362-6.867 8.21 8.21 0 0 0 3 2.48Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={cls}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12A1.125 1.125 0 0 1 19.75 21H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 6.75h12.974c.576 0 1.059.435 1.119 1.007Z" />
    </svg>
  );
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
  const [productoModal, setProductoModal] = useState<ProductoTienda | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [catFiltro, setCatFiltro] = useState("");
  const [ordenPrecio, setOrdenPrecio] = useState<"" | "asc" | "desc">("");
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
  const nItems = useMemo(() => lineas.length, [lineas]);
  const disponible = saldo?.cupo_disponible ?? 0;
  const excede = total > disponible;
  const restante = disponible - total;

  // Catálogo con filtros aplicados (búsqueda por nombre, categoría y orden).
  const categoriasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (tienda?.categorias ?? [])
      .filter((c) => !catFiltro || c.categoria === catFiltro)
      .map((c) => {
        let productos = q
          ? c.productos.filter((p) => (p.producto || p.referencia).toLowerCase().includes(q))
          : c.productos;
        if (ordenPrecio) {
          productos = [...productos].sort((a, b) =>
            ordenPrecio === "asc" ? a.precio - b.precio : b.precio - a.precio,
          );
        }
        return { ...c, productos };
      })
      .filter((c) => c.productos.length > 0);
  }, [tienda, busqueda, catFiltro, ordenPrecio]);

  const nResultados = useMemo(
    () => categoriasFiltradas.reduce((s, c) => s + c.productos.length, 0),
    [categoriasFiltradas],
  );
  const hayFiltros = busqueda.trim() !== "" || catFiltro !== "" || ordenPrecio !== "";

  // Cambia la cantidad conservando la observación (stepper del carrito).
  function setCantidad(p: LineaCarrito, cant: number) {
    setCarrito((prev) => {
      const next = { ...prev };
      if (cant <= 0) delete next[p.referencia];
      else next[p.referencia] = { ...next[p.referencia], ...p, cantidad: cant };
      return next;
    });
  }

  // Agrega/actualiza una línea con cantidad y observación (desde el modal).
  function setLinea(p: ProductoTienda, cantidad: number, observacion: string) {
    setCarrito((prev) => {
      const next = { ...prev };
      if (cantidad <= 0) delete next[p.referencia];
      else
        next[p.referencia] = {
          referencia: p.referencia,
          producto: p.producto,
          um: p.um,
          precio: p.precio,
          cantidad,
          observacion: observacion.trim() || undefined,
        };
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
          observacion: l.observacion,
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
      <main className={`${manrope.className} flex min-h-screen bg-brand-cream-soft text-brand-black`}>
        {/* Panel izquierdo — Branding */}
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-wine to-brand-wine-dark lg:flex lg:w-1/2">
          <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-amber/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 right-0 h-96 w-96 rounded-full bg-brand-gold/10 blur-3xl" />
          <div className="relative z-10 flex w-full flex-col items-center justify-center px-14 text-center">
            <Image src="/LOGOCARNESSANTACRUZ.png" alt="Carnes Santacruz" width={220} height={220} className="h-40 w-auto object-contain drop-shadow-2xl" />
            <h1 className={`${playfair.className} mt-6 text-4xl font-extrabold text-white`}>Tienda de empleados</h1>
            <div className="mt-4 h-1 w-16 rounded-full bg-brand-amber" />
            <p className="mt-5 max-w-sm text-sm font-light text-brand-cream/80">
              Compra con tu crédito y págalo cómodamente por nómina.
            </p>
          </div>
        </div>

        {/* Panel derecho — Formulario */}
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 text-center lg:hidden">
              <Image src="/LOGOCARNESSANTACRUZ.png" alt="Carnes Santacruz" width={160} height={160} className="mx-auto h-20 w-auto object-contain" />
            </div>

            <div className="rounded-3xl bg-white p-7 shadow-xl ring-1 ring-brand-brown/5">
              <h2 className={`${playfair.className} text-2xl font-extrabold text-brand-wine`}>Identifícate</h2>
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
          </div>
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
      {/* Header + tabs de categorías (pegajosos) */}
      <div className="sticky top-0 z-30">
        <header className="bg-gradient-to-br from-brand-wine to-brand-wine-dark shadow-md">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            {/* Izquierda: volver + nombres */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Link href="/tienda-empleados" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-cream/90 transition hover:bg-white/10" title="Volver">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </Link>
              <div className="min-w-0">
                <p className={`${playfair.className} truncate text-lg font-extrabold text-white`}>
                  {tienda?.nombre}
                </p>
                <p className="truncate text-[11px] font-medium text-brand-cream/70">{saldo?.nombre}</p>
              </div>
            </div>
            {/* Centro: logo sin fondo */}
            <Image src="/LOGOCARNESSANTACRUZ.png" alt="Carnes Santacruz" width={120} height={48} className="h-11 w-auto shrink-0 object-contain drop-shadow-sm" />
            {/* Derecha: saldo */}
            <div className="flex flex-1 justify-end">
              <div className="rounded-2xl bg-white/10 px-3.5 py-1.5 text-right ring-1 ring-white/15">
                <p className="text-[9px] font-bold uppercase tracking-widest text-brand-cream/60">Saldo</p>
                <p className={`text-sm font-extrabold ${excede ? "text-red-300" : "text-emerald-300"}`}>
                  {copTienda(restante < 0 ? disponible : restante)}
                </p>
              </div>
            </div>
          </div>
        </header>

        {(tienda?.categorias?.length ?? 0) > 1 && (
          <div className="border-b border-brand-brown/10 bg-brand-cream-soft/95 backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                onClick={() => setCatFiltro("")}
                className={`inline-flex shrink-0 items-center rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                  catFiltro === ""
                    ? "bg-brand-wine text-white shadow-sm"
                    : "bg-white text-brand-brown/70 ring-1 ring-brand-brown/10 hover:bg-brand-cream-soft"
                }`}
              >
                Todas
              </button>
              {(tienda?.categorias ?? []).map((cat) => {
                const activa = catFiltro === cat.categoria;
                return (
                  <button
                    key={cat.categoria}
                    onClick={() => setCatFiltro(activa ? "" : cat.categoria)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                      activa
                        ? "bg-brand-wine text-white shadow-sm"
                        : "bg-white text-brand-brown/70 ring-1 ring-brand-brown/10 hover:bg-brand-cream-soft"
                    }`}
                  >
                    <span className={activa ? "text-brand-amber" : "text-brand-brown/40"}>
                      {iconoCategoria(limpiarCategoria(cat.categoria), "h-4 w-4")}
                    </span>
                    {limpiarCategoria(cat.categoria)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Banner (ancho completo) */}
      <div className="mx-auto max-w-6xl px-4 pt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/banner-compra-creditos.png"
          alt="Compra con tu crédito"
          className="w-full rounded-3xl shadow-md"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>

      {/* Contenido: filtros (izquierda) + catálogo */}
      <div className="mx-auto max-w-6xl items-start gap-6 px-4 lg:flex">
        {/* Sidebar de filtros (escritorio) — sticky al hacer scroll */}
        <aside className="hidden shrink-0 lg:block lg:w-64">
          <div className="sticky top-20 mt-6 space-y-3">
            {/* Buscador */}
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-brand-brown/5">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-brand-brown/45">Buscar producto</label>
              <div className="relative">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/35">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
                </svg>
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Nombre del producto…"
                  className="h-10 w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft/50 pl-9 pr-3 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:bg-white"
                />
              </div>
            </div>

            {/* Categorías */}
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-brand-brown/5">
              <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wide text-brand-brown/45">Categorías</p>
              <div className="space-y-0.5">
                <button
                  onClick={() => setCatFiltro("")}
                  className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition ${
                    catFiltro === "" ? "bg-brand-wine text-white" : "text-brand-brown/70 hover:bg-brand-cream-soft"
                  }`}
                >
                  <span className={catFiltro === "" ? "text-brand-amber" : "text-brand-brown/40"}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>
                  </span>
                  <span className="flex-1">Todas</span>
                  <span className={`text-[11px] font-bold ${catFiltro === "" ? "text-white/70" : "text-brand-brown/40"}`}>{tienda?.categorias?.reduce((s, c) => s + c.productos.length, 0) ?? 0}</span>
                </button>
                {(tienda?.categorias ?? []).map((cat) => {
                  const activa = catFiltro === cat.categoria;
                  return (
                    <button
                      key={cat.categoria}
                      onClick={() => setCatFiltro(activa ? "" : cat.categoria)}
                      className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition ${
                        activa ? "bg-brand-wine text-white" : "text-brand-brown/70 hover:bg-brand-cream-soft"
                      }`}
                    >
                      <span className={activa ? "text-brand-amber" : "text-brand-brown/40"}>
                        {iconoCategoria(limpiarCategoria(cat.categoria), "h-4 w-4")}
                      </span>
                      <span className="flex-1 truncate">{limpiarCategoria(cat.categoria)}</span>
                      <span className={`text-[11px] font-bold ${activa ? "text-white/70" : "text-brand-brown/40"}`}>{cat.productos.length}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ordenar por precio */}
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-brand-brown/5">
              <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wide text-brand-brown/45">Ordenar por precio</p>
              <div className="grid grid-cols-2 gap-1.5">
                {([["asc", "Menor"], ["desc", "Mayor"]] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    onClick={() => setOrdenPrecio((prev) => (prev === val ? "" : val))}
                    className={`rounded-xl px-2 py-2 text-xs font-bold transition ${
                      ordenPrecio === val ? "bg-brand-amber text-white" : "bg-brand-cream-soft text-brand-brown/60 hover:bg-brand-cream"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {hayFiltros && (
              <button
                onClick={() => { setBusqueda(""); setCatFiltro(""); setOrdenPrecio(""); }}
                className="w-full rounded-xl border border-brand-brown/15 bg-white px-3 py-2 text-xs font-semibold text-brand-brown/60 transition hover:bg-brand-cream-soft"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </aside>

        {/* Columna principal */}
        <div className="min-w-0 flex-1">
          {/* Buscador (móvil) */}
          <div className="relative mt-4 lg:hidden">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/35">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
            </svg>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto…"
              className="h-11 w-full rounded-2xl border border-brand-brown/15 bg-white pl-10 pr-4 text-sm text-brand-black shadow-sm outline-none transition focus:border-brand-amber"
            />
          </div>

          {/* Catálogo por categoría */}
          <div className="py-6">
            {categoriasFiltradas.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-brand-brown/20 bg-white/60 px-6 py-16 text-center">
                <p className="text-sm font-semibold text-brand-brown/55">No se encontraron productos</p>
                <p className="mt-1 text-xs text-brand-brown/40">Prueba con otro nombre o quita los filtros.</p>
                {hayFiltros && (
                  <button
                    onClick={() => { setBusqueda(""); setCatFiltro(""); setOrdenPrecio(""); }}
                    className="mt-4 rounded-xl bg-brand-wine px-4 py-2 text-xs font-bold text-white"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              categoriasFiltradas.map((cat) => {
                const nombreCat = limpiarCategoria(cat.categoria);
                return (
                  <section key={cat.categoria} id={slugCat(cat.categoria)} className="mb-9 scroll-mt-32">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-wine/5 text-brand-wine">{iconoCategoria(nombreCat)}</span>
                      <h2 className={`${playfair.className} text-xl font-extrabold uppercase tracking-wide text-brand-wine`}>{nombreCat}</h2>
                      <span className="h-1 flex-1 rounded-full bg-gradient-to-r from-brand-amber/50 to-transparent" />
                      <span className="rounded-full bg-brand-cream-soft px-2.5 py-1 text-[11px] font-bold text-brand-brown/50">{cat.productos.length}</span>
                    </div>
                    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                      {cat.productos.map((p) => {
                        const enCarro = carrito[p.referencia]?.cantidad ?? 0;
                        return (
                          <button
                            key={p.referencia}
                            onClick={() => setProductoModal(p)}
                            className={`group flex items-center gap-4 rounded-3xl bg-white p-4 text-left shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-lg ${
                              enCarro > 0 ? "ring-2 ring-brand-amber" : "ring-brand-brown/5"
                            }`}
                          >
                            <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-brand-cream-soft">
                              <ProductoImg />
                              {enCarro > 0 && (
                                <span className="absolute right-1 top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-amber px-1 text-[10px] font-extrabold text-white shadow">
                                  {enCarro % 1 === 0 ? enCarro : enCarro.toFixed(1)}
                                </span>
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 block text-[15px] font-bold leading-snug text-brand-black">
                                {p.producto || p.referencia}
                              </span>
                              <span className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span className="text-lg font-extrabold text-brand-wine">{copTienda(p.precio)}</span>
                                <span className="rounded-full bg-brand-cream-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-brown/55">{p.um || "UND"}</span>
                              </span>
                            </span>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-amber text-white shadow-sm shadow-brand-amber/30 transition group-hover:bg-brand-amber-light">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </div>
      </div>

      {productoModal && (
        <ProductoModal
          producto={productoModal}
          inicialCantidad={carrito[productoModal.referencia]?.cantidad ?? 0}
          inicialObs={carrito[productoModal.referencia]?.observacion ?? ""}
          onConfirmar={(cant, obs) => {
            setLinea(productoModal, cant, obs);
            setProductoModal(null);
          }}
          onCerrar={() => setProductoModal(null)}
        />
      )}

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
                        {l.observacion && <p className="truncate text-[11px] italic text-brand-brown/50">“{l.observacion}”</p>}
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
                    <div className="rounded-2xl border border-brand-brown/15 bg-brand-cream-soft/60 p-3">
                      <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-brand-brown/50">Dirección de entrega</p>
                      <DireccionInput value={direccion} onChange={setDireccion} />
                    </div>
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

/* -------------------------------------------------------------------------- */
/* Modal de producto: imagen grande, cantidad (kg) y observación               */
/* -------------------------------------------------------------------------- */
function ProductoModal({
  producto,
  inicialCantidad,
  inicialObs,
  onConfirmar,
  onCerrar,
}: {
  producto: ProductoTienda;
  inicialCantidad: number;
  inicialObs: string;
  onConfirmar: (cantidad: number, observacion: string) => void;
  onCerrar: () => void;
}) {
  const esKg = (producto.um || "").trim().toUpperCase() === "KG";
  const paso = esKg ? 0.5 : 1;
  const [cantidad, setCantidad] = useState(inicialCantidad > 0 ? inicialCantidad : paso);
  const [obs, setObs] = useState(inicialObs);
  const cambiar = (v: number) => setCantidad(Math.max(0, Math.round(v * 100) / 100));
  const subtotal = producto.precio * cantidad;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-brand-black/50 backdrop-blur-sm sm:items-center"
      onClick={onCerrar}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div className="aspect-[16/10] w-full overflow-hidden bg-brand-cream-soft">
            <ProductoImg />
          </div>
          <button
            onClick={onCerrar}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-brand-brown shadow transition hover:bg-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5">
          <h3 className="text-lg font-extrabold leading-tight text-brand-black">
            {producto.producto || producto.referencia}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xl font-extrabold text-brand-wine">{copTienda(producto.precio)}</span>
            <span className="rounded-full bg-brand-cream-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">
              {producto.um || "UND"}
            </span>
          </div>

          <label className="mt-5 block text-xs font-bold uppercase tracking-widest text-brand-brown/50">
            {esKg ? "¿Cuántos kilos?" : "Cantidad"}
          </label>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-full bg-brand-amber p-1 shadow-sm shadow-brand-amber/30">
              <button onClick={() => cambiar(cantidad - paso)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-2xl font-bold text-white transition active:scale-90">−</button>
              <input
                value={cantidad}
                onChange={(e) => cambiar(Number(e.target.value.replace(",", ".")) || 0)}
                inputMode="decimal"
                className="w-16 bg-transparent text-center text-xl font-extrabold text-white outline-none"
              />
              <button onClick={() => cambiar(cantidad + paso)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-2xl font-bold text-white transition active:scale-90">+</button>
            </div>
            {esKg && <span className="text-xs font-medium text-brand-brown/50">Puedes pedir medios kilos (0.5)</span>}
          </div>

          <label className="mt-5 block text-xs font-bold uppercase tracking-widest text-brand-brown/50">
            Observación (opcional)
          </label>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={2}
            placeholder="Ej. bien molido, sin grasa, en bandeja…"
            className="mt-1.5 w-full rounded-2xl border border-brand-brown/15 bg-brand-cream-soft/60 px-4 py-3 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:bg-white"
          />

          <button
            onClick={() => onConfirmar(cantidad, obs)}
            disabled={cantidad <= 0}
            className="mt-5 flex w-full items-center justify-between rounded-2xl bg-brand-amber px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-md shadow-brand-amber/30 transition hover:bg-brand-amber-light active:scale-[0.99] disabled:opacity-40"
          >
            <span>{inicialCantidad > 0 ? "Actualizar carrito" : "Agregar al carrito"}</span>
            <span>{copTienda(subtotal)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
