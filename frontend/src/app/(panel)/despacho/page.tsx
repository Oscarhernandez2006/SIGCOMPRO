"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { imprimirComanda, METODOS, type Pedido } from "@/app/(panel)/pedidos/page";
import { misPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";
import { getUsuario, tieneAccesoAdministrativo, puedeMultiPunto } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ModalSinPermiso, useSinPermiso } from "@/components/SinPermisoModal";
import {
  cargarEstadoPedidos,
  actualizarMetaApi,
  marcarImpresoApi,
  guardarPedidoApi,
  descargarExcelDespacho,
  enviarADrivinApi,
  type DespachoMeta,
} from "@/lib/pedidos";
import { obtenerPersonalDespachoTodos, type PersonalDespacho } from "@/lib/configuracion";
import {
  ALERTA_DESPACHO_MS,
  LIMITE_DESPACHO_MS,
  esTransferencia,
  objetivoDespacho,
  msRestantesDespacho,
} from "@/lib/despacho";

const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

/** Peso total del pedido en kilos (suma los ítems vendidos por KG). */
function pesoPedidoKg(p: Pedido): number {
  return (p.carrito ?? []).reduce((s, i) => {
    const esKilo = (i.producto?.um || "").trim().toUpperCase() === "KG";
    return s + (esKilo ? i.cantidad || 0 : 0);
  }, 0);
}

/** Clasifica el tamaño del pedido por kilos: ≤10 Pequeño, 11-20 Mediano, >20 Grande. */
function tamanoPedido(kilos: number): string {
  if (kilos <= 10) return "Pequeño";
  if (kilos <= 20) return "Mediano";
  return "Grande";
}

/** Formatea un número como moneda colombiana: 143320 => "$ 143.320". */
const fmtMoneda = (n: number) => "$ " + Math.round(n || 0).toLocaleString("es-CO");

/** Diferencia entre dos instantes ISO formateada: "5 min 12 s", "1 h 3 min". */
function fmtDuracion(inicio: string, fin: string): string {
  const ms = Math.max(0, new Date(fin).getTime() - new Date(inicio).getTime());
  const totalSeg = Math.floor(ms / 1000);
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  if (min < 1) return `${seg} s`;
  if (min < 60) return `${min} min ${seg} s`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

// La lógica de deadlines vive en lib/despacho (compartida con el Dashboard).

/** Fecha de hoy en formato YYYY-MM-DD (local). */
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
/**
 * ¿El pedido es para HOY? Incluye los ARRASTRADOS: pedidos aún activos (no
 * despachados ni anulados) que quedaron de días anteriores y nunca se
 * despacharon, para que no desaparezcan de despacho al cambiar el día.
 */
function esDeHoy(p: Pedido): boolean {
  const dia = diaEntregaISO(p);
  const hoy = hoyISO();
  if (dia === hoy) return true;
  if (dia < hoy) {
    // Quedó de un día anterior: solo se arrastra si sigue activo.
    const e = norm(p.estado);
    return !p.anulado && e !== "despachado" && e !== "anulado";
  }
  return false;
}
/** ¿El pedido es un "posterior" (programado para un día futuro)? */
function esPosteriorFuturo(p: Pedido): boolean {
  return Boolean(
    p.entregaProgramada && p.fechaProgramada && p.fechaProgramada > hoyISO(),
  );
}

/** Formatea milisegundos como cronómetro "1:59:32" (h:mm:ss) usando el valor absoluto. */
function fmtCronometro(ms: number): string {
  const totalSeg = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface EstadoDef {
  key: string;
  label: string;
  sub?: string;
  icon: ReactNode;
  /** Predicado: ¿el pedido corresponde a este estado? (para contar y filtrar). */
  match: (pedido: Pedido) => boolean;
  /** Clases del chip de icono (fondo + texto). */
  chip: string;
  /** ¿Resaltar la card como alerta? */
  alerta?: boolean;
}

/* Iconos (heroicons outline) */
const Icono = {
  reloj: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  ),
  engranaje: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </>
  ),
  caja: (
    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
  ),
  recibo: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 3.75h3M3.375 19.5V6.108c0-.668.46-1.247 1.11-1.394a48.6 48.6 0 0 1 1.123-.238m13.917 0a48.6 48.6 0 0 1 1.123.238c.65.147 1.11.726 1.11 1.394V19.5l-3-1.5-3 1.5-3-1.5-3 1.5-3-1.5-3 1.5Zm9.75-12.75h.008v.008H12V6.75Z" />
  ),
  camion: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.834 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
  ),
  xcirculo: (
    <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  ),
  alerta: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
  ),
  calendario: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
  ),
  tarjeta: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
  ),
};

const ESTADOS: EstadoDef[] = [
  {
    key: "total",
    label: "Total",
    sub: "Activos de hoy",
    icon: Icono.caja,
    match: (x) =>
      !x.anulado &&
      norm(x.estado) !== "despachado" &&
      norm(x.estado) !== "anulado",
    chip: "bg-brand-wine/10 text-brand-wine",
  },
  {
    key: "pendientes",
    label: "Pendientes",
    sub: "Sin finalizar",
    icon: Icono.reloj,
    match: (x) => !x.anulado && norm(x.estado) === "en proceso",
    chip: "bg-brand-amber/12 text-brand-amber",
  },
  {
    key: "atrasados",
    label: "Atrasados",
    sub: "No finalizados",
    icon: Icono.alerta,
    match: (x) => norm(x.estado) === "atrasado",
    chip: "bg-red-100 text-red-600",
    alerta: true,
  },
  {
    key: "liberacion",
    label: "Retenidos",
    sub: "Cartera",
    icon: Icono.tarjeta,
    match: (x) => norm(x.estado) === "liberación",
    chip: "bg-brand-gold/20 text-brand-amber",
  },
  {
    key: "posteriores",
    label: "Posteriores",
    sub: "Programados",
    icon: Icono.calendario,
    match: (x) => norm(x.estado) === "posterior",
    chip: "bg-indigo-100 text-indigo-600",
  },
  {
    key: "produccion",
    label: "En producción",
    sub: "En preparación",
    icon: Icono.engranaje,
    match: (x) => norm(x.estado) === "en producción",
    chip: "bg-orange-100 text-orange-600",
  },
  {
    key: "alistados",
    label: "Alistados",
    sub: "Listos para facturar",
    icon: Icono.caja,
    match: (x) => norm(x.estado) === "alistado",
    chip: "bg-violet-100 text-violet-600",
  },
  {
    key: "facturados",
    label: "Facturados",
    sub: "Con factura",
    icon: Icono.recibo,
    match: (x) => norm(x.estado) === "facturado",
    chip: "bg-emerald-100 text-emerald-600",
  },
  {
    key: "despachados",
    label: "Despachados",
    sub: "En ruta o entregados",
    icon: Icono.camion,
    match: (x) => norm(x.estado) === "despachado",
    chip: "bg-teal-100 text-teal-600",
  },
  {
    key: "cancelados",
    label: "Cancelados",
    sub: "Anulados",
    icon: Icono.xcirculo,
    match: (x) => x.anulado || norm(x.estado) === "anulado",
    chip: "bg-red-100 text-red-500",
  },
];

/** Estados del flujo del pedido, en orden, para el selector de administradores. */
const ESTADOS_FLUJO = [
  "En proceso",
  "En producción",
  "Alistado",
  "Facturado",
  "Despachado",
] as const;

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Fecha de entrega/despacho del pedido: la programada si el pedido se dejó para
 * otro día, o la de creación si es para hoy/sin programar.
 */
function fechaEntregaISO(p: Pedido): string {
  if (p.entregaProgramada && p.fechaProgramada) {
    return `${p.fechaProgramada}T00:00:00`;
  }
  return p.fecha;
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function tiempoEnEstado(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "MENOS DE 1 MIN EN PROCESO";
  if (min < 60) return `${min} MIN EN PROCESO`;
  const h = Math.floor(min / 60);
  return `${h} H ${min % 60} MIN EN PROCESO`;
}

export default function DespachoPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [impresos, setImpresos] = useState<Set<string>>(new Set());
  // Metadata de despacho (porcionador, etapas, liberación) por id de pedido.
  const [meta, setMeta] = useState<Record<string, DespachoMeta>>({});
  // Borrador del porcionador antes de presionar "Guardar".
  const [porcBorrador, setPorcBorrador] = useState<Record<string, string>>({});
  // Personal de despacho (porcionadores/domiciliarios) por id de punto de venta.
  // Cada pedido usa el de su propio punto (configurable en /admin/configuracion).
  const [personalPorPunto, setPersonalPorPunto] = useState<
    Record<string, PersonalDespacho>
  >({});
  // Texto del buscador (consecutivo, nombre o NIT del cliente).
  const [busqueda, setBusqueda] = useState("");
  // Id del pedido cuya ficha completa del cliente está desplegada (al hacer
  // click en el nombre): muestra referencia, correo, ciudad, NIT, etc.
  const [clienteAbierto, setClienteAbierto] = useState<string | null>(null);
  // Vista activa de la tabla: "activos" oculta despachados y cancelados;
  // "despachados"/"cancelados" muestran solo esos al pulsar su card.
  const [vista, setVista] = useState<string | null>(null);
  // Reloj que avanza cada segundo para los cronómetros de despacho.
  const [ahora, setAhora] = useState(() => Date.now());
  // Alerta de pedidos por vencer / vencidos (modal).
  const [alertaCerrada, setAlertaCerrada] = useState(false);
  // Modal de réplica: crear (elegir domiciliario) o ver detalle (solo lectura).
  const [modalReplica, setModalReplica] = useState<{
    pedido: Pedido;
    numero: number;
    modo: "crear" | "ver";
  } | null>(null);
  const firmaAlertaRef = useRef("");
  // Contenedor scrolleable de la tabla (scroll normal con la rueda/barra).
  const scrollRef = useRef<HTMLDivElement>(null);

  // Permisos granulares de despacho y modal de acción no permitida.
  const sinPermiso = useSinPermiso();
  const [usuarioDesp, setUsuarioDesp] = useState<ReturnType<typeof getUsuario>>(null);
  useEffect(() => setUsuarioDesp(getUsuario()), []);
  const permite = useMemo(
    () => ({
      estado: puedeAccion(usuarioDesp, "despacho.estado"),
      pago: puedeAccion(usuarioDesp, "despacho.pago"),
    }),
    [usuarioDesp],
  );

  // ¿El usuario puede reversar estados? (administrador / administrador app / desarrollador).
  const esAdmin = useMemo(
    () => tieneAccesoAdministrativo(usuarioDesp?.rol),
    [usuarioDesp],
  );

  // Alcance por punto: roles con selector (administrador app / desarrollador) o
  // usuarios con el permiso "pedidos.multipunto" eligen UN punto de sus
  // asignados; el resto ve la unión de sus asignados.
  const esSelector = useMemo(
    () => puedeMultiPunto(usuarioDesp),
    [usuarioDesp],
  );
  const [puntosAsignados, setPuntosAsignados] = useState<PuntoVenta[]>([]);
  const [puntoActivoId, setPuntoActivoId] = useState<string | null>(null);
  const [filtroListo, setFiltroListo] = useState(false);

  useEffect(() => {
    if (!usuarioDesp) return;
    misPuntosVenta()
      .then((ps) => {
        setPuntosAsignados(ps);
        // Roles con selector: por defecto el primer punto; se cambia en el select.
        if (puedeMultiPunto(usuarioDesp) && ps.length > 0) {
          setPuntoActivoId((prev) => prev ?? String(ps[0].id));
        }
      })
      .catch(() => setPuntosAsignados([]))
      .finally(() => setFiltroListo(true));
  }, [usuarioDesp]);

  const idsPuntos = useMemo(() => {
    if (esSelector) {
      return puntoActivoId ? new Set([puntoActivoId]) : new Set<string>();
    }
    return new Set(puntosAsignados.map((p) => String(p.id)));
  }, [esSelector, puntoActivoId, puntosAsignados]);

  useEffect(() => {
    cargarEstadoPedidos()
      .then((e) => {
        setPedidos(e.pedidos);
        setMeta(e.meta);
        setImpresos(new Set(e.impresos));
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  // Carga los selectores de porcionadores y domiciliarios por punto de venta.
  useEffect(() => {
    obtenerPersonalDespachoTodos()
      .then((mapa) => setPersonalPorPunto(mapa ?? {}))
      .catch(() => {
        /* ignore */
      });
  }, []);

  // Avanza el reloj cada segundo para refrescar los cronómetros.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /** Marca un pedido como impreso y lo persiste. */
  const marcarImpreso = (id: string) => {
    setImpresos((prev) => new Set(prev).add(id));
    marcarImpresoApi(id).catch(() => {
      /* ignore */
    });
  };

  /** Actualiza la metadata de despacho de un pedido y la persiste. */
  const actualizarMeta = (id: string, cambios: Partial<DespachoMeta>) => {
    setMeta((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }));
    actualizarMetaApi(id, cambios).catch(() => {
      /* ignore */
    });
  };

  /** Edita el método de pago de un pedido y lo persiste (se refleja en la comanda). */
  const cambiarPago = (id: string, pago: string) => {
    if (!permite.pago) {
      sinPermiso.mostrar();
      return;
    }
    const m = meta[id];
    const esTransfer = norm(pago) === "transferencia";
    // Mantiene consistente el flujo de transferencia para EVITAR facturas sin
    // confirmar el pago: al marcar transferencia (sin confirmar aún) se descarta
    // cualquier factura previa, obligando a confirmar la transferencia ANTES de
    // volver a facturar. Si el pedido ya estaba "Facturado", regresa a
    // "Alistado". Al cambiar a otro método, se descarta una confirmación de
    // transferencia que hubiera quedado obsoleta.
    const reset: Record<string, unknown> = {};
    let revertirAAlistado = false;
    if (esTransfer) {
      if (!m?.pagoConfirmado) {
        if (m?.facturaNumero) reset.facturaNumero = "";
        if (m?.facturaValor != null) reset.facturaValor = null;
        const est = norm(pedidos.find((p) => p.id === id)?.estado);
        if (est === "facturado") revertirAAlistado = true;
      }
    } else if (m?.pagoConfirmado) {
      reset.pagoConfirmado = null;
    }
    if (Object.keys(reset).length) {
      actualizarMeta(id, reset as Partial<DespachoMeta>);
    }
    setPedidos((prev) => {
      const next = prev.map((p) =>
        p.id === id
          ? {
              ...p,
              pago,
              ...(revertirAAlistado
                ? { estado: "Alistado" as Pedido["estado"] }
                : {}),
            }
          : p,
      );
      const actualizado = next.find((p) => p.id === id);
      if (actualizado) guardarPedidoApi(actualizado).catch(() => { /* ignore */ });
      return next;
    });
  };

  /** Cambia el estado de un pedido y lo persiste. */
  const cambiarEstado = (id: string, estado: Pedido["estado"]) => {
    if (!permite.estado) {
      sinPermiso.mostrar();
      return;
    }
    // Al pasar a "Despachado" se registra la hora exacta del cambio (si aún no
    // existe) y el nombre de quien lo despachó (cajera/despachadora).
    if (norm(estado) === "despachado") {
      setMeta((prev) => {
        if (prev[id]?.despachoFin) return prev;
        const despachoFin = new Date().toISOString();
        const despachadoPor = usuarioDesp?.nombre ?? "";
        actualizarMetaApi(id, { despachoFin, despachadoPor }).catch(() => { /* ignore */ });
        return { ...prev, [id]: { ...prev[id], despachoFin, despachadoPor } };
      });
    }
    setPedidos((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, estado } : p));
      const actualizado = next.find((p) => p.id === id);
      if (actualizado) guardarPedidoApi(actualizado).catch(() => { /* ignore */ });
      return next;
    });
  };

  /**
   * Reversa/cambia el estado de un pedido (solo administradores). NO reinicia
   * los tiempos (inicio/fin de alistamiento, hora de despacho ni la confirmación
   * de transferencia): al cambiar el estado se conservan tal cual para no perder
   * el registro de tiempos ya tomado.
   */
  const reversarEstado = (id: string, nuevoEstado: Pedido["estado"]) => {
    if (!permite.estado) {
      sinPermiso.mostrar();
      return;
    }
    cambiarEstado(id, nuevoEstado);
  };

  /* --- Réplicas del pedido (el mismo pedido enviado por partes) --- */
  // Agrega la siguiente réplica en secuencia (máx. 5) con su domiciliario.
  const crearReplica = (id: string, domiciliario: string) => {
    const actuales = meta[id]?.replicas ?? [];
    const max = actuales.reduce((mx, r) => Math.max(mx, r.numero), 0);
    if (max >= 5) return;
    actualizarMeta(id, {
      replicas: [...actuales, { numero: max + 1, domiciliario }],
    });
  };
  // Quita la última réplica (para mantener la secuencia).
  const quitarUltimaReplica = (id: string) => {
    const actuales = meta[id]?.replicas ?? [];
    if (actuales.length === 0) return;
    const max = actuales.reduce((mx, r) => Math.max(mx, r.numero), 0);
    actualizarMeta(id, { replicas: actuales.filter((r) => r.numero !== max) });
  };
  const descargarReplica = (p: Pedido, numero: number) => {
    descargarExcelDespacho(p.id, numero).catch(() =>
      alert("No se pudo generar el Excel de la réplica."),
    );
  };

  const pedidosVisibles = useMemo(() => {
    if (!filtroListo) return [];
    return pedidos.filter((p) => p.punto?.id != null && idsPuntos.has(String(p.punto.id)));
  }, [pedidos, filtroListo, idsPuntos]);

  // "De hoy": pedidos para hoy (programados con fecha de hoy o no programados
  // creados hoy). Los contadores y cronómetros del día se basan en estos.
  const pedidosDeHoy = useMemo(
    () => pedidosVisibles.filter(esDeHoy),
    [pedidosVisibles],
  );
  // Posteriores: programados para un día futuro Y con la comanda YA IMPRESA.
  // Un posterior SIN imprimir se queda en la vista de hoy (para poder imprimir
  // su comanda); al imprimirse pasa a esta card/vista de Posteriores.
  const posterioresFuturos = useMemo(
    () => pedidosVisibles.filter((p) => esPosteriorFuturo(p) && impresos.has(p.id)),
    [pedidosVisibles, impresos],
  );

  // Número del día (turno) por punto: lo asigna el BACKEND de forma rodante
  // (arrastra pendientes de días anteriores al día de hoy, reinicia por punto y
  // por día). Aquí solo se lee p.numeroDia para ordenar/mostrar.
  const numeroDelDiaPorId = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of pedidosVisibles) {
      if (typeof p.numeroDia === "number") mapa.set(p.id, p.numeroDia);
    }
    return mapa;
  }, [pedidosVisibles]);

  // Pedidos atrasados del día: venció su ventana y siguen sin despachar.
  const atrasados = useMemo(() => {
    return pedidosDeHoy.filter((p) => {
      if (p.anulado) return false;
      const e = norm(p.estado);
      if (e === "despachado" || e === "anulado") return false;
      // Transferencia sin confirmar -> objetivo Infinity -> nunca atrasado.
      return msRestantesDespacho(p, ahora, meta[p.id]?.pagoConfirmado) <= 0;
    });
  }, [pedidosDeHoy, meta, ahora]);
  const atrasadosIds = useMemo(
    () => new Set(atrasados.map((p) => p.id)),
    [atrasados],
  );

  const pedidosOrdenados = useMemo(
    () =>
      pedidosVisibles.slice().sort((a, b) => {
        // Los posteriores YA IMPRESOS (programados a futuro) van al final; los
        // posteriores sin imprimir se ordenan como los de hoy (posición normal).
        const fa = esPosteriorFuturo(a) && impresos.has(a.id) ? 1 : 0;
        const fb = esPosteriorFuturo(b) && impresos.has(b.id) ? 1 : 0;
        if (fa !== fb) return fa - fb;
        // Orden por número del día (turno) DESCENDENTE: el último que entra
        // aparece ARRIBA y los anteriores van bajando (10, 9, 8, … 1).
        const na = numeroDelDiaPorId.get(a.id) ?? 0;
        const nb = numeroDelDiaPorId.get(b.id) ?? 0;
        if (na !== nb) return nb - na;
        return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
      }),
    [pedidosVisibles, numeroDelDiaPorId, impresos],
  );

  // Filtra por consecutivo, nombre del cliente o NIT/cédula del cliente.
  const pedidosFiltrados = useMemo(() => {
    const esAnulado = (p: Pedido) => p.anulado || norm(p.estado) === "anulado";
    // Si hay una card de estado seleccionada, filtra por ese estado; si no,
    // muestra la vista activa (oculta despachados y cancelados).
    const estadoSel = vista ? ESTADOS.find((e) => e.key === vista) : null;
    const base = pedidosOrdenados.filter((p) => {
      if (vista === "atrasados") return atrasadosIds.has(p.id);
      if (vista === "posteriores") return esPosteriorFuturo(p) && impresos.has(p.id);
      // Un pedido atrasado sale de su card de proceso (alistado, producción…) y
      // solo aparece bajo "Atrasados", así el conteo coincide con la tabla.
      if (estadoSel) return esDeHoy(p) && estadoSel.match(p) && !atrasadosIds.has(p.id);
      // Vista por defecto: activos de HOY + posteriores aún no impresos (para
      // poder imprimir su comanda; al imprimirse salen de aquí y quedan solo en
      // la card de Posteriores).
      const activo = norm(p.estado) !== "despachado" && !esAnulado(p);
      if (!activo) return false;
      if (esDeHoy(p)) return true;
      if (esPosteriorFuturo(p) && !impresos.has(p.id)) return true;
      return false;
    });
    const q = norm(busqueda);
    if (!q) return base;
    return base.filter((p) => {
      const consec = String(p.consecutivo ?? "");
      const comanda = norm(p.comanda);
      const nombre = norm(p.cliente?.nombre);
      const nit = norm(p.cliente?.nit_cedula);
      return (
        consec.includes(q) ||
        comanda.includes(q) ||
        nombre.includes(q) ||
        nit.includes(q)
      );
    });
  }, [pedidosOrdenados, busqueda, vista, atrasadosIds, impresos]);

  // Pedidos pendientes (ni despachados ni anulados) clasificados por su cronómetro.
  const { porVencer, vencidos } = useMemo(() => {
    const pendientes = pedidosDeHoy.filter(
      (p) => !p.anulado && norm(p.estado) !== "despachado" && norm(p.estado) !== "anulado",
    );
    const porVencer: Pedido[] = [];
    const vencidos: Pedido[] = [];
    for (const p of pendientes) {
      const pc = meta[p.id]?.pagoConfirmado;
      const restante = msRestantesDespacho(p, ahora, pc);
      if (!Number.isFinite(restante)) continue; // transferencia sin confirmar
      // Transferencia (ventana 1h) avisa con 30 min; el resto con 1h.
      const umbral = esTransferencia(p) ? 30 * 60 * 1000 : ALERTA_DESPACHO_MS;
      if (restante <= 0) vencidos.push(p);
      else if (restante <= umbral) porVencer.push(p);
    }
    // Ordena por urgencia: menos tiempo restante primero.
    const porTiempo = (a: Pedido, b: Pedido) =>
      msRestantesDespacho(a, ahora, meta[a.id]?.pagoConfirmado) -
      msRestantesDespacho(b, ahora, meta[b.id]?.pagoConfirmado);
    return { porVencer: porVencer.sort(porTiempo), vencidos: vencidos.sort(porTiempo) };
  }, [pedidosDeHoy, ahora, meta]);

  const totalAlertas = porVencer.length + vencidos.length;

  // Reabre la alerta automáticamente cuando cambia el conjunto de pedidos en riesgo.
  useEffect(() => {
    const firma = [...porVencer, ...vencidos].map((p) => p.id).sort().join("|");
    if (firma && firma !== firmaAlertaRef.current) {
      firmaAlertaRef.current = firma;
      setAlertaCerrada(false);
    } else if (!firma) {
      firmaAlertaRef.current = "";
    }
  }, [porVencer, vencidos]);

  const mostrarAlerta = totalAlertas > 0 && !alertaCerrada;

  return (
    <div>
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">Despacho</h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Seguimiento de los pedidos del día en Carnes Santacruz.
        </p>
        {esSelector && puntosAsignados.length > 0 && (
          <label className="mt-2 inline-flex items-center gap-2">
            <span className="text-xs font-semibold text-brand-brown/60">Punto:</span>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-wine">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />
              </svg>
              <select
                value={puntoActivoId ?? ""}
                onChange={(e) => setPuntoActivoId(e.target.value)}
                title="Punto de venta que estás viendo"
                className="cursor-pointer appearance-none rounded-full border border-brand-wine/20 bg-brand-wine/5 py-1.5 pl-8 pr-8 text-xs font-semibold text-brand-wine outline-none transition hover:bg-brand-wine/10 focus:border-brand-wine/40"
              >
                {puntosAsignados.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-brand-wine/70">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </label>
        )}
      </div>

      {/* Grid de estados */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {ESTADOS.map((e) => {
            const valorDeCard = (def: EstadoDef) =>
              def.key === "atrasados"
                ? atrasados.length
                : def.key === "posteriores"
                  ? posterioresFuturos.length
                  : // Un pedido atrasado se contabiliza SOLO en la card "Atrasados"
                    // (aunque su estado real sea alistado/producción/etc.), para no
                    // duplicarlo ni inflar el Total.
                    pedidosDeHoy.filter((p) => def.match(p) && !atrasadosIds.has(p.id)).length;
            // El Total es la suma de todas las demás cards.
            const valor =
              e.key === "total"
                ? ESTADOS.reduce(
                    (s, d) => (d.key === "total" ? s : s + valorDeCard(d)),
                    0,
                  )
                : valorDeCard(e);
            // Todas las cards son interactivas: filtran la tabla por su estado.
            const activo = vista === e.key;
            return (
              <button
                key={e.key}
                type="button"
                onClick={() => setVista((v) => (v === e.key ? null : e.key))}
                aria-pressed={activo}
                title={activo ? `Ocultar filtro: ${e.label}` : `Filtrar pedidos por: ${e.label}`}
                className={`group flex items-center gap-3 rounded-xl border p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                  activo
                    ? "border-brand-wine bg-brand-wine/5 ring-1 ring-brand-wine"
                    : e.alerta && valor > 0
                      ? "border-red-200 bg-white ring-1 ring-red-100"
                      : "border-brand-brown/10 bg-white"
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${e.chip}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
                    {e.icon}
                  </svg>
                </span>
                <div className="min-w-0 pr-1">
                  <p className="text-xs font-semibold text-brand-black">{e.label}</p>
                  {e.sub && <p className="text-[10px] text-brand-brown/55">{e.sub}</p>}
                  <p className="text-[10px] font-semibold text-brand-wine">
                    {activo ? "Mostrando · clic para ocultar" : "Clic para ver"}
                  </p>
                </div>
                <span className="ml-auto text-2xl font-extrabold leading-none text-brand-black">
                  {valor}
                </span>
              </button>
            );
          })}
      </div>

      {/* Tabla de pedidos */}
      <div className="mt-6 flex max-h-[calc(100vh-19rem)] flex-col overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
        <div className="flex shrink-0 flex-col gap-3 border-b border-brand-brown/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-lg font-bold text-brand-wine">Pedidos</h2>
            <span className="rounded-full bg-brand-cream-soft px-2.5 py-0.5 text-xs font-semibold text-brand-brown/60">
              {pedidosFiltrados.length}
            </span>
          </div>
          <div className="relative w-full sm:w-80">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={(ev) => setBusqueda(ev.target.value)}
              placeholder="Buscar por consecutivo, cliente o NIT..."
              className="w-full rounded-lg border border-brand-brown/15 bg-white py-2 pl-9 pr-9 text-sm text-brand-black outline-none focus:ring-1 focus:ring-brand-amber"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda("")}
                aria-label="Limpiar búsqueda"
                title="Limpiar la búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-brand-brown/50 hover:bg-brand-cream-soft"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {pedidosFiltrados.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-brand-brown/50">
            {pedidosOrdenados.length === 0
              ? "Aún no hay pedidos. Los pedidos creados aparecerán aquí."
              : "No se encontraron pedidos para la búsqueda."}
          </p>
        ) : (
          <div
            ref={scrollRef}
            className="max-h-[calc(100vh-340px)] overflow-auto"
          >
          <table className="w-full min-w-[1000px] table-fixed text-sm">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[17%]" />
              <col className="w-[15%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-brand-cream-soft text-center text-[11px] uppercase tracking-wide text-brand-brown/50 shadow-sm">
              <tr>
                <th className="border-r border-brand-brown/10 px-3 py-2.5 font-semibold">Cliente</th>
                <th className="border-r border-brand-brown/10 px-3 py-2.5 font-semibold">Estado</th>
                <th className="border-r border-brand-brown/10 px-3 py-2.5 font-semibold">Porcionador</th>
                <th className="border-r border-brand-brown/10 px-3 py-2.5 font-semibold">Factura</th>
                <th className="border-r border-brand-brown/10 px-3 py-2.5 font-semibold">Domiciliario</th>
                <th className="px-3 py-2.5 font-semibold">Temporizador</th>
              </tr>
            </thead>
            <tbody className="divide-y-4 divide-double divide-brand-brown/20">
              {pedidosFiltrados.map((p) => {
                const anulado = p.anulado;
                const estado = anulado ? "Anulado" : p.estado || "En proceso";
                const m = meta[p.id] ?? {};
                const porcSel = porcBorrador[p.id] ?? m.porcionador ?? "";
                // Porcionadores y domiciliarios del punto de venta de este pedido.
                const personal = personalPorPunto[String(p.punto?.id ?? "")] ?? {
                  porcionadores: [],
                  domiciliarios: [],
                };
                const porcionadores = personal.porcionadores;
                const domiciliarios = personal.domiciliarios;
                // Bloqueos: un pedido despachado ya no se reversa; uno facturado no se vuelve a facturar.
                const despachado = norm(estado) === "despachado";
                const facturado = norm(estado) === "facturado" || despachado;
                // Solo se puede facturar cuando el pedido ya está alistado.
                const alistado = norm(estado) === "alistado";
                // Transferencia: el cobro se confirma aparte para congelar el cronómetro.
                const transferencia = norm(p.pago) === "transferencia";
                const pagoConfirmado = Boolean(m.pagoConfirmado);
                // Sin imprimir la comanda NO se habilita ningún cambio de estado
                // (alistar, producción, facturar, despachar). Al gatear la entrada
                // a producción y la confirmación de pago, el resto queda bloqueado
                // en cascada (facturar exige alistado, despachar exige facturado).
                const impreso = impresos.has(p.id);
                return (
                  <tr key={p.id} className={anulado ? "opacity-60" : ""}>
                    {/* Cliente: agrupa televentas, comanda y medio de pago */}
                    <td className="relative border-r border-brand-brown/10 px-3 py-3 align-top">
                      <div className="flex w-full items-stretch gap-3 pb-12">
                        <div className="relative min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setClienteAbierto((prev) => (prev === p.id ? null : p.id))}
                            title="Ver toda la información del cliente"
                            className="group flex items-center gap-1 text-left font-bold text-brand-black transition hover:text-brand-wine"
                          >
                            <span className="underline decoration-brand-brown/20 decoration-dotted underline-offset-2 group-hover:decoration-brand-wine">
                              {p.cliente.nombre || p.cliente.nit_cedula}
                            </span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={`h-3 w-3 shrink-0 text-brand-brown/50 transition ${clienteAbierto === p.id ? "rotate-180" : ""}`}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>
                          {p.cliente.direccion && (
                            <p className="text-xs text-brand-brown/60">{p.cliente.direccion}</p>
                          )}
                          {p.cliente.barrio && (
                            <p className="text-xs text-brand-brown/60">{p.cliente.barrio}</p>
                          )}
                          {p.cliente.telefono && (
                            <p className="text-xs text-brand-brown/60">Tel: {p.cliente.telefono}</p>
                          )}
                          {clienteAbierto === p.id && (
                            <div className="absolute left-0 top-6 z-30 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-brand-brown/20 bg-white p-3 text-xs shadow-xl">
                              <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-brand-brown/10 pb-1.5">
                                <p className="truncate font-bold text-brand-black">
                                  {p.cliente.nombre || p.cliente.nit_cedula}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setClienteAbierto(null)}
                                  title="Cerrar"
                                  className="shrink-0 rounded p-0.5 text-brand-brown/60 transition hover:bg-brand-cream-soft hover:text-brand-wine"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-brand-brown/80">
                                  <span className="font-semibold text-brand-black">NIT/Cédula:</span> {p.cliente.nit_cedula || "—"}
                                </p>
                                <p className="text-brand-brown/80">
                                  <span className="font-semibold text-brand-black">Dirección:</span> {p.cliente.direccion || "—"}
                                </p>
                                <p className="text-brand-brown/80">
                                  <span className="font-semibold text-brand-black">Referencia:</span> {p.cliente.referencia || "—"}
                                </p>
                                <p className="text-brand-brown/80">
                                  <span className="font-semibold text-brand-black">Barrio:</span> {p.cliente.barrio || "—"}
                                </p>
                                <p className="text-brand-brown/80">
                                  <span className="font-semibold text-brand-black">Ciudad:</span> {p.cliente.ciudad || "—"}
                                </p>
                                <p className="text-brand-brown/80">
                                  <span className="font-semibold text-brand-black">Teléfono:</span> {p.cliente.telefono || "—"}
                                </p>
                                <p className="break-all text-brand-brown/80">
                                  <span className="font-semibold text-brand-black">Correo:</span> {p.cliente.correo || "—"}
                                </p>
                              </div>
                            </div>
                          )}
                          <p className="text-xs text-brand-brown/50">
                            <span className="font-semibold text-brand-black">Despacho:</span> {fmtFecha(fechaEntregaISO(p))}
                          </p>
                          <div className="mt-1.5 flex flex-col items-start gap-1">
                            {(() => {
                              const kilos = pesoPedidoKg(p);
                              if (kilos <= 0) return null;
                              return (
                                <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-2.5 w-2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                                  </svg>
                                  {tamanoPedido(kilos)} · {kilos % 1 === 0 ? kilos : kilos.toFixed(1)} kg
                                </span>
                              );
                            })()}
                            {p.retenido ? (
                              <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-2.5 w-2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                                </svg>
                                Retenido
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-2.5 w-2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                                </svg>
                                Liberado
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="w-px shrink-0 self-stretch bg-brand-brown/10" />
                        <div className="min-w-0 text-right">
                          <p className="text-xs font-semibold text-brand-wine">Comanda</p>
                          <p className="text-xs font-semibold text-brand-wine">
                            #{p.comanda}
                          </p>
                          {p.clonadoDe && (
                            <p className="mt-0.5 text-[11px] font-medium text-brand-amber">
                              Clonado de #{p.clonadoDe}
                            </p>
                          )}
                          {p.vendedorNombre && (
                            <div className="mt-1.5">
                              <p className="text-xs font-semibold text-brand-black">Televentas</p>
                              <p className="text-xs text-brand-brown/70">
                                {p.vendedorNombre}
                              </p>
                            </div>
                          )}
                          <div className="mt-1.5 flex justify-end text-[11px]">
                            {!anulado ? (
                              <label className={`inline-flex items-center gap-1 rounded-md bg-brand-amber/12 pl-1.5 pr-0.5 py-0.5 font-medium text-brand-amber ${permite.pago ? "" : "opacity-50"}`}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                                </svg>
                                <select
                                  value={p.pago ?? ""}
                                  onChange={(ev) => cambiarPago(p.id, ev.target.value)}
                                  className="cursor-pointer rounded bg-transparent py-0.5 pr-1 text-[11px] font-semibold text-brand-amber outline-none focus:ring-1 focus:ring-brand-amber"
                                >
                                  <option value="" disabled>
                                    Medio de pago
                                  </option>
                                  {METODOS.map((m) => (
                                    <option key={m} value={m} className="text-brand-black">
                                      {m}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              p.pago && (
                                <span className="rounded-md bg-brand-amber/12 px-1.5 py-0.5 font-medium text-brand-amber">
                                  {p.pago}
                                </span>
                              )
                            )}
                          </div>
                          <p className="mt-1.5 whitespace-nowrap text-[11px] text-brand-brown/50">
                            Recibido: {fmtHora(p.fecha)}
                          </p>
                          <p className="mt-1 whitespace-nowrap text-sm font-bold text-brand-wine">
                            {fmtMoneda(p.total)}
                          </p>
                        </div>
                      </div>
                      {!anulado && (
                        <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
                          <button
                            onClick={() => {
                              marcarImpreso(p.id);
                              imprimirComanda(p, numeroDelDiaPorId.get(p.id));
                            }}
                            title="Imprimir la comanda del pedido"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-wine px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-wine/90"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Z" />
                            </svg>
                            Imprimir comanda
                          </button>
                          {impresos.has(p.id) && (
                            <span className="mx-auto inline-flex items-center justify-center gap-1 self-center rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-bold uppercase leading-none tracking-wide text-emerald-700">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3 w-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                              Impresa
                            </span>
                          )}
                          {!impreso && (
                            <span className="self-center text-[10px] font-semibold text-amber-600">
                              Imprime para habilitar el despacho
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="relative border-r border-brand-brown/10 px-3 py-3 align-top">
                      <div className={esAdmin && !anulado ? "pb-14" : ""}>
                      <div
                        className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${
                          anulado
                            ? "border-red-200 bg-red-50 text-red-600"
                            : "border-brand-amber/30 bg-brand-amber/10 text-brand-amber"
                        }`}
                      >
                        <span className="uppercase tracking-wide">{norm(estado) === "en proceso" ? "Pendiente" : estado}</span>
                      </div>
                      <div className="mt-1.5 rounded-lg border border-brand-brown/10 bg-brand-cream-soft/40 px-3 py-1.5 text-center text-xs font-semibold text-brand-brown/70">
                        ENTREGA: {fmtFecha(fechaEntregaISO(p))}
                      </div>
                      {!anulado && norm(estado) === "despachado" ? (
                        <div className="mt-1.5 space-y-0.5 rounded-lg border border-brand-wine/20 bg-brand-wine/5 px-3 py-1.5 text-[11px] font-semibold text-brand-brown/70">
                          <p className="whitespace-nowrap">
                            Recibido: <span className="text-brand-wine">{fmtHora(p.fecha)}</span>
                          </p>
                          {m.despachoFin ? (
                            <>
                              <p className="whitespace-nowrap">
                                Despachado: <span className="text-brand-wine">{fmtHora(m.despachoFin)}</span>
                              </p>
                              <p className="whitespace-nowrap">
                                Tiempo total:{" "}
                                <span className="text-brand-wine">{fmtDuracion(p.fecha, m.despachoFin)}</span>
                              </p>
                            </>
                          ) : (
                            <p className="text-brand-brown/50">Despachado (hora no registrada)</p>
                          )}
                        </div>
                      ) : (
                        !anulado && (
                          <div className="mt-1.5 rounded-lg border border-brand-amber/25 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-brand-amber">
                            {tiempoEnEstado(p.fecha)}
                          </div>
                        )
                      )}
                      </div>
                      {esAdmin && !anulado && (
                        <div className="absolute inset-x-3 bottom-3">
                          <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-brand-brown/40">
                            Cambiar estado (admin)
                          </label>
                          <select
                            value={ESTADOS_FLUJO.find((s) => norm(s) === norm(estado)) ?? "En proceso"}
                            onChange={(ev) => reversarEstado(p.id, ev.target.value as Pedido["estado"])}
                            className="w-full rounded-lg border border-brand-wine/25 bg-brand-wine/5 px-2 py-1.5 text-xs font-semibold text-brand-wine outline-none focus:ring-1 focus:ring-brand-wine"
                          >
                            {ESTADOS_FLUJO.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </td>

                    {/* Porcionador */}
                    <td className="relative h-full border-r border-brand-brown/10 px-3 py-3 align-top">
                      <div className="flex flex-col gap-1.5 pb-12">
                        {m.inicio && (
                          <div className="space-y-0.5 text-[11px] font-semibold text-brand-brown/60">
                            <p>
                              Inicio: <span className="text-brand-wine">{fmtHora(m.inicio)}</span>
                            </p>
                            {m.fin && (
                              <>
                                <p>
                                  Terminado: <span className="text-brand-wine">{fmtHora(m.fin)}</span>
                                </p>
                                <p>
                                  Diferencia:{" "}
                                  <span className="text-brand-wine">{fmtDuracion(m.inicio, m.fin)}</span>
                                </p>
                              </>
                            )}
                          </div>
                        )}
                        <select
                          value={porcSel}
                          onChange={(ev) =>
                            setPorcBorrador((prev) => ({ ...prev, [p.id]: ev.target.value }))
                          }
                          disabled={anulado || Boolean(m.fin) || !impreso}
                          className="w-full rounded-lg border border-brand-brown/15 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-black outline-none focus:ring-1 focus:ring-brand-amber disabled:opacity-50"
                        >
                          <option value="">Selecciona</option>
                          {(porcSel && !porcionadores.includes(porcSel)
                            ? [porcSel, ...porcionadores]
                            : porcionadores
                          ).map((nombre) => (
                            <option key={nombre} value={nombre}>
                              {nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                      {!m.fin && (
                        <div className="absolute inset-x-3 bottom-3">
                          <button
                            onClick={() => {
                              if (!m.inicio) {
                                actualizarMeta(p.id, {
                                  porcionador: porcSel,
                                  inicio: new Date().toISOString(),
                                });
                                cambiarEstado(p.id, "En producción");
                                setPorcBorrador((prev) => {
                                  const next = { ...prev };
                                  delete next[p.id];
                                  return next;
                                });
                              } else {
                                actualizarMeta(p.id, { fin: new Date().toISOString() });
                                cambiarEstado(p.id, "Alistado");
                              }
                            }}
                            disabled={anulado || !impreso || (!m.inicio && !porcSel.trim())}
                            title={
                              !impreso
                                ? "Imprime la comanda primero para habilitar el despacho"
                                : !m.inicio && !porcSel.trim()
                                  ? "Selecciona el porcionador antes de iniciar el alistamiento"
                                  : m.inicio
                                    ? "Marcar el alistamiento como preparado"
                                    : "Iniciar el alistamiento del pedido"
                            }
                            className={`w-full whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50 ${
                              permite.estado ? "" : "opacity-50"
                            } ${
                              m.inicio
                                ? "bg-green-600 hover:bg-green-700"
                                : "bg-brand-amber hover:bg-brand-amber/90"
                            }`}
                          >
                            {m.inicio ? "Preparado" : "Iniciar alistamiento"}
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Factura: número y valor (puede diferir del pedido) */}
                    <td className="relative h-full border-r border-brand-brown/10 px-3 py-3 align-top">
                      <div className="flex w-full flex-col gap-1.5 pb-12">
                        <input
                          type="text"
                          value={m.facturaNumero ?? ""}
                          onChange={(ev) => actualizarMeta(p.id, { facturaNumero: ev.target.value })}
                          disabled={anulado || facturado || !alistado || (transferencia && !pagoConfirmado)}
                          placeholder="N° factura"
                          className="rounded-lg border border-brand-brown/15 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-black outline-none focus:ring-1 focus:ring-brand-amber disabled:opacity-50"
                        />
                        <input
                          type="number"
                          min={0}
                          value={m.facturaValor ?? ""}
                          onChange={(ev) =>
                            actualizarMeta(p.id, {
                              facturaValor: ev.target.value === "" ? undefined : Number(ev.target.value),
                            })
                          }
                          disabled={anulado || facturado || !alistado || (transferencia && !pagoConfirmado)}
                          placeholder="Valor factura"
                          className="rounded-lg border border-brand-brown/15 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-black outline-none focus:ring-1 focus:ring-brand-amber disabled:opacity-50"
                        />
                        {typeof m.facturaValor === "number" && m.facturaValor > 0 && (
                          <p className="text-[11px] font-semibold text-brand-wine">
                            Valor factura: {fmtMoneda(m.facturaValor)}
                          </p>
                        )}
                      </div>
                      <div className="absolute inset-x-3 bottom-3">
                        {transferencia && !pagoConfirmado && !facturado && !despachado ? (
                          <button
                            onClick={() =>
                              actualizarMeta(p.id, { pagoConfirmado: new Date().toISOString() })
                            }
                            disabled={anulado || !impreso}
                            title={!impreso ? "Imprime la comanda primero" : "Confirma la transferencia e inicia el cronómetro de 1 hora para despachar"}
                            className={`w-full whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40 ${permite.estado ? "" : "opacity-50"}`}
                          >
                            Confirmar transferencia
                          </button>
                        ) : (
                          <button
                            onClick={() => cambiarEstado(p.id, "Facturado")}
                            disabled={
                              anulado ||
                              facturado ||
                              !alistado ||
                              !m.facturaNumero?.trim() ||
                              !(typeof m.facturaValor === "number" && m.facturaValor > 0)
                            }
                            title={!alistado && !facturado ? "Debes terminar el alistamiento antes de facturar" : "Marcar el pedido como facturado"}
                            className={`w-full whitespace-nowrap rounded-lg bg-brand-amber px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-amber/90 disabled:opacity-40 ${permite.estado ? "" : "opacity-50"}`}
                          >
                            Facturado
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Domiciliario: al asignar pasa a Despachado */}
                    <td className="relative h-full border-r border-brand-brown/10 px-3 py-3 align-top">
                      <div className="flex w-full flex-col gap-1.5 pb-12">
                        <select
                          value={m.domiciliario ?? ""}
                          onChange={(ev) => actualizarMeta(p.id, { domiciliario: ev.target.value })}
                          disabled={anulado || despachado || !facturado}
                          title={!facturado && !despachado ? "Debes facturar el pedido antes de asignar domiciliario" : undefined}
                          className="rounded-lg border border-brand-brown/15 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-black outline-none focus:ring-1 focus:ring-brand-amber disabled:opacity-50"
                        >
                          <option value="">Selecciona</option>
                          {(m.domiciliario && !domiciliarios.includes(m.domiciliario)
                            ? [m.domiciliario, ...domiciliarios]
                            : domiciliarios
                          ).map((nombre) => (
                            <option key={nombre} value={nombre}>
                              {nombre}
                            </option>
                          ))}
                        </select>

                        {/* Réplicas del pedido: el mismo pedido enviado por partes */}
                        <div className="mt-1 border-t border-brand-brown/10 pt-1.5">
                          <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-brand-brown/40">
                            Réplicas (mismo pedido por partes)
                          </p>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((n) => {
                              const reps = m.replicas ?? [];
                              const activa = reps.some((r) => r.numero === n);
                              const maxN = reps.reduce((mx, r) => Math.max(mx, r.numero), 0);
                              const esSiguiente = n === maxN + 1;
                              // Secuencial: solo el siguiente número (crear) o los ya
                              // generados (ver detalle) son clickeables.
                              const deshabilitado = anulado || (!activa && !esSiguiente);
                              return (
                                <button
                                  key={n}
                                  disabled={deshabilitado}
                                  onClick={() => {
                                    if (activa)
                                      setModalReplica({ pedido: p, numero: n, modo: "ver" });
                                    else if (esSiguiente)
                                      setModalReplica({ pedido: p, numero: n, modo: "crear" });
                                  }}
                                  title={
                                    activa
                                      ? "Ver detalle de la réplica"
                                      : esSiguiente
                                        ? "Crear réplica"
                                        : "Marca las réplicas en orden"
                                  }
                                  className={`flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-bold transition disabled:cursor-not-allowed ${
                                    activa
                                      ? "border-brand-wine bg-brand-wine text-white hover:bg-brand-wine/90"
                                      : esSiguiente
                                        ? "border-brand-wine/40 bg-white text-brand-wine hover:bg-brand-wine/10"
                                        : "border-brand-brown/15 bg-white text-brand-brown/30"
                                  }`}
                                >
                                  {n}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="absolute inset-x-3 bottom-3">
                        <button
                          onClick={() => cambiarEstado(p.id, "Despachado")}
                          disabled={anulado || despachado || !facturado || !m.domiciliario?.trim()}
                          title={!facturado && !despachado ? "Debes facturar el pedido antes de despachar" : "Marcar el pedido como despachado"}
                          className={`w-full whitespace-nowrap rounded-lg bg-brand-wine px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-40 ${permite.estado ? "" : "opacity-50"}`}
                        >
                          Despachado
                        </button>
                      </div>
                    </td>

                    {/* Temporizador: preparación (1h) y entrega (2h) */}
                    <td className="relative px-3 pb-9 pt-3 align-top">
                      {/* Número del día (orden de llegada) para marcar las bolsas */}
                      <span
                        title="Número del día (orden de llegada)"
                        className="absolute bottom-2 right-2 z-10 flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-brand-wine px-1.5 text-xs font-extrabold text-white shadow-sm"
                      >
                        {numeroDelDiaPorId.get(p.id) ?? "—"}
                      </span>
                      {!anulado &&
                        (() => {
                          // Posterior (programado para otro día): no corre el
                          // cronómetro, solo se muestra el día programado.
                          if (esPosteriorFuturo(p)) {
                            return (
                              <div className="flex items-center justify-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-600">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                                </svg>
                                Programado {p.fechaProgramada}
                              </div>
                            );
                          }
                          const box =
                            "flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold tabular-nums";
                          const iconoReloj = (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          );
                          const iconoOk = (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3 w-3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          );

                          // Transferencia: el cronómetro (1 hora) corre SOLO desde
                          // que se confirma la transferencia. Antes: sin cuenta.
                          if (esTransferencia(p)) {
                            if (!m.pagoConfirmado) {
                              return (
                                <div className={`${box} border-blue-200 bg-blue-50 text-blue-600`}>
                                  Esperando transferencia
                                </div>
                              );
                            }
                            const deadline = objetivoDespacho(p, m.pagoConfirmado);
                            const rest = deadline - ahora;
                            let cont;
                            if (m.despachoFin) {
                              const aTiempo = new Date(m.despachoFin).getTime() <= deadline;
                              cont = (
                                <div className={`${box} ${aTiempo ? "border-green-200 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-600"}`}>
                                  {aTiempo ? iconoOk : null}
                                  {aTiempo ? "Cumplido" : "Fuera de tiempo"}
                                </div>
                              );
                            } else {
                              const clase =
                                rest <= 30 * 60 * 1000
                                  ? "border-red-300 bg-red-50 text-red-600"
                                  : "border-green-200 bg-green-50 text-green-700";
                              cont = (
                                <div className={`${box} ${clase}`}>
                                  {iconoReloj}
                                  {rest <= 0 ? "-" : ""}
                                  {fmtCronometro(rest)}
                                </div>
                              );
                            }
                            return (
                              <div>
                                <p className="mb-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-brand-brown/40">
                                  Producción (1h)
                                </p>
                                {cont}
                              </div>
                            );
                          }

                          // Resto de pagos: preparación (1h) + entrega (2h) desde que entra.
                          const deadlineEntrega = objetivoDespacho(p);
                          const deadlinePrep = deadlineEntrega - ALERTA_DESPACHO_MS; // 1h antes de la entrega
                          const restEntrega = deadlineEntrega - ahora;
                          const restPrep = deadlinePrep - ahora;
                          const horaObj = (p.horaDespacho ?? "").trim();
                          // Antes de activar: hay hora pedida y faltan más de 2h.
                          const antesDeActivar =
                            horaObj !== "" && restEntrega > LIMITE_DESPACHO_MS;

                          // Rojo al llegar a la mitad del tiempo (o menos); verde antes.
                          const claseTiempo = (rest: number, mitadMs: number) =>
                            rest <= mitadMs
                              ? "border-red-300 bg-red-50 text-red-600"
                              : "border-green-200 bg-green-50 text-green-700";

                          // Preparación (1h): meta = marcar "Alistado" (m.fin).
                          let prep;
                          if (m.fin) {
                            const aTiempo = new Date(m.fin).getTime() <= deadlinePrep;
                            prep = (
                              <div className={`${box} ${aTiempo ? "border-green-200 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-600"}`}>
                                {aTiempo ? iconoOk : null}
                                {aTiempo ? "Cumplido" : "Fuera de tiempo"}
                              </div>
                            );
                          } else if (antesDeActivar) {
                            prep = <div className={`${box} border-indigo-200 bg-indigo-50 text-indigo-600`}>Programado</div>;
                          } else {
                            prep = (
                              <div className={`${box} ${claseTiempo(restPrep, 30 * 60 * 1000)}`}>
                                {iconoReloj}
                                {restPrep <= 0 ? "-" : ""}{fmtCronometro(restPrep)}
                              </div>
                            );
                          }

                          // Entrega (2h): meta = marcar "Despachado" (m.despachoFin).
                          let entrega;
                          if (m.despachoFin) {
                            const aTiempo = new Date(m.despachoFin).getTime() <= deadlineEntrega;
                            entrega = (
                              <div className={`${box} ${aTiempo ? "border-green-200 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-600"}`}>
                                {aTiempo ? iconoOk : null}
                                {aTiempo ? "Cumplido" : "Fuera de tiempo"}
                              </div>
                            );
                          } else if (antesDeActivar) {
                            entrega = <div className={`${box} border-indigo-200 bg-indigo-50 text-indigo-600`}>Programado</div>;
                          } else {
                            entrega = (
                              <div className={`${box} ${claseTiempo(restEntrega, ALERTA_DESPACHO_MS)}`}>
                                {iconoReloj}
                                {restEntrega <= 0 ? "-" : ""}{fmtCronometro(restEntrega)}
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-2">
                              <div>
                                <p className="mb-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-brand-brown/40">
                                  Preparación (1h)
                                </p>
                                {prep}
                              </div>
                              <div>
                                <p className="mb-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-brand-brown/40">
                                  Entrega (2h)
                                </p>
                                {entrega}
                              </div>
                            </div>
                          );
                        })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Botón flotante para reabrir la alerta si fue cerrada */}
      {alertaCerrada && totalAlertas > 0 && (
        <button
          type="button"
          onClick={() => setAlertaCerrada(false)}
          title="Ver los pedidos en riesgo de vencerse"
          className="fixed right-6 top-6 z-40 flex items-center gap-2 rounded-full bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-red-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {totalAlertas} {totalAlertas === 1 ? "pedido en riesgo" : "pedidos en riesgo"}
        </button>
      )}

      {/* Alerta modal de pedidos por vencer / vencidos */}
      {mostrarAlerta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-brand-brown/10 bg-red-50 px-5 py-4">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-serif text-lg font-bold text-red-700">Alerta de despacho</h3>
                <p className="text-xs text-red-600/80">
                  Tienes 2 horas para despachar cada pedido desde que ingresa.
                </p>
              </div>
              <button
                onClick={() => setAlertaCerrada(true)}
                className="rounded-lg p-1.5 text-brand-brown/50 transition hover:bg-white hover:text-brand-brown"
                aria-label="Cerrar"
                title="Cerrar alerta"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {porVencer.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-amber">
                    Por vencer · queda 1 hora o menos
                  </p>
                  <ul className="space-y-1.5">
                    {porVencer.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-brand-amber/30 bg-brand-amber/5 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate font-semibold text-brand-black">
                          Pedido #{p.comanda}
                          <span className="ml-1 font-normal text-brand-brown/60">
                            · {p.cliente?.nombre || p.cliente?.nit_cedula}
                          </span>
                        </span>
                        <span className="shrink-0 font-bold tabular-nums text-brand-amber">
                          {fmtCronometro(msRestantesDespacho(p, ahora, meta[p.id]?.pagoConfirmado))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {vencidos.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-red-600">
                    Vencidos · superaron las 2 horas
                  </p>
                  <ul className="space-y-1.5">
                    {vencidos.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate font-semibold text-brand-black">
                          Pedido #{p.comanda}
                          <span className="ml-1 font-normal text-brand-brown/60">
                            · {p.cliente?.nombre || p.cliente?.nit_cedula}
                          </span>
                        </span>
                        <span className="shrink-0 font-bold tabular-nums text-red-600">
                          -{fmtCronometro(msRestantesDespacho(p, ahora, meta[p.id]?.pagoConfirmado))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-brand-brown/10 px-5 py-3">
              <span className="text-xs font-semibold text-brand-brown/60">
                {vencidos.length} vencido{vencidos.length === 1 ? "" : "s"} ·{" "}
                {porVencer.length} por vencer
              </span>
              <button
                onClick={() => setAlertaCerrada(true)}
                title="Cerrar la alerta de despacho"
                className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-wine/90"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
      {modalReplica && (
        <ModalReplica
          pedido={modalReplica.pedido}
          numero={modalReplica.numero}
          modo={modalReplica.modo}
          domiciliarios={
            personalPorPunto[String(modalReplica.pedido.punto?.id ?? "")]?.domiciliarios ?? []
          }
          domiciliarioAsignado={
            (meta[modalReplica.pedido.id]?.replicas ?? []).find(
              (r) => r.numero === modalReplica.numero,
            )?.domiciliario ?? ""
          }
          esUltima={
            modalReplica.numero ===
            (meta[modalReplica.pedido.id]?.replicas ?? []).reduce(
              (mx, r) => Math.max(mx, r.numero),
              0,
            )
          }
          onCrear={(domi) => {
            crearReplica(modalReplica.pedido.id, domi);
            setModalReplica(null);
          }}
          onDescargar={() =>
            descargarReplica(modalReplica.pedido, modalReplica.numero)
          }
          onDrivin={() =>
            enviarADrivinApi(modalReplica.pedido.id, modalReplica.numero)
          }
          onQuitar={() => {
            quitarUltimaReplica(modalReplica.pedido.id);
            setModalReplica(null);
          }}
          onCerrar={() => setModalReplica(null)}
        />
      )}
      <ModalSinPermiso abierto={sinPermiso.abierto} onCerrar={sinPermiso.cerrar} />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Modal de réplica: crear (elegir domiciliario) o ver detalle      */
/* ---------------------------------------------------------------- */
function ModalReplica({
  pedido,
  numero,
  modo,
  domiciliarios,
  domiciliarioAsignado,
  esUltima,
  onCrear,
  onDescargar,
  onDrivin,
  onQuitar,
  onCerrar,
}: {
  pedido: Pedido;
  numero: number;
  modo: "crear" | "ver";
  domiciliarios: string[];
  domiciliarioAsignado: string;
  esUltima: boolean;
  onCrear: (domiciliario: string) => void;
  onDescargar: () => void;
  onDrivin: () => Promise<{ comanda: string; status: number }>;
  onQuitar: () => void;
  onCerrar: () => void;
}) {
  const [domi, setDomi] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drivinEstado, setDrivinEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [drivinMsg, setDrivinMsg] = useState("");
  const codigoReplica = `${pedido.comanda}-${numero}`;
  // Puntos integrados con Drivin (suben directo): La 93, Alameda, Olaya y San
  // Felipe. Cada uno usa su schema en el backend (93->01, La 43->03, Alameda I->04,
  // Alameda II->05, Olaya->06, San Felipe->07). El resto va por Excel.
  const esDrivin = (() => {
    const nombre = String(pedido.punto?.nombre ?? "").toLowerCase();
    return (
      /\b93\b/.test(nombre) ||
      /\b43\b/.test(nombre) ||
      nombre.includes("alameda") ||
      nombre.includes("olaya") ||
      nombre.includes("felipe")
    );
  })();

  async function enviarDrivin() {
    if (drivinEstado === "enviando") return;
    setDrivinEstado("enviando");
    setDrivinMsg("");
    try {
      await onDrivin();
      setDrivinEstado("ok");
    } catch (e) {
      setDrivinEstado("error");
      setDrivinMsg(e instanceof Error ? e.message : "");
    }
  }

  function confirmar() {
    if (!domi.trim()) {
      setError("Selecciona el domiciliario para esta réplica.");
      return;
    }
    onCrear(domi);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-brand-black/50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-brand-brown/10 px-5 py-4">
          <h2 className="font-serif text-lg font-bold text-brand-wine">
            {modo === "crear" ? "Nueva réplica" : `Réplica -${numero}`}
          </h2>
          <button
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-brand-brown/50 hover:bg-brand-cream-soft"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-lg border border-brand-brown/10 bg-brand-cream-soft/40 px-3 py-2 text-sm">
            <p className="text-brand-brown/70">
              {modo === "crear"
                ? "Estás haciendo una réplica del pedido"
                : "Este pedido es una réplica del pedido"}{" "}
              <span className="font-bold text-brand-wine">#{pedido.comanda}</span>
            </p>
            {pedido.cliente?.nombre && (
              <p className="mt-0.5 text-xs text-brand-brown/50">{pedido.cliente.nombre}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-brand-brown/10 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand-brown/40">
                Consecutivo del pedido
              </p>
              <p className="font-bold text-brand-black">
                {pedido.consecutivo ?? pedido.comanda}
              </p>
            </div>
            <div className="rounded-lg border border-brand-brown/10 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand-brown/40">
                Consecutivo de la réplica
              </p>
              <p className="font-bold text-brand-black">{codigoReplica}</p>
            </div>
          </div>

          {modo === "crear" ? (
            <div>
              <label className="mb-1 block text-sm font-semibold text-brand-brown">
                Domiciliario
              </label>
              <select
                value={domi}
                autoFocus
                onChange={(e) => {
                  setDomi(e.target.value);
                  setError(null);
                }}
                className="w-full rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm text-brand-black outline-none focus:border-brand-wine"
              >
                <option value="">Selecciona…</option>
                {domiciliarios.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {error && <p className="mt-1 text-sm font-medium text-red-600">{error}</p>}
            </div>
          ) : (
            <div className="rounded-lg border border-brand-brown/10 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand-brown/40">
                Domiciliario asignado
              </p>
              <p className="font-bold text-brand-black">{domiciliarioAsignado || "—"}</p>
            </div>
          )}

          {modo === "ver" && drivinEstado === "ok" && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Envío exitoso del pedido {codigoReplica} a Drivin.
            </div>
          )}
          {modo === "ver" && drivinEstado === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="font-semibold">Error al subir el pedido a Drivin.</p>
              <p className="mt-0.5">Por favor genera el Excel (ícono) e inténtalo manual.</p>
              {drivinMsg && (
                <p className="mt-1 break-words text-xs text-red-500/80">{drivinMsg}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-brand-brown/10 px-5 py-4">
          {modo === "ver" && esUltima ? (
            <button
              onClick={onQuitar}
              title="Quitar esta réplica"
              className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              Quitar
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onCerrar}
              title={modo === "crear" ? "Cancelar" : "Cerrar"}
              className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft"
            >
              {modo === "crear" ? "Cancelar" : "Cerrar"}
            </button>
            {modo === "crear" ? (
              <button
                onClick={confirmar}
                title="Confirmar y crear la réplica"
                className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90"
              >
                Confirmar
              </button>
            ) : esDrivin ? (
              <>
                <button
                  onClick={onDescargar}
                  title={`Descargar el Excel de la réplica -${numero} (respaldo)`}
                  aria-label="Descargar Excel de respaldo"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-brown/20 text-brand-brown transition hover:bg-brand-cream-soft"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </button>
                <button
                  onClick={enviarDrivin}
                  disabled={drivinEstado === "enviando"}
                  title={`Enviar la réplica -${numero} directamente a Drivin`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-60"
                >
                  {drivinEstado === "enviando" ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                    </svg>
                  )}
                  Enviar a Drivin
                </button>
              </>
            ) : (
              <button
                onClick={onDescargar}
                title={`Descargar el Excel de la réplica -${numero}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Excel -{numero}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
