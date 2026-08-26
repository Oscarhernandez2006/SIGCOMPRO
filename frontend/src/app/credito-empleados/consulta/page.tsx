"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { getUsuario } from "@/lib/auth";
import {
  consultarCreditoPorCedula,
  listarPedidosCredito,
  type PedidoCredito,
  type TrabajadorCredito,
} from "@/lib/credito-empleados";

const fmtCop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const money = (v: number) => fmtCop.format(Number.isFinite(v) ? v : 0);

function fechaLarga(iso: string | null) {
  if (!iso) return null;
  return new Date(iso + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function diasRestantes(iso: string | null): number | null {
  if (!iso) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T12:00:00"); target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - hoy.getTime()) / 86_400_000);
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-700 border-amber-200",
  facturado: "bg-brand-wine/8 text-brand-wine border-brand-wine/20",
  anulado:   "bg-neutral-100 text-neutral-500 border-neutral-200",
};

export default function MiCreditoPage() {
  const [trabajador, setTrabajador]   = useState<TrabajadorCredito | null>(null);
  const [pedidos, setPedidos]         = useState<PedidoCredito[]>([]);
  const [cargando, setCargando]       = useState(true);
  const [error, setError]             = useState<string | null>(null);

  const usuario = getUsuario();
  const cedula  = usuario?.cedula ?? "";

  useEffect(() => {
    if (!cedula) { setCargando(false); setError("Tu usuario no tiene cédula registrada."); return; }

    let vivo = true;
    setCargando(true);

    Promise.all([
      consultarCreditoPorCedula(cedula),
      listarPedidosCredito({ cedula, hasta: new Date().toISOString().split("T")[0] }),
    ])
      .then(([t, ps]) => {
        if (!vivo) return;
        setTrabajador(t);
        setPedidos(ps.slice(0, 5));
      })
      .catch((err) => {
        if (!vivo) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("No estás registrado en el sistema de crédito de empleados. Consulta con administración.");
        } else {
          setError("No se pudo cargar tu información de crédito. Intenta de nuevo.");
        }
      })
      .finally(() => { if (vivo) setCargando(false); });

    return () => { vivo = false; };
  }, [cedula]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-3 border-brand-wine/20 border-t-brand-wine" />
          <p className="text-sm text-brand-brown/50">Cargando tu estado de crédito…</p>
        </div>
      </div>
    );
  }

  // ── Error / sin registro ─────────────────────────────────────────────────
  if (error || !trabajador) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-sm rounded-2xl border border-brand-brown/10 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-wine/10 text-brand-wine">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="mt-4 font-serif text-lg font-bold text-brand-wine">Sin información</h2>
          <p className="mt-2 text-sm text-brand-brown/65">{error}</p>
        </div>
      </div>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────────────
  const cupo      = Number(trabajador.cupo_asignado) || 0;
  const deuda     = Number(trabajador.deuda_vigente) || 0;
  const disponible = Number(trabajador.cupo_disponible) || 0;
  const pct       = cupo > 0 ? Math.min(100, Math.round((deuda / cupo) * 100)) : 0;
  const dias      = diasRestantes(trabajador.fecha_proximo_descuento ?? null);
  const iniciales = trabajador.nombre.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-5">

      {/* ── Hero ── */}
      <div className="overflow-hidden rounded-2xl bg-brand-wine text-white shadow-sm">
        {/* Fondo sutil */}
        <div className="relative px-6 py-6">
          <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_70%_-20%,white_0%,transparent_60%)]" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold backdrop-blur-sm">
              {iniciales}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Mi crédito</p>
              <h1 className="font-serif text-xl font-bold text-white leading-tight truncate">{trabajador.nombre}</h1>
              <p className="text-sm text-white/60">CC {trabajador.cedula}</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${trabajador.activo ? "bg-white/20 text-white" : "bg-rose-400/30 text-rose-200"}`}>
              {trabajador.activo ? "Activo" : "Inactivo"}
            </span>
          </div>

          {/* Barra de uso */}
          <div className="relative mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-white/60">Cupo utilizado</p>
              <p className="text-xs font-bold text-white/80">{pct}%</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-rose-300" : pct >= 60 ? "bg-amber-300" : "bg-white/60"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Cupo total",
            val: money(cupo),
            sub: "Asignado",
            icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />,
            color: "text-brand-black",
            bg: "bg-brand-wine/8",
            ico: "text-brand-wine",
          },
          {
            label: "Deuda",
            val: money(deuda),
            sub: "Pendiente de pago",
            icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.107-.879-1.107-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
            color: "text-amber-700",
            bg: "bg-amber-50",
            ico: "text-amber-600",
          },
          {
            label: "Disponible",
            val: money(disponible),
            sub: disponible > 0 ? "Para comprar" : "Sin cupo",
            icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
            color: disponible > 0 ? "text-brand-wine" : "text-rose-600",
            bg: disponible > 0 ? "bg-brand-wine/8" : "bg-rose-50",
            ico: disponible > 0 ? "text-brand-wine" : "text-rose-500",
          },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-brand-brown/10 bg-white p-3.5 shadow-sm">
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-xl ${k.bg}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={`h-4 w-4 ${k.ico}`}>
                {k.icon}
              </svg>
            </div>
            <p className={`text-base font-bold tabular-nums leading-tight ${k.color}`}>{k.val}</p>
            <p className="mt-0.5 text-[11px] text-brand-brown/50">{k.label}</p>
            <p className="text-[10px] text-brand-brown/35">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Próximo descuento ── */}
      {trabajador.fecha_proximo_descuento ? (
        <div className="flex items-center gap-4 rounded-2xl border border-brand-brown/10 bg-white px-5 py-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-wine/8 leading-tight text-brand-wine">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown/50">Próximo descuento de nómina</p>
            <p className="text-sm font-bold capitalize text-brand-black leading-tight">{fechaLarga(trabajador.fecha_proximo_descuento)}</p>
          </div>
          {dias !== null && (
            <div className={`shrink-0 rounded-xl px-3 py-1.5 text-center ${dias === 0 ? "bg-brand-wine text-white" : dias < 0 ? "bg-neutral-100 text-neutral-500" : dias <= 7 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-brand-wine/8 text-brand-wine"}`}>
              <p className="text-lg font-extrabold tabular-nums leading-none">{Math.abs(dias)}</p>
              <p className="text-[10px] font-semibold">{dias === 0 ? "¡Hoy!" : dias < 0 ? "días" : "días"}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-brand-brown/15 bg-neutral-50/60 px-5 py-4 text-center">
          <p className="text-xs text-brand-brown/35 italic">Sin fecha de descuento registrada · Consulta con administración</p>
        </div>
      )}

      {/* ── Últimas compras ── */}
      <div className="rounded-2xl border border-brand-brown/10 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-brand-brown/8 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 text-brand-wine">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
            <p className="text-sm font-semibold text-brand-black">Últimas compras</p>
          </div>
          {pedidos.length > 0 && (
            <span className="rounded-full bg-brand-brown/8 px-2.5 py-0.5 text-[11px] font-semibold text-brand-brown/60">
              {pedidos.length} registros
            </span>
          )}
        </div>
        {pedidos.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-brand-brown/40">No tienes compras registradas aún.</p>
          </div>
        ) : (
          <div className="divide-y divide-brand-brown/6">
            {pedidos.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-wine/8 text-brand-wine">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-black leading-tight">{p.punto_nombre}</p>
                  <p className="text-[11px] text-brand-brown/50">{fechaCorta(p.creado_en)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-brand-black">{money(Number(p.total))}</p>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ESTADO_BADGE[p.estado] ?? "bg-neutral-100 text-neutral-500 border-neutral-200"}`}>
                    {p.estado === "pendiente" ? "Pendiente" : p.estado === "facturado" ? "Facturado" : "Anulado"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Siesa saldo si disponible ── */}
      {trabajador.siesa_saldo !== null && (
        <div className="flex items-center justify-between rounded-2xl border border-brand-brown/10 bg-white px-5 py-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-brand-brown/50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
            </svg>
            <span className="font-semibold">Saldo en cartera ERP (Siesa)</span>
          </div>
          <p className={`text-sm font-bold tabular-nums ${trabajador.siesa_saldo > 0 ? "text-rose-600" : "text-brand-wine"}`}>
            {money(trabajador.siesa_saldo)}
          </p>
        </div>
      )}

    </div>
  );
}
