"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getUsuario, type Usuario } from "@/lib/auth";
import { puedeVerModulo } from "@/lib/permisos";
import { cargarEstadoPedidos, type DespachoMeta } from "@/lib/pedidos";
import type { Pedido } from "@/app/(panel)/pedidos/page";
import {
  ALERTA_DESPACHO_MS,
  esTransferencia,
  msRestantesDespacho,
  deadlinePreparacion,
  objetivoDespacho,
  yaDespachado,
  colorEstado,
} from "@/lib/despacho";

const cop = (n: number) => "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");
const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Día de entrega efectivo (YYYY-MM-DD): el programado o el de creación. */
function diaEntregaISO(p: Pedido): string {
  if (p.entregaProgramada && p.fechaProgramada) return p.fechaProgramada;
  const d = new Date(p.fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** ¿El pedido es para HOY? Incluye arrastrados activos de días anteriores. */
function esDeHoy(p: Pedido): boolean {
  const dia = diaEntregaISO(p);
  const hoy = hoyISO();
  if (dia === hoy) return true;
  if (dia < hoy) return !p.anulado && !yaDespachado(p.estado) && norm(p.estado) !== "anulado";
  return false;
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });
}

/** Formatea milisegundos como cronómetro "1:59:32" (h:mm:ss), valor absoluto. */
function fmtCronometro(ms: number): string {
  const totalSeg = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Orden real del proceso, para ubicar en qué parte va cada pedido retrasado. */
const SECUENCIA_ESTADOS = ["En proceso", "En producción", "Alistado", "Facturado", "Despachado"];

export default function MonitoreoPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [meta, setMeta] = useState<Record<string, DespachoMeta>>({});
  const [ahora, setAhora] = useState(Date.now());
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    const u = getUsuario();
    if (!puedeVerModulo(u, "monitoreo")) {
      router.replace("/");
      return;
    }
    setUsuario(u);
  }, [router]);

  // Carga inicial + polling incremental (igual que Despacho): cada 7 s trae
  // solo lo que cambió, para que las cards reflejen el estado en tiempo real.
  useEffect(() => {
    if (usuario === null) return;
    let activo = true;
    let primera = true;
    let enVuelo = false;
    let desde: string | undefined;
    const refrescar = () => {
      if (enVuelo) return;
      enVuelo = true;
      cargarEstadoPedidos({ desde, rango: "hoy" })
        .then((e) => {
          if (!activo) return;
          desde = e.ahora ?? desde;
          if (primera) {
            setPedidos(e.pedidos);
            setMeta(e.meta);
            primera = false;
            setCargando(false);
            return;
          }
          if (e.pedidos.length) {
            setPedidos((prev) => {
              const cambiados = new Map(e.pedidos.map((p) => [p.id, p]));
              const idsPrev = new Set(prev.map((p) => p.id));
              const actualizados = prev.map((p) => cambiados.get(p.id) ?? p);
              const nuevos = e.pedidos.filter((p) => !idsPrev.has(p.id));
              return nuevos.length ? [...nuevos, ...actualizados] : actualizados;
            });
          }
          if (e.meta && Object.keys(e.meta).length) {
            setMeta((prev) => {
              const merged = { ...prev };
              for (const [k, v] of Object.entries(e.meta)) {
                merged[k] = { ...(merged[k] ?? {}), ...v };
              }
              return merged;
            });
          }
        })
        .catch(() => {
          /* ignore */
        })
        .finally(() => {
          enVuelo = false;
          setCargando(false);
        });
    };
    refrescar();
    const id = setInterval(refrescar, 7000);
    const onFocus = () => refrescar();
    window.addEventListener("focus", onFocus);
    return () => {
      activo = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [usuario]);

  // Reloj para refrescar los cronómetros cada segundo.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pedidos "en riesgo" de hoy: los MISMOS que muestra la alerta modal de
  // Despacho (por vencer o ya vencidos), agrupados por punto de venta.
  const puntosEnRiesgo = useMemo(() => {
    const pendientes = pedidos.filter(
      (p) => esDeHoy(p) && !p.anulado && !yaDespachado(p.estado) && norm(p.estado) !== "anulado",
    );
    const enRiesgo: (Pedido & { _restante: number })[] = [];
    for (const p of pendientes) {
      const pc = meta[p.id]?.pagoConfirmado;
      const restante = msRestantesDespacho(p, ahora, pc);
      if (!Number.isFinite(restante)) continue; // transferencia sin confirmar
      const umbral = esTransferencia(p) ? 30 * 60 * 1000 : ALERTA_DESPACHO_MS;
      if (restante <= umbral) enRiesgo.push({ ...p, _restante: restante });
    }

    const grupos = new Map<
      string,
      { nombre: string; pedidos: (Pedido & { _restante: number })[] }
    >();
    for (const p of enRiesgo) {
      const key = String(p.punto?.id ?? "sin-punto");
      const nombre = p.punto?.nombre ?? "Sin punto";
      if (!grupos.has(key)) grupos.set(key, { nombre, pedidos: [] });
      grupos.get(key)!.pedidos.push(p);
    }
    for (const g of grupos.values()) {
      g.pedidos.sort((a, b) => a._restante - b._restante);
    }
    // Puntos con más pedidos vencidos (restante <= 0) primero.
    return Array.from(grupos.entries())
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => {
        const va = a.pedidos.filter((p) => p._restante <= 0).length;
        const vb = b.pedidos.filter((p) => p._restante <= 0).length;
        if (va !== vb) return vb - va;
        return b.pedidos.length - a.pedidos.length;
      });
  }, [pedidos, meta, ahora]);

  const totalPedidos = puntosEnRiesgo.reduce((s, g) => s + g.pedidos.length, 0);

  const puntosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return puntosEnRiesgo;
    return puntosEnRiesgo.filter((g) => g.nombre.toLowerCase().includes(q));
  }, [puntosEnRiesgo, busqueda]);

  // Cuántos pedidos en riesgo hay en cada paso del proceso (para la secuencia).
  const conteoPorEstado = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const g of puntosEnRiesgo) {
      for (const p of g.pedidos) {
        const estado = SECUENCIA_ESTADOS.includes(p.estado ?? "") ? (p.estado as string) : "En proceso";
        conteo.set(estado, (conteo.get(estado) ?? 0) + 1);
      }
    }
    return conteo;
  }, [puntosEnRiesgo]);

  if (!usuario) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">Monitoreo</h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Pedidos retrasados o por vencerse en cada punto de venta, en tiempo
          real (los mismos que avisa la alerta de Despacho).
        </p>
      </div>

      {!cargando && totalPedidos > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1 overflow-x-auto rounded-2xl border border-brand-brown/10 bg-white px-4 py-3 shadow-sm">
          {SECUENCIA_ESTADOS.map((estado, i) => {
            const n = conteoPorEstado.get(estado) ?? 0;
            return (
              <div key={estado} className="flex items-center gap-1">
                <div
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    n > 0 ? colorEstado(estado) : "border-brand-brown/10 bg-brand-cream-soft/60 text-brand-brown/40"
                  }`}
                >
                  <span>{estado}</span>
                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                      n > 0 ? "bg-white/70" : "bg-white/50"
                    }`}
                  >
                    {n}
                  </span>
                </div>
                {i < SECUENCIA_ESTADOS.length - 1 && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-brand-brown/30">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5 15.75 12l-7.5 7.5" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!cargando && totalPedidos > 0 && (
        <div className="mb-4 max-w-sm">
          <div className="flex items-center gap-2 rounded-xl border border-brand-brown/20 bg-white px-3 py-2 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-brand-brown/50">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar punto de venta…"
              className="w-full text-sm text-brand-black outline-none placeholder:text-brand-brown/40"
            />
          </div>
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-brand-brown/60">Cargando…</p>
      ) : totalPedidos === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center">
          <p className="font-semibold text-emerald-700">
            No hay pedidos retrasados ni por vencerse en ningún punto.
          </p>
        </div>
      ) : puntosFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-brand-brown/10 bg-white px-5 py-8 text-center">
          <p className="text-sm text-brand-brown/60">
            Ningún punto de venta coincide con “{busqueda}”.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {puntosFiltrados.map((g) => (
            <PuntoCard key={g.id} nombre={g.nombre} pedidos={g.pedidos} meta={meta} ahora={ahora} />
          ))}
        </div>
      )}
    </div>
  );
}

function PuntoCard({
  nombre,
  pedidos,
  meta,
  ahora,
}: {
  nombre: string;
  pedidos: (Pedido & { _restante: number })[];
  meta: Record<string, DespachoMeta>;
  ahora: number;
}) {
  const vencidos = pedidos.filter((p) => p._restante <= 0).length;
  return (
    <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-brand-brown/10 bg-brand-cream-soft/50 px-4 py-3">
        <h2 className="font-serif text-base font-bold text-brand-wine">{nombre}</h2>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            vencidos > 0 ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
          }`}
        >
          {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"}
        </span>
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto p-3">
        {pedidos.map((p) => {
          const m = meta[p.id] ?? {};
          const restEntrega = objetivoDespacho(p, m.pagoConfirmado) - ahora;
          const restPrep = deadlinePreparacion(p, m.pagoConfirmado) - ahora;
          return (
            <div
              key={p.id}
              className={`rounded-xl border p-3 text-sm ${
                p._restante <= 0
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-brand-black">Pedido #{p.comanda}</p>
                  <p className="mt-0.5 break-words text-brand-brown/80">
                    {p.cliente?.nombre || p.cliente?.nit_cedula}
                  </p>
                  <p className="mt-0.5 break-words text-xs text-brand-brown/60">
                    Televenta: <span className="font-bold">{p.vendedorNombre || "—"}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-brand-brown/60">
                    Creado: <span className="font-bold">{fmtHora(p.fecha)}</span>
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${colorEstado(p.estado)}`}>
                  {p.estado ?? "—"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-brand-wine">{cop(p.total)}</span>
                <div className="flex gap-2">
                  <span
                    className={`rounded-md border px-1.5 py-0.5 font-semibold ${
                      restPrep <= 0 ? "border-red-300 bg-red-100 text-red-600" : "border-brand-brown/20 bg-white text-brand-brown/70"
                    }`}
                    title="Tiempo restante de alistamiento"
                  >
                    Alist. {restPrep <= 0 ? "-" : ""}{fmtCronometro(restPrep)}
                  </span>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 font-semibold ${
                      restEntrega <= 0 ? "border-red-300 bg-red-100 text-red-600" : "border-brand-brown/20 bg-white text-brand-brown/70"
                    }`}
                    title="Tiempo restante de despacho"
                  >
                    Desp. {restEntrega <= 0 ? "-" : ""}{fmtCronometro(restEntrega)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
