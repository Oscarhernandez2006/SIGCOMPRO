"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getUsuario } from "@/lib/auth";
import { puedeVerModulo } from "@/lib/permisos";
import { listarPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";
import {
  ROLES_LIQUIDACION,
  CONFIG_DEFECTO,
  quincena,
  calcularLiquidacion,
  copLiq,
  duracionLiq,
  obtenerConfigsLiquidacion,
  guardarConfigLiquidacion,
  pedidosLiquidacion,
  overridesLiquidacion,
  guardarOverrideLiquidacion,
  type RolLiquidacion,
  type ConfigLiquidacion,
} from "@/lib/liquidacion-variable";
import type { Pedido } from "@/app/(panel)/pedidos/page";
import type { DespachoMeta } from "@/lib/pedidos";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default function LiquidacionVariablePage() {
  const router = useRouter();
  useEffect(() => {
    if (!puedeVerModulo(getUsuario(), "liquidacion_variable")) router.replace("/mi-resumen");
  }, [router]);

  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [mitad, setMitad] = useState<1 | 2>(hoy.getDate() <= 15 ? 1 : 2);
  const [puntoId, setPuntoId] = useState("");
  const [rol, setRol] = useState<RolLiquidacion>("porcionador");

  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [configs, setConfigs] = useState<Record<string, ConfigLiquidacion>>({});
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [meta, setMeta] = useState<Record<string, DespachoMeta>>({});
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalConfig, setModalConfig] = useState<string | null>(null);
  const [modalDetalle, setModalDetalle] = useState(false);

  const q = useMemo(() => quincena(anio, mes, mitad), [anio, mes, mitad]);

  useEffect(() => {
    listarPuntosVenta().then(setPuntos).catch(() => setPuntos([]));
    obtenerConfigsLiquidacion().then(setConfigs).catch(() => setConfigs({}));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [data, ov] = await Promise.all([
        pedidosLiquidacion(q.desde, q.hasta, puntoId || undefined),
        overridesLiquidacion(q.key),
      ]);
      setPedidos(data.pedidos);
      setMeta(data.meta);
      setOverrides(ov);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la liquidación.");
    } finally {
      setCargando(false);
    }
  }, [q, puntoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const liq = useMemo(
    () => calcularLiquidacion(pedidos, meta, configs, overrides),
    [pedidos, meta, configs, overrides],
  );
  const rolData = liq[rol];

  // Puntos para el selector/config: los del backend o, si no hay acceso, los de los pedidos.
  const puntosLista = useMemo(() => {
    if (puntos.length > 0) return puntos.map((p) => ({ id: String(p.id), nombre: p.nombre }));
    const map = new Map<string, string>();
    for (const p of pedidos) {
      const id = String(p.punto?.id ?? "");
      if (id) map.set(id, p.punto?.nombre ?? id);
    }
    return Array.from(map, ([id, nombre]) => ({ id, nombre }));
  }, [puntos, pedidos]);

  const nombrePunto = (id: string) =>
    puntosLista.find((p) => p.id === id)?.nombre ?? id;

  async function toggle(pedidoId: string, actual: boolean) {
    const nuevo = !actual;
    const clave = `${rol}|${pedidoId}`;
    setOverrides((prev) => ({ ...prev, [clave]: nuevo }));
    try {
      await guardarOverrideLiquidacion({ periodo: q.key, rol, pedido_id: pedidoId, pagar: nuevo });
    } catch {
      setOverrides((prev) => ({ ...prev, [clave]: actual }));
      alert("No se pudo guardar la decisión. Intenta de nuevo.");
    }
  }

  const moverMes = (delta: number) => {
    let m = mes + delta;
    let a = anio;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    setMes(m);
    setAnio(a);
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">Liquidación variable</h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Informe quincenal de liquidación por cumplimiento de tiempos (promesa de Drivin).
          Revisa y decide manualmente qué pedidos se pagan.
        </p>
      </div>

      {/* Controles */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-brand-brown/15 bg-white p-1">
          <button onClick={() => moverMes(-1)} title="Mes anterior" className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-brown hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <span className="min-w-[8rem] text-center text-sm font-semibold capitalize text-brand-black">
            {MESES[mes - 1]} {anio}
          </span>
          <button onClick={() => moverMes(1)} title="Mes siguiente" className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-brown hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-brand-brown/15 bg-white p-1">
          {([1, 2] as const).map((h) => (
            <button
              key={h}
              onClick={() => setMitad(h)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mitad === h ? "bg-brand-wine text-white" : "text-brand-brown hover:bg-brand-cream-soft"
              }`}
            >
              {h === 1 ? "1 – 15" : "16 – fin"}
            </button>
          ))}
        </div>

        <select
          value={puntoId}
          onChange={(e) => setPuntoId(e.target.value)}
          className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2 text-sm font-semibold text-brand-black outline-none focus:border-brand-amber"
        >
          <option value="">Todos los puntos</option>
          {puntosLista.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>

        <button
          onClick={() => setModalConfig(puntoId || puntosLista[0]?.id || "")}
          disabled={puntosLista.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-brand-brown/15 bg-white px-3 py-2 text-sm font-semibold text-brand-wine transition hover:bg-brand-cream-soft disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
          Configurar punto
        </button>

        <button
          onClick={() => setModalDetalle(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-wine/90"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>
          Revisar y decidir pedidos
        </button>

        <span className="ml-auto text-xs font-medium text-brand-brown/60">{q.label}</span>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {/* Tabs por rol */}
      <div className="mb-4 flex flex-wrap gap-2">
        {ROLES_LIQUIDACION.map((r) => (
          <button
            key={r.key}
            onClick={() => setRol(r.key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              rol === r.key ? "bg-brand-wine text-white" : "bg-white text-brand-brown hover:bg-brand-cream-soft"
            }`}
          >
            {r.label}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${rol === r.key ? "bg-white/20 text-white" : "bg-brand-wine/10 text-brand-wine"}`}>
              {copLiq(liq[r.key].total)}
            </span>
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="py-10 text-center text-sm text-brand-brown/60">Cargando pedidos de la quincena…</p>
      ) : (
        <div className="space-y-6">
          {/* Resumen por persona */}
          <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
            <div className="flex items-center justify-between border-b border-brand-brown/10 bg-brand-cream-soft px-4 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-brown/60">
                Resumen a pagar · {ROLES_LIQUIDACION.find((r) => r.key === rol)?.label}
              </p>
              <p className="text-sm font-bold text-brand-wine">Total {copLiq(rolData.total)}</p>
            </div>
            {rolData.resumen.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-brand-brown/50">Sin personas en este periodo.</p>
            ) : (
              <div className="max-h-[calc(100vh-320px)] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white text-left text-[11px] uppercase tracking-wide text-brand-brown/45 shadow-sm">
                  <tr>
                    <th className="px-4 py-2">Persona</th>
                    <th className="px-4 py-2">Punto</th>
                    <th className="px-4 py-2 text-right">{rol === "porcionador" ? "Kilos pagados" : "Pedidos pagados"}</th>
                    <th className="px-4 py-2 text-right">A pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {rolData.resumen.map((g) => (
                    <tr key={`${g.persona}|${g.puntoId}`} className="border-t border-brand-brown/5">
                      <td className="px-4 py-2.5 font-semibold text-brand-black">{g.persona}</td>
                      <td className="px-4 py-2.5 text-brand-brown/70">{g.puntoNombre}</td>
                      <td className="px-4 py-2.5 text-right">
                        {rol === "porcionador"
                          ? `${g.kilos % 1 === 0 ? g.kilos : g.kilos.toFixed(1)} kg`
                          : g.nPedidos}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-brand-wine">
                        {copLiq(g.monto)}
                        {g.minimoAplicado && (
                          <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">mín</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: detalle de pedidos con decisión manual */}
      {modalDetalle && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/50 p-4" onClick={() => setModalDetalle(false)}>
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-brand-brown/10 bg-brand-cream-soft px-4 py-3">
              <p className="text-sm font-bold text-brand-wine">
                Detalle — {ROLES_LIQUIDACION.find((r) => r.key === rol)?.label} · decide qué se paga
              </p>
              <button onClick={() => setModalDetalle(false)} className="rounded-lg p-1.5 text-brand-brown/50 transition hover:bg-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="sticky top-0 z-10 bg-white text-left text-[11px] uppercase tracking-wide text-brand-brown/45 shadow-sm">
                  <tr>
                    <th className="px-4 py-2">Comanda</th>
                    <th className="px-4 py-2">Persona</th>
                    <th className="px-4 py-2">Punto</th>
                    <th className="px-4 py-2 text-right">Kilos</th>
                    <th className="px-4 py-2 text-right">Preparación</th>
                    <th className="px-4 py-2 text-center">A tiempo</th>
                    {rol === "porcionador" && <th className="px-4 py-2 text-center">Razonable</th>}
                    <th className="px-4 py-2 text-center">¿Pagar?</th>
                  </tr>
                </thead>
                <tbody>
                  {rolData.detalle.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-brand-brown/50">
                        No hay pedidos con persona asignada para este rol en la quincena.
                      </td>
                    </tr>
                  ) : (
                    rolData.detalle.map((d) => {
                      const aTiempo = rol === "facturacion" ? d.entregaATiempo : d.prepATiempo;
                      return (
                        <tr key={d.pedidoId} className="border-t border-brand-brown/5 hover:bg-brand-cream-soft/30">
                          <td className="px-4 py-2 font-semibold text-brand-wine">{d.comanda}</td>
                          <td className="px-4 py-2 text-brand-black">{d.persona}</td>
                          <td className="px-4 py-2 text-brand-brown/60">{d.puntoNombre}</td>
                          <td className="px-4 py-2 text-right text-brand-brown/70">
                            {d.kilos % 1 === 0 ? d.kilos : d.kilos.toFixed(1)}
                          </td>
                          <td className="px-4 py-2 text-right text-brand-brown/70">{duracionLiq(d.prepMs)}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${aTiempo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                              {aTiempo ? "Sí" : "No"}
                            </span>
                          </td>
                          {rol === "porcionador" && (
                            <td className="px-4 py-2 text-center">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.razonable ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                {d.razonable ? "Sí" : "No"}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => toggle(d.pedidoId, d.pagar)}
                              title={d.overridden ? "Decisión manual" : "Automático según cumplimiento"}
                              className={`inline-flex min-w-[3rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${
                                d.pagar
                                  ? "bg-green-600 text-white hover:bg-green-700"
                                  : "bg-red-100 text-red-600 hover:bg-red-200"
                              }`}
                            >
                              {d.pagar ? "Sí" : "No"}
                              {d.overridden && <span className="text-[9px] opacity-80">●</span>}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {modalConfig !== null && (
        <ModalConfig
          puntoId={modalConfig}
          puntos={puntosLista}
          config={configs[modalConfig] ?? CONFIG_DEFECTO}
          onCerrar={() => setModalConfig(null)}
          onGuardado={(pid, cfg) => {
            setConfigs((prev) => ({ ...prev, [pid]: cfg }));
            setModalConfig(null);
          }}
          onCambiarPunto={setModalConfig}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal de configuración por punto                                            */
/* -------------------------------------------------------------------------- */
function ModalConfig({
  puntoId,
  puntos,
  config,
  onCerrar,
  onGuardado,
  onCambiarPunto,
}: {
  puntoId: string;
  puntos: { id: string; nombre: string }[];
  config: ConfigLiquidacion;
  onCerrar: () => void;
  onGuardado: (puntoId: string, config: ConfigLiquidacion) => void;
  onCambiarPunto: (puntoId: string) => void;
}) {
  const [form, setForm] = useState<ConfigLiquidacion>(config);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setForm(config), [config, puntoId]);

  const campo = (k: keyof ConfigLiquidacion, label: string, unidad: "money" | "seg" = "money", hint?: string) => (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/60">{label}</label>
      <div className="flex items-center gap-1 rounded-xl border border-brand-brown/15 bg-white px-3 py-2">
        {unidad === "money" && <span className="text-brand-brown/40">$</span>}
        <input
          type="number"
          min="0"
          value={form[k]}
          onChange={(e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) || 0 }))}
          className="w-full bg-transparent text-right font-semibold text-brand-black outline-none"
        />
        {unidad === "seg" && <span className="text-brand-brown/40">s</span>}
      </div>
      {hint && <p className="mt-0.5 text-[10px] text-brand-brown/45">{hint}</p>}
    </div>
  );

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const g = await guardarConfigLiquidacion(puntoId, form);
      onGuardado(puntoId, g);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/50 p-4" onClick={onCerrar}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-xl font-bold text-brand-wine">Configuración de liquidación</h3>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-brand-brown/50 hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-brown/60">Punto de venta</label>
        <select
          value={puntoId}
          onChange={(e) => onCambiarPunto(e.target.value)}
          className="mb-4 w-full rounded-xl border border-brand-brown/15 bg-white px-3 py-2 text-sm font-semibold text-brand-black outline-none focus:border-brand-amber"
        >
          {puntos.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>

        <div className="mb-2 rounded-xl bg-brand-cream-soft/60 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-brown/50">Porcionadores</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {campo("porcionador_minimo", "Mínimo garantizado")}
            {campo("porcionador_por_kg", "Pago por kilo")}
            {campo("porcionador_seg_por_kg", "Seg. mínimos/kg", "seg", "Evita tiempos irreales")}
          </div>
        </div>

        <div className="rounded-xl bg-brand-cream-soft/60 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-brown/50">Valor por pedido cumplido a tiempo</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {campo("televentas_por_pedido", "Televentas")}
            {campo("caja_por_pedido", "Caja")}
            {campo("facturacion_por_pedido", "Facturación")}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-xl border border-brand-brown/15 px-4 py-2.5 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando} className="rounded-xl bg-brand-wine px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-wine/90 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>
      </div>
    </div>
  );
}
