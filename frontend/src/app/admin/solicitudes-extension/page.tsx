"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getUsuario, puedeVerDashboard } from "@/lib/auth";
import { listarPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";
import {
  aprobarSolicitudExtension,
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  guardarValorExtension,
  listarSolicitudesExtension,
  pedidosDeExtension,
  rechazarSolicitudExtension,
  valoresExtension,
  type EstadoSolicitud,
  type SolicitudExtension,
  type ValorExtensionPunto,
} from "@/lib/extensiones";
import PedidosExtensionModal from "@/components/PedidosExtensionModal";
import CardsDespachoFoto from "@/components/CardsDespachoFoto";

type Pestana = "solicitudes" | "reporte" | "valores";

const cop = (n: number) => "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inicioMesISO(): string {
  return `${hoyISO().slice(0, 8)}01`;
}

const inputCls =
  "rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber";

export default function SolicitudesExtensionPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("solicitudes");
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);

  useEffect(() => {
    if (!puedeVerDashboard(getUsuario()?.rol)) {
      router.replace("/");
      return;
    }
    setListo(true);
    listarPuntosVenta().then(setPuntos).catch(() => {});
  }, [router]);

  if (!listo) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">Aprobación de extensiones</h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Aprueba o rechaza las extensiones de domiciliarios que solicita Despacho en cada punto.
          Los pedidos cuentan desde que se envía la solicitud; si se rechaza, se descartan.
          Configura el valor fijo por extensión y consulta el reporte para el pago.
        </p>
      </div>
      <div className="mb-5 flex gap-2">
        {(
          [
            ["solicitudes", "Solicitudes"],
            ["reporte", "Reporte"],
            ["valores", "Valor por punto"],
          ] as [Pestana, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPestana(k)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              pestana === k ? "bg-brand-wine text-white" : "border border-brand-brown/20 bg-white text-brand-black hover:bg-brand-cream-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {pestana === "solicitudes" && <Solicitudes puntos={puntos} />}
      {pestana === "reporte" && <Reporte puntos={puntos} />}
      {pestana === "valores" && <Valores />}
    </div>
  );
}

function SelectorPunto({
  puntos,
  value,
  onChange,
}: {
  puntos: PuntoVenta[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">Todos los puntos</option>
      {puntos.map((p) => (
        <option key={p.id} value={String(p.id)}>{p.nombre}</option>
      ))}
    </select>
  );
}

function Solicitudes({ puntos }: { puntos: PuntoVenta[] }) {
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [puntoId, setPuntoId] = useState("");
  const [estado, setEstado] = useState("");
  const [lista, setLista] = useState<SolicitudExtension[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<SolicitudExtension | null>(null);
  const [verPedidos, setVerPedidos] = useState<SolicitudExtension | null>(null);
  const [trazabilidad, setTrazabilidad] = useState<SolicitudExtension | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLista(await listarSolicitudesExtension({ desde, hasta, puntoId, estado }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las solicitudes");
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, puntoId, estado]);

  useEffect(() => {
    setCargando(true);
    cargar();
    const id = setInterval(cargar, 30000);
    return () => clearInterval(id);
  }, [cargar]);

  async function aprobar(s: SolicitudExtension) {
    setProcesando(s.id);
    try {
      await aprobarSolicitudExtension(s.id);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aprobar");
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
        <span className="text-sm text-brand-brown/60">a</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
        <SelectorPunto puntos={puntos} value={puntoId} onChange={setPuntoId} />
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={inputCls}>
          <option value="">Todos los estados</option>
          {(Object.keys(ETIQUETA_ESTADO) as EstadoSolicitud[]).map((k) => (
            <option key={k} value={k}>{ETIQUETA_ESTADO[k]}</option>
          ))}
        </select>
      </div>
      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      {cargando ? (
        <p className="text-sm text-brand-brown/60">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl border border-brand-brown/10 bg-white px-5 py-8 text-center text-sm text-brand-brown/60">
          No hay solicitudes con estos filtros.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-brand-cream-soft/60 text-left text-[11px] uppercase tracking-wide text-brand-brown/70">
              <tr>
                <th className="px-3 py-2">Día</th>
                <th className="px-3 py-2">Punto</th>
                <th className="px-3 py-2">Domiciliario</th>
                <th className="px-3 py-2">Motivo</th>
                <th className="px-3 py-2">Solicitó</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-center">Trazabilidad</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.id} className="border-t border-brand-brown/10 align-top">
                  <td className="whitespace-nowrap px-3 py-2">{s.dia}</td>
                  <td className="px-3 py-2">{s.punto_nombre ?? s.punto_id}</td>
                  <td className="px-3 py-2 font-semibold">{s.domiciliario}</td>
                  <td className="max-w-xs break-words px-3 py-2">{s.motivo}</td>
                  <td className="px-3 py-2">
                    {s.solicitado_por_nombre ?? "—"}
                    <span className="block text-[11px] text-brand-brown/60">{fmtHora(s.solicitado_en)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLOR_ESTADO[s.estado]}`}>
                      {ETIQUETA_ESTADO[s.estado]}
                    </span>
                    {s.motivo_rechazo && <span className="mt-1 block text-[11px] text-red-600">{s.motivo_rechazo}</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setTrazabilidad(s)}
                      title="Ver trazabilidad y estado del punto al solicitar"
                      className="rounded-lg p-1.5 text-brand-wine hover:bg-brand-cream-soft"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      {s.estado === "pendiente" && (
                        <>
                          <button
                            onClick={() => aprobar(s)}
                            disabled={procesando === s.id}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => setRechazando(s)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                      {(s.estado === "pendiente" || s.estado === "aprobada" || s.estado === "cerrada") && (
                        <button
                          onClick={() => setVerPedidos(s)}
                          className="whitespace-nowrap rounded-lg border border-brand-brown/20 px-3 py-1.5 text-xs font-semibold text-brand-wine hover:bg-brand-cream-soft"
                        >
                          Ver pedidos ({s.pedidos})
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rechazando && (
        <RechazarModal
          solicitud={rechazando}
          onCerrar={() => setRechazando(null)}
          onListo={() => {
            setRechazando(null);
            cargar();
          }}
        />
      )}
      {verPedidos && <PedidosExtensionModal solicitud={verPedidos} onCerrar={() => setVerPedidos(null)} />}
      {trazabilidad && <TrazabilidadModal solicitud={trazabilidad} onCerrar={() => setTrazabilidad(null)} />}
    </div>
  );
}

function TrazabilidadModal({
  solicitud: s,
  onCerrar,
}: {
  solicitud: SolicitudExtension;
  onCerrar: () => void;
}) {
  const resolvio =
    s.estado === "rechazada" ? "Rechazó" : s.estado === "cancelada" ? "Cancelada" : "Aprobó";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-brand-wine">Trazabilidad de la solicitud</h3>
            <p className="text-xs text-brand-black">
              {s.domiciliario} · {s.punto_nombre ?? s.punto_id} · {s.dia}
            </p>
          </div>
          <button onClick={onCerrar} title="Cerrar" className="rounded-lg p-1.5 text-brand-black hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <ol className="space-y-2 border-l-2 border-brand-brown/15 pl-4">
            <li>
              <span className="font-semibold">Solicitada</span> por {s.solicitado_por_nombre ?? "—"} a las{" "}
              {fmtHora(s.solicitado_en)}
              <span className="block text-xs text-brand-brown/70">Motivo: {s.motivo}</span>
            </li>
            {s.resuelto_en && (
              <li>
                <span className="font-semibold">{resolvio}</span>
                {s.resuelto_por_nombre ? ` por ${s.resuelto_por_nombre}` : ""} a las {fmtHora(s.resuelto_en)}
                {s.motivo_rechazo && <span className="block text-xs text-red-600">Motivo: {s.motivo_rechazo}</span>}
              </li>
            )}
            {s.cerrado_en && (
              <li>
                <span className="font-semibold">Cerrada</span> al terminar el día ({fmtHora(s.cerrado_en)})
              </li>
            )}
          </ol>

          <div>
            <h4 className="mb-2 font-semibold text-brand-black">
              Estado del punto al momento de solicitar
            </h4>
            {!s.snapshot ? (
              <p className="text-brand-brown/60">Esta solicitud no tiene el registro del estado del punto.</p>
            ) : (
              <CardsDespachoFoto resumen={s.snapshot} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RechazarModal({
  solicitud,
  onCerrar,
  onListo,
}: {
  solicitud: SolicitudExtension;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rechazar() {
    setEnviando(true);
    try {
      await rechazarSolicitudExtension(solicitud.id, motivo.trim());
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo rechazar");
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="font-serif text-lg font-bold text-brand-wine">Rechazar extensión</h3>
        <p className="mb-3 text-xs text-brand-black">
          {solicitud.domiciliario} · {solicitud.punto_nombre}
        </p>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Motivo del rechazo"
          className="w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex gap-3">
          <button onClick={onCerrar} className="flex-1 rounded-xl border border-brand-brown/20 py-2.5 text-sm font-semibold hover:bg-brand-cream-soft">
            Volver
          </button>
          <button
            onClick={rechazar}
            disabled={!motivo.trim() || enviando}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}

function Reporte({ puntos }: { puntos: PuntoVenta[] }) {
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [puntoId, setPuntoId] = useState("");
  const [lista, setLista] = useState<SolicitudExtension[]>([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verPedidos, setVerPedidos] = useState<SolicitudExtension | null>(null);

  useEffect(() => {
    setCargando(true);
    listarSolicitudesExtension({ desde, hasta, puntoId, estado: "aprobada,cerrada" })
      .then((l) => {
        setLista(l);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar el reporte"))
      .finally(() => setCargando(false));
  }, [desde, hasta, puntoId]);

  const resumen = useMemo(() => {
    const mapa = new Map<string, { domiciliario: string; punto: string; extensiones: number; pedidos: number; total: number }>();
    for (const s of lista) {
      const key = `${s.punto_id}|${s.domiciliario_codigo || s.domiciliario.toLowerCase()}`;
      const e = mapa.get(key) ?? { domiciliario: s.domiciliario, punto: s.punto_nombre ?? s.punto_id, extensiones: 0, pedidos: 0, total: 0 };
      e.extensiones += 1;
      e.pedidos += s.pedidos;
      e.total += Number(s.valor) || 0;
      mapa.set(key, e);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [lista]);
  const totalGeneral = resumen.reduce((s, r) => s + r.total, 0);

  async function exportar() {
    setExportando(true);
    try {
      const { utils, writeFile } = await import("xlsx");
      const detalle = await Promise.all(lista.map((s) => pedidosDeExtension(s.id).then((ps) => ({ s, ps }))));
      const hojaExt = utils.json_to_sheet(
        lista.map((s) => ({
          Día: s.dia,
          Punto: s.punto_nombre ?? s.punto_id,
          Domiciliario: s.domiciliario,
          Motivo: s.motivo,
          "Solicitó": s.solicitado_por_nombre ?? "",
          "Hora solicitud": fmtHora(s.solicitado_en),
          "Aprobó": s.resuelto_por_nombre ?? "",
          "Hora aprobación": s.resuelto_en ? fmtHora(s.resuelto_en) : "",
          Estado: ETIQUETA_ESTADO[s.estado],
          Pedidos: s.pedidos,
          Valor: Number(s.valor) || 0,
        })),
      );
      const hojaPed = utils.json_to_sheet(
        detalle.flatMap(({ s, ps }) =>
          ps.map((p) => ({
            Día: s.dia,
            Punto: s.punto_nombre ?? s.punto_id,
            Domiciliario: s.domiciliario,
            Consecutivo: p.consecutivo ?? "",
            Comanda: p.comanda ?? "",
            Cliente: p.cliente_nombre ?? "",
            "NIT/Cédula": p.cliente_nit ?? "",
            "Estado final": p.estado_final ?? "",
          })),
        ),
      );
      const libro = utils.book_new();
      utils.book_append_sheet(libro, hojaExt, "Extensiones");
      utils.book_append_sheet(libro, hojaPed, "Pedidos");
      writeFile(libro, `extensiones_${desde}_a_${hasta}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
        <span className="text-sm text-brand-brown/60">a</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
        <SelectorPunto puntos={puntos} value={puntoId} onChange={setPuntoId} />
        <button
          onClick={exportar}
          disabled={exportando || lista.length === 0}
          className="ml-auto rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {exportando ? "Exportando…" : "Exportar a Excel"}
        </button>
      </div>
      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      {cargando ? (
        <p className="text-sm text-brand-brown/60">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl border border-brand-brown/10 bg-white px-5 py-8 text-center text-sm text-brand-brown/60">
          No hay extensiones aprobadas en este rango.
        </div>
      ) : (
        <>
          <div className="mb-5 overflow-x-auto rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-brand-cream-soft/60 text-left text-[11px] uppercase tracking-wide text-brand-brown/70">
                <tr>
                  <th className="px-3 py-2">Domiciliario</th>
                  <th className="px-3 py-2">Punto</th>
                  <th className="px-3 py-2 text-right">Extensiones</th>
                  <th className="px-3 py-2 text-right">Pedidos</th>
                  <th className="px-3 py-2 text-right">Total a pagar</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={`${r.punto}|${r.domiciliario}`} className="border-t border-brand-brown/10">
                    <td className="px-3 py-2 font-semibold">{r.domiciliario}</td>
                    <td className="px-3 py-2">{r.punto}</td>
                    <td className="px-3 py-2 text-right">{r.extensiones}</td>
                    <td className="px-3 py-2 text-right">{r.pedidos}</td>
                    <td className="px-3 py-2 text-right font-bold text-brand-wine">{cop(r.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-brand-brown/20 bg-brand-cream-soft/40">
                  <td className="px-3 py-2 font-bold" colSpan={4}>Total</td>
                  <td className="px-3 py-2 text-right font-bold text-brand-wine">{cop(totalGeneral)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <h2 className="mb-2 font-serif text-lg font-bold text-brand-wine">Detalle por extensión</h2>
          <div className="overflow-x-auto rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-brand-cream-soft/60 text-left text-[11px] uppercase tracking-wide text-brand-brown/70">
                <tr>
                  <th className="px-3 py-2">Día</th>
                  <th className="px-3 py-2">Punto</th>
                  <th className="px-3 py-2">Domiciliario</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id} className="border-t border-brand-brown/10">
                    <td className="whitespace-nowrap px-3 py-2">{s.dia}</td>
                    <td className="px-3 py-2">{s.punto_nombre ?? s.punto_id}</td>
                    <td className="px-3 py-2 font-semibold">{s.domiciliario}</td>
                    <td className="px-3 py-2">
                      <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLOR_ESTADO[s.estado]}`}>
                        {ETIQUETA_ESTADO[s.estado]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{cop(Number(s.valor) || 0)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setVerPedidos(s)} className="font-semibold text-brand-wine underline">
                        {s.pedidos}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {verPedidos && <PedidosExtensionModal solicitud={verPedidos} onCerrar={() => setVerPedidos(null)} />}
    </div>
  );
}

function Valores() {
  const [valores, setValores] = useState<ValorExtensionPunto[] | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    valoresExtension()
      .then((v) => {
        setValores(v);
        setEdit(Object.fromEntries(v.map((x) => [x.punto_id, String(Number(x.valor) || 0)])));
      })
      .catch((e) => setMensaje(e instanceof Error ? e.message : "No se pudieron cargar los valores"));
  }, []);

  async function guardar(puntoId: string) {
    const v = Number(edit[puntoId]);
    if (!Number.isFinite(v) || v < 0) return;
    setGuardando(puntoId);
    try {
      await guardarValorExtension(puntoId, v);
      setMensaje("Valor guardado. Aplica a las extensiones que se aprueben desde ahora.");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(null);
    }
  }

  if (valores === null) return <p className="text-sm text-brand-brown/60">{mensaje ?? "Cargando…"}</p>;

  return (
    <div className="max-w-xl">
      <p className="mb-3 text-sm text-brand-brown/70">
        Valor fijo que se paga por cada extensión aprobada, según el punto de venta.
      </p>
      {mensaje && <p className="mb-3 rounded-xl border border-brand-brown/10 bg-brand-cream-soft/60 px-4 py-2 text-sm">{mensaje}</p>}
      <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        {valores.map((v) => (
          <div key={v.punto_id} className="flex items-center gap-3 border-t border-brand-brown/10 px-4 py-3 first:border-t-0">
            <span className="flex-1 text-sm font-medium">{v.nombre}</span>
            <span className="text-sm text-brand-brown/60">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={edit[v.punto_id] ?? ""}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setEdit((prev) => ({ ...prev, [v.punto_id]: val }));
              }}
              className="w-32 rounded-lg border border-brand-brown/20 px-2 py-1.5 text-right text-sm outline-none focus:border-brand-amber"
            />
            <button
              onClick={() => guardar(v.punto_id)}
              disabled={guardando === v.punto_id}
              className="rounded-lg bg-brand-wine px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
