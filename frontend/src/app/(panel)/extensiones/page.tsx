"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUsuario, tieneAccesoAdministrativo, type Usuario } from "@/lib/auth";
import { listarPuntosVenta, misPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";
import { cargarDomiciliariosDrivin, cargarEstadoPedidos } from "@/lib/pedidos";
import { calcularResumenDespacho } from "@/lib/resumen-despacho";
import { obtenerPersonalDespachoTodos } from "@/lib/configuracion";
import {
  cancelarSolicitudExtension,
  COLOR_ESTADO,
  crearSolicitudExtension,
  esRolDespacho,
  ETIQUETA_ESTADO,
  solicitudesDelPunto,
  type SolicitudExtension,
} from "@/lib/extensiones";
import PedidosExtensionModal from "@/components/PedidosExtensionModal";

interface Domiciliario {
  nombre: string;
  codigo: string;
}

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });

export default function ExtensionesPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [puntoSel, setPuntoSel] = useState("");
  const [solicitudes, setSolicitudes] = useState<SolicitudExtension[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalNueva, setModalNueva] = useState(false);
  const [verPedidos, setVerPedidos] = useState<SolicitudExtension | null>(null);

  useEffect(() => {
    const u = getUsuario();
    if (!esRolDespacho(u?.rol) && !tieneAccesoAdministrativo(u?.rol)) {
      router.replace("/");
      return;
    }
    setUsuario(u);
    (tieneAccesoAdministrativo(u?.rol) ? listarPuntosVenta() : misPuntosVenta())
      .then((ps) => {
        setPuntos(ps);
        if (ps.length > 0) setPuntoSel(String(ps[0].id));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los puntos"));
  }, [router]);

  const cargar = useCallback(async () => {
    if (!puntoSel) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setSolicitudes(await solicitudesDelPunto(puntoSel));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las solicitudes");
    } finally {
      setCargando(false);
    }
  }, [puntoSel]);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 30000);
    return () => clearInterval(id);
  }, [cargar]);

  async function cancelar(s: SolicitudExtension) {
    try {
      await cancelarSolicitudExtension(s.id);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar");
    }
  }

  if (!usuario) return null;
  const punto = puntos.find((p) => String(p.id) === puntoSel) ?? null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">Solicitud de extensión</h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Solicita extensiones de domiciliarios. Desde que se envía la solicitud, los pedidos que se
            le asignen al domiciliario hasta terminar el día cuentan en la extensión; si se rechaza,
            se descartan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {puntos.length > 1 && (
            <select
              value={puntoSel}
              onChange={(e) => setPuntoSel(e.target.value)}
              className="rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber"
            >
              {puntos.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.nombre}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setModalNueva(true)}
            disabled={!punto}
            className="rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            Nueva solicitud
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="text-sm text-brand-brown/60">Cargando…</p>
      ) : solicitudes.length === 0 ? (
        <div className="rounded-2xl border border-brand-brown/10 bg-white px-5 py-8 text-center text-sm text-brand-brown/60">
          No hay solicitudes de extensión hoy en este punto.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {solicitudes.map((s) => (
            <div key={s.id} className="rounded-2xl border border-brand-brown/10 bg-white p-4 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-brand-black">{s.domiciliario}</p>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLOR_ESTADO[s.estado]}`}>
                  {ETIQUETA_ESTADO[s.estado]}
                </span>
              </div>
              <p className="mt-1 break-words text-brand-brown/80">{s.motivo}</p>
              <p className="mt-2 text-xs text-brand-brown/60">
                Solicitó <span className="font-semibold">{s.solicitado_por_nombre ?? "—"}</span> a las {fmtHora(s.solicitado_en)}
              </p>
              {s.resuelto_en && s.resuelto_por_nombre && (
                <p className="text-xs text-brand-brown/60">
                  {s.estado === "rechazada" ? "Rechazó" : "Aprobó"}{" "}
                  <span className="font-semibold">{s.resuelto_por_nombre}</span> a las {fmtHora(s.resuelto_en)}
                </p>
              )}
              {s.motivo_rechazo && <p className="mt-1 text-xs text-red-600">Motivo: {s.motivo_rechazo}</p>}
              <div className="mt-3 flex justify-end gap-2">
                {(s.estado === "pendiente" || s.estado === "aprobada" || s.estado === "cerrada") && (
                  <button
                    onClick={() => setVerPedidos(s)}
                    className="rounded-lg border border-brand-brown/20 px-3 py-1.5 text-xs font-semibold text-brand-wine hover:bg-brand-cream-soft"
                  >
                    Ver pedidos ({s.pedidos})
                  </button>
                )}
                {s.estado === "pendiente" && (
                  <button
                    onClick={() => cancelar(s)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Cancelar solicitud
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalNueva && punto && (
        <NuevaSolicitudModal
          punto={punto}
          onCerrar={() => setModalNueva(false)}
          onCreada={() => {
            setModalNueva(false);
            cargar();
          }}
        />
      )}
      {verPedidos && <PedidosExtensionModal solicitud={verPedidos} onCerrar={() => setVerPedidos(null)} />}
    </div>
  );
}

function NuevaSolicitudModal({
  punto,
  onCerrar,
  onCreada,
}: {
  punto: PuntoVenta;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const [domiciliarios, setDomiciliarios] = useState<Domiciliario[] | null>(null);
  const [sel, setSel] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const carga: Promise<Domiciliario[]> = punto.drivin
      ? cargarDomiciliariosDrivin(punto.codigo ?? "", punto.nombre).then((ds) =>
          ds.map((d) => ({ nombre: d.nombre, codigo: d.code })),
        )
      : obtenerPersonalDespachoTodos().then((todos) =>
          (todos[String(punto.id)]?.domiciliarios ?? []).map((nombre) => ({ nombre, codigo: "" })),
        );
    carga
      .then(setDomiciliarios)
      .catch((e) => {
        setDomiciliarios([]);
        setError(e instanceof Error ? e.message : "No se pudieron cargar los domiciliarios");
      });
  }, [punto]);

  const elegido = domiciliarios?.find((d) => `${d.codigo}|${d.nombre}` === sel) ?? null;

  async function enviar() {
    if (!elegido || !motivo.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      const estado = await cargarEstadoPedidos({ rango: "hoy" });
      const snapshot = calcularResumenDespacho(
        estado.pedidos,
        estado.meta,
        new Set(estado.impresos),
        String(punto.id),
      );
      await crearSolicitudExtension({
        puntoId: String(punto.id),
        domiciliario: elegido.nombre,
        domiciliarioCodigo: elegido.codigo,
        motivo: motivo.trim(),
        snapshot,
      });
      onCreada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la solicitud");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-brand-wine">Nueva solicitud de extensión</h3>
            <p className="text-xs text-brand-black">{punto.nombre}</p>
          </div>
          <button onClick={onCerrar} title="Cerrar" className="rounded-lg p-1.5 text-brand-black hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-brand-black">Domiciliario a extender</label>
            <select
              value={sel}
              onChange={(e) => setSel(e.target.value)}
              disabled={domiciliarios === null}
              className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber"
            >
              <option value="">{domiciliarios === null ? "Cargando…" : "Selecciona un domiciliario"}</option>
              {(domiciliarios ?? []).map((d) => (
                <option key={`${d.codigo}|${d.nombre}`} value={`${d.codigo}|${d.nombre}`}>{d.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-brand-black">Motivo de la extensión</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Ej. Alta demanda de pedidos en la tarde"
              className="w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex gap-3 border-t border-brand-brown/10 px-5 py-4">
          <button
            onClick={onCerrar}
            className="flex-1 rounded-xl border border-brand-brown/20 py-2.5 text-sm font-semibold text-brand-black hover:bg-brand-cream-soft"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={!elegido || !motivo.trim() || enviando}
            className="flex-1 rounded-xl bg-brand-amber py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}
