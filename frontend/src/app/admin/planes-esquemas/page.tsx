"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { colorEstado } from "@/lib/despacho";
import { actualizarPuntoVenta } from "@/lib/puntos-venta";
import {
  generarPlanes,
  obtenerEsquemas,
  obtenerGeneracion,
  obtenerGeneraciones,
  obtenerPlanes,
  type EsquemaPunto,
  type GeneracionPlanes,
  type OrdenPlan,
  type ResultadoPlan,
  type PlanDrivin,
} from "@/lib/planes";

type Pestana = "planes" | "esquemas";

function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function mensajeError(e: unknown, porDefecto: string): string {
  return e instanceof ApiError || e instanceof Error ? e.message || porDefecto : porDefecto;
}

const ESTADO_PLAN: Record<string, { texto: string; clase: string }> = {
  started: { texto: "Iniciado", clase: "bg-sky-100 text-sky-700" },
  finished: { texto: "Finalizado", clase: "bg-emerald-100 text-emerald-700" },
  completed: { texto: "Finalizado", clase: "bg-emerald-100 text-emerald-700" },
  planned: { texto: "Planificado", clase: "bg-violet-100 text-violet-700" },
  pending: { texto: "Pendiente", clase: "bg-amber-100 text-amber-700" },
  draft: { texto: "Borrador", clase: "bg-gray-100 text-gray-600" },
};

function EstadoPlan({ estado }: { estado: string }) {
  const e = ESTADO_PLAN[estado.trim().toLowerCase()];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${e?.clase ?? "bg-gray-100 text-gray-600"}`}>
      {e?.texto ?? (estado || "Sin estado")}
    </span>
  );
}

export default function PlanesEsquemasPage() {
  const [pestana, setPestana] = useState<Pestana>("planes");
  return (
    <div>
      <div className="mb-5">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">Planes y esquemas</h1>
        <p className="mt-1 text-sm text-brand-black">
          Esquemas de Drivin de cada punto de venta y planes (escenarios) que Drivin tiene por día.
        </p>
      </div>
      <div className="mb-4 flex items-center gap-1 rounded-xl border border-brand-brown/15 bg-white p-1 sm:w-fit">
        {([
          ["planes", "Planes"],
          ["esquemas", "Esquemas"],
        ] as const).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setPestana(valor)}
            title={`Ver ${etiqueta}`}
            className={`flex-1 rounded-lg px-5 py-2 text-sm font-semibold transition sm:flex-none ${
              pestana === valor ? "bg-brand-wine text-white" : "text-brand-brown hover:bg-brand-cream-soft"
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>
      {pestana === "planes" ? <PestanaPlanes /> : <PestanaEsquemas />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Planes                                                             */
/* ------------------------------------------------------------------ */

function PestanaPlanes() {
  const [fecha, setFecha] = useState(hoyISO);
  const [planes, setPlanes] = useState<PlanDrivin[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [soloSinAsignar, setSoloSinAsignar] = useState(false);
  const [modalGenerar, setModalGenerar] = useState(false);
  const [modalHistorial, setModalHistorial] = useState(false);
  const [recargaHistorial, setRecargaHistorial] = useState(0);

  const cargar = useCallback((dia: string, fresco: boolean) => {
    setCargando(true);
    setError(null);
    obtenerPlanes(dia, fresco)
      .then(setPlanes)
      .catch((e) => {
        setPlanes(null);
        setError(mensajeError(e, "No se pudieron consultar los planes de Drivin"));
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    let vivo = true;
    obtenerPlanes(fecha)
      .then((p) => vivo && (setPlanes(p), setError(null)))
      .catch((e) => {
        if (!vivo) return;
        setPlanes(null);
        setError(mensajeError(e, "No se pudieron consultar los planes de Drivin"));
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [fecha]);

  const q = busqueda.trim().toLowerCase();
  const coincide = useCallback(
    (o: OrdenPlan) => {
      if (soloSinAsignar && o.vehiculo) return false;
      if (!q) return true;
      return [o.codigo, o.cliente, o.codigoCliente, o.direccion, o.barrio, o.domiciliario ?? "", o.vehiculo ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    },
    [q, soloSinAsignar],
  );

  const visibles = useMemo(
    () =>
      (planes ?? [])
        .map((p) => ({ ...p, filtradas: p.ordenes.filter(coincide) }))
        .filter((p) => (!q && !soloSinAsignar) || p.filtradas.length > 0),
    [planes, coincide, q, soloSinAsignar],
  );

  const totales = useMemo(() => {
    const ordenes = (planes ?? []).flatMap((p) => p.ordenes);
    return {
      planes: planes?.length ?? 0,
      ordenes: ordenes.length,
      asignadas: ordenes.filter((o) => o.vehiculo).length,
      sinAsignar: ordenes.filter((o) => !o.vehiculo).length,
      domiciliarios: new Set(ordenes.map((o) => o.vehiculo).filter(Boolean)).size,
    };
  }, [planes]);

  const filtrando = !!q || soloSinAsignar;
  function alternar(codigo: string) {
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(codigo)) n.delete(codigo);
      else n.add(codigo);
      return n;
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={fecha}
          onChange={(e) => {
            if (!e.target.value) return;
            setCargando(true);
            setAbiertos(new Set());
            setFecha(e.target.value);
          }}
          title="Día de los planes"
          className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm text-brand-black outline-none focus:border-brand-amber"
        />
        {fecha !== hoyISO() && (
          <button
            onClick={() => {
              setCargando(true);
              setFecha(hoyISO());
            }}
            className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft"
          >
            Hoy
          </button>
        )}
        <div className="relative min-w-[240px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-black">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar comanda, cliente, dirección o domiciliario"
            className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-3 text-sm text-brand-black outline-none focus:border-brand-amber"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm text-brand-black">
          <input
            type="checkbox"
            checked={soloSinAsignar}
            onChange={(e) => setSoloSinAsignar(e.target.checked)}
            className="accent-brand-wine"
          />
          Solo sin domiciliario
        </label>
        <button
          onClick={() => cargar(fecha, true)}
          disabled={cargando}
          title="Consultar de nuevo a Drivin"
          className="inline-flex items-center gap-2 rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Actualizar
        </button>
        <button
          onClick={() => setModalGenerar(true)}
          title="Crear en Drivin los planes que falten de un día"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008Z" />
          </svg>
          Generar planes
        </button>
      </div>

      <UltimaGeneracion recarga={recargaHistorial} onVerHistorial={() => setModalHistorial(true)} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([
          ["Planes", totales.planes, "text-brand-wine"],
          ["Órdenes", totales.ordenes, "text-brand-black"],
          ["Con domiciliario", totales.asignadas, "text-emerald-700"],
          ["Sin domiciliario", totales.sinAsignar, totales.sinAsignar ? "text-amber-600" : "text-brand-black"],
          ["Domiciliarios", totales.domiciliarios, "text-sky-700"],
        ] as const).map(([etiqueta, valor, color]) => (
          <div key={etiqueta} className="rounded-2xl border border-brand-brown/10 bg-white px-4 py-3">
            <p className="text-xs font-medium text-brand-black/60">{etiqueta}</p>
            <p className={`text-2xl font-bold ${color}`}>{cargando && !planes ? "…" : valor.toLocaleString("es-CO")}</p>
          </div>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {cargando && !planes ? (
        <p className="text-sm text-brand-black">Consultando Drivin…</p>
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-brand-brown/10 bg-white px-4 py-10 text-center text-sm text-brand-black/60">
          {filtrando ? "Ninguna orden coincide con el filtro." : "Drivin no tiene planes para este día."}
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((p) => {
            const asignadas = p.ordenes.filter((o) => o.vehiculo).length;
            const sinAsignar = p.ordenes.length - asignadas;
            const porDomi = new Map<string, number>();
            for (const o of p.ordenes) {
              if (o.vehiculo) porDomi.set(o.domiciliario ?? o.vehiculo, (porDomi.get(o.domiciliario ?? o.vehiculo) ?? 0) + 1);
            }
            const clave = `${p.esquemaCodigo}|${p.descripcion}`;
            const abierto = abiertos.has(clave) || filtrando;
            return (
              <div key={clave} className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
                <button
                  onClick={() => alternar(clave)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition hover:bg-brand-cream-soft/40"
                >
                  <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-wine/10 font-mono text-sm font-bold text-brand-wine">
                    {p.esquemaCodigo || "—"}
                  </span>
                  <div className="min-w-[200px] flex-1">
                    <p className="font-semibold text-brand-black">{p.esquemaNombre || p.descripcion}</p>
                    <p className="text-xs text-brand-black/60">
                      {p.descripcion}
                      {p.puntos.length > 0 ? ` · SIGCOMPRO: ${p.puntos.join(", ")}` : " · Sin punto de SIGCOMPRO asociado"}
                    </p>
                  </div>
                  <EstadoPlan estado={p.estado} />
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-semibold text-brand-black">{p.ordenes.length} órdenes</span>
                    <span className="text-emerald-700">{asignadas} asignadas</span>
                    {sinAsignar > 0 && <span className="font-semibold text-amber-600">{sinAsignar} sin domiciliario</span>}
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 text-brand-black transition ${abierto ? "rotate-180" : ""}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {abierto && (
                  <div className="border-t border-brand-brown/10">
                    {p.error && (
                      <p className="bg-red-50 px-4 py-2 text-xs text-red-700">No se pudieron leer las órdenes: {p.error}</p>
                    )}
                    {porDomi.size > 0 && (
                      <div className="flex flex-wrap gap-1.5 px-4 py-2.5">
                        {[...porDomi.entries()]
                          .sort((a, b) => b[1] - a[1])
                          .map(([nombre, n]) => (
                            <span key={nombre} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-800">
                              {nombre} · {n}
                            </span>
                          ))}
                      </div>
                    )}
                    {p.filtradas.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-brand-black/60">Este plan no tiene órdenes.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-left text-sm">
                          <thead className="bg-brand-cream-soft text-[11px] uppercase tracking-wide text-brand-black">
                            <tr>
                              <th className="px-4 py-2 font-semibold">Comanda</th>
                              <th className="px-4 py-2 font-semibold">Cliente</th>
                              <th className="px-4 py-2 font-semibold">Dirección</th>
                              <th className="px-4 py-2 font-semibold">Domiciliario</th>
                              <th className="px-4 py-2 text-center font-semibold">Viaje</th>
                              <th className="px-4 py-2 text-center font-semibold">Prioridad</th>
                              <th className="px-4 py-2 font-semibold">Estado en SIGCOMPRO</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-brown/5">
                            {p.filtradas.map((o) => (
                              <tr key={o.codigo} className="hover:bg-brand-cream-soft/30">
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span className="font-semibold text-brand-wine">{o.codigo}</span>
                                  {o.replica && (
                                    <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                                      Réplica {o.replica}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2">
                                  <p className="text-brand-black">{o.cliente}</p>
                                  <p className="text-[11px] text-brand-black/50">{o.codigoCliente}</p>
                                </td>
                                <td className="px-4 py-2">
                                  <p className="text-brand-black">{o.direccion}</p>
                                  <p className="text-[11px] text-brand-black/50">{[o.barrio, o.ciudad].filter(Boolean).join(", ")}</p>
                                </td>
                                <td className="px-4 py-2">
                                  {o.vehiculo ? (
                                    <>
                                      <p className="text-brand-black">{o.domiciliario}</p>
                                      <p className="text-[11px] text-brand-black/50">{o.vehiculo}</p>
                                    </>
                                  ) : (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                      Sin domiciliario
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-center text-brand-black">{o.viaje ?? "—"}</td>
                                <td className="px-4 py-2 text-center text-brand-black">{o.prioridad ?? "—"}</td>
                                <td className="px-4 py-2">
                                  {o.estadoSigcompro ? (
                                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${colorEstado(o.estadoSigcompro)}`}>
                                      {o.estadoSigcompro}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-brand-black/50">No está en SIGCOMPRO</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] text-brand-black/50">
        Los planes de cada día se crean solos a las 12:01 a. m. (con reintentos a las 12:20 a. m. y 5:00 a. m.) para todos los esquemas activos. Usa «Generar planes» si alguno faltó o para crear los de otro día.
      </p>

      {modalGenerar && (
        <ModalGenerarPlanes
          onCerrar={() => setModalGenerar(false)}
          onGenerado={(g) => {
            setRecargaHistorial((n) => n + 1);
            if (g.fecha === fecha) cargar(fecha, true);
          }}
        />
      )}
      {modalHistorial && <ModalHistorial onCerrar={() => setModalHistorial(false)} />}
    </div>
  );
}

function fechaLarga(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Resumen de la última generación de planes (automática o manual). */
function UltimaGeneracion({ recarga, onVerHistorial }: { recarga: number; onVerHistorial: () => void }) {
  const [ultima, setUltima] = useState<GeneracionPlanes | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    let t: ReturnType<typeof setTimeout>;
    const cargarUltima = () =>
      obtenerGeneraciones()
        .then((l) => {
          if (!vivo) return;
          setUltima(l[0] ?? null);
          // Mientras haya una corrida en curso (p. ej. la automática), se refresca.
          if (l[0]?.estado === "en_curso") t = setTimeout(cargarUltima, 3000);
        })
        .catch(() => vivo && setUltima(null));
    cargarUltima();
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [recarga]);
  if (ultima === undefined) return null;
  const creados = ultima?.resultado.filter((r) => r.estado === "creado").length ?? 0;
  const errores = ultima?.resultado.filter((r) => r.estado === "error").length ?? 0;
  const sinAprobar = ultima?.resultado.filter((r) => r.aprobado === false).length ?? 0;
  const sinOptimizar = ultima?.resultado.filter((r) => r.optimizado === false).length ?? 0;
  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-sm ${
        errores || sinAprobar || sinOptimizar ? "border-red-200 bg-red-50 text-red-800" : "border-brand-brown/10 bg-white text-brand-black"
      }`}
    >
      {ultima?.estado === "en_curso" ? (
        <span className="flex items-center gap-2 font-semibold">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
          Generando planes del {ultima.fecha} ({ultima.origen === "automatico" ? "automática" : `manual · ${ultima.usuario ?? ""}`}) ·{" "}
          {ultima.resultado.filter((r) => r.paso === "listo").length}/{ultima.resultado.length} esquemas
        </span>
      ) : ultima ? (
        <>
          <span className="font-semibold">
            Última generación ({ultima.origen === "automatico" ? "automática" : `manual · ${ultima.usuario ?? ""}`}):
          </span>
          <span>
            planes del {ultima.fecha} · {creados} creados ·{" "}
            {ultima.resultado.length - creados - errores} ya existían
            {errores ? ` · ${errores} con error` : ""}
            {sinAprobar ? ` · ${sinAprobar} sin aprobar` : ""}
            {sinOptimizar ? ` · ${sinOptimizar} sin optimizar` : ""}
          </span>
          <span className="text-xs opacity-70">{new Date(ultima.creadoEn).toLocaleString("es-CO")}</span>
        </>
      ) : (
        <span className="text-brand-black/60">Aún no se han generado planes desde SIGCOMPRO.</span>
      )}
      <button onClick={onVerHistorial} className="ml-auto text-xs font-semibold text-brand-wine hover:underline">
        Ver historial
      </button>
    </div>
  );
}

type EstadoPaso = "espera" | "proceso" | "ok" | "error" | "omitido";

/** Estado de cada paso (crear, optimizar, aprobar) de un esquema. */
function pasosDe(r: ResultadoPlan): { crear: EstadoPaso; aprobar: EstadoPaso; optimizar: EstadoPaso } {
  const paso = r.paso ?? (r.estado === "pendiente" ? "pendiente" : "listo");
  const crear: EstadoPaso =
    paso === "creando"
      ? "proceso"
      : r.estado === "creado"
        ? "ok"
        : r.estado === "existente"
          ? "omitido"
          : r.estado === "error"
            ? "error"
            : "espera";
  const aprobar: EstadoPaso =
    paso === "aprobando"
      ? "proceso"
      : r.aprobado === true
        ? "ok"
        : r.aprobado === false
          ? "error"
          : paso === "listo" || r.estado === "error"
            ? "omitido"
            : "espera";
  const optimizar: EstadoPaso =
    paso === "optimizando"
      ? "proceso"
      : r.optimizado === true
        ? "ok"
        : r.optimizado === false
          ? "error"
          : paso === "listo" || r.estado === "error"
            ? "omitido"
            : "espera";
  return { crear, aprobar, optimizar };
}

/** Indicador de un paso: en espera, girando, listo, error u omitido. */
function Paso({ estado, etiqueta, omitidoTexto = "—" }: { estado: EstadoPaso; etiqueta: string; omitidoTexto?: string }) {
  const base = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold";
  if (estado === "proceso") {
    return (
      <span className={`${base} bg-sky-100 text-sky-700`}>
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
        {etiqueta}…
      </span>
    );
  }
  if (estado === "ok") {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-700`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        {etiqueta}
      </span>
    );
  }
  if (estado === "error") {
    return (
      <span className={`${base} bg-red-100 text-red-700`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
        {etiqueta}
      </span>
    );
  }
  if (estado === "omitido") return <span className={`${base} bg-gray-100 text-gray-500`}>{omitidoTexto}</span>;
  return <span className={`${base} border border-dashed border-gray-300 text-gray-400`}>{etiqueta}</span>;
}

/** Tabla con el avance / resultado por esquema de una generación. */
function TablaResultado({ g }: { g: GeneracionPlanes }) {
  if (g.resultado.length === 0) {
    return <p className="text-sm text-brand-black/60">No hay puntos de venta con Drivin activo.</p>;
  }
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-[11px] uppercase tracking-wide text-brand-black/60">
        <tr>
          <th className="py-1.5 pr-3 font-semibold">Esquema</th>
          <th className="py-1.5 pr-2 font-semibold">Crear</th>
          <th className="py-1.5 pr-2 font-semibold">Optimizar</th>
          <th className="py-1.5 pr-2 font-semibold">Aprobar</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-brand-brown/5">
        {g.resultado.map((r) => {
          const p = pasosDe(r);
          const activo = r.paso === "creando" || r.paso === "aprobando" || r.paso === "optimizando";
          const detalle = [r.estado === "error" ? r.mensaje : null, r.errorAprobacion, r.errorOptimizacion]
            .filter(Boolean)
            .join(" · ");
          return (
            <tr key={r.esquemaCodigo} className={activo ? "bg-sky-50/60" : ""}>
              <td className="py-2 pr-3 align-top">
                <span className="font-mono font-semibold text-brand-wine">{r.esquemaCodigo}</span>{" "}
                <span className="text-xs text-brand-black">{r.puntos.join(", ")}</span>
                {r.estado !== "error" && r.mensaje && r.estado !== "pendiente" && (
                  <p className="text-[11px] text-brand-black/50">{r.mensaje}</p>
                )}
                {detalle && (
                  <p className="mt-0.5 text-[11px] text-red-700">
                    {detalle}
                    {(r.errorAprobacion || r.errorOptimizacion) && " · Se reintenta en la siguiente generación."}
                  </p>
                )}
              </td>
              <td className="py-2 pr-2 align-top">
                <Paso estado={p.crear} etiqueta="Creado" omitidoTexto={r.estado === "existente" ? "Ya existía" : "—"} />
              </td>
              <td className="py-2 pr-2 align-top">
                <Paso estado={p.optimizar} etiqueta="Optimizado" />
                {r.paso === "optimizando" && r.estadoDrivin && (
                  <p className="mt-0.5 text-[10px] text-sky-700">Drivin: {r.estadoDrivin}</p>
                )}
              </td>
              <td className="py-2 pr-2 align-top">
                <Paso estado={p.aprobar} etiqueta="Aprobado" />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Generación manual: elegir el día (calendario), iniciar y ver EN VIVO cómo se
 * crea, aprueba y optimiza cada plan (consulta el avance cada segundo).
 */
function ModalGenerarPlanes({
  onCerrar,
  onGenerado,
}: {
  onCerrar: () => void;
  onGenerado: (g: GeneracionPlanes) => void;
}) {
  const hoy = hoyISO();
  const [dia, setDia] = useState(hoy);
  const [iniciando, setIniciando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idCorrida, setIdCorrida] = useState<string | null>(null);
  const [avance, setAvance] = useState<GeneracionPlanes | null>(null);
  const [inicio, setInicio] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const enCurso = !!idCorrida && (!avance || avance.estado === "en_curso");

  // Consulta el avance cada segundo mientras la corrida está en curso.
  useEffect(() => {
    if (!idCorrida) return;
    let vivo = true;
    let t: ReturnType<typeof setTimeout>;
    const consultar = async () => {
      try {
        const g = await obtenerGeneracion(idCorrida);
        if (!vivo) return;
        setAvance(g);
        if (g.estado && g.estado !== "en_curso") {
          onGenerado(g);
          return;
        }
      } catch {
        /* reintenta en el siguiente ciclo */
      }
      if (vivo) t = setTimeout(consultar, 1000);
    };
    consultar();
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // onGenerado se usa solo al terminar; no debe reiniciar la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCorrida]);

  // Reloj del tiempo transcurrido.
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [enCurso]);

  async function generar() {
    if (!dia || dia < hoy) {
      setError("Elige hoy o un día posterior.");
      return;
    }
    setIniciando(true);
    setError(null);
    try {
      const { id } = await generarPlanes(dia);
      setInicio(Date.now());
      setAhora(Date.now());
      setIdCorrida(id);
    } catch (e) {
      setError(mensajeError(e, "No se pudieron generar los planes"));
    } finally {
      setIniciando(false);
    }
  }

  const total = avance?.resultado.length ?? 0;
  const listos = avance?.resultado.filter((r) => r.paso === "listo").length ?? 0;
  const actual = avance?.resultado.find(
    (r) => r.paso === "creando" || r.paso === "aprobando" || r.paso === "optimizando",
  );
  const pct = total ? Math.round((listos / total) * 100) : 0;
  const segundos = inicio ? Math.max(0, Math.round((ahora - inicio) / 1000)) : 0;
  const creados = avance?.resultado.filter((r) => r.estado === "creado").length ?? 0;
  const existentes = avance?.resultado.filter((r) => r.estado === "existente").length ?? 0;
  const conError = avance?.resultado.filter((r) => r.estado === "error" || r.aprobado === false || r.optimizado === false).length ?? 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-brand-wine">Generar planes en Drivin</h2>
            {idCorrida && (
              <p className="text-xs capitalize text-brand-black/60">{fechaLarga(avance?.fecha ?? dia)}</p>
            )}
          </div>
          <button
            onClick={onCerrar}
            disabled={iniciando}
            className="rounded-lg p-1.5 text-brand-black hover:bg-brand-cream-soft disabled:opacity-40"
            aria-label="Cerrar"
            title={enCurso ? "Cerrar (la generación sigue en el servidor)" : "Cerrar"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!idCorrida ? (
            <>
              <p className="text-sm text-brand-black">
                Se crea, se optimiza y se aprueba un plan por cada esquema activo (puntos con Drivin activo). Los que ya existan ese día no se tocan, así que no se duplican.
              </p>
              <div>
                <label className="mb-1 block text-sm font-semibold text-brand-brown">Día</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={dia}
                    min={hoy}
                    max={sumarDias(hoy, 30)}
                    onChange={(e) => {
                      setDia(e.target.value);
                      setError(null);
                    }}
                    className="rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm text-brand-black outline-none focus:border-brand-wine"
                  />
                  {([
                    ["Hoy", hoy],
                    ["Mañana", sumarDias(hoy, 1)],
                  ] as const).map(([etiqueta, valor]) => (
                    <button
                      key={etiqueta}
                      type="button"
                      onClick={() => setDia(valor)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        dia === valor
                          ? "border-brand-wine bg-brand-wine/5 text-brand-wine ring-1 ring-brand-wine"
                          : "border-brand-brown/20 text-brand-brown hover:bg-brand-cream-soft"
                      }`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
                {dia && <p className="mt-1.5 text-xs capitalize text-brand-black/60">{fechaLarga(dia)}</p>}
              </div>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </>
          ) : (
            <>
              {/* Barra de progreso y paso actual */}
              <div className="rounded-xl border border-brand-brown/10 bg-brand-cream-soft/40 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-semibold text-brand-black">
                    {enCurso ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
                    ) : avance?.estado === "terminado" && conError === 0 ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4 text-emerald-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 text-amber-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                      </svg>
                    )}
                    {enCurso
                      ? actual
                        ? `${
                            actual.paso === "creando"
                              ? "Creando"
                              : actual.paso === "optimizando"
                                ? `Optimizando${actual.estadoDrivin ? ` (Drivin: ${actual.estadoDrivin})` : ""}`
                                : "Aprobando"
                          } el plan ${actual.esquemaCodigo} (${actual.puntos.join(", ")})…`
                        : "Consultando esquemas y planes en Drivin…"
                      : avance?.estado === "terminado"
                        ? conError
                          ? "Terminó con pendientes"
                          : "¡Listo! Todos los planes quedaron al día"
                        : avance?.estado === "interrumpida"
                          ? "La generación se interrumpió"
                          : "La generación terminó con un error"}
                  </span>
                  <span className="text-xs text-brand-black/60">
                    {listos}/{total} esquemas · {segundos}s
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      !enCurso && conError ? "bg-amber-500" : !enCurso ? "bg-emerald-500" : "bg-brand-amber"
                    }`}
                    style={{ width: `${enCurso ? Math.max(pct, 4) : 100}%` }}
                  />
                </div>
                {!enCurso && avance && (
                  <p className="mt-2 text-xs text-brand-black">
                    {creados} creados · {existentes} ya existían
                    {conError ? <span className="font-semibold text-red-600"> · {conError} con algún paso pendiente</span> : null}
                  </p>
                )}
                {avance?.error && <p className="mt-2 text-xs text-red-700">{avance.error}</p>}
              </div>
              {avance ? (
                <TablaResultado g={avance} />
              ) : (
                <p className="text-sm text-brand-black/60">Iniciando…</p>
              )}
              {enCurso && (
                <p className="text-[11px] text-brand-black/50">
                  Puedes cerrar esta ventana: la generación sigue en el servidor y su resultado queda en el historial.
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-brand-brown/10 px-5 py-4">
          {!idCorrida ? (
            <>
              <button onClick={onCerrar} disabled={iniciando} className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={generar} disabled={iniciando || !dia} className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90 disabled:opacity-60">
                {iniciando ? "Iniciando…" : "Generar planes"}
              </button>
            </>
          ) : (
            <button
              onClick={onCerrar}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                enCurso ? "border border-brand-brown/15 text-brand-brown hover:bg-brand-cream-soft" : "bg-brand-wine text-white hover:bg-brand-wine/90"
              }`}
            >
              {enCurso ? "Cerrar (sigue en segundo plano)" : "Entendido"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Historial de generaciones (automáticas y manuales). */
function ModalHistorial({ onCerrar }: { onCerrar: () => void }) {
  const [lista, setLista] = useState<GeneracionPlanes[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  useEffect(() => {
    obtenerGeneraciones()
      .then(setLista)
      .catch((e) => setError(mensajeError(e, "No se pudo cargar el historial")));
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/50 p-4" onClick={onCerrar}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-brand-brown/10 px-5 py-4">
          <h2 className="font-serif text-lg font-bold text-brand-wine">Historial de generación de planes</h2>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-brand-black hover:bg-brand-cream-soft" aria-label="Cerrar" title="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : !lista ? (
            <p className="text-sm text-brand-black">Cargando…</p>
          ) : lista.length === 0 ? (
            <p className="py-6 text-center text-sm text-brand-black/60">Aún no hay generaciones registradas.</p>
          ) : (
            <ul className="divide-y divide-brand-brown/10">
              {lista.map((g) => {
                const creados = g.resultado.filter((r) => r.estado === "creado").length;
                const errores = g.resultado.filter((r) => r.estado === "error").length;
                const sinAprobar = g.resultado.filter((r) => r.aprobado === false).length;
                const sinOptimizar = g.resultado.filter((r) => r.optimizado === false).length;
                return (
                  <li key={g.id} className="py-2.5">
                    <button onClick={() => setAbierto(abierto === g.id ? null : g.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left text-sm">
                      <span className="font-semibold text-brand-black">Planes del {g.fecha}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.origen === "automatico" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                        {g.origen === "automatico" ? "Automático" : `Manual · ${g.usuario ?? ""}`}
                      </span>
                      <span className="text-xs text-brand-black/70">
                        {creados} creados · {g.resultado.length - creados - errores} ya existían
                        {errores ? <span className="font-semibold text-red-600"> · {errores} con error</span> : null}
                        {sinAprobar ? <span className="font-semibold text-amber-600"> · {sinAprobar} sin aprobar</span> : null}
                        {sinOptimizar ? <span className="font-semibold text-amber-600"> · {sinOptimizar} sin optimizar</span> : null}
                      </span>
                      <span className="ml-auto text-xs text-brand-black/50">{new Date(g.creadoEn).toLocaleString("es-CO")}</span>
                    </button>
                    {abierto === g.id && (
                      <div className="mt-2 rounded-lg bg-brand-cream-soft/40 px-3 py-2">
                        <TablaResultado g={g} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Esquemas                                                           */
/* ------------------------------------------------------------------ */

type Borrador = { drivin: boolean; esquema: string; localidad: string };

function PestanaEsquemas() {
  const [esquemas, setEsquemas] = useState<EsquemaPunto[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; msg: string } | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    obtenerEsquemas()
      .then((e) => vivo && (setEsquemas(e), setError(null)))
      .catch((e) => vivo && setError(mensajeError(e, "No se pudieron cargar los esquemas")))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [recarga]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  function base(e: EsquemaPunto): Borrador {
    return { drivin: e.drivin, esquema: e.esquemaConfigurado ?? "", localidad: e.localidadConfigurada ?? "" };
  }
  function cambiar(e: EsquemaPunto, cambios: Partial<Borrador>) {
    setBorradores((prev) => ({ ...prev, [e.puntoId]: { ...(prev[e.puntoId] ?? base(e)), ...cambios } }));
  }
  function modificado(e: EsquemaPunto): boolean {
    const b = borradores[e.puntoId];
    if (!b) return false;
    const o = base(e);
    return b.drivin !== o.drivin || b.esquema.trim() !== o.esquema || b.localidad.trim() !== o.localidad;
  }

  async function guardar(e: EsquemaPunto) {
    const b = borradores[e.puntoId];
    if (!b) return;
    if (b.esquema.trim() && !/^[\w-]{1,20}$/.test(b.esquema.trim())) {
      setAviso({ tipo: "error", msg: "El código de esquema solo admite letras, números y guiones." });
      return;
    }
    setGuardando(e.puntoId);
    try {
      await actualizarPuntoVenta(e.puntoId, {
        drivin: b.drivin,
        drivin_schema_code: b.esquema.trim(),
        drivin_localidad: b.localidad.trim(),
      });
      setBorradores((prev) => {
        const n = { ...prev };
        delete n[e.puntoId];
        return n;
      });
      setAviso({ tipo: "ok", msg: `Esquema de ${e.puntoNombre} guardado.` });
      setCargando(true);
      setRecarga((n) => n + 1);
    } catch (err) {
      setAviso({ tipo: "error", msg: mensajeError(err, "No se pudo guardar") });
    } finally {
      setGuardando(null);
    }
  }

  const sinPlan = (esquemas ?? []).filter((e) => e.activo && e.drivin && e.planHoy === false).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-brand-black/70">
          Si el esquema o la localidad se dejan vacíos, se usa el valor automático por número de punto (se muestra en gris).
        </p>
        <button
          onClick={() => {
            setCargando(true);
            setRecarga((n) => n + 1);
          }}
          title="Recargar"
          className="inline-flex items-center gap-2 rounded-xl border border-brand-brown/15 bg-white px-3 py-2 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Recargar
        </button>
      </div>

      {sinPlan > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {sinPlan} punto{sinPlan === 1 ? "" : "s"} con Drivin activo no tiene{sinPlan === 1 ? "" : "n"} plan hoy en Drivin: sus pedidos no podrán subirse hasta que exista el plan de su esquema.
        </div>
      )}
      {error && <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {cargando && !esquemas ? (
        <p className="text-sm text-brand-black">Cargando…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-brown/10 bg-white">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-brand-cream-soft text-xs uppercase tracking-wide text-brand-black">
              <tr>
                <th className="px-4 py-3 font-semibold">Punto de venta</th>
                <th className="px-4 py-3 text-center font-semibold">Drivin</th>
                <th className="px-4 py-3 font-semibold">Esquema</th>
                <th className="px-4 py-3 font-semibold">Localidad (flota)</th>
                <th className="px-4 py-3 font-semibold">Nombre en Drivin</th>
                <th className="px-4 py-3 text-center font-semibold">Plan hoy</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/5">
              {(esquemas ?? []).map((e) => {
                const b = borradores[e.puntoId] ?? base(e);
                const cambio = modificado(e);
                return (
                  <tr key={e.puntoId} className={`hover:bg-brand-cream-soft/30 ${e.activo ? "" : "opacity-50"}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-black">{e.puntoNombre}</p>
                      <p className="text-[11px] text-brand-black/50">
                        {e.puntoCodigo || "Sin código"}
                        {!e.activo && " · Inactivo"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={b.drivin}
                        onClick={() => cambiar(e, { drivin: !b.drivin })}
                        title={b.drivin ? "Sube pedidos a Drivin. Clic para pasar a flujo manual." : "Flujo manual. Clic para integrar con Drivin."}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${b.drivin ? "bg-emerald-500" : "bg-brand-brown/25"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${b.drivin ? "translate-x-4" : "translate-x-1"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={b.esquema}
                        onChange={(ev) => cambiar(e, { esquema: ev.target.value })}
                        placeholder={e.esquemaEfectivo}
                        title="Código del esquema de Drivin (vacío = automático)"
                        className="w-24 rounded-lg border border-brand-brown/20 bg-white px-2 py-1.5 font-mono text-sm text-brand-black outline-none placeholder:text-brand-black/30 focus:border-brand-amber"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={b.localidad}
                        onChange={(ev) => cambiar(e, { localidad: ev.target.value })}
                        placeholder={e.localidadEfectiva}
                        title='Localidad de la flota "Domiciliarios PDV <localidad>" (vacío = automático)'
                        className="w-40 rounded-lg border border-brand-brown/20 bg-white px-2 py-1.5 text-sm text-brand-black outline-none placeholder:text-brand-black/30 focus:border-brand-amber"
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-black">{e.esquemaNombreDrivin ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      {e.planHoy === null ? (
                        <span className="text-[11px] text-brand-black/50" title="No se pudo consultar Drivin">
                          —
                        </span>
                      ) : e.planHoy ? (
                        <EstadoPlan estado={e.estadoPlanHoy ?? ""} />
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.drivin ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                          Sin plan
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {cambio ? (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() =>
                              setBorradores((prev) => {
                                const n = { ...prev };
                                delete n[e.puntoId];
                                return n;
                              })
                            }
                            className="rounded-lg border border-brand-brown/20 px-2.5 py-1.5 text-xs font-semibold text-brand-brown hover:bg-brand-cream-soft"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => guardar(e)}
                            disabled={guardando === e.puntoId}
                            className="rounded-lg bg-brand-wine px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-wine/90 disabled:opacity-60"
                          >
                            {guardando === e.puntoId ? "Guardando…" : "Guardar"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-brand-black/40">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {aviso && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${
            aviso.tipo === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {aviso.msg}
        </div>
      )}
    </div>
  );
}
