"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "@/lib/api";
import {
  cargarAsignacionesDrivin,
  cargarEntregasDrivin,
  cargarPuntosEnvio,
  enviarFundacionADrivin,
  type EnvioFundacion,
  type PuntoEnvio,
} from "@/lib/pedidos";
import { estadoReplicaVista } from "@/lib/despacho";

interface Props {
  pedidoId: string;
  comanda: string;
  cliente: string;
  onClose: () => void;
  /** Notifica la lista vigente de envíos (para refrescar el contador del botón). */
  onEnvios?: (envios: EnvioFundacion[]) => void;
}

type Pestana = "puntos" | "seguimiento";

/** Estado Drivin de un envío a fundación (asignación + POD). */
interface EstadoEnvio {
  domiciliario?: string;
  estado?: string;
  /** La orden ya figura en algún escenario de Drivin. */
  enDrivin: boolean;
}

const TARJETAS: Array<{ key: string; label: string; chip: string; match: (e: EstadoEnvio) => boolean }> = [
  { key: "total", label: "Enviados", chip: "bg-brand-wine/10 text-brand-wine", match: () => true },
  { key: "espera", label: "Sin asignar", chip: "bg-amber-100 text-amber-700", match: (e) => !e.domiciliario && !["in-transit", "approved", "rejected", "partial"].includes(e.estado ?? "") },
  { key: "asignado", label: "Asignados", chip: "bg-teal-100 text-teal-700", match: (e) => Boolean(e.domiciliario) && !["in-transit", "approved", "rejected", "partial"].includes(e.estado ?? "") },
  { key: "transito", label: "En tránsito", chip: "bg-sky-100 text-sky-600", match: (e) => e.estado === "in-transit" },
  { key: "entregado", label: "Entregados", chip: "bg-green-100 text-green-700", match: (e) => e.estado === "approved" },
];

/**
 * Modal "Puntos de envío": direcciones alternas del cliente ("cédula-N") a las
 * que se puede mandar el pedido como orden aparte "comanda-NF" (fundaciones),
 * con pestaña de seguimiento del estado de cada envío en Drivin.
 */
export default function PuntosEnvioFundacion({ pedidoId, comanda, cliente, onClose, onEnvios }: Props) {
  const [pestana, setPestana] = useState<Pestana>("puntos");
  const [puntos, setPuntos] = useState<PuntoEnvio[]>([]);
  const [envios, setEnvios] = useState<EnvioFundacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [estados, setEstados] = useState<Record<string, EstadoEnvio>>({});
  const [filtro, setFiltro] = useState<string | null>(null);
  const onEnviosRef = useRef(onEnvios);
  useEffect(() => {
    onEnviosRef.current = onEnvios;
  }, [onEnvios]);

  const cargar = useCallback(async () => {
    try {
      const r = await cargarPuntosEnvio(pedidoId);
      setPuntos(r.puntos);
      setEnvios(r.envios);
      onEnviosRef.current?.(r.envios);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar los puntos de envío.");
    } finally {
      setCargando(false);
    }
  }, [pedidoId]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(t);
  }, [cargar]);

  // Seguimiento: asignación (vehículo) + POD de cada orden "-NF" cada 10 s.
  useEffect(() => {
    if (envios.length === 0) return;
    let activo = true;
    const codigos = envios.map((e) => e.comanda);
    const refrescar = async () => {
      try {
        const [asig, pods] = await Promise.all([
          cargarAsignacionesDrivin(),
          cargarEntregasDrivin(codigos),
        ]);
        if (!activo) return;
        const out: Record<string, EstadoEnvio> = {};
        for (const c of codigos) {
          const a = asig[c];
          out[c] = {
            enDrivin: c in asig,
            domiciliario: a?.nombre,
            estado: pods[c]?.status ?? undefined,
          };
        }
        setEstados(out);
      } catch {
        /* se reintenta en el siguiente ciclo */
      }
    };
    void refrescar();
    const t = setInterval(refrescar, 10_000);
    return () => {
      activo = false;
      clearInterval(t);
    };
  }, [envios]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const enviadoPorSufijo = useMemo(() => new Map(envios.map((e) => [e.sufijo, e])), [envios]);

  // Selección (checks) de direcciones a enviar en lote.
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);
  const pendientes = useMemo(() => puntos.filter((p) => !enviadoPorSufijo.has(p.sufijo)), [puntos, enviadoPorSufijo]);
  const todosMarcados = pendientes.length > 0 && pendientes.every((p) => seleccion.has(p.sufijo));

  function alternar(sufijo: number) {
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(sufijo)) s.delete(sufijo);
      else s.add(sufijo);
      return s;
    });
  }
  function alternarTodos() {
    setSeleccion(todosMarcados ? new Set() : new Set(pendientes.map((p) => p.sufijo)));
  }

  /** Envía en lote (secuencial, para no saturar Drivin) las direcciones marcadas. */
  async function enviarSeleccion() {
    const lista = puntos.filter((p) => seleccion.has(p.sufijo)).sort((a, b) => a.sufijo - b.sufijo);
    if (lista.length === 0) return;
    setAviso(null);
    setProgreso({ hecho: 0, total: lista.length });
    const ok: string[] = [];
    const fallos: string[] = [];
    for (const p of lista) {
      setEnviando(p.sufijo);
      try {
        const r = await enviarFundacionADrivin(pedidoId, p.sufijo, p.nit);
        ok.push(r.comanda);
        setSeleccion((prev) => {
          const s = new Set(prev);
          s.delete(p.sufijo);
          return s;
        });
      } catch (e) {
        fallos.push(`${p.comanda}: ${e instanceof ApiError || e instanceof Error ? e.message : "error"}`);
      }
      setProgreso({ hecho: ok.length + fallos.length, total: lista.length });
    }
    setEnviando(null);
    setProgreso(null);
    await cargar();
    if (fallos.length === 0) {
      setAviso({ tipo: "ok", texto: `${ok.length} orden${ok.length === 1 ? "" : "es"} enviada${ok.length === 1 ? "" : "s"} a Drivin.` });
      setPestana("seguimiento");
    } else {
      setAviso({
        tipo: "error",
        texto: `${ok.length} enviada(s), ${fallos.length} con error: ${fallos.join(" · ")}`,
      });
    }
  }

  /** Reenvío individual de una orden ya subida. */
  async function reenviar(p: PuntoEnvio) {
    setEnviando(p.sufijo);
    setAviso(null);
    try {
      const r = await enviarFundacionADrivin(pedidoId, p.sufijo, p.nit);
      setAviso({ tipo: "ok", texto: `Orden ${r.comanda} reenviada a Drivin.` });
      await cargar();
    } catch (e) {
      setAviso({
        tipo: "error",
        texto: e instanceof ApiError ? e.message : e instanceof Error ? e.message : "No se pudo enviar a Drivin.",
      });
    } finally {
      setEnviando(null);
    }
  }

  const enviosVista = useMemo(() => {
    const lista = envios
      .slice()
      .sort((a, b) => a.sufijo - b.sufijo)
      .map((e) => ({ envio: e, st: estados[e.comanda] ?? { enDrivin: false } }));
    const def = TARJETAS.find((t) => t.key === filtro);
    return def ? lista.filter((x) => def.match(x.st)) : lista;
  }, [envios, estados, filtro]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-brand-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h2 className="font-serif text-xl font-bold text-brand-wine">Puntos de envío</h2>
            <p className="text-xs text-brand-black">
              Comanda # <span className="font-semibold">{comanda}</span> · {cliente}
            </p>
            <p className="mt-0.5 text-[11px] text-brand-black/70">
              Marca las direcciones alternas y pulsa «Enviar a Drivin»: cada una sube como orden aparte <span className="font-mono">{comanda}-NF</span> (F = fundación).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-brand-black transition hover:bg-brand-cream-soft"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 border-b border-brand-brown/10 px-5 pt-3">
          {(
            [
              { k: "puntos", t: `Direcciones (${puntos.length})` },
              { k: "seguimiento", t: `Seguimiento (${envios.length})` },
            ] as Array<{ k: Pestana; t: string }>
          ).map((tab) => (
            <button
              key={tab.k}
              type="button"
              onClick={() => setPestana(tab.k)}
              className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold transition ${
                pestana === tab.k
                  ? "border-brand-wine text-brand-wine"
                  : "border-transparent text-brand-black/60 hover:text-brand-black"
              }`}
            >
              {tab.t}
            </button>
          ))}
        </div>

        {aviso && (
          <div
            className={`mx-5 mt-3 rounded-xl border px-4 py-2.5 text-sm ${
              aviso.tipo === "ok"
                ? "border-green-300 bg-green-50 text-green-700"
                : "border-brand-wine/30 bg-brand-wine/10 text-brand-wine"
            }`}
          >
            {aviso.texto}
          </div>
        )}
        {error && (
          <div className="mx-5 mt-3 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-2.5 text-sm text-brand-wine">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {cargando ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
            </div>
          ) : pestana === "puntos" ? (
            puntos.length === 0 ? (
              <p className="py-12 text-center text-sm text-brand-black/70">
                Este cliente no tiene direcciones alternas registradas (cédula-1, cédula-2, …).
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-brand-brown/10 text-[11px] uppercase tracking-wide text-brand-black">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={todosMarcados}
                        disabled={pendientes.length === 0 || enviando !== null}
                        onChange={alternarTodos}
                        aria-label="Marcar todas las direcciones pendientes"
                        className="h-4 w-4 accent-sky-600"
                      />
                    </th>
                    <th className="px-3 py-2 font-semibold">Código</th>
                    <th className="px-3 py-2 font-semibold">Dirección</th>
                    <th className="px-3 py-2 font-semibold">Orden Drivin</th>
                    <th className="px-3 py-2 text-right font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-brown/5">
                  {puntos.map((p) => {
                    const env = enviadoPorSufijo.get(p.sufijo);
                    const st = env ? estados[env.comanda] : undefined;
                    const ev = st ? estadoReplicaVista(st) : null;
                    const marcado = seleccion.has(p.sufijo);
                    return (
                      <tr
                        key={p.nit}
                        onClick={() => !env && enviando === null && alternar(p.sufijo)}
                        className={`${env ? "" : "cursor-pointer"} ${marcado ? "bg-sky-50" : "hover:bg-brand-cream-soft/60"}`}
                      >
                        <td className="px-3 py-2.5">
                          {!env && (
                            <input
                              type="checkbox"
                              checked={marcado}
                              disabled={enviando !== null}
                              onChange={() => alternar(p.sufijo)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Marcar ${p.direccion ?? p.nit}`}
                              className="h-4 w-4 accent-sky-600"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-brand-black">{p.nit}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-brand-black">{p.direccion ?? "—"}</div>
                          <div className="text-[11px] text-brand-black/70">
                            {[p.barrio, p.ciudad].filter(Boolean).join(" · ")}
                            {p.telefono ? ` · Tel: ${p.telefono}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold text-brand-wine">{p.comanda}</td>
                        <td className="px-3 py-2.5 text-right">
                          {enviando === p.sufijo ? (
                            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
                          ) : env ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${ev?.chip ?? "bg-brand-cream-soft text-brand-black"}`}>
                                {ev?.label ?? "Enviado"}
                              </span>
                              <button
                                type="button"
                                disabled={enviando !== null}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void reenviar(p);
                                }}
                                className="text-[11px] font-semibold text-sky-600 hover:underline disabled:opacity-50"
                                title="Volver a subir la orden a Drivin"
                              >
                                Reenviar
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-brand-black/60">Sin enviar</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : envios.length === 0 ? (
            <p className="py-12 text-center text-sm text-brand-black/70">
              Aún no se ha enviado ninguna dirección alterna a Drivin.
            </p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {TARJETAS.map((t) => {
                  const n = envios.filter((e) => t.match(estados[e.comanda] ?? { enDrivin: false })).length;
                  const activo = filtro === t.key || (t.key === "total" && filtro === null);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setFiltro(t.key === "total" ? null : filtro === t.key ? null : t.key)}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 ${
                        activo ? "border-brand-wine ring-1 ring-brand-wine" : "border-brand-brown/10"
                      }`}
                    >
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${t.chip}`}>{t.label}</span>
                      <span className="text-xl font-extrabold text-brand-black">{n}</span>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2">
                {enviosVista.map(({ envio, st }) => {
                  const ev = estadoReplicaVista(st);
                  return (
                    <div key={envio.sufijo} className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-brown/10 bg-white px-4 py-3 shadow-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm font-bold text-brand-wine">{envio.comanda}</div>
                        <div className="truncate text-sm text-brand-black">{envio.direccion ?? "—"}</div>
                        <div className="text-[11px] text-brand-black/70">
                          {[envio.barrio, envio.ciudad].filter(Boolean).join(" · ")} · Enviado{" "}
                          {new Date(envio.drivinEnviadoEn).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ev.chip}`}>{ev.label}</span>
                        <span className="text-[11px] text-brand-black">
                          {ev.domiciliario ? `Domiciliario: ${ev.domiciliario}` : st.enDrivin ? "Sin domiciliario asignado" : "Pendiente en Drivin"}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {enviosVista.length === 0 && (
                  <p className="py-6 text-center text-sm text-brand-black/70">Ningún envío en este estado.</p>
                )}
              </div>
            </>
          )}
        </div>

        {pestana === "puntos" && !cargando && puntos.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-brown/10 bg-brand-cream-soft/40 px-5 py-3">
            <p className="text-xs text-brand-black">
              {progreso
                ? `Enviando ${progreso.hecho} de ${progreso.total}…`
                : seleccion.size > 0
                  ? `${seleccion.size} dirección${seleccion.size === 1 ? "" : "es"} marcada${seleccion.size === 1 ? "" : "s"}`
                  : pendientes.length > 0
                    ? "Marca las direcciones a las que quieres enviar el pedido."
                    : "Todas las direcciones ya fueron enviadas."}
            </p>
            <button
              type="button"
              disabled={seleccion.size === 0 || enviando !== null}
              onClick={() => void enviarSeleccion()}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
            >
              {enviando !== null ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              )}
              Enviar a Drivin{seleccion.size > 0 ? ` (${seleccion.size})` : ""}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
