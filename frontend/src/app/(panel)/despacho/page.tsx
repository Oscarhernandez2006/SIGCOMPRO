"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { imprimirComanda, METODOS, numerosDelDia, type Pedido } from "@/app/(panel)/pedidos/page";
import { misPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";
import { getUsuario, puedeMultiPunto, puedeSeleccionarPuntoVenta, tieneAccesoAdministrativo } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ModalSinPermiso, useSinPermiso } from "@/components/SinPermisoModal";
import {
  cargarEstadoPedidos,
  actualizarMetaApi,
  marcarImpresoApi,
  guardarPedidoApi,
  descargarExcelDespacho,
  enviarADrivinApi,
  obtenerComprobanteApi,
  subirComprobanteApi,
  confirmarComprobanteApi,
  eliminarComprobanteApi,
  cargarAsignacionesDrivin,
  cargarEntregasDrivin,
  type DespachoMeta,
} from "@/lib/pedidos";
import { obtenerPersonalDespachoTodos, type PersonalDespacho } from "@/lib/configuracion";
import { verificarClaveDinamica } from "@/lib/clave-dinamica";
import {
  ALERTA_DESPACHO_MS,
  ALERTA_ALISTADO_PEQUENO_MS,
  LIMITE_ALISTADO_PEQUENO_MS,
  LIMITE_DESPACHO_MS,
  LIMITE_TRANSFERENCIA_MS,
  esTransferencia,
  esPedidoPequeno,
  objetivoDespacho,
  deadlinePreparacion,
  msRestantesDespacho,
  yaDespachado,
  colorEstado,
} from "@/lib/despacho";

const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

/**
 * Comprime una imagen (archivo) a JPEG redimensionado (máx. 1280 px de lado)
 * y la devuelve como data URL base64. Reduce el peso del comprobante para
 * guardarlo/transmitirlo sin saturar el servidor ni la base de datos.
 */
function comprimirImagen(
  file: File,
  maxLado = 1280,
  calidad = 0.7,
): Promise<{ dataUrl: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagen inválida"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxLado || height > maxLado) {
          if (width >= height) {
            height = Math.round((height * maxLado) / width);
            width = maxLado;
          } else {
            width = Math.round((width * maxLado) / height);
            height = maxLado;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo procesar la imagen"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", calidad);
        resolve({ dataUrl, mime: "image/jpeg" });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

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
    // Quedó de un día anterior: solo se arrastra si sigue activo (no despachado/
    // en tránsito/entregado ni anulado).
    const e = norm(p.estado);
    return !p.anulado && !yaDespachado(p.estado) && e !== "anulado";
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
      !yaDespachado(x.estado) &&
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
    key: "retenido",
    label: "Retenido",
    sub: "Cartera",
    icon: Icono.tarjeta,
    match: (x) => norm(x.estado) === "liberación",
    chip: "bg-brand-gold/20 text-brand-amber",
  },
  {
    key: "rechazados",
    label: "Rechazados",
    sub: "Por cliente no atender (Drivin)",
    icon: Icono.alerta,
    match: (x) => norm(x.estado) === "rechazado",
    chip: "bg-orange-100 text-orange-700",
    alerta: true,
  },
  {
    key: "cancelados",
    label: "Cancelados",
    sub: "Anulados",
    icon: Icono.xcirculo,
    match: (x) => x.anulado || norm(x.estado) === "anulado",
    chip: "bg-red-100 text-red-500",
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
    sub: "En ruta",
    icon: Icono.camion,
    match: (x) => norm(x.estado) === "despachado",
    chip: "bg-teal-100 text-teal-600",
  },
  {
    key: "transito",
    label: "En tránsito",
    sub: "En reparto (Drivin)",
    icon: Icono.camion,
    match: (x) => norm(x.estado) === "en tránsito",
    chip: "bg-sky-100 text-sky-600",
  },
  {
    key: "entregados",
    label: "Entregados",
    sub: "Entregados (Drivin)",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    ),
    match: (x) => norm(x.estado) === "entregado",
    chip: "bg-green-100 text-green-600",
  },
];

/** Estados del flujo del pedido, en orden, para el selector de administradores. */
const ESTADOS_FLUJO = [
  "En proceso",
  "En producción",
  "Alistado",
  "Facturado",
  "Despachado",
  "En tránsito",
  "Entregado",
  "Rechazado",
] as const;

/**
 * Etiqueta amigable para el selector de "Cambiar estado" (solo cambia el TEXTO
 * mostrado; el valor guardado sigue siendo el estado real del flujo).
 */
const ETIQUETA_ESTADO_FLUJO: Record<string, string> = {
  "En proceso": "Pendiente",
  "En producción": "Preparado",
  "Rechazado": "Rechazado (Cliente no atendía)",
};

/**
 * Permiso granular requerido para COLOCAR un pedido en cada estado. Cada estado
 * tiene su propio permiso; además, el permiso "maestro" despacho.estado (o un
 * rol con acceso total) habilita todos.
 */
const PERMISO_POR_ESTADO: Record<string, string> = {
  "en proceso": "despacho.estado.proceso",
  "en producción": "despacho.estado.produccion",
  "alistado": "despacho.estado.alistado",
  "facturado": "despacho.estado.facturado",
  "despachado": "despacho.estado.despachado",
  "en tránsito": "despacho.estado.despachado",
  "entregado": "despacho.estado.despachado",
  "rechazado": "despacho.estado.despachado",
};

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
  if (min < 1) return "Menos de 1 Mint. EN PROCESO DESDE LA TOMA";
  if (min < 60) return `${min} Mint. EN PROCESO DESDE LA TOMA`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} Mint. EN PROCESO DESDE LA TOMA`;
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
  // Asignaciones bajadas de Drivin: comanda -> domiciliario que Drivin asignó
  // (null = está en Drivin pero SIN domiciliario; ausente = no está en Drivin).
  const [asignacionesDrivin, setAsignacionesDrivin] = useState<
    Record<string, { code: string; nombre: string } | null>
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
  // Modal para que un ADMIN asigne un domiciliario MANUAL (de la Gestión de
  // recursos, según el punto) y así cerrar el ciclo a Despachado cuando Drivin
  // rebotó el pedido y no lo asignó.
  const [despachoManual, setDespachoManual] = useState<{ id: string } | null>(null);
  const [despachoManualSel, setDespachoManualSel] = useState("");
  const firmaAlertaRef = useRef("");
  // Modal para REINICIAR los tiempos de alistamiento de un pedido: se abre al
  // hacer clic en los tiempos y exige la clave dinámica para reiniciarlos.
  const [resetTiemposId, setResetTiemposId] = useState<string | null>(null);
  const [codigoReset, setCodigoReset] = useState("");
  const [verificandoReset, setVerificandoReset] = useState(false);
  const [errorReset, setErrorReset] = useState<string | null>(null);
  // Comprobante de pago (imagen) por pedido: subida, previsualización y
  // confirmación. La imagen se consulta bajo demanda (no viene en la carga
  // masiva). `compSubirId` = pedido que abrió el selector de archivo.
  const compFileRef = useRef<HTMLInputElement>(null);
  const [compSubirId, setCompSubirId] = useState<string | null>(null);
  const [compSubiendo, setCompSubiendo] = useState<Record<string, boolean>>({});
  // Imágenes del comprobante por pedido (varias) y modal con la imagen actual.
  const [compImg, setCompImg] = useState<Record<string, string[]>>({});
  const [compModal, setCompModal] = useState<{ id: string; indice: number } | null>(null);
  // Pedidos cuyo comprobante YA confirmado se desbloqueó (con clave dinámica)
  // para poder reemplazarlo o eliminarlo en esta sesión.
  const [compDesbloqueo, setCompDesbloqueo] = useState<Set<string>>(new Set());
  // Modal de clave dinámica para modificar un comprobante ya confirmado.
  const [compClaveId, setCompClaveId] = useState<string | null>(null);
  const [codigoComp, setCodigoComp] = useState("");
  const [verificandoComp, setVerificandoComp] = useState(false);
  const [errorComp, setErrorComp] = useState<string | null>(null);
  // Contenedor scrolleable de la tabla (scroll normal con la rueda/barra).
  const scrollRef = useRef<HTMLDivElement>(null);
  // Ids cuyo pedido base ya se subió a Drivin al despachar (evita reenvíos).
  const drivinDespachoRef = useRef<Set<string>>(new Set());
  // Resultado del envío a Drivin al despachar (modal central).
  const [drivinModal, setDrivinModal] = useState<{
    estado: "enviando" | "ok" | "error";
    comanda: string;
    msg?: string;
  } | null>(null);

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

  // ¿El usuario puede COLOCAR un pedido en un estado concreto? Cada estado tiene
  // su permiso (despacho.estado.<estado>); el maestro despacho.estado y los
  // roles con acceso total habilitan todos.
  const puedeEstado = (estado?: string | null): boolean => {
    if (puedeAccion(usuarioDesp, "despacho.estado")) return true;
    const clave = PERMISO_POR_ESTADO[norm(estado)];
    return clave ? puedeAccion(usuarioDesp, clave) : false;
  };

  // El selector para CAMBIAR/REVERSAR el estado directamente es EXCLUSIVO de los
  // roles administrativos con selector (administrador app / desarrollador). Los
  // demás usuarios avanzan el flujo solo con los botones (según sus permisos).
  const puedeCambiarEstadoManual = puedeSeleccionarPuntoVenta(usuarioDesp?.rol);

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

  // Carga inicial + auto-actualización (polling). Cada 7 s (y al volver a la
  // pestaña) agrega los pedidos NUEVOS y su metadata, sin reemplazar los
  // existentes, para no pisar lo que se está editando (factura, estado, etc.).
  useEffect(() => {
    let activo = true;
    let primera = true;
    let enVuelo = false;
    let desde: string | undefined;
    const refrescar = () => {
      // Evita ENCABALLAR peticiones: si la carga anterior sigue en curso, se
      // omite este tick. Contra la BD remota una carga puede tardar más que el
      // intervalo (7 s); acumular peticiones satura la red y todo se vuelve
      // progresivamente más lento (lento -> rápido -> lento).
      if (enVuelo) return;
      enVuelo = true;
      // Polling INCREMENTAL: tras la primera carga se envía `desde` (el `ahora`
      // de la respuesta previa) y el backend responde SOLO con lo que cambió,
      // haciendo cada poll mucho más liviano (KB en vez de MB). Alcance 'hoy':
      // activos (cualquier fecha) + finalizados de hoy — Despacho nunca muestra
      // finalizados de días anteriores, así que no cambia lo que se ve.
      cargarEstadoPedidos({ desde, rango: "hoy" })
        .then((e) => {
          if (!activo) return;
          desde = e.ahora ?? desde;
          if (primera) {
            setPedidos(e.pedidos);
            setMeta(e.meta);
            setImpresos(new Set(e.impresos));
            primera = false;
            return;
          }
          // Incremental: e.pedidos trae SOLO los pedidos que cambiaron.
          if (e.pedidos.length) {
            // UPSERT por id: reemplaza el pedido existente con la versión del
            // servidor (para REFLEJAR cambios de OTRA estación: estado, etc.) y
            // agrega los nuevos al inicio. El delta solo trae lo que cambió, así
            // que un pedido que se edita localmente sin guardar NO viene aquí y
            // no se pisa.
            setPedidos((prev) => {
              const cambiados = new Map(e.pedidos.map((p) => [p.id, p]));
              const idsPrev = new Set(prev.map((p) => p.id));
              const actualizados = prev.map((p) => cambiados.get(p.id) ?? p);
              const nuevos = e.pedidos.filter((p) => !idsPrev.has(p.id));
              return nuevos.length ? [...nuevos, ...actualizados] : actualizados;
            });
            // Reconcilia impresos SOLO para los pedidos que cambiaron.
            const impresosDelta = new Set(e.impresos);
            setImpresos((prev) => {
              let cambio = false;
              const next = new Set(prev);
              for (const p of e.pedidos) {
                const debe = impresosDelta.has(p.id);
                if (debe && !next.has(p.id)) {
                  next.add(p.id);
                  cambio = true;
                } else if (!debe && next.has(p.id)) {
                  next.delete(p.id);
                  cambio = true;
                }
              }
              return cambio ? next : prev;
            });
          }
          if (e.meta && Object.keys(e.meta).length) {
            // Deep-merge por pedido: aplica los campos del servidor y conserva
            // los que se estén editando localmente y aún no se hayan guardado.
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

  // Baja de Drivin las asignaciones (comanda -> domiciliario) cada 5s. Con esto
  // SIGCOMPRO sabe a quién asignó Drivin cada pedido facturado.
  useEffect(() => {
    let vivo = true;
    const bajar = () => {
      cargarAsignacionesDrivin()
        .then((mapa) => vivo && setAsignacionesDrivin(mapa ?? {}))
        .catch(() => {
          /* ignore */
        });
    };
    bajar();
    const id = setInterval(bajar, 5000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  // Estado de ENTREGA (POD) de Drivin. Máquina de estados por pedido:
  //   customer_status "approved"    -> estado "Entregado"  (final)
  //   customer_status "rejected"    -> estado "Cancelado"  (anulado; final)
  //   customer_status "in-transit"  -> estado "En tránsito" (sigue consultando)
  //   "pending" / sin POD           -> se deja igual (sigue consultando)
  // El endpoint /pods es POR PEDIDO. Cada ciclo (5s) consulta los NO finales
  // (despachado / en tránsito); los "entregado" solo cada 6 ciclos (~30s), para
  // AUTO-CORREGIR a Cancelado si Drivin los rechazó, sin inflar la consulta.
  const entregaRef = useRef({ pedidos, meta, idsPuntos });
  entregaRef.current = { pedidos, meta, idsPuntos };
  useEffect(() => {
    let vivo = true;
    let enVuelo = false; // evita encaballar consultas (una a la vez)
    let ciclo = 0;
    const revisar = async () => {
      if (enVuelo) return;
      const { pedidos: peds, meta: mts, idsPuntos: ids } = entregaRef.current;
      ciclo += 1;
      const revisarEntregados = ciclo % 6 === 0;
      const candidatos = peds.filter((p) => {
        // Incluye recoge en PDV: también tienen POD en Drivin (se aprueban al
        // entregarse/recogerse).
        if (p.anulado || !p.punto?.id || !ids.has(String(p.punto.id))) return false;
        const e = norm(p.estado);
        if (e === "despachado" || e === "en tránsito") return true;
        if (e === "entregado" && revisarEntregados) return true;
        return false;
      });
      // Códigos Drivin por pedido: si tiene RÉPLICAS son "comanda-N" (cada parte
      // es una orden aparte en Drivin); si no, la comanda base.
      const codigosDe = (p: Pedido): string[] => {
        const reps = mts[p.id]?.replicas ?? [];
        return reps.length > 0
          ? reps.map((r) => `${p.comanda}-${r.numero}`)
          : [p.comanda];
      };
      const comandas = Array.from(
        new Set(candidatos.flatMap(codigosDe).filter(Boolean)),
      );
      if (!comandas.length) return;
      enVuelo = true;
      try {
        const res = await cargarEntregasDrivin(comandas);
        if (!vivo) return;
        for (const p of candidatos) {
          const reps = mts[p.id]?.replicas ?? [];
          // Estado AGREGADO del pedido. Con réplicas: se entrega cuando TODAS
          // las partes están aprobadas; va "en tránsito" si alguna va en camino
          // o ya se entregó. (No se auto-cancela por rechazo parcial.)
          let st: string | null | undefined;
          let entregadoEn: string | null | undefined;
          let comment: string | null | undefined;
          if (reps.length > 0) {
            const infos = reps.map((r) => res[`${p.comanda}-${r.numero}`]);
            const sts = infos.map((x) => x?.status);
            if (sts.length && sts.every((s) => s === "approved")) {
              st = "approved";
              entregadoEn =
                infos.map((x) => x?.entregadoEn).filter(Boolean).sort().pop() ??
                new Date().toISOString();
            } else if (sts.some((s) => s === "in-transit" || s === "approved")) {
              st = "in-transit";
            }
          } else {
            const info = res[p.comanda];
            st = info?.status;
            entregadoEn = info?.entregadoEn;
            comment = info?.comment;
          }
          if (st === "approved") {
            const en = entregadoEn ?? new Date().toISOString();
            setMeta((prev) => {
              if (prev[p.id]?.entregadoEn === en && prev[p.id]?.entregado) return prev;
              actualizarMetaApi(p.id, { entregado: true, entregadoEn: en }).catch(() => { /* ignore */ });
              return { ...prev, [p.id]: { ...prev[p.id], entregado: true, entregadoEn: en } };
            });
            setPedidos((prev) => {
              if (norm(prev.find((x) => x.id === p.id)?.estado) === "entregado") return prev;
              const next = prev.map((x) => (x.id === p.id ? { ...x, estado: "Entregado" as Pedido["estado"] } : x));
              const upd = next.find((x) => x.id === p.id);
              if (upd) guardarPedidoApi(upd).catch(() => { /* ignore */ });
              return next;
            });
          } else if (st === "rejected") {
            const motivo = (comment || "").trim() || "Rechazado por el cliente (Drivin)";
            setPedidos((prev) => {
              const actual = prev.find((x) => x.id === p.id);
              if (!actual || (actual.anulado && norm(actual.estado) === "cancelado")) return prev;
              const next = prev.map((x) =>
                x.id === p.id ? { ...x, anulado: true, estado: "Cancelado" as Pedido["estado"], motivo } : x,
              );
              const upd = next.find((x) => x.id === p.id);
              if (upd) guardarPedidoApi(upd).catch(() => { /* ignore */ });
              return next;
            });
          } else if (st === "in-transit") {
            setPedidos((prev) => {
              // Solo sube de "Despachado" a "En tránsito"; nunca degrada un
              // "Entregado" ya confirmado.
              if (norm(prev.find((x) => x.id === p.id)?.estado) !== "despachado") return prev;
              const next = prev.map((x) => (x.id === p.id ? { ...x, estado: "En tránsito" as Pedido["estado"] } : x));
              const upd = next.find((x) => x.id === p.id);
              if (upd) guardarPedidoApi(upd).catch(() => { /* ignore */ });
              return next;
            });
          }
          // "pending" / sin POD: no se toca (seguirá consultándose).
        }
      } catch {
        /* ignore */
      } finally {
        enVuelo = false;
      }
    };
    revisar();
    const id = setInterval(revisar, 5000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  // Cierra solo el modal de Drivin cuando el envío fue exitoso (a los 4s).
  useEffect(() => {
    if (drivinModal?.estado !== "ok") return;
    const t = setTimeout(() => setDrivinModal(null), 4000);
    return () => clearTimeout(t);
  }, [drivinModal]);

  // AUTO-CORRECCIÓN de estado (SOLO en la vista, no se guarda): si el
  // alistamiento YA terminó (meta.fin) pero el estado quedó desincronizado en
  // "En producción", se muestra como "Alistado" para no bloquear la facturación.
  // Solo aplica a los pedidos de los puntos del usuario. NO persiste ni registra
  // trazabilidad (la factura se habilita porque `alistado` se deriva de meta.fin).
  const alistadoCorregidoRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of pedidos) {
      if (p.anulado) continue;
      // SOLO pedidos de los puntos del usuario: el backend devuelve pedidos de
      // TODOS los puntos, y auto-guardar los de OTROS puntos registraría a este
      // usuario en su trazabilidad sin haberlos tocado.
      if (!p.punto?.id || !idsPuntos.has(String(p.punto.id))) continue;
      if (alistadoCorregidoRef.current.has(p.id)) continue;
      // NO "corregir" a Alistado si el pedido ya avanzó (tiene factura o ya se
      // despachó): hacerlo revertiría el estado puesto por otra estación. Solo se
      // sana la desincronización real "en producción" -> "alistado".
      if (
        meta[p.id]?.fin &&
        norm(p.estado) === "en producción" &&
        !meta[p.id]?.despachoFin &&
        !String(meta[p.id]?.facturaNumero ?? "").trim()
      ) {
        alistadoCorregidoRef.current.add(p.id);
        // Corrección SOLO LOCAL (display): NO se guarda, para no registrar una
        // "edición" en la trazabilidad ni atribuir al usuario un cambio que no
        // hizo. La facturación se habilita igual porque `alistado` se deriva de
        // meta.fin, no del estado guardado.
        setPedidos((prev) =>
          prev.map((x) =>
            x.id === p.id ? { ...x, estado: "Alistado" as Pedido["estado"] } : x,
          ),
        );
      }
    }
  }, [pedidos, meta, idsPuntos]);

  // SINCRONIZACIÓN CONTINUA con Drivin (el domiciliario lo decide Drivin y puede
  // CAMBIAR o DESASIGNARSE, incluso después de despachado):
  //  - Facturado + Drivin asignó  -> guarda el domiciliario y pasa a Despachado.
  //  - Despachado + Drivin cambió  -> actualiza el domiciliario.
  //  - Despachado + Drivin DESASIGNÓ -> quita el domiciliario y vuelve a Facturado
  //    (a esperar hasta que Drivin reasigne).
  // Solo aplica a pedidos de los puntos del usuario y ya subidos a Drivin.
  useEffect(() => {
    // Si el mapa vino vacío (posible fallo de lectura), NO desasignamos nada.
    const mapaTieneDatos = Object.keys(asignacionesDrivin).length > 0;
    for (const p of pedidos) {
      if (p.anulado) continue;
      if (!p.punto?.id || !idsPuntos.has(String(p.punto.id))) continue;
      const m = meta[p.id] ?? {};
      const est = norm(p.estado);
      if (est !== "facturado" && est !== "despachado") continue;

      // BASE: si la comanda está en Drivin, refleja su asignación.
      if (p.comanda in asignacionesDrivin) {
        const asg = asignacionesDrivin[p.comanda]; // {code,nombre} | null
        if (asg) {
          // Drivin tiene un domiciliario asignado.
          const cambioDomi = m.domiciliarioCodigo !== asg.code;
          // NO auto-despachar si hay comprobante subido sin confirmar.
          const compPendiente = !!m.comprobante?.tiene && !m.comprobante?.confirmado;
          const debeDespachar = est === "facturado" && !compPendiente;
          if (cambioDomi || debeDespachar) {
            const despachoFin = m.despachoFin ?? new Date().toISOString();
            const despachadoPor = m.despachadoPor || usuarioDesp?.nombre || "Auto (Drivin)";
            setMeta((prev) => {
              const nuevo = { ...prev[p.id], domiciliario: asg.nombre, domiciliarioCodigo: asg.code, despachoFin, despachadoPor };
              actualizarMetaApi(p.id, { domiciliario: asg.nombre, domiciliarioCodigo: asg.code, despachoFin, despachadoPor }).catch(() => { /* ignore */ });
              return { ...prev, [p.id]: nuevo };
            });
            if (debeDespachar) {
              setPedidos((prev) => {
                const next = prev.map((x) => (x.id === p.id ? { ...x, estado: "Despachado" as Pedido["estado"] } : x));
                const upd = next.find((x) => x.id === p.id);
                if (upd) guardarPedidoApi(upd).catch(() => { /* ignore */ });
                return next;
              });
            }
          }
        } else if (mapaTieneDatos) {
          // Drivin DESASIGNÓ: quitar el domiciliario y, si estaba despachado,
          // volver a Facturado para esperar la reasignación.
          const teniaDomi = !!(m.domiciliario || m.domiciliarioCodigo);
          if (teniaDomi || est === "despachado") {
            setMeta((prev) => {
              const nuevo = { ...prev[p.id], domiciliario: "", domiciliarioCodigo: "" };
              actualizarMetaApi(p.id, { domiciliario: "", domiciliarioCodigo: "" }).catch(() => { /* ignore */ });
              return { ...prev, [p.id]: nuevo };
            });
            if (est === "despachado") {
              setPedidos((prev) => {
                const next = prev.map((x) => (x.id === p.id ? { ...x, estado: "Facturado" as Pedido["estado"] } : x));
                const upd = next.find((x) => x.id === p.id);
                if (upd) guardarPedidoApi(upd).catch(() => { /* ignore */ });
                return next;
              });
            }
          }
        }
      }

      // RÉPLICAS: cada réplica es una orden aparte en Drivin (código "comanda-N").
      // Se baja su domiciliario asignado igual que la base.
      const reps = m.replicas ?? [];
      if (reps.length > 0) {
        let cambioRep = false;
        const nuevas = reps.map((r) => {
          const key = `${p.comanda}-${r.numero}`;
          if (!(key in asignacionesDrivin)) return r;
          const a = asignacionesDrivin[key];
          if (a) {
            if (r.domiciliarioCodigo !== a.code) {
              cambioRep = true;
              return { ...r, domiciliario: a.nombre, domiciliarioCodigo: a.code };
            }
            return r;
          }
          if (mapaTieneDatos && (r.domiciliario || r.domiciliarioCodigo)) {
            cambioRep = true;
            return { ...r, domiciliario: "", domiciliarioCodigo: "" };
          }
          return r;
        });
        if (cambioRep) {
          setMeta((prev) => {
            actualizarMetaApi(p.id, { replicas: nuevas }).catch(() => { /* ignore */ });
            return { ...prev, [p.id]: { ...prev[p.id], replicas: nuevas } };
          });
        }
      }
    }
  }, [pedidos, asignacionesDrivin, idsPuntos, meta, usuarioDesp]);

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

  /** Edita SOLO el método de pago de un pedido y lo persiste. Conserva estado,
   *  factura, alistamiento, confirmación de transferencia y demás información. */
  const cambiarPago = (id: string, pago: string) => {
    if (!permite.pago) {
      sinPermiso.mostrar();
      return;
    }
    setPedidos((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, pago } : p));
      const actualizado = next.find((p) => p.id === id);
      if (actualizado) guardarPedidoApi(actualizado).catch(() => { /* ignore */ });
      return next;
    });
  };

  /** Cambia el estado de un pedido y lo persiste. */
  const cambiarEstado = async (
    id: string,
    estado: Pedido["estado"],
    opts?: { domiManual?: string },
  ) => {
    if (!puedeEstado(estado)) {
      sinPermiso.mostrar();
      return;
    }
    // Validación de flujo (integridad): impide dejar un pedido en un estado
    // final sin sus datos, aunque se use el selector de estado directamente (los
    // botones ya lo validan). Evita pedidos "facturados/despachados" sin
    // porcionador, factura o domiciliario. No aplica al REVERSAR a estados
    // anteriores (solo se exige al colocar Facturado/Despachado).
    const mm = meta[id] ?? {};
    const n = norm(estado);
    const tieneFactura =
      Boolean(mm.facturaNumero?.trim()) &&
      typeof mm.facturaValor === "number" &&
      mm.facturaValor > 0;
    if (n === "facturado" || n === "despachado") {
      const verbo = n === "facturado" ? "facturar" : "despachar";
      if (!mm.porcionador?.trim()) {
        alert(`No se puede ${verbo} sin un porcionador asignado.`);
        return;
      }
      if (!tieneFactura) {
        alert(`No se puede ${verbo} sin número y valor de factura.`);
        return;
      }
    }
    // Comprobante SUBIDO pero SIN confirmar: no se puede FACTURAR (sí puede pasar
    // sin comprobante o con el comprobante confirmado, pero no sin confirmar).
    if (n === "facturado" && mm.comprobante?.tiene && !mm.comprobante?.confirmado) {
      alert("Debes confirmar el comprobante de pago para poder facturar.");
      return;
    }
    if (n === "despachado" && !mm.domiciliario?.trim()) {
      // Solo ADMIN puede asignar un domiciliario MANUAL para cerrar el ciclo
      // (p. ej. si Drivin rebotó el pedido por consecutivo cruzado y no lo
      // asignó). El resto no puede despachar sin domiciliario. Los "recoge en
      // PDV" también llevan domiciliario (el simulado que Drivin asigna).
      const manual = opts?.domiManual?.trim();
      if (manual) {
        mm.domiciliario = manual;
        mm.domiciliarioCodigo = "";
        actualizarMetaApi(id, { domiciliario: manual, domiciliarioCodigo: "" }).catch(() => { /* ignore */ });
        setMeta((prev) => ({
          ...prev,
          [id]: { ...prev[id], domiciliario: manual, domiciliarioCodigo: "" },
        }));
      } else if (tieneAccesoAdministrativo(usuarioDesp?.rol)) {
        // Abre el modal para elegir el domiciliario del punto y reintenta.
        setDespachoManualSel("");
        setDespachoManual({ id });
        return;
      } else {
        alert("No se puede despachar sin un domiciliario asignado.");
        return;
      }
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
    // Al pasar a "Facturado" se registra el facturador y se SUBE el pedido a
    // Drivin SIN domiciliario: Drivin asigna el vehículo y SIGCOMPRO lo baja
    // luego (poll de asignaciones) para despachar automáticamente.
    if (norm(estado) === "facturado") {
      const facturadoPor = usuarioDesp?.nombre ?? "";
      actualizarMetaApi(id, { facturadoPor }).catch(() => { /* ignore */ });
      setMeta((prev) => ({ ...prev, [id]: { ...prev[id], facturadoPor } }));
      // NO reenviar si ya se subió antes (p. ej. si revierten a Alistado y
      // vuelven a facturar por corregir la factura/un valor). La bandera
      // `drivinEnviado` queda PERSISTIDA en la meta.
      const sinReplicas = (mm.replicas ?? []).length === 0;
      if (
        sinReplicas &&
        !mm.drivinEnviado &&
        !drivinDespachoRef.current.has(id)
      ) {
        drivinDespachoRef.current.add(id);
        const comanda = pedidos.find((x) => x.id === id)?.comanda ?? id;
        setDrivinModal({ estado: "enviando", comanda });
        enviarADrivinApi(id)
          .then(() => {
            setDrivinModal({ estado: "ok", comanda });
            actualizarMetaApi(id, { drivinEnviado: true }).catch(() => { /* ignore */ });
            setMeta((prev) => ({ ...prev, [id]: { ...prev[id], drivinEnviado: true } }));
          })
          .catch((e) => {
            drivinDespachoRef.current.delete(id); // permite reintentar
            setDrivinModal({
              estado: "error",
              comanda,
              msg: e instanceof Error ? e.message : "",
            });
          });
      }
    }
    // Para facturar/despachar, garantiza que la factura ya quedó PERSISTIDA en
    // el backend antes de guardar el pedido (evita que la validación del backend
    // falle por una carrera si el último dato de factura seguía en vuelo).
    if (n === "facturado" || n === "despachado") {
      try {
        await actualizarMetaApi(id, {
          facturaNumero: mm.facturaNumero,
          facturaValor: mm.facturaValor,
        });
      } catch {
        /* si falla, el guardado del pedido reflejará el rechazo */
      }
    }
    // Al facturar/despachar, si el backend RECHAZA el guardado (p. ej. por falta
    // de número o valor de factura) se revierte el estado optimista para no
    // mostrarlo como hecho.
    const revertible = n === "facturado" || n === "despachado";
    setPedidos((prev) => {
      const estadoAnterior = prev.find((p) => p.id === id)?.estado;
      const next = prev.map((p) => (p.id === id ? { ...p, estado } : p));
      const actualizado = next.find((p) => p.id === id);
      if (actualizado)
        guardarPedidoApi(actualizado).catch(() => {
          if (!revertible) return;
          setPedidos((cur) =>
            cur.map((p) =>
              p.id === id ? { ...p, estado: estadoAnterior ?? p.estado } : p,
            ),
          );
          alert(
            "No se pudo facturar o despachar: falta el número o el valor de la factura.",
          );
        });
      return next;
    });
  };

  /**
   * Reversa/cambia el estado de un pedido (solo administradores). Al REVERSAR
   * (ir a un estado anterior del flujo) libera los tiempos de los pasos que se
   * deshacen, para poder rehacer el alistamiento/despacho. Al avanzar o mantener
   * el estado se conservan los tiempos ya tomados.
   */
  const reversarEstado = (id: string, nuevoEstado: Pedido["estado"]) => {
    if (!puedeEstado(nuevoEstado)) {
      sinPermiso.mostrar();
      return;
    }
    const actual = pedidos.find((p) => p.id === id);
    const idxActual = ESTADOS_FLUJO.findIndex(
      (s) => norm(s) === norm(actual?.estado),
    );
    const idxNuevo = ESTADOS_FLUJO.findIndex(
      (s) => norm(s) === norm(nuevoEstado),
    );
    // Solo si es una REVERSA (estado destino anterior al actual) se limpian los
    // DATOS y tiempos de los pasos que se deshacen: si se devuelve un pedido es
    // para corregir, así que las etapas posteriores quedan en blanco para
    // rehacerse (porcionador, factura, domiciliario, réplicas, etc.).
    if (idxNuevo >= 0 && idxActual >= 0 && idxNuevo < idxActual) {
      const n = norm(nuevoEstado);
      const reset: Record<string, unknown> = {};
      const limpiarProduccion = () => {
        reset.porcionador = null;
        reset.inicio = null;
      };
      const limpiarAlistado = () => {
        reset.fin = null;
      };
      const limpiarFactura = () => {
        reset.facturaNumero = "";
        reset.facturaValor = null;
        reset.facturadoPor = null;
        reset.pagoConfirmado = null;
      };
      const limpiarDespacho = () => {
        reset.domiciliario = null;
        reset.despachoFin = null;
        reset.despachadoPor = null;
        reset.replicas = [];
      };
      if (n === "en proceso") {
        limpiarProduccion();
        limpiarAlistado();
        limpiarFactura();
        limpiarDespacho();
      } else if (n === "en producción") {
        // Al regresar a "En producción" (Preparado) se REINICIA el alistamiento:
        // se libera el porcionador y se reinician los tiempos (inicio y fin);
        // además se rehace lo que viene después (factura y despacho).
        limpiarProduccion();
        limpiarAlistado();
        limpiarFactura();
        limpiarDespacho();
      } else if (n === "alistado") {
        limpiarFactura();
        limpiarDespacho();
      } else if (n === "facturado") {
        limpiarDespacho();
      }
      if (Object.keys(reset).length) {
        actualizarMeta(id, reset as Partial<DespachoMeta>);
      }
    }
    cambiarEstado(id, nuevoEstado);
  };

  // Verifica la clave dinámica y, si es válida, REINICIA los tiempos de
  // alistamiento del pedido (inicio y fin). El estado vuelve a "En proceso"
  // para que el porcionador pueda arrancar de nuevo el alistamiento.
  const confirmarResetTiempos = async () => {
    if (verificandoReset || !resetTiemposId) return;
    const codigo = codigoReset.replace(/\D/g, "");
    if (codigo.length !== 6) {
      setErrorReset("Ingresa la clave dinámica de 6 dígitos.");
      return;
    }
    setVerificandoReset(true);
    setErrorReset(null);
    try {
      const { valido } = await verificarClaveDinamica(codigo);
      if (!valido) {
        setErrorReset("Clave incorrecta o vencida.");
        return;
      }
      const id = resetTiemposId;
      actualizarMeta(id, { inicio: null, fin: null } as unknown as Partial<DespachoMeta>);
      setPedidos((prev) => {
        const next = prev.map((p) =>
          p.id === id ? { ...p, estado: "En proceso" as Pedido["estado"] } : p,
        );
        const actualizado = next.find((p) => p.id === id);
        if (actualizado) guardarPedidoApi(actualizado).catch(() => { /* ignore */ });
        return next;
      });
      setResetTiemposId(null);
      setCodigoReset("");
    } catch {
      setErrorReset("No se pudo verificar la clave. Inténtalo de nuevo.");
    } finally {
      setVerificandoReset(false);
    }
  };

  /* --- Comprobante de pago (imagen) por pedido --- */
  // Abre el selector de archivo para subir/reemplazar el comprobante del pedido.
  const abrirSelectorComprobante = (id: string) => {
    setCompSubirId(id);
    if (compFileRef.current) {
      compFileRef.current.value = "";
      compFileRef.current.click();
    }
  };

  // Procesa los archivos elegidos (uno o VARIOS): comprime, sube (agrega) cada
  // uno y refleja la bandera en la meta.
  const onArchivoComprobante = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const id = compSubirId;
    e.target.value = "";
    if (!files.length || !id) return;
    const imagenes = files.filter((f) => f.type.startsWith("image/"));
    if (!imagenes.length) {
      alert("El comprobante debe ser una imagen.");
      return;
    }
    setCompSubiendo((prev) => ({ ...prev, [id]: true }));
    try {
      const subidas: string[] = [];
      for (const file of imagenes) {
        const { dataUrl, mime } = await comprimirImagen(file);
        await subirComprobanteApi(id, dataUrl, mime, usuarioDesp?.nombre ?? null);
        subidas.push(dataUrl);
      }
      setCompImg((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), ...subidas] }));
      setCompDesbloqueo((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setMeta((prev) => ({
        ...prev,
        [id]: { ...prev[id], comprobante: { tiene: true, confirmado: false } },
      }));
    } catch {
      alert("No se pudo subir el comprobante. Inténtalo de nuevo.");
    } finally {
      setCompSubiendo((prev) => ({ ...prev, [id]: false }));
      setCompSubirId(null);
    }
  };

  // Abre la galería del comprobante (lo consulta si no está en caché).
  const verComprobante = async (id: string) => {
    const cache = compImg[id];
    if (cache && cache.length) {
      setCompModal({ id, indice: 0 });
      return;
    }
    try {
      const c = await obtenerComprobanteApi(id);
      const imgs = (c?.imagenes ?? []).map((x) => x.imagen).filter(Boolean);
      if (!imgs.length) {
        alert("Este pedido no tiene comprobante cargado.");
        return;
      }
      setCompImg((prev) => ({ ...prev, [id]: imgs }));
      setCompModal({ id, indice: 0 });
    } catch {
      alert("No se pudo cargar el comprobante.");
    }
  };

  // Confirma el comprobante: queda solo de lectura.
  const confirmarComprobante = async (id: string) => {
    try {
      await confirmarComprobanteApi(id, usuarioDesp?.nombre ?? null);
      setCompDesbloqueo((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setMeta((prev) => ({
        ...prev,
        [id]: { ...prev[id], comprobante: { tiene: true, confirmado: true } },
      }));
      // Al confirmar, cierra la ventana del comprobante.
      setCompModal((prev) => (prev && prev.id === id ? null : prev));
    } catch {
      alert("No se pudo confirmar el comprobante.");
    }
  };

  // Elimina el comprobante del pedido (con confirmación).
  // Elimina UNA imagen del comprobante (por índice) o TODAS (indice undefined).
  const eliminarComprobante = async (id: string, indice?: number) => {
    const varias = (compImg[id]?.length ?? 0) > 1;
    const msg =
      typeof indice === "number" && varias
        ? "¿Eliminar esta imagen del comprobante?"
        : "¿Eliminar el comprobante de pago de este pedido?";
    if (!window.confirm(msg)) return;
    try {
      await eliminarComprobanteApi(id, indice);
      // Actualiza la caché local de imágenes.
      const restantes =
        typeof indice === "number"
          ? (compImg[id] ?? []).filter((_, i) => i !== indice)
          : [];
      setCompImg((prev) => {
        const next = { ...prev };
        if (restantes.length) next[id] = restantes;
        else delete next[id];
        return next;
      });
      setCompModal((prev) => {
        if (!prev || prev.id !== id) return prev;
        if (!restantes.length) return null;
        return { id, indice: Math.min(prev.indice, restantes.length - 1) };
      });
      setCompDesbloqueo((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setMeta((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          comprobante: restantes.length ? { tiene: true, confirmado: false } : null,
        },
      }));
    } catch {
      alert("No se pudo eliminar el comprobante.");
    }
  };

  // Verifica la clave dinámica para desbloquear un comprobante ya confirmado.
  const confirmarClaveComprobante = async () => {
    if (verificandoComp || !compClaveId) return;
    const codigo = codigoComp.replace(/\D/g, "");
    if (codigo.length !== 6) {
      setErrorComp("Ingresa la clave dinámica de 6 dígitos.");
      return;
    }
    setVerificandoComp(true);
    setErrorComp(null);
    try {
      const { valido } = await verificarClaveDinamica(codigo);
      if (!valido) {
        setErrorComp("Clave incorrecta o vencida.");
        return;
      }
      const id = compClaveId;
      setCompDesbloqueo((prev) => new Set(prev).add(id));
      setCompClaveId(null);
      setCodigoComp("");
    } catch {
      setErrorComp("No se pudo verificar la clave. Inténtalo de nuevo.");
    } finally {
      setVerificandoComp(false);
    }
  };


  // Agrega la siguiente réplica en secuencia (máx. 5) con su domiciliario.
  const crearReplica = (id: string, domiciliario: string, code?: string) => {
    const actuales = meta[id]?.replicas ?? [];
    const max = actuales.reduce((mx, r) => Math.max(mx, r.numero), 0);
    if (max >= 5) return;
    actualizarMeta(id, {
      replicas: [
        ...actuales,
        { numero: max + 1, domiciliario, domiciliarioCodigo: code },
      ],
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
  // Marca una réplica como ya subida a Drivin (setMeta funcional para leer el
  // estado más reciente, incluso si la réplica se acaba de crear).
  const marcarReplicaDrivin = (id: string, numero: number) => {
    setMeta((prev) => {
      const actuales = prev[id]?.replicas ?? [];
      const replicas = actuales.map((r) =>
        r.numero === numero ? { ...r, drivinEnviado: true } : r,
      );
      actualizarMetaApi(id, { replicas }).catch(() => { /* ignore */ });
      return { ...prev, [id]: { ...prev[id], replicas } };
    });
  };

  const pedidosVisibles = useMemo(() => {
    if (!filtroListo) return [];
    return pedidos.filter((p) => p.punto?.id != null && idsPuntos.has(String(p.punto.id)));
  }, [pedidos, filtroListo, idsPuntos]);

  // Clones por comanda de origen: comanda del pedido -> comandas de sus clones.
  // Sirve para mostrar la relación de clonación en ambos sentidos (como en Pedidos).
  const clonesPorComanda = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const p of pedidos) {
      if (!p.clonadoDe) continue;
      const arr = mapa.get(p.clonadoDe);
      if (arr) arr.push(p.comanda);
      else mapa.set(p.clonadoDe, [p.comanda]);
    }
    return mapa;
  }, [pedidos]);

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

  // Número del día (turno) por punto: se calcula desde la lista completa
  // (arrastrados primero, luego por orden de llegada), único por punto/día y
  // estable — un mismo pedido no cambia de número.
  const numeroDelDiaPorId = useMemo(
    () => numerosDelDia(pedidosVisibles),
    [pedidosVisibles],
  );

  // Pedidos atrasados del día: venció su ventana y siguen sin despachar.
  const atrasados = useMemo(() => {
    return pedidosDeHoy.filter((p) => {
      if (p.anulado) return false;
      const e = norm(p.estado);
      if (yaDespachado(p.estado) || e === "anulado") return false;
      // Transferencia sin confirmar -> objetivo Infinity -> nunca atrasado.
      return msRestantesDespacho(p, ahora, meta[p.id]?.pagoConfirmado) <= 0;
    });
  }, [pedidosDeHoy, meta, ahora]);
  const atrasadosIds = useMemo(
    () => new Set(atrasados.map((p) => p.id)),
    [atrasados],
  );

  const pedidosOrdenados = useMemo(
    () => {
      const hoy = hoyISO();
      // ¿Arrastrado? Pedido activo cuyo día de entrega ya pasó (quedó pendiente
      // de un día anterior). Estos deben salir PRIMERO para no perderse de vista.
      const esArrastrado = (p: Pedido) =>
        diaEntregaISO(p) < hoy &&
        !p.anulado &&
        !yaDespachado(p.estado) &&
        norm(p.estado) !== "anulado";
      return pedidosVisibles.slice().sort((a, b) => {
        // 1) Arrastrados de días anteriores van ARRIBA del todo.
        const ra = esArrastrado(a) ? 0 : 1;
        const rb = esArrastrado(b) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        // 2) Los posteriores YA IMPRESOS (programados a futuro) van al final; los
        // posteriores sin imprimir se ordenan como los de hoy (posición normal).
        const fa = esPosteriorFuturo(a) && impresos.has(a.id) ? 1 : 0;
        const fb = esPosteriorFuturo(b) && impresos.has(b.id) ? 1 : 0;
        if (fa !== fb) return fa - fb;
        // 3) Entre arrastrados, el más antiguo primero (más urgente); en el resto,
        // orden por número del día (turno) DESCENDENTE (el último que entra arriba).
        if (ra === 0 && rb === 0) {
          return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
        }
        const na = numeroDelDiaPorId.get(a.id) ?? 0;
        const nb = numeroDelDiaPorId.get(b.id) ?? 0;
        if (na !== nb) return nb - na;
        return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
      });
    },
    [pedidosVisibles, numeroDelDiaPorId, impresos],
  );

  // Filtra por consecutivo, nombre del cliente o NIT/cédula del cliente.
  const pedidosFiltrados = useMemo(() => {
    const q = norm(busqueda);
    const coincide = (p: Pedido) => {
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
    };
    // Con BÚSQUEDA activa: busca SOLO en los pedidos de HOY (cualquier estado),
    // sin importar la card seleccionada. Nunca trae pedidos de días anteriores.
    if (q) return pedidosOrdenados.filter((p) => coincide(p) && esDeHoy(p));

    const esAnulado = (p: Pedido) => p.anulado || norm(p.estado) === "anulado";
    // Si hay una card de estado seleccionada, filtra por ese estado; si no,
    // muestra la vista activa (oculta despachados y cancelados).
    const estadoSel = vista ? ESTADOS.find((e) => e.key === vista) : null;
    return pedidosOrdenados.filter((p) => {
      if (vista === "atrasados") return atrasadosIds.has(p.id);
      if (vista === "posteriores") return esPosteriorFuturo(p) && impresos.has(p.id);
      // La card "Total" trae TODOS los pedidos en cualquier estado: los de HOY
      // (incluidos despachados, anulados y atrasados) + los Posteriores impresos.
      if (vista === "total")
        return esDeHoy(p) || (esPosteriorFuturo(p) && impresos.has(p.id));
      // Un pedido atrasado sale de su card de proceso (alistado, producción…) y
      // solo aparece bajo "Atrasados", así el conteo coincide con la tabla.
      if (estadoSel) return esDeHoy(p) && estadoSel.match(p) && !atrasadosIds.has(p.id);
      // Vista por defecto: activos de HOY + posteriores aún no impresos (para
      // poder imprimir su comanda; al imprimirse salen de aquí y quedan solo en
      // la card de Posteriores). Oculta los ya despachados/en tránsito/entregados.
      const activo = !yaDespachado(p.estado) && !esAnulado(p);
      if (!activo) return false;
      if (esDeHoy(p)) return true;
      if (esPosteriorFuturo(p) && !impresos.has(p.id)) return true;
      return false;
    });
  }, [pedidosOrdenados, busqueda, vista, atrasadosIds, impresos]);

  // Pedidos visibles cuya comanda AÚN no se ha impreso (excluye anulados).
  const noImpresos = useMemo(
    () =>
      pedidosFiltrados.filter((p) => !p.anulado && !impresos.has(p.id)).length,
    [pedidosFiltrados, impresos],
  );

  // Pedidos pendientes (ni despachados ni anulados) clasificados por su cronómetro.
  const { porVencer, vencidos } = useMemo(() => {
    const pendientes = pedidosDeHoy.filter(
      (p) => !p.anulado && !yaDespachado(p.estado) && norm(p.estado) !== "anulado",
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
      {/* Encabezado + cards Total/Entregados alineadas al grid (misma columna/tamaño). */}
      <div className="mb-3 grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <div className="col-span-2 flex flex-col justify-center sm:col-span-1 lg:col-span-2 xl:col-span-3">
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
        {/* Cards TOTAL y ENTREGADOS: celdas del grid (mismo tamaño que las de abajo). */}
        <button
          type="button"
          onClick={() => setVista((v) => (v === "total" ? null : "total"))}
          aria-pressed={vista === "total"}
          title={vista === "total" ? "Ocultar filtro: Total" : "Filtrar pedidos por: Total"}
          className={`group flex items-center gap-3 rounded-xl border p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
            vista === "total"
              ? "border-brand-wine bg-brand-wine/5 ring-1 ring-brand-wine"
              : "border-brand-brown/10 bg-white"
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-wine/10 text-brand-wine">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
              {Icono.caja}
            </svg>
          </span>
          <div className="min-w-0 pr-1">
            <p className="text-xs font-semibold text-brand-black">Total</p>
            <p className="text-[10px] text-brand-brown/55">Activos de hoy</p>
            <p className="text-[10px] font-semibold text-brand-wine">
              {vista === "total" ? "Mostrando · clic para ocultar" : "Clic para ver"}
            </p>
          </div>
          <span className="ml-auto text-2xl font-extrabold leading-none text-brand-black">
            {pedidosDeHoy.length + posterioresFuturos.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setVista((v) => (v === "entregados" ? null : "entregados"))}
          aria-pressed={vista === "entregados"}
          title={vista === "entregados" ? "Ocultar filtro: Entregados" : "Filtrar pedidos por: Entregados"}
          className={`group flex items-center gap-3 rounded-xl border p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
            vista === "entregados"
              ? "border-brand-wine bg-brand-wine/5 ring-1 ring-brand-wine"
              : "border-brand-brown/10 bg-white"
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </span>
          <div className="min-w-0 pr-1">
            <p className="text-xs font-semibold text-brand-black">Entregados</p>
            <p className="text-[10px] text-brand-brown/55">Entregados (Drivin)</p>
            <p className="text-[10px] font-semibold text-brand-wine">
              {vista === "entregados" ? "Mostrando · clic para ocultar" : "Clic para ver"}
            </p>
          </div>
          <span className="ml-auto text-2xl font-extrabold leading-none text-brand-black">
            {pedidosDeHoy.filter((p) => norm(p.estado) === "entregado").length}
          </span>
        </button>
      </div>

      {/* Grid de estados */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {ESTADOS.filter((e) => e.key !== "total" && e.key !== "entregados").map((e) => {
            const valorDeCard = (def: EstadoDef) =>
              def.key === "atrasados"
                ? atrasados.length
                : def.key === "posteriores"
                  ? posterioresFuturos.length
                  : // Un pedido atrasado se contabiliza SOLO en la card "Atrasados"
                    // (aunque su estado real sea alistado/producción/etc.), para no
                    // duplicarlo ni inflar el Total.
                    pedidosDeHoy.filter((p) => def.match(p) && !atrasadosIds.has(p.id)).length;
            // El Total = TODOS los pedidos de cualquier estado: los de hoy +
            // los Posteriores (programados a futuro ya impresos). Así el Total
            // coincide con la suma de todas las cards (incluida Posteriores).
            const valor =
              e.key === "total"
                ? pedidosDeHoy.length + posterioresFuturos.length
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
            {noImpresos > 0 && (
              <span
                title="Pedidos cuya comanda aún no se ha impreso"
                className="flex items-center gap-1 rounded-full bg-brand-amber/15 px-2.5 py-0.5 text-xs font-semibold text-brand-amber"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
                </svg>
                {noImpresos} sin imprimir
              </span>
            )}
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
              placeholder="Buscar por consecutivo, cliente o NIT (en cualquier estado)..."
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
                <th className="border-r border-brand-brown/10 px-3 py-2.5 font-semibold">Cliente / info. del pedido</th>
                <th className="border-r border-brand-brown/10 px-3 py-2.5 font-semibold">Estado actual del pedido</th>
                <th className="border-r border-brand-brown/10 px-3 py-2.5 font-semibold">Preparación y alistamiento</th>
                <th className="border-r border-brand-brown/10 px-3 py-2.5 font-semibold">Facturación</th>
                <th className="border-r border-brand-brown/10 px-3 py-2.5 font-semibold">Despacho</th>
                <th className="px-3 py-2.5 font-semibold">Temporizador</th>
              </tr>
            </thead>
            <tbody className="divide-y-4 divide-double divide-brand-brown/20">
              {pedidosFiltrados.map((p) => {
                const anulado = p.anulado;
                const estado = anulado ? (p.estado === "Cancelado" ? "Cancelado" : "Anulado") : p.estado || "En proceso";
                const m = meta[p.id] ?? {};
                const porcSel = porcBorrador[p.id] ?? m.porcionador ?? "";
                // Porcionadores y domiciliarios del punto de venta de este pedido.
                const personal = personalPorPunto[String(p.punto?.id ?? "")] ?? {
                  porcionadores: [],
                  domiciliarios: [],
                };
                const porcionadores = [...personal.porcionadores].sort((a, b) =>
                  a.localeCompare(b, "es", { sensitivity: "base" }),
                );
                // Bloqueos: un pedido despachado ya no se reversa; uno facturado no se vuelve a facturar.
                // "En tránsito" y "Entregado" cuentan como despachado (ya salió a reparto).
                const despachado = yaDespachado(estado);
                const facturado = norm(estado) === "facturado" || despachado;
                // Solo se puede facturar cuando el pedido ya está alistado. Si el
                // alistamiento YA terminó (m.fin) pero el estado quedó pegado en
                // "En producción", se considera alistado igual (y se auto-corrige).
                const alistado =
                  norm(estado) === "alistado" ||
                  (Boolean(m.fin) && !facturado && !despachado);
                // Transferencia: el cobro se confirma aparte para congelar el cronómetro.
                const transferencia = norm(p.pago) === "transferencia";
                const pagoConfirmado = Boolean(m.pagoConfirmado);
                // Comprobante de pago: solo aplica a transferencia o mixto.
                const mixto = norm(p.pago) === "mixto";
                const requiereComprobante = transferencia || mixto;
                const comp = m.comprobante ?? null;
                const compConfirmado = Boolean(comp?.confirmado);
                // Comprobante SUBIDO pero SIN confirmar: bloquea el despacho.
                const comprobantePendiente = Boolean(comp?.tiene) && !compConfirmado;
                // El cliente recoge en el punto de venta (no lleva domiciliario).
                const esRecoge = p.entrega === "recoge";
                // Pedido pequeño (≤10 kg): alistado de 40 min (rojo a los 20 min).
                const esPequeno = esPedidoPequeno(p);
                // Límite de DURACIÓN del alistamiento (producción): pequeño 40 min,
                // recoge 2h, resto (normal/transferencia) 1h. El "Cumplido" se mide
                // por lo que TARDÓ el alistamiento (fin − inicio), no por el reloj
                // de entrega.
                const limitePrepMs = esPequeno
                  ? LIMITE_ALISTADO_PEQUENO_MS
                  : esRecoge
                    ? LIMITE_DESPACHO_MS
                    : ALERTA_DESPACHO_MS;
                // Arrastrado: pedido activo que quedó pendiente de un día anterior.
                const esArrastrado =
                  diaEntregaISO(p) < hoyISO() &&
                  !anulado &&
                  norm(estado) !== "despachado" &&
                  norm(estado) !== "anulado";
                // Posterior aún sin procesar: se muestra como "Posterior" (no "Pendiente").
                const esPosteriorPend = esPosteriorFuturo(p) && norm(estado) === "en proceso";
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
                          {clonesPorComanda.get(p.comanda) && (
                            <p className="mt-0.5 text-[11px] font-medium text-brand-wine">
                              Ya clonado en #{clonesPorComanda.get(p.comanda)!.join(", #")}
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
                      <div className={puedeCambiarEstadoManual && !anulado ? "pb-14" : ""}>
                      <div
                        className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${
                          esPosteriorPend
                            ? "border-blue-200 bg-blue-50 text-blue-600"
                            : colorEstado(estado)
                        }`}
                      >
                        <span className="uppercase tracking-wide">{esPosteriorPend ? "Posterior" : norm(estado) === "en proceso" ? "Pendiente" : estado}</span>
                      </div>
                      {anulado && p.motivo && (
                        <div className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-center text-[11px] font-medium text-red-600">
                          Motivo: {p.motivo}
                        </div>
                      )}
                      <div className="mt-1.5 rounded-lg border border-brand-brown/10 bg-brand-cream-soft/40 px-3 py-1.5 text-center text-xs font-semibold text-brand-brown/70">
                        ENTREGA: {fmtFecha(fechaEntregaISO(p))}
                      </div>
                      {esArrastrado && (
                        <div className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-red-600">
                          Pendiente de días anteriores
                        </div>
                      )}
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
                          <div className="mt-1.5 rounded-lg border border-brand-amber/25 px-3 py-1.5 text-center text-[11px] font-bold tracking-wide text-brand-amber">
                            {tiempoEnEstado(p.fecha)}
                          </div>
                        )
                      )}
                      </div>
                      {puedeCambiarEstadoManual && !anulado && (
                        <div className="absolute inset-x-3 bottom-3">
                          <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-brand-brown/40">
                            Cambiar estado
                          </label>
                          <select
                            value={ESTADOS_FLUJO.find((s) => norm(s) === norm(estado)) ?? "En proceso"}
                            onChange={(ev) => reversarEstado(p.id, ev.target.value as Pedido["estado"])}
                            className="w-full rounded-lg border border-brand-wine/25 bg-brand-wine/5 px-2 py-1.5 text-xs font-semibold text-brand-wine outline-none focus:ring-1 focus:ring-brand-wine"
                          >
                            {ESTADOS_FLUJO.map((s) => (
                              <option key={s} value={s} disabled={!puedeEstado(s)}>
                                {ETIQUETA_ESTADO_FLUJO[s] ?? s}
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
                          <button
                            type="button"
                            onClick={() => {
                              setResetTiemposId(p.id);
                              setCodigoReset("");
                              setErrorReset(null);
                            }}
                            title="Clic para reiniciar los tiempos de alistamiento (requiere clave dinámica)"
                            className="space-y-0.5 rounded-lg px-1.5 py-1 text-left text-[11px] font-semibold text-brand-brown/60 transition hover:bg-brand-amber/10"
                          >
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
                          </button>
                        )}
                        <select
                          value={porcSel}
                          onChange={(ev) =>
                            setPorcBorrador((prev) => ({ ...prev, [p.id]: ev.target.value }))
                          }
                          disabled={anulado || Boolean(m.fin) || !impreso || (!puedeEstado("En producción") && !puedeEstado("Alistado"))}
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
                            disabled={anulado || !impreso || (!m.inicio && !porcSel.trim()) || (!puedeEstado("En producción") && !puedeEstado("Alistado"))}
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
                              puedeEstado(m.inicio ? "Alistado" : "En producción") ? "" : "opacity-50"
                            } ${
                              m.inicio
                                ? "bg-green-600 hover:bg-green-700"
                                : "bg-brand-amber hover:bg-brand-amber/90"
                            }`}
                          >
                            {m.inicio ? "Finalizar Preparación" : "Iniciar alistamiento"}
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
                          disabled={anulado || facturado || !alistado || (transferencia && !pagoConfirmado) || !puedeEstado("Facturado")}
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
                          disabled={anulado || facturado || !alistado || (transferencia && !pagoConfirmado) || !puedeEstado("Facturado")}
                          placeholder="Valor factura"
                          className="rounded-lg border border-brand-brown/15 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-black outline-none focus:ring-1 focus:ring-brand-amber disabled:opacity-50"
                        />
                        {typeof m.facturaValor === "number" && m.facturaValor > 0 && (
                          <p className="text-[11px] font-semibold text-brand-wine">
                            Valor factura: {fmtMoneda(m.facturaValor)}
                          </p>
                        )}
                        {m.facturadoPor && (
                          <p className="text-[11px] font-medium text-brand-brown/60">
                            Facturó: {m.facturadoPor}
                          </p>
                        )}
                        {requiereComprobante && (
                          <div className="mt-1 border-t border-brand-brown/10 pt-1.5">
                            {!comp?.tiene ? (
                              <button
                                type="button"
                                onClick={() => abrirSelectorComprobante(p.id)}
                                disabled={anulado || compSubiendo[p.id]}
                                title="Adjuntar la imagen del comprobante de pago"
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-400 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                                </svg>
                                {compSubiendo[p.id] ? "Subiendo…" : "Subir comprobante de pago"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => verComprobante(p.id)}
                                title="Ver y gestionar el comprobante de pago"
                                className={`flex w-full items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                                  compConfirmado
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                  </svg>
                                  Comprobante
                                </span>
                                <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-bold">
                                  {compConfirmado ? "Confirmado" : "Sin confirmar"}
                                </span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="absolute inset-x-3 bottom-3">
                        {transferencia && !pagoConfirmado && !facturado && !despachado ? (
                          <button
                            onClick={() =>
                              actualizarMeta(p.id, { pagoConfirmado: new Date().toISOString() })
                            }
                            disabled={anulado || !impreso || !puedeEstado("Facturado")}
                            title={!impreso ? "Imprime la comanda primero" : "Confirma la transferencia e inicia el cronómetro de 1 hora para despachar"}
                            className={`w-full whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40 ${puedeEstado("Facturado") ? "" : "opacity-50"}`}
                          >
                            Confirmar transferencia
                          </button>
                        ) : (
                          <button
                            onClick={() => cambiarEstado(p.id, "Facturado")}
                            disabled={anulado || facturado || !alistado || comprobantePendiente || !puedeEstado("Facturado")}
                            title={
                              !alistado && !facturado
                                ? "Debes terminar el alistamiento antes de facturar"
                                : comprobantePendiente
                                  ? "Debes confirmar el comprobante de pago para facturar"
                                  : !m.facturaNumero?.trim() || !(typeof m.facturaValor === "number" && m.facturaValor > 0)
                                    ? "Ingresa el número y el valor de la factura para facturar"
                                    : "Marcar el pedido como facturado"
                            }
                            className={`w-full whitespace-nowrap rounded-lg bg-brand-amber px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-amber/90 disabled:opacity-40 ${puedeEstado("Facturado") ? "" : "opacity-50"}`}
                          >
                            Facturado
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Domiciliario: al asignar pasa a Despachado */}
                    <td className="relative h-full border-r border-brand-brown/10 px-3 py-3 align-top">
                      <div className="flex w-full flex-col gap-1.5 pb-12">
                        {/* Indicador (solo visual) de que el cliente RECOGE en el
                            punto de venta. */}
                        {esRecoge && (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-brand-wine/25 bg-brand-wine/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-wine">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13 5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
                            </svg>
                            Recoge en PDV
                          </span>
                        )}
                        {/* Domiciliario: lo ASIGNA Drivin. SIGCOMPRO solo lo
                            muestra (y despacha automáticamente al bajarlo). Los
                            "recoge en PDV" llevan el domiciliario simulado que
                            Drivin asigna para tener trazabilidad. */}
                        {m.domiciliario ? (
                          <div className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-wide text-green-700/70">
                              Domiciliario (Drivin)
                            </p>
                            <p className="text-xs font-semibold text-green-800">{m.domiciliario}</p>
                            {m.entregado && (
                              <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-green-700">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3 w-3">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                                Entregado{m.entregadoEn ? ` · ${fmtHora(m.entregadoEn)}` : ""}
                              </p>
                            )}
                          </div>
                        ) : facturado ? (
                          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700">
                            <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                            {esRecoge
                              ? "Esperando que asignes como recoge en punto de venta"
                              : "En espera de domiciliario…"}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-brand-brown/15 bg-brand-cream-soft/40 px-2.5 py-1.5 text-xs text-brand-brown/50">
                            {esRecoge
                              ? "Factura el pedido y asígnalo en Drivin como recoge en punto de venta."
                              : "Factura el pedido y asigna en Drivin el domiciliario."}
                          </div>
                        )}

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
                          disabled={anulado || despachado || !facturado || !puedeEstado("Despachado")}
                          title={
                            !facturado && !despachado
                              ? "Debes facturar el pedido antes de despachar"
                              : !m.domiciliario?.trim()
                                ? "Asigna un domiciliario para despachar"
                                : "Marcar el pedido como despachado"
                          }
                          className={`w-full whitespace-nowrap rounded-lg bg-brand-wine px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-40 ${puedeEstado("Despachado") ? "" : "opacity-50"}`}
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

                          // Transferencia: el cronómetro (1 hora) corre desde que
                          // se confirma el pago. Solo se muestra "Esperando
                          // transferencia" si el pedido AÚN no ha empezado; si ya se
                          // alistó/facturó/despachó (p. ej. se corrigió el método de
                          // pago), se conserva su cronómetro/estado usando la creación
                          // como base. Los "recoge" NO usan esta rama (objetivo 6 PM).
                          if (esTransferencia(p) && !esRecoge) {
                            const yaEmpezo =
                              Boolean(m.inicio) || Boolean(m.fin) || facturado || despachado;
                            if (!m.pagoConfirmado && !yaEmpezo) {
                              return (
                                <div className={`${box} border-blue-200 bg-blue-50 text-blue-600`}>
                                  Esperando transferencia
                                </div>
                              );
                            }
                            const baseMs = m.pagoConfirmado
                              ? new Date(m.pagoConfirmado).getTime()
                              : new Date(p.fecha).getTime();
                            const deadline = baseMs + LIMITE_TRANSFERENCIA_MS;
                            const rest = deadline - ahora;
                            const claseTransfer =
                              rest <= 30 * 60 * 1000
                                ? "border-red-300 bg-red-50 text-red-600"
                                : "border-green-200 bg-green-50 text-green-700";
                            // Preparación: meta = alistado (m.fin).
                            let prepT;
                            if (m.fin) {
                              const aTiempo = m.inicio
                                ? new Date(m.fin).getTime() - new Date(m.inicio).getTime() <= limitePrepMs
                                : new Date(m.fin).getTime() <= deadline;
                              prepT = (
                                <div className={`${box} ${aTiempo ? "border-green-200 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-600"}`}>
                                  {aTiempo ? iconoOk : null}
                                  {aTiempo ? "Cumplido" : "Fuera de tiempo"}
                                </div>
                              );
                            } else {
                              prepT = (
                                <div className={`${box} ${claseTransfer}`}>
                                  {iconoReloj}
                                  {rest <= 0 ? "-" : ""}
                                  {fmtCronometro(rest)}
                                </div>
                              );
                            }
                            // Entrega: meta = despachado (m.despachoFin).
                            let entregaT;
                            if (m.despachoFin) {
                              const aTiempo = new Date(m.despachoFin).getTime() <= deadline;
                              entregaT = (
                                <div className={`${box} ${aTiempo ? "border-green-200 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-600"}`}>
                                  {aTiempo ? iconoOk : null}
                                  {aTiempo ? "Cumplido" : "Fuera de tiempo"}
                                </div>
                              );
                            } else {
                              entregaT = (
                                <div className={`${box} ${claseTransfer}`}>
                                  {iconoReloj}
                                  {rest <= 0 ? "-" : ""}
                                  {fmtCronometro(rest)}
                                </div>
                              );
                            }
                            return (
                              <div className="space-y-2">
                                <div>
                                  <p className="mb-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-brand-brown/40">
                                    Producción (1h)
                                  </p>
                                  {prepT}
                                </div>
                                <div>
                                  <p className="mb-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-brand-brown/40">
                                    Entrega
                                  </p>
                                  {entregaT}
                                </div>
                              </div>
                            );
                          }

                          // Resto de pagos: preparación + entrega.
                          // - Normal: preparación (1h) y entrega (2h) desde que entra.
                          // - RECOGE en el punto: 2h para alistar y entrega HASTA las
                          //   6:00 PM (la cuenta regresiva corre hacia esa hora).
                          const deadlineEntrega = objetivoDespacho(p);
                          // deadlinePreparacion contempla pequeños (40 min), recoge (2h)
                          // y el resto (1h antes de la entrega).
                          const deadlinePrep = deadlinePreparacion(p, m.pagoConfirmado);
                          const restEntrega = deadlineEntrega - ahora;
                          const restPrep = deadlinePrep - ahora;
                          const horaObj = (p.horaDespacho ?? "").trim();
                          // Antes de activar: hay hora pedida y faltan más de 2h.
                          // (No aplica a recoge, cuyo objetivo fijo son las 6:00 PM.)
                          const antesDeActivar =
                            !esRecoge && horaObj !== "" && restEntrega > LIMITE_DESPACHO_MS;

                          // Rojo al llegar a la mitad del tiempo (o menos); verde antes.
                          const claseTiempo = (rest: number, mitadMs: number) =>
                            rest <= mitadMs
                              ? "border-red-300 bg-red-50 text-red-600"
                              : "border-green-200 bg-green-50 text-green-700";

                          // Preparación (1h): meta = marcar "Alistado" (m.fin).
                          let prep;
                          if (m.fin) {
                            const aTiempo = m.inicio
                              ? new Date(m.fin).getTime() - new Date(m.inicio).getTime() <= limitePrepMs
                              : new Date(m.fin).getTime() <= deadlinePrep;
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
                              <div className={`${box} ${claseTiempo(restPrep, esPequeno ? ALERTA_ALISTADO_PEQUENO_MS : 30 * 60 * 1000)}`}>
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
                                  {esPequeno ? "Alistar (40 min)" : esRecoge ? "Alistar (2h)" : "Preparación (1h)"}
                                </p>
                                {prep}
                              </div>
                              <div>
                                <p className="mb-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-brand-brown/40">
                                  {esRecoge ? "Entrega (hasta 6:00 pm)" : "Entrega (2h)"}
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
          facturado={
            ["facturado", "despachado", "en tránsito", "en transito", "entregado"].includes(
              norm(modalReplica.pedido.estado),
            ) || !!(meta[modalReplica.pedido.id]?.facturaNumero ?? "").trim()
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
          yaEnviado={
            (meta[modalReplica.pedido.id]?.replicas ?? []).find(
              (r) => r.numero === modalReplica.numero,
            )?.drivinEnviado ?? false
          }
          onCrear={(domi, code) => {
            crearReplica(modalReplica.pedido.id, domi, code);
          }}
          onDescargar={() =>
            descargarReplica(modalReplica.pedido, modalReplica.numero)
          }
          onDrivin={() =>
            enviarADrivinApi(modalReplica.pedido.id, modalReplica.numero)
          }
          onMarcarEnviado={() =>
            marcarReplicaDrivin(modalReplica.pedido.id, modalReplica.numero)
          }
          onQuitar={() => {
            quitarUltimaReplica(modalReplica.pedido.id);
            setModalReplica(null);
          }}
          onCerrar={() => setModalReplica(null)}
        />
      )}
      {/* Resultado del envío a Drivin al despachar (modal central). */}
      {drivinModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-brand-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            {drivinModal.estado === "enviando" && (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
                  <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-blue-500 border-t-transparent" />
                </div>
                <h3 className="mt-4 font-serif text-xl font-bold text-brand-wine">
                  Enviando a Drivin…
                </h3>
                <p className="mt-1 text-sm text-brand-brown/60">
                  Pedido <b>{drivinModal.comanda}</b>
                </p>
              </>
            )}
            {drivinModal.estado === "ok" && (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-8 w-8 text-green-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h3 className="mt-4 font-serif text-xl font-bold text-green-700">
                  Envío a Drivin exitoso
                </h3>
                <p className="mt-1 text-sm text-brand-brown/60">
                  El pedido <b>{drivinModal.comanda}</b> se envió correctamente a Drivin.
                </p>
                <button
                  onClick={() => setDrivinModal(null)}
                  className="mt-5 rounded-xl bg-brand-wine px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90"
                >
                  Aceptar
                </button>
              </>
            )}
            {drivinModal.estado === "error" && (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-8 w-8 text-red-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94l-7.5 12.99A1.5 1.5 0 0 0 4.14 19.5h15.72a1.5 1.5 0 0 0 1.3-2.57l-7.5-12.99a1.5 1.5 0 0 0-2.6 0Z" />
                  </svg>
                </div>
                <h3 className="mt-4 font-serif text-xl font-bold text-red-700">
                  El pedido se despachó, pero falló el envío a Drivin
                </h3>
                <p className="mt-1 text-sm text-brand-brown/60">
                  Pedido <b>{drivinModal.comanda}</b>. Un administrador puede reversar y volver a despachar para reintentar.
                </p>
                {drivinModal.msg && (
                  <p className="mt-2 break-words rounded-lg bg-red-50 px-3 py-2 text-left text-xs text-red-500/90">
                    {drivinModal.msg}
                  </p>
                )}
                <button
                  onClick={() => setDrivinModal(null)}
                  className="mt-5 rounded-xl bg-brand-wine px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90"
                >
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <ModalSinPermiso abierto={sinPermiso.abierto} onCerrar={sinPermiso.cerrar} />
      {despachoManual && (() => {
        const ped = pedidos.find((x) => x.id === despachoManual.id);
        const personal = personalPorPunto[String(ped?.punto?.id ?? "")] ?? {
          porcionadores: [],
          domiciliarios: [],
        };
        const domiciliarios = [...personal.domiciliarios].sort((a, b) =>
          a.localeCompare(b, "es", { sensitivity: "base" }),
        );
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-brand-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <h3 className="font-serif text-xl font-bold text-brand-wine">
                Domiciliario manual
              </h3>
              <p className="mt-1 text-sm text-brand-brown/60">
                Drivin no asignó domiciliario al pedido <b>{ped?.comanda ?? ""}</b>.
                Selecciona uno de la Gestión de recursos para cerrar el ciclo a
                Despachado.
              </p>
              <select
                value={despachoManualSel}
                onChange={(e) => setDespachoManualSel(e.target.value)}
                className="mt-4 w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2.5 text-sm text-brand-brown focus:border-brand-wine focus:outline-none"
              >
                <option value="">— Selecciona domiciliario —</option>
                {domiciliarios.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {domiciliarios.length === 0 && (
                <p className="mt-2 text-xs text-red-500/90">
                  Este punto no tiene domiciliarios en la Gestión de recursos.
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setDespachoManual(null)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-brown/70 transition hover:bg-brand-cream"
                >
                  Cancelar
                </button>
                <button
                  disabled={!despachoManualSel}
                  onClick={() => {
                    const sel = despachoManualSel;
                    const pid = despachoManual.id;
                    setDespachoManual(null);
                    if (sel) cambiarEstado(pid, "Despachado", { domiManual: sel });
                  }}
                  className="rounded-xl bg-brand-wine px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-brand-wine/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Despachar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {resetTiemposId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-wine/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 text-brand-wine">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h3 className="mt-4 text-center font-serif text-xl font-bold text-brand-wine">
              Reiniciar tiempos
            </h3>
            <p className="mt-1 text-center text-sm text-brand-brown/70">
              Para reiniciar los tiempos de alistamiento de este pedido, ingresa
              la <b>clave dinámica</b>. El alistador podrá iniciar de nuevo.
            </p>
            <input
              inputMode="numeric"
              autoFocus
              value={codigoReset}
              onChange={(e) => {
                setCodigoReset(e.target.value.replace(/\D/g, "").slice(0, 6));
                setErrorReset(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmarResetTiempos();
              }}
              placeholder="••••••"
              className="mt-4 w-full rounded-xl border border-brand-brown/20 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-brand-wine outline-none focus:border-brand-wine"
            />
            {errorReset && (
              <p className="mt-2 text-center text-sm font-medium text-red-600">{errorReset}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setResetTiemposId(null);
                  setCodigoReset("");
                  setErrorReset(null);
                }}
                className="flex-1 rounded-xl border border-brand-brown/20 px-4 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarResetTiempos}
                disabled={verificandoReset || codigoReset.length !== 6}
                className="flex-1 rounded-xl bg-brand-wine px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-50"
              >
                {verificandoReset ? "Verificando…" : "Reiniciar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input oculto para subir imágenes del comprobante de pago (varias) */}
      <input
        ref={compFileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onArchivoComprobante}
        className="hidden"
      />

      {/* Modal del comprobante de pago: previsualización + acciones */}
      {compModal && (() => {
        const cid = compModal.id;
        const cConf = Boolean(meta[cid]?.comprobante?.confirmado);
        const cDesb = compDesbloqueo.has(cid);
        const subiendo = Boolean(compSubiendo[cid]);
        const imgs = compImg[cid] ?? [];
        const total = imgs.length;
        const idx = Math.min(compModal.indice, Math.max(0, total - 1));
        const imgActual = imgs[idx];
        const puedeEditar = !cConf || cDesb;
        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/70 p-4"
            onClick={() => setCompModal(null)}
          >
            <div
              className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 border-b border-brand-brown/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-serif text-base font-bold text-brand-wine">Comprobante de pago</h3>
                  {total > 1 && (
                    <span className="rounded-full bg-brand-brown/10 px-2 py-0.5 text-[10px] font-bold text-brand-brown/70">
                      {idx + 1}/{total}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      cConf ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {cConf ? "Confirmado" : "Sin confirmar"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCompModal(null)}
                  className="rounded-lg p-1 text-brand-brown/50 transition hover:bg-brand-cream-soft hover:text-brand-brown"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="relative overflow-auto bg-brand-cream-soft/40 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgActual} alt={`Comprobante ${idx + 1}`} className="mx-auto max-h-[55vh] w-auto rounded-lg" />
                {total > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCompModal({ id: cid, indice: (idx - 1 + total) % total })}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition hover:bg-black/60"
                      aria-label="Anterior"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompModal({ id: cid, indice: (idx + 1) % total })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition hover:bg-black/60"
                      aria-label="Siguiente"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
              {/* Miniaturas para saltar entre imágenes */}
              {total > 1 && (
                <div className="flex gap-1.5 overflow-x-auto border-t border-brand-brown/10 px-3 py-2">
                  {imgs.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={src}
                      alt={`Miniatura ${i + 1}`}
                      onClick={() => setCompModal({ id: cid, indice: i })}
                      className={`h-12 w-12 shrink-0 cursor-pointer rounded-md object-cover ring-2 transition ${
                        i === idx ? "ring-brand-wine" : "ring-transparent hover:ring-brand-amber/60"
                      }`}
                    />
                  ))}
                </div>
              )}
              <div className="border-t border-brand-brown/10 px-4 py-3">
                {puedeEditar ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => abrirSelectorComprobante(cid)}
                      disabled={subiendo}
                      className="flex-1 rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-50"
                    >
                      {subiendo ? "Subiendo…" : "Agregar imagen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminarComprobante(cid, total > 1 ? idx : undefined)}
                      className="flex-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                    >
                      {total > 1 ? "Eliminar esta" : "Eliminar"}
                    </button>
                    {!cConf && (
                      <button
                        type="button"
                        onClick={() => confirmarComprobante(cid)}
                        className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Confirmar
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCompClaveId(cid);
                      setCodigoComp("");
                      setErrorComp(null);
                    }}
                    title="Modificar un comprobante ya confirmado requiere clave dinámica"
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand-wine/25 bg-brand-wine/5 px-3 py-2 text-sm font-semibold text-brand-wine transition hover:bg-brand-wine/10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                    Modificar (clave dinámica)
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de clave dinámica para modificar un comprobante confirmado */}
      {compClaveId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-wine/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 text-brand-wine">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h3 className="mt-4 text-center font-serif text-xl font-bold text-brand-wine">
              Modificar comprobante
            </h3>
            <p className="mt-1 text-center text-sm text-brand-brown/70">
              Este comprobante ya fue <b>confirmado</b>. Para reemplazarlo o
              eliminarlo, ingresa la <b>clave dinámica</b>.
            </p>
            <input
              inputMode="numeric"
              autoFocus
              value={codigoComp}
              onChange={(e) => {
                setCodigoComp(e.target.value.replace(/\D/g, "").slice(0, 6));
                setErrorComp(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmarClaveComprobante();
              }}
              placeholder="••••••"
              className="mt-4 w-full rounded-xl border border-brand-brown/20 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-brand-wine outline-none focus:border-brand-wine"
            />
            {errorComp && (
              <p className="mt-2 text-center text-sm font-medium text-red-600">{errorComp}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCompClaveId(null);
                  setCodigoComp("");
                  setErrorComp(null);
                }}
                className="flex-1 rounded-xl border border-brand-brown/20 px-4 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarClaveComprobante}
                disabled={verificandoComp || codigoComp.length !== 6}
                className="flex-1 rounded-xl bg-brand-wine px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-50"
              >
                {verificandoComp ? "Verificando…" : "Desbloquear"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  facturado,
  domiciliarioAsignado,
  esUltima,
  yaEnviado,
  onCrear,
  onDescargar,
  onDrivin,
  onMarcarEnviado,
  onQuitar,
  onCerrar,
}: {
  pedido: Pedido;
  numero: number;
  modo: "crear" | "ver";
  facturado: boolean;
  domiciliarioAsignado: string;
  esUltima: boolean;
  yaEnviado: boolean;
  onCrear: (domiciliario: string, code: string) => void;
  onDescargar: () => void;
  onDrivin: (code?: string) => Promise<{ comanda: string; status: number }>;
  onMarcarEnviado: () => void;
  onQuitar: () => void;
  onCerrar: () => void;
}) {
  const [drivinEstado, setDrivinEstado] = useState<"idle" | "enviando" | "ok" | "error">(
    yaEnviado ? "ok" : "idle",
  );
  const [drivinMsg, setDrivinMsg] = useState("");
  // Clave dinámica para confirmar réplica de pedidos rechazados
  const [requiereClaveReplica, setRequiereClaveReplica] = useState(false);
  const [codigoClaveReplica, setCodigoClaveReplica] = useState("");
  const [verificandoClaveReplica, setVerificandoClaveReplica] = useState(false);
  const [errorClaveReplica, setErrorClaveReplica] = useState<string | null>(null);
  
  const codigoReplica = `${pedido.comanda}-${numero}`;
  // Solo se puede REPLICAR un pedido que YA esté facturado. La factura es la del
  // pedido ORIGINAL, así que basta con que el pedido tenga factura registrada,
  // aunque ya haya avanzado a Despachado/En tránsito/Entregado.
  const esFacturado = facturado;
  // Puntos integrados con Drivin (suben directo): La 93, La 70, La 43, Alameda,
  // Olaya y San Felipe. Cada uno usa su schema en el backend (93->01, 70->03,
  // 43->02, Alameda I->04, Alameda II->05, Olaya->06, San Felipe->07). El resto va por Excel.
  const esDrivin = (() => {
    const nombre = String(pedido.punto?.nombre ?? "").toLowerCase();
    return (
      /\b93\b/.test(nombre) ||
      /\b70\b/.test(nombre) ||
      /\b43\b/.test(nombre) ||
      nombre.includes("alameda") ||
      nombre.includes("olaya") ||
      nombre.includes("felipe")
    );
  })();
  
  // ¿Este pedido es "rechazado"? (cuando el cliente no estaba)
  const esRechazado = norm(pedido.estado) === "rechazado";

  // Sube la réplica a Drivin (se usa al confirmar y como reintento). SIN
  // domiciliario: Drivin lo asigna y SIGCOMPRO lo baja luego.
  async function enviarDrivin() {
    if (drivinEstado === "enviando") return;
    setDrivinEstado("enviando");
    setDrivinMsg("");
    try {
      await onDrivin();
      setDrivinEstado("ok");
      onMarcarEnviado();
    } catch (e) {
      setDrivinEstado("error");
      setDrivinMsg(e instanceof Error ? e.message : "");
    }
  }

  // Confirmar (modo crear): crea la réplica SIN domiciliario y la sube a Drivin.
  // El domiciliario lo asigna Drivin (queda "esperando asignación").
  // Si es pedido rechazado, requiere clave dinámica antes.
  function confirmar() {
    // Si es rechazado y no se ha verificado la clave, mostrar input de clave
    if (esRechazado && !requiereClaveReplica) {
      setRequiereClaveReplica(true);
      return;
    }
    onCrear("", "");
    if (esDrivin) {
      enviarDrivin();
    } else {
      onCerrar();
    }
  }
  
  // Verifica la clave dinámica para réplica de rechazados
  const verificarClaveReplicaHandler = async () => {
    if (!codigoClaveReplica || codigoClaveReplica.length < 6) {
      setErrorClaveReplica("Ingresa la clave dinámica de 6 dígitos.");
      return;
    }
    setVerificandoClaveReplica(true);
    setErrorClaveReplica(null);
    try {
      const { valido } = await verificarClaveDinamica(codigoClaveReplica);
      if (!valido) {
        setErrorClaveReplica("Clave incorrecta o vencida.");
        return;
      }
      // Clave válida: proceder con la réplica
      onCrear("", "");
      if (esDrivin) {
        enviarDrivin();
      } else {
        onCerrar();
      }
    } catch {
      setErrorClaveReplica("No se pudo verificar la clave. Inténtalo de nuevo.");
    } finally {
      setVerificandoClaveReplica(false);
    }
  };

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
            esFacturado ? (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  Al confirmar, la réplica <b>{codigoReplica}</b> se sube a Drivin y
                  <b> esperará que Drivin le asigne el domiciliario</b> (no se
                  selecciona aquí).
                </div>
                
                {/* Clave dinámica para pedidos rechazados */}
                {esRechazado && requiereClaveReplica && (
                  <div className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 space-y-2">
                    <p className="text-sm font-semibold text-orange-900">
                      Clave dinámica requerida para réplica
                    </p>
                    <p className="text-xs text-orange-700">
                      Ingresa la clave de 6 dígitos para confirmar la réplica de este pedido rechazado.
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={codigoClaveReplica}
                      onChange={(e) => {
                        setCodigoClaveReplica(e.target.value.replace(/\D/g, ""));
                        setErrorClaveReplica(null);
                      }}
                      placeholder="000000"
                      disabled={verificandoClaveReplica}
                      className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2 text-center font-mono text-lg font-bold tracking-widest disabled:opacity-50"
                    />
                    {errorClaveReplica && (
                      <p className="text-xs font-semibold text-red-600">{errorClaveReplica}</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
                No se puede realizar réplica si el pedido no está facturado.
              </div>
            )
          ) : (
            <div className="rounded-lg border border-brand-brown/10 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand-brown/40">
                Domiciliario (Drivin)
              </p>
              <p className="font-bold text-brand-black">{domiciliarioAsignado || "Esperando asignación…"}</p>
            </div>
          )}

          {drivinEstado === "enviando" && (
            <div className="flex items-center gap-2 rounded-lg border border-brand-brown/15 bg-brand-cream-soft/50 px-3 py-2 text-sm font-semibold text-brand-brown">
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-wine border-t-transparent" />
              Subiendo la réplica {codigoReplica} a Drivin…
            </div>
          )}
          {drivinEstado === "ok" && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Envío exitoso del pedido {codigoReplica} a Drivin.
            </div>
          )}
          {drivinEstado === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="font-semibold">Error al subir el pedido a Drivin.</p>
              <p className="mt-0.5">Reintenta o genera el Excel (ícono) e inténtalo manual.</p>
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
              title={modo === "crear" && drivinEstado === "idle" ? "Cancelar" : "Cerrar"}
              className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft"
            >
              {modo === "crear" && drivinEstado === "idle" ? "Cancelar" : "Cerrar"}
            </button>
            {modo === "crear" ? (
              drivinEstado === "ok" ? (
                <button
                  onClick={onCerrar}
                  title="Listo"
                  className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90"
                >
                  Listo
                </button>
              ) : drivinEstado === "error" ? (
                <button
                  onClick={enviarDrivin}
                  title="Reintentar el envío a Drivin"
                  className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90"
                >
                  Reintentar envío
                </button>
              ) : esFacturado ? (
                <>
                  {/* Si es rechazado y requiere clave, mostrar botón de verificación */}
                  {esRechazado && requiereClaveReplica ? (
                    <button
                      onClick={verificarClaveReplicaHandler}
                      disabled={verificandoClaveReplica || codigoClaveReplica.length < 6}
                      title="Verificar clave dinámica"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                    >
                      {verificandoClaveReplica && (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      )}
                      {verificandoClaveReplica ? "Verificando…" : "Verificar clave"}
                    </button>
                  ) : (
                    /* Botón normal de confirmar */
                    <button
                      onClick={confirmar}
                      disabled={drivinEstado === "enviando"}
                      title={esRechazado ? "Confirmar (se pedirá clave dinámica)" : (esDrivin ? "Confirmar la réplica y subirla a Drivin" : "Confirmar y crear la réplica")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90 disabled:opacity-60"
                    >
                      {drivinEstado === "enviando" && (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      )}
                      {drivinEstado === "enviando"
                        ? "Enviando…"
                        : esDrivin
                          ? "Confirmar y subir"
                          : "Confirmar"}
                    </button>
                  )}
                </>
              ) : null
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
                {yaEnviado ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Ya enviado a Drivin
                  </span>
                ) : (
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
                )}
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
