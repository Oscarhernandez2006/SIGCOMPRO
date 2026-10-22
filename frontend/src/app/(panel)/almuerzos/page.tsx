"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUsuario, tieneAccesoAdministrativo } from "@/lib/auth";
import { puedeVerModulo } from "@/lib/permisos";
import { listarPuntosVenta, misPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";
import {
  almuerzosDelPunto,
  aprobarAlmuerzo,
  COLOR_ALMUERZO,
  ETIQUETA_ALMUERZO,
  rechazarAlmuerzo,
  reprogramarAlmuerzo,
  type SolicitudAlmuerzo,
} from "@/lib/almuerzos";

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });

/** HH:MM (Bogotá) de un instante. */
function horaBogota(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  });
}

function sumarHora(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function AlmuerzosPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [puntoSel, setPuntoSel] = useState("");
  const [solicitudes, setSolicitudes] = useState<SolicitudAlmuerzo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [reprogramar, setReprogramar] = useState<SolicitudAlmuerzo | null>(null);
  const [rechazar, setRechazar] = useState<SolicitudAlmuerzo | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const u = getUsuario();
    const rolPermitido = tieneAccesoAdministrativo(u?.rol) || ["despacho", "supervisor general", "supervisor_general", "administrador pdv"].includes((u?.rol ?? "").trim().toLowerCase());
    if (!rolPermitido || (!tieneAccesoAdministrativo(u?.rol) && !["supervisor general", "supervisor_general"].includes((u?.rol ?? "").trim().toLowerCase()) && !puedeVerModulo(u, "despacho") && !puedeVerModulo(u, "almuerzos"))) {
      router.replace("/");
      return;
    }
    (tieneAccesoAdministrativo(u?.rol) || ['supervisor general', 'supervisor_general'].includes((u?.rol ?? '').trim().toLowerCase()) ? listarPuntosVenta() : misPuntosVenta())
      .then((ps) => {
        setListo(true);
        setPuntos(ps);
        if (ps.length > 0) setPuntoSel(String(ps[0].id));
        else setCargando(false);
      })
      .catch((e) => {
        setListo(true);
        setError(e instanceof Error ? e.message : "No se pudieron cargar los puntos");
        setCargando(false);
      });
  }, [router]);

  const cargar = useCallback(async () => {
    if (!puntoSel) return;
    try {
      setSolicitudes(await almuerzosDelPunto(puntoSel));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las solicitudes");
    } finally {
      setCargando(false);
    }
  }, [puntoSel]);

  useEffect(() => {
    if (!puntoSel) return;
    const refrescar = () => void cargar();
    const inicial = setTimeout(refrescar, 0);
    const id = setInterval(refrescar, 10000);
    return () => {
      clearTimeout(inicial);
      clearInterval(id);
    };
  }, [cargar, puntoSel]);

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  async function ejecutar(id: string, accion: () => Promise<SolicitudAlmuerzo>) {
    setTrabajando(id);
    setError(null);
    try {
      const actualizada = await accion();
      setSolicitudes((prev) => prev.map((s) => (s.id === actualizada.id ? actualizada : s)));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción");
      void cargar();
      return false;
    } finally {
      setTrabajando(null);
    }
  }

  if (!listo) return null;

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente");
  const programados = solicitudes.filter((s) => s.estado === "aprobada" || s.estado === "reprogramada");
  const historial = solicitudes.filter((s) => !["pendiente", "aprobada", "reprogramada"].includes(s.estado));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">Aprobación almuerzo</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-black">
            Los domiciliarios piden su almuerzo desde Mi Variable Liquidación. Apruébalo, recházalo o
            reprográmalo: siempre dura 1 hora y se marca como terminado automáticamente.
          </p>
        </div>
        {puntos.length > 1 && (
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-black">
            Punto
            <select
              value={puntoSel}
              onChange={(e) => {
                setCargando(true);
                setSolicitudes([]);
                setPuntoSel(e.target.value);
              }}
              className="rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-brand-amber"
            >
              {puntos.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.nombre}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
        </div>
      ) : !puntoSel ? (
        <Vacio texto="No tienes puntos de venta asignados." />
      ) : (
        <div className="space-y-8">
          <Seccion titulo="Por aprobar" cantidad={pendientes.length}>
            {pendientes.length === 0 ? (
              <Vacio texto="No hay solicitudes pendientes." />
            ) : (
              pendientes.map((s) => (
                <Tarjeta key={s.id} s={s} ahora={ahora}>
                  <button
                    onClick={() => void ejecutar(s.id, () => aprobarAlmuerzo(s.id))}
                    disabled={trabajando === s.id || new Date(s.fin).getTime() <= ahora}
                    title={new Date(s.fin).getTime() <= ahora ? "La hora ya pasó: reprográmalo" : "Aprobar el almuerzo"}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() => setReprogramar(s)}
                    disabled={trabajando === s.id}
                    className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    Reprogramar
                  </button>
                  <button
                    onClick={() => setRechazar(s)}
                    disabled={trabajando === s.id}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                </Tarjeta>
              ))
            )}
          </Seccion>

          <Seccion titulo="Aprobados hoy" cantidad={programados.length}>
            {programados.length === 0 ? (
              <Vacio texto="No hay almuerzos aprobados en curso o por iniciar." />
            ) : (
              programados.map((s) => {
                const yaInicio = new Date(s.inicio).getTime() <= ahora;
                return (
                  <Tarjeta key={s.id} s={s} ahora={ahora}>
                    {!yaInicio && (
                      <button
                        onClick={() => setReprogramar(s)}
                        disabled={trabajando === s.id}
                        className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        Reprogramar
                      </button>
                    )}
                  </Tarjeta>
                );
              })
            )}
          </Seccion>

          {historial.length > 0 && (
            <Seccion titulo="Historial de hoy" cantidad={historial.length}>
              {historial.map((s) => <Tarjeta key={s.id} s={s} ahora={ahora} />)}
            </Seccion>
          )}
        </div>
      )}

      {reprogramar && (
        <ReprogramarModal
          s={reprogramar}
          onCerrar={() => setReprogramar(null)}
          onGuardar={async (hora, motivo) => {
            if (await ejecutar(reprogramar.id, () => reprogramarAlmuerzo(reprogramar.id, hora, motivo))) setReprogramar(null);
          }}
          guardando={trabajando === reprogramar.id}
        />
      )}
      {rechazar && (
        <RechazarModal
          s={rechazar}
          onCerrar={() => setRechazar(null)}
          onGuardar={async (motivo) => {
            if (await ejecutar(rechazar.id, () => rechazarAlmuerzo(rechazar.id, motivo))) setRechazar(null);
          }}
          guardando={trabajando === rechazar.id}
        />
      )}
    </div>
  );
}

function Seccion({ titulo, cantidad, children }: { titulo: string; cantidad: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-bold text-brand-wine">
        {titulo}
        <span className="rounded-full bg-brand-wine/10 px-2 py-0.5 text-xs font-bold text-brand-wine">{cantidad}</span>
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="col-span-full rounded-2xl border border-brand-brown/10 bg-white px-5 py-6 text-center text-sm text-brand-black">
      {texto}
    </div>
  );
}

function Tarjeta({ s, ahora, children }: { s: SolicitudAlmuerzo; ahora: number; children?: React.ReactNode }) {
  const inicio = new Date(s.inicio).getTime();
  const fin = new Date(s.fin).getTime();
  const enCurso = (s.estado === "aprobada" || s.estado === "reprogramada") && inicio <= ahora && ahora < fin;
  const restanteMin = Math.max(0, Math.ceil((fin - ahora) / 60000));
  const reprogramado = s.estado === "reprogramada" && horaBogota(s.inicio) !== s.hora_solicitada;
  return (
    <div className="flex flex-col rounded-2xl border border-brand-brown/10 bg-white p-4 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-brand-black">{s.domiciliario}</p>
          <p className="text-xs text-brand-black">C.C. {s.documento}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            s.disponible_en ? "border-emerald-200 bg-emerald-50 text-emerald-700" : enCurso ? "border-orange-200 bg-orange-50 text-orange-700" : COLOR_ALMUERZO[s.estado]
          }`}
        >
          {s.disponible_en ? "Disponible" : enCurso ? `En almuerzo · ${restanteMin} min` : ETIQUETA_ALMUERZO[s.estado]}
        </span>
      </div>
      <p className="mt-3 text-base font-bold text-brand-wine">
        {fmtHora(s.inicio)} – {fmtHora(s.fin)}
      </p>
      {reprogramado && (
        <p className="text-xs text-blue-700">
          Pidió {s.hora_solicitada} – {sumarHora(s.hora_solicitada)}
        </p>
      )}
      {s.nota && <p className="mt-1 break-words text-brand-black">“{s.nota}”</p>}
      {s.motivo_reprogramacion && <p className="mt-2 break-words rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">Motivo de reprogramación: {s.motivo_reprogramacion}</p>}
      {s.disponible_en && <p className="mt-2 text-xs font-semibold text-emerald-700">Disponible desde las {fmtHora(s.disponible_en)}</p>}
      <p className="mt-2 text-xs text-brand-black">Solicitó a las {fmtHora(s.solicitado_en)}</p>
      {s.resuelto_por_nombre && s.resuelto_en && (
        <p className="text-xs text-brand-black">
          {s.estado === "rechazada" ? "Rechazó" : s.estado === "reprogramada" ? "Reprogramó" : "Aprobó"}{" "}
          <b>{s.resuelto_por_nombre}</b> a las {fmtHora(s.resuelto_en)}
        </p>
      )}
      {s.motivo_rechazo && <p className="mt-1 text-xs text-red-600">Motivo: {s.motivo_rechazo}</p>}
      {children && <div className="mt-3 flex flex-wrap justify-end gap-2">{children}</div>}
    </div>
  );
}

function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-brand-black/50 p-4" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-bold text-brand-wine">{titulo}</h3>
        {children}
      </div>
    </div>
  );
}

function ReprogramarModal({
  s,
  onCerrar,
  onGuardar,
  guardando,
}: {
  s: SolicitudAlmuerzo;
  onCerrar: () => void;
  onGuardar: (hora: string, motivo: string) => void;
  guardando: boolean;
}) {
  const [hora, setHora] = useState(() => sumarHora(horaBogota(s.inicio)));
  const [motivo, setMotivo] = useState("");
  const valida = /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
  return (
    <Modal titulo="Reprogramar almuerzo" onCerrar={onCerrar}>
      <p className="mt-1 text-sm text-brand-black">
        {s.domiciliario} pidió de <b>{s.hora_solicitada}</b> a <b>{sumarHora(s.hora_solicitada)}</b>.
      </p>
      <label className="mt-4 block text-sm font-semibold text-brand-black">
        Nueva hora de inicio
        <input
          type="time"
          value={hora}
          min="06:00"
          max="21:00"
          onChange={(e) => setHora(e.target.value)}
          className="mt-1 w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-base outline-none focus:border-blue-500"
        />
      </label>
      <p className="mt-2 text-sm text-brand-black">
        Quedará de <b>{valida ? hora : "—"}</b> a <b>{valida ? sumarHora(hora) : "—"}</b> (1 hora).
      </p>
      <label className="mt-4 block text-sm font-semibold text-brand-black">
        Motivo de reprogramación
        <textarea required maxLength={300} rows={3} value={motivo} onChange={(event) => setMotivo(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-brown/20 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500" />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCerrar} className="rounded-xl border border-brand-brown/20 px-4 py-2 text-sm font-semibold text-brand-black hover:bg-brand-cream-soft">
          Cancelar
        </button>
        <button
          onClick={() => onGuardar(hora, motivo.trim())}
          disabled={!valida || !motivo.trim() || guardando}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Reprogramar"}
        </button>
      </div>
    </Modal>
  );
}

function RechazarModal({
  s,
  onCerrar,
  onGuardar,
  guardando,
}: {
  s: SolicitudAlmuerzo;
  onCerrar: () => void;
  onGuardar: (motivo: string) => void;
  guardando: boolean;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <Modal titulo="Rechazar almuerzo" onCerrar={onCerrar}>
      <p className="mt-1 text-sm text-brand-black">
        {s.domiciliario} · {s.hora_solicitada} a {sumarHora(s.hora_solicitada)}
      </p>
      <label className="mt-4 block text-sm font-semibold text-brand-black">
        Motivo (opcional, lo verá el domiciliario)
        <textarea
          value={motivo}
          maxLength={300}
          rows={3}
          onChange={(e) => setMotivo(e.target.value)}
          className="mt-1 w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm font-normal outline-none focus:border-red-400"
        />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCerrar} className="rounded-xl border border-brand-brown/20 px-4 py-2 text-sm font-semibold text-brand-black hover:bg-brand-cream-soft">
          Cancelar
        </button>
        <button
          onClick={() => onGuardar(motivo.trim())}
          disabled={guardando}
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Rechazar"}
        </button>
      </div>
    </Modal>
  );
}
