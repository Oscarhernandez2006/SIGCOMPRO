"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listarClientes, type Cliente } from "@/lib/clientes";
import {
  misPuntosVenta,
  puntoMasCercano,
  distanciaKm,
  calcularValorDomicilio,
  domicilioGratisAplica,
  coordenadasValidas,
  type PuntoVenta,
} from "@/lib/puntos-venta";
import { listarProductos, listarListasPrecio, sincronizarProductos, type ProductoPrecio } from "@/lib/productos";
import { getUsuario, puedeMultiPunto } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ModalSinPermiso, useSinPermiso } from "@/components/SinPermisoModal";
import { cargarEstadoPedidos, guardarPedidoApi, descargarExcelDespacho, enviarADrivinApi, type DespachoMeta } from "@/lib/pedidos";
import { listarCongeladosApi, guardarCongeladoApi, eliminarCongeladoApi } from "@/lib/congelados";
import { listarMotivos, type Motivo } from "@/lib/motivos";
import { obtenerTiposCorteCache } from "@/lib/configuracion";
import { verificarClaveDinamica } from "@/lib/clave-dinamica";
import CrearClienteModal from "@/components/CrearClienteModal";

const PASOS = ["Cliente", "Productos", "Entrega y pago", "Confirmar"] as const;

// Motivos por tipo de baja. Anular = errores internos (televentas); Cancelar =
// causas externas (el cliente no recibió el pedido / devolución).
const MOTIVOS_ANULAR = ["Pedido Doble", "Error dirección", "Inventario Agotados"] as const;
const MOTIVOS_CANCELAR = ["Cliente Cerrado", "Promesa no Cumplida"] as const;

/**
 * Borrador de pedido "congelado" (en espera). Guarda el estado del wizard tal
 * como iba el vendedor para poder retomarlo después. Se persiste en la base de
 * datos por usuario. El consecutivo temporal (CONG-N) es solo una etiqueta; el
 * consecutivo real del software se asigna únicamente al crear el pedido,
 * evitando consecutivos duplicados.
 */
interface PedidoCongelado {
  id: string;
  tempConsecutivo: number;
  creadoEn: string;
  paso: number;
  punto: PuntoVenta | null;
  cliente: Cliente | null;
  carrito: ItemCarrito[];
  entrega: "domicilio" | "recoge" | null;
  pago: string | null;
  valorDomicilio: number;
  programado: boolean;
  fechaProgramada: string;
  horaDespacho: string;
  observacion: string;
  clienteNombre: string;
  numItems: number;
  totalParcial: number;
  /** Nombre de la persona que congeló el pedido (para saber de quién es). */
  congeladoPor: string;
}

export default function PedidosPage() {
  const [wizardAbierto, setWizardAbierto] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  // Metadata de despacho por pedido (porcionador, domiciliario, horas, etc.).
  const [meta, setMeta] = useState<Record<string, DespachoMeta>>({});
  const [detalle, setDetalle] = useState<Pedido | null>(null);
  const [editando, setEditando] = useState<Pedido | null>(null);
  const [clonando, setClonando] = useState<Pedido | null>(null);
  // Modal para elegir el motivo al anular o cancelar un pedido.
  const [motivoModal, setMotivoModal] = useState<{ pedido: Pedido; tipo: "anular" | "cancelar" } | null>(null);
  // Motivos activos (anular/cancelar) cargados desde la base de datos.
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  useEffect(() => {
    listarMotivos({ soloActivos: true })
      .then(setMotivos)
      .catch(() => setMotivos([]));
  }, []);

  // Pedidos congelados (borradores en espera) del vendedor.
  const [congelados, setCongelados] = useState<PedidoCongelado[]>([]);
  const [modalCongelados, setModalCongelados] = useState(false);
  const [borrador, setBorrador] = useState<PedidoCongelado | null>(null);

  // Cargar congelados persistidos en la base de datos al iniciar.
  useEffect(() => {
    listarCongeladosApi<PedidoCongelado>()
      .then(setCongelados)
      .catch(() => setCongelados([]));
  }, []);

  // Usuario actual y permisos granulares.
  const [usuario, setUsuario] = useState<ReturnType<typeof getUsuario>>(null);
  useEffect(() => setUsuario(getUsuario()), []);
  const sinPermiso = useSinPermiso();
  const permite = useMemo(
    () => ({
      crear: puedeAccion(usuario, "pedidos.crear"),
      editar: puedeAccion(usuario, "pedidos.editar"),
      anular: puedeAccion(usuario, "pedidos.anular"),
      imprimir: puedeAccion(usuario, "pedidos.imprimir"),
      clonar: puedeAccion(usuario, "pedidos.clonar"),
      sincronizar: puedeAccion(usuario, "pedidos.sincronizar"),
    }),
    [usuario],
  );

  // Cargar pedidos desde la base de datos.
  useEffect(() => {
    cargarEstadoPedidos()
      .then((e) => {
        setPedidos(e.pedidos);
        setMeta(e.meta ?? {});
      })
      .catch(() => { /* ignore */ });
  }, []);

  // Puntos de venta asignados al usuario. Alcance de lo que ve:
  //  - Roles con selector (administrador app / desarrollador): eligen UN punto
  //    (de sus asignados) y ven solo ese; pueden cambiarlo cuando quieran.
  //  - Resto de usuarios: ven la UNIÓN de sus puntos asignados (sin selector).
  const esSelector = puedeMultiPunto(usuario);
  const [puntosAsignados, setPuntosAsignados] = useState<PuntoVenta[]>([]);
  const [puntoActivoId, setPuntoActivoId] = useState<string | null>(null);

  useEffect(() => {
    if (!usuario) return;
    misPuntosVenta()
      .then((ps) => {
        setPuntosAsignados(ps);
        // Roles con selector: por defecto el primer punto; se cambia en el select.
        if (puedeMultiPunto(usuario) && ps.length > 0) {
          setPuntoActivoId((prev) => prev ?? String(ps[0].id));
        }
      })
      .catch(() => setPuntosAsignados([]));
  }, [usuario]);

  // Conjunto de IDs de punto permitidos para la vista actual.
  const idsPuntos = useMemo(() => {
    if (esSelector) {
      return puntoActivoId ? new Set([puntoActivoId]) : new Set<string>();
    }
    return new Set(puntosAsignados.map((p) => String(p.id)));
  }, [esSelector, puntoActivoId, puntosAsignados]);

  // Búsqueda (consecutivo, comanda, nombre o NIT) y filtro por día.
  const [busqueda, setBusqueda] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");

  // Ordena por fecha desc y aplica el alcance por punto + búsqueda + filtro de día.
  const pedidosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const ordenados = [...pedidos].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    );
    return ordenados.filter((p) => {
      // Alcance por punto de venta.
      if (!idsPuntos.has(String(p.punto?.id))) return false;
      if (fechaFiltro) {
        const d = new Date(p.fecha);
        const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (dia !== fechaFiltro) return false;
      }
      if (!q) return true;
      const consec = String(p.consecutivo ?? "");
      const comanda = (p.comanda ?? "").toLowerCase();
      const nombre = (p.cliente?.nombre ?? "").toLowerCase();
      const nit = (p.cliente?.nit_cedula ?? "").toLowerCase();
      return (
        consec.includes(q) ||
        comanda.includes(q) ||
        nombre.includes(q) ||
        nit.includes(q)
      );
    });
  }, [pedidos, busqueda, fechaFiltro, idsPuntos]);

  // Número del día (turno) por pedido, para que la comanda impresa desde aquí
  // muestre el mismo número que en Despacho.
  const numerosDia = useMemo(() => numerosDelDia(pedidos), [pedidos]);

  // Clones por comanda de origen: comanda del pedido -> comandas de sus clones.
  // Sirve para avisar en el pedido (p. ej. anulado) que ya tiene una clonación.
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

  // Desplaza el día del filtro (delta en días). Si no hay día, parte de hoy.
  const moverDia = (delta: number) => {
    const base = fechaFiltro ? new Date(`${fechaFiltro}T00:00:00`) : new Date();
    base.setDate(base.getDate() + delta);
    const dia = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
    setFechaFiltro(dia);
  };
  const hoyISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const guardarPedido = (p: Pedido) => {
    setPedidos((prev) => {
      const existe = prev.some((x) => x.id === p.id);
      return existe ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev];
    });
    // Persistimos en la base de datos y actualizamos con la versión del backend,
    // que incluye la trazabilidad completa (quién y a qué hora creó/anuló).
    guardarPedidoApi(p)
      .then((guardado) => {
        if (guardado) {
          setPedidos((prev) =>
            prev.map((x) => (x.id === guardado.id ? guardado : x)),
          );
        }
      })
      .catch(() => { /* ignore */ });
  };

  const abrirNuevo = () => { setEditando(null); setClonando(null); setBorrador(null); setWizardAbierto(true); };
  const abrirEdicion = (p: Pedido) => { setEditando(p); setClonando(null); setBorrador(null); setWizardAbierto(true); };
  const abrirClon = (p: Pedido) => { setEditando(null); setClonando(p); setBorrador(null); setWizardAbierto(true); };
  const cerrarWizard = () => { setWizardAbierto(false); setEditando(null); setClonando(null); setBorrador(null); };

  // Congela (guarda en espera) el borrador actual del wizard.
  const congelarBorrador = async (b: PedidoCongelado) => {
    try {
      const guardado = await guardarCongeladoApi<PedidoCongelado>(b.id, b);
      setCongelados((prev) => {
        const sinEste = prev.filter((x) => x.id !== guardado.id);
        return [...sinEste, guardado];
      });
      cerrarWizard();
    } catch {
      alert("No se pudo congelar el pedido. Intenta de nuevo.");
    }
  };

  // Descongela: saca el borrador de la lista y lo abre en el wizard.
  const descongelar = async (b: PedidoCongelado) => {
    try {
      await eliminarCongeladoApi(b.id);
    } catch {
      alert("No se pudo descongelar el pedido. Intenta de nuevo.");
      return;
    }
    setCongelados((prev) => prev.filter((x) => x.id !== b.id));
    setEditando(null);
    setClonando(null);
    setBorrador(b);
    setModalCongelados(false);
    setWizardAbierto(true);
  };

  // Elimina un congelado sin abrirlo.
  const eliminarCongelado = async (id: string) => {
    try {
      await eliminarCongeladoApi(id);
    } catch {
      alert("No se pudo eliminar el congelado. Intenta de nuevo.");
      return;
    }
    setCongelados((prev) => prev.filter((x) => x.id !== id));
  };

  // Anula un pedido (marca anulado + estado) y lo persiste.
  // Anular = motivo INTERNO (error de la televendedora).
  const anularPedido = (p: Pedido) => {
    setMotivoModal({ pedido: p, tipo: "anular" });
  };

  // Cancela un pedido (motivo EXTERNO: el cliente no lo recibió / devolución).
  // También sale del flujo activo (anulado=true) pero con estado "Cancelado".
  const cancelarPedido = (p: Pedido) => {
    setMotivoModal({ pedido: p, tipo: "cancelar" });
  };

  // Confirma la anulación/cancelación con el motivo elegido y lo persiste.
  const confirmarMotivo = (motivo: string) => {
    if (!motivoModal) return;
    const { pedido, tipo } = motivoModal;
    guardarPedido({
      ...pedido,
      anulado: true,
      estado: tipo === "anular" ? "Anulado" : "Cancelado",
      motivo,
    });
    setMotivoModal(null);
  };

  // Reimprime/descarga el Excel de despacho del pedido.
  const reimprimirExcel = (p: Pedido) => {
    descargarExcelDespacho(p.id).catch(() => alert("No se pudo generar el Excel de despacho."));
  };

  // Sincroniza la lista de precios desde la API externa (permiso pedidos.sincronizar).
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizarPrecios = async () => {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const r = await sincronizarProductos();
      alert(`Lista de precios actualizada: ${r.total} productos en ${r.listas} listas.`);
    } catch {
      alert("No se pudo sincronizar la lista de precios. Intenta de nuevo.");
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <div>
      {/* Encabezado */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">
            Pedidos
          </h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Gestiona los pedidos de Carnes Santacruz.
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
        <div className="flex items-center gap-2">
          {permite.sincronizar && (
            <button
              onClick={sincronizarPrecios}
              disabled={sincronizando}
              title="Actualiza la lista de precios desde el sistema"
              className="inline-flex items-center gap-2 rounded-xl border border-brand-brown/15 bg-white px-4 py-2.5 text-sm font-semibold text-brand-brown shadow-sm transition hover:bg-brand-cream-soft disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {sincronizando ? "Sincronizando…" : "Sincronizar precios"}
            </button>
          )}
          <button
            onClick={() => setModalCongelados(true)}
            title="Ver pedidos congelados en espera"
            className="relative inline-flex items-center gap-2 rounded-xl border border-brand-brown/15 bg-white px-4 py-2.5 text-sm font-semibold text-brand-brown shadow-sm transition hover:bg-brand-cream-soft"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
            Congelados
            {congelados.length > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-wine px-1.5 text-[11px] font-bold text-white">
                {congelados.length}
              </span>
            )}
          </button>
          <button
            onClick={permite.crear ? abrirNuevo : sinPermiso.mostrar}
            title="Crear un nuevo pedido"
            className={`inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90 ${
              permite.crear ? "" : "opacity-50"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            Nuevo pedido
          </button>
        </div>
      </div>

      {/* Barra de búsqueda y filtro por día */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por consecutivo, comanda, nombre o NIT/cédula"
            className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-3 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => moverDia(-1)}
            title="Día anterior"
            className="flex h-10 w-9 items-center justify-center rounded-xl border border-brand-brown/15 bg-white text-brand-brown transition hover:bg-brand-cream-soft"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <input
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
          />
          <button
            onClick={() => moverDia(1)}
            title="Día siguiente"
            className="flex h-10 w-9 items-center justify-center rounded-xl border border-brand-brown/15 bg-white text-brand-brown transition hover:bg-brand-cream-soft"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <button
          onClick={() => setFechaFiltro(hoyISO())}
          title="Filtrar por el día de hoy"
          className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
        >
          Hoy
        </button>
        {(fechaFiltro || busqueda) && (
          <button
            onClick={() => { setFechaFiltro(""); setBusqueda(""); }}
            title="Limpiar búsqueda y filtros"
            className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm font-semibold text-brand-wine transition hover:bg-brand-cream-soft"
          >
            Limpiar
          </button>
        )}
        <span className="ml-auto text-xs font-medium text-brand-brown/60">
          {pedidosFiltrados.length} {pedidosFiltrados.length === 1 ? "pedido" : "pedidos"}
        </span>
      </div>

      {/* Lista de pedidos */}
      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-brown/20 bg-white px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7 text-brand-amber">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.137a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
          </div>
          <p className="mt-4 font-medium text-brand-black">Aún no hay pedidos</p>
          <p className="mt-1 max-w-sm text-sm text-brand-brown/60">
            Empieza creando tu primer pedido con el botón “Nuevo pedido”.
          </p>
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-brown/20 bg-white px-6 py-16 text-center">
          <p className="font-medium text-brand-black">Sin resultados</p>
          <p className="mt-1 max-w-sm text-sm text-brand-brown/60">
            No hay pedidos que coincidan con la búsqueda o el día seleccionado.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
          <div className="max-h-[calc(100vh-300px)] overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10 bg-brand-cream-soft text-left text-xs uppercase tracking-wide text-brand-brown/50 shadow-sm">
                <tr>
                  <th className="px-4 py-3">Comanda</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Punto</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((p) => (
                <tr key={p.id} className={`border-t border-brand-brown/5 hover:bg-brand-cream-soft/30 ${p.anulado ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-semibold text-brand-wine">{p.comanda}</td>
                  <td className="px-4 py-3">{p.cliente.nombre || p.cliente.nit_cedula}</td>
                  <td className="px-4 py-3 text-brand-brown/70">{p.punto.nombre}</td>
                  <td className="px-4 py-3 font-medium">{formatoCOP(p.total)}</td>
                  <td className="px-4 py-3">
                    <span title={p.motivo ? `Motivo: ${p.motivo}` : undefined} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.anulado ? (p.estado === "Cancelado" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-600") : "bg-amber-100 text-amber-700"}`}>
                      {p.anulado ? (p.estado || "Anulado") : p.estado || "En proceso"}
                    </span>
                    {p.motivo && (
                      <p className="mt-0.5 text-[11px] text-brand-brown/50">{p.motivo}</p>
                    )}
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
                  </td>
                  <td className="px-4 py-3 text-brand-brown/60">{new Date(p.fecha).toLocaleString("es-CO")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => setDetalle(p)} aria-label="Ver detalle" title="Ver detalle del pedido" className="rounded-lg border border-brand-brown/15 p-1.5 text-brand-brown transition hover:bg-brand-cream-soft">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      </button>
                      {!p.anulado && (
                        <>
                          <button onClick={permite.imprimir ? () => imprimirComanda(p, numerosDia.get(p.id)) : sinPermiso.mostrar} aria-label="Reimprimir comanda" title="Reimprimir la comanda del pedido" className={`rounded-lg border border-brand-brown/15 p-1.5 text-brand-brown transition hover:bg-brand-cream-soft ${permite.imprimir ? "" : "opacity-50"}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
                            </svg>
                          </button>
                          {/* Un pedido DESPACHADO solo permite Ver y Reimprimir. */}
                          {p.estado !== "Despachado" && (
                          <>
                          <button onClick={permite.imprimir ? () => reimprimirExcel(p) : sinPermiso.mostrar} aria-label="Descargar Excel" title="Descargar el Excel de despacho" className={`rounded-lg border border-brand-brown/15 p-1.5 text-green-700 transition hover:bg-brand-cream-soft ${permite.imprimir ? "" : "opacity-50"}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v2.625a2.25 2.25 0 0 1-2.25 2.25h-10.5a2.25 2.25 0 0 1-2.25-2.25V14.25M12 3v12m0 0-3.75-3.75M12 15l3.75-3.75" />
                            </svg>
                          </button>
                          <button onClick={permite.editar ? () => abrirEdicion(p) : sinPermiso.mostrar} aria-label="Editar pedido" title="Editar el pedido" className={`rounded-lg border border-brand-brown/15 p-1.5 text-brand-wine transition hover:bg-brand-cream-soft ${permite.editar ? "" : "opacity-50"}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                            </svg>
                          </button>
                          <button onClick={permite.anular ? () => anularPedido(p) : sinPermiso.mostrar} aria-label="Anular pedido" title="Anular el pedido (error interno de la televendedora)" className={`rounded-lg border border-red-200 p-1.5 text-red-600 transition hover:bg-red-50 ${permite.anular ? "" : "opacity-50"}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          </button>
                          <button onClick={permite.anular ? () => cancelarPedido(p) : sinPermiso.mostrar} aria-label="Cancelar pedido" title="Cancelar el pedido (motivo externo: el cliente no lo recibió / devolución)" className={`rounded-lg border border-orange-200 p-1.5 text-orange-600 transition hover:bg-orange-50 ${permite.anular ? "" : "opacity-50"}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                            </svg>
                          </button>
                          </>
                          )}
                        </>
                      )}
                      {p.anulado && (
                        <button onClick={permite.clonar ? () => abrirClon(p) : sinPermiso.mostrar} aria-label="Clonar pedido" title="Clonar el pedido" className={`rounded-lg border border-brand-amber/40 p-1.5 text-brand-amber transition hover:bg-brand-amber/10 ${permite.clonar ? "" : "opacity-50"}`}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m11.25 4.125v3.375" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {wizardAbierto && (
        <WizardPedido
          onCerrar={cerrarWizard}
          onCrear={guardarPedido}
          onCongelar={congelarBorrador}
          pedidos={pedidos}
          inicial={editando}
          clon={clonando}
          borrador={borrador}
        />
      )}
      {modalCongelados && (
        <ModalCongelados
          congelados={congelados}
          onDescongelar={descongelar}
          onEliminar={eliminarCongelado}
          onCerrar={() => setModalCongelados(false)}
        />
      )}
      {detalle && <DetallePedido pedido={detalle} numeroDia={numerosDia.get(detalle.id)} meta={meta[detalle.id]} clones={clonesPorComanda.get(detalle.comanda)} onCerrar={() => setDetalle(null)} />}
      {motivoModal && (
        <ModalMotivo
          pedido={motivoModal.pedido}
          tipo={motivoModal.tipo}
          motivos={motivos}
          onConfirmar={confirmarMotivo}
          onCerrar={() => setMotivoModal(null)}
        />
      )}
      <ModalSinPermiso abierto={sinPermiso.abierto} onCerrar={sinPermiso.cerrar} />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Modal para elegir el motivo al anular o cancelar un pedido       */
/* ---------------------------------------------------------------- */

function ModalMotivo({
  pedido,
  tipo,
  motivos,
  onConfirmar,
  onCerrar,
}: {
  pedido: Pedido;
  tipo: "anular" | "cancelar";
  motivos: Motivo[];
  onConfirmar: (motivo: string) => void;
  onCerrar: () => void;
}) {
  const esAnular = tipo === "anular";
  // Motivos configurados en el módulo Motivos; si no hay, se usan los de defecto.
  const deTipo = motivos.filter((m) => m.tipo === tipo).map((m) => m.nombre);
  const opciones = deTipo.length ? deTipo : [...(esAnular ? MOTIVOS_ANULAR : MOTIVOS_CANCELAR)];
  const [motivo, setMotivo] = useState<string>("");
  const claseSel = esAnular
    ? "border-red-400 bg-red-50 text-red-700"
    : "border-orange-400 bg-orange-50 text-orange-700";
  const claseRadio = esAnular ? "accent-red-600" : "accent-orange-600";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          title="Cerrar"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-brand-brown/50 transition hover:bg-brand-cream-soft hover:text-brand-brown"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="font-serif text-xl font-bold text-brand-wine">
          {esAnular ? "Anular pedido" : "Cancelar pedido"}
        </h2>
        <p className="mt-1 text-sm text-brand-brown/70">
          Pedido <b>{pedido.comanda}</b>. Elige el motivo. Esta acción no se
          puede deshacer.
        </p>

        <div className="mt-4 space-y-2">
          {opciones.map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                motivo === m
                  ? claseSel
                  : "border-brand-brown/15 hover:bg-brand-cream-soft"
              }`}
            >
              <input
                type="radio"
                name="motivo"
                value={m}
                checked={motivo === m}
                onChange={() => setMotivo(m)}
                className={`h-4 w-4 ${claseRadio}`}
              />
              <span className="font-medium">{m}</span>
            </label>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-xl border border-brand-brown/20 px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft"
          >
            Volver
          </button>
          <button
            type="button"
            disabled={!motivo}
            onClick={() => motivo && onConfirmar(motivo)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
              esAnular ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"
            }`}
          >
            {esAnular ? "Anular pedido" : "Cancelar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Modal de pedidos congelados (en espera)                          */
/* ---------------------------------------------------------------- */
function ModalCongelados({
  congelados,
  onDescongelar,
  onEliminar,
  onCerrar,
}: {
  congelados: PedidoCongelado[];
  onDescongelar: (b: PedidoCongelado) => void;
  onEliminar: (id: string) => void;
  onCerrar: () => void;
}) {
  const [verCong, setVerCong] = useState<PedidoCongelado | null>(null);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-brand-brown/10 px-6 py-4">
          <div>
            <h2 className="font-serif text-xl font-bold text-brand-wine">
              Pedidos congelados
            </h2>
            <p className="text-xs text-brand-brown/50">
              Borradores en espera. Descongela uno para retomarlo por donde ibas.
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-brand-brown/50 transition hover:bg-brand-cream-soft hover:text-brand-brown"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {congelados.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-brand-brown/50">
              No hay pedidos congelados en tus puntos de venta. Usa el botón
              “Congelar” dentro de un pedido para dejarlo en espera.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-brand-cream-soft/80 text-left text-xs uppercase tracking-wide text-brand-brown/50">
                <tr>
                  <th className="px-4 py-3">Temporal</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Punto</th>
                  <th className="px-4 py-3">Congelado por</th>
                  <th className="px-4 py-3">Productos</th>
                  <th className="px-4 py-3">Total parcial</th>
                  <th className="px-4 py-3">Congelado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {congelados.map((c) => (
                  <tr key={c.id} className="border-t border-brand-brown/5 hover:bg-brand-cream-soft/30">
                    <td className="px-4 py-3 font-semibold text-brand-wine">
                      CONG-{c.tempConsecutivo}
                    </td>
                    <td className="px-4 py-3">{c.clienteNombre}</td>
                    <td className="px-4 py-3 text-brand-brown/70">{c.punto?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-brand-brown/70">{c.congeladoPor || "—"}</td>
                    <td className="px-4 py-3 text-brand-brown/70">{c.numItems}</td>
                    <td className="px-4 py-3 font-medium">{formatoCOP(c.totalParcial)}</td>
                    <td className="px-4 py-3 text-brand-brown/60">
                      {new Date(c.creadoEn).toLocaleString("es-CO", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setVerCong(c)}
                          title="Ver detalle del pedido congelado"
                          className="rounded-lg border border-brand-brown/15 px-3 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
                        >
                          Ver
                        </button>
                        <button
                          onClick={() => onDescongelar(c)}
                          title="Descongelar y retomar el pedido"
                          className="rounded-lg border border-brand-amber/40 bg-brand-amber/10 px-3 py-1.5 text-xs font-semibold text-brand-amber transition hover:bg-brand-amber/20"
                        >
                          Descongelar
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar el congelado CONG-${c.tempConsecutivo}?`)) onEliminar(c.id);
                          }}
                          title="Eliminar el pedido congelado"
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-brand-brown/10 px-6 py-4">
          <button
            onClick={onCerrar}
            title="Cerrar"
            className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-wine/90"
          >
            Cerrar
          </button>
        </div>
      </div>

      {verCong && (
        <DetalleCongelado
          congelado={verCong}
          onCerrar={() => setVerCong(null)}
          onDescongelar={(c) => {
            setVerCong(null);
            onDescongelar(c);
          }}
          onEliminar={(id) => {
            setVerCong(null);
            onEliminar(id);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Detalle de un pedido congelado                                   */
/* ---------------------------------------------------------------- */
function DetalleCongelado({
  congelado,
  onCerrar,
  onDescongelar,
  onEliminar,
}: {
  congelado: PedidoCongelado;
  onCerrar: () => void;
  onDescongelar: (c: PedidoCongelado) => void;
  onEliminar: (id: string) => void;
}) {
  const c = congelado;
  const cli = c.cliente;
  const dest =
    c.entrega === "domicilio"
      ? "Domicilio"
      : c.entrega === "recoge"
        ? "Recoge en punto"
        : "—";
  const subtotal = c.carrito.reduce(
    (s, i) => s + i.producto.precio * i.cantidad,
    0,
  );
  const dom = c.entrega === "domicilio" ? c.valorDomicilio ?? 0 : 0;
  const total = subtotal + dom;
  const pasoLabel = PASOS[c.paso] ?? "—";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-brand-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-brand-wine">
              Congelado CONG-{c.tempConsecutivo}
            </h3>
            <p className="text-xs text-brand-brown/50">
              {new Date(c.creadoEn).toLocaleString("es-CO")} ·{" "}
              {c.punto?.nombre ?? "Sin punto"}
            </p>
          </div>
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
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          {/* NIT/Cédula destacado */}
          <div className="mb-4 rounded-xl border border-brand-wine/15 bg-brand-wine/5 px-4 py-3 text-center">
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-brown/50">NIT / Cédula</p>
            <p className="text-2xl font-bold text-brand-wine">{cli?.nit_cedula || "—"}</p>
          </div>
          {/* Secciones en 2 columnas (van bajando) para ahorrar espacio */}
          <div className="gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid lg:columns-2">
          {/* Cliente */}
          {cli ? (
            <Seccion titulo="Cliente">
              <Dato label="Nombre">{cli.nombre || "—"}</Dato>
              <Dato label="Teléfono">{cli.telefono || "—"}</Dato>
              <Dato label="Ciudad">{cli.ciudad || "—"}</Dato>
              <Dato label="Barrio">{cli.barrio || "—"}</Dato>
              <Dato label="Dirección">{cli.direccion || "—"}</Dato>
              <Dato label="Referencia">{cli.referencia || "—"}</Dato>
            </Seccion>
          ) : (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">Cliente</p>
              <p className="text-xs italic text-brand-brown/40">Aún no se ha seleccionado un cliente.</p>
            </div>
          )}
          {/* Borrador */}
          <Seccion titulo="Borrador">
            <Dato label="Consecutivo temporal">CONG-{c.tempConsecutivo}</Dato>
            <Dato label="Avance">
              Paso {Math.min(c.paso + 1, PASOS.length)} de {PASOS.length} · {pasoLabel}
            </Dato>
            <Dato label="Punto de venta">{c.punto?.nombre ?? "—"}</Dato>
            <Dato label="Congelado por">{c.congeladoPor || "—"}</Dato>
            <Dato label="Congelado">{new Date(c.creadoEn).toLocaleString("es-CO")}</Dato>
            <Dato label="Entrega">{dest}</Dato>
            <Dato label="Método de pago">{c.pago || "—"}</Dato>
            {c.entrega === "domicilio" && (
              <Dato label="Valor domicilio">{formatoCOP(dom)}</Dato>
            )}
            {c.programado && (
              <Dato label="Entrega programada">{c.fechaProgramada || "—"}</Dato>
            )}
          </Seccion>
          {/* Productos */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">
              Productos ({c.carrito.length})
            </p>
            {c.carrito.length > 0 ? (
              <div className="grid max-h-[20rem] gap-2 overflow-y-auto rounded-xl border border-brand-brown/10 p-2 sm:grid-cols-2">
                {c.carrito.map((i) => (
                  <div key={i.id} className="flex justify-between gap-2 rounded-lg bg-brand-cream-soft/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium text-brand-black break-words">
                        {i.producto.producto || i.producto.referencia}{" "}
                        <span className="text-xs text-brand-brown/40">Ref {i.producto.referencia}</span>
                      </p>
                      <p className="text-xs text-brand-brown/60">Cantidad: {cantidadLabel(i.cantidad, i.producto.um)} · {formatoCOP(i.producto.precio)} c/u</p>
                      {i.alVacio && <p className="text-xs text-brand-brown/60">Empaque al vacío: Sí</p>}
                      {i.porcionado && <p className="text-xs text-brand-brown/60">Porcionado: {i.unidades} und x {i.gramos} g{i.corte ? ` · ${i.corte}` : ""}</p>}
                      {i.notas && <p className="text-xs italic text-brand-brown/60">Nota: {i.notas}</p>}
                    </div>
                    <span className="shrink-0 whitespace-nowrap font-medium">{formatoCOP(i.producto.precio * i.cantidad)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs italic text-brand-brown/40">Sin productos todavía.</p>
            )}
            {/* Totales */}
            <div className="mt-2 flex flex-wrap items-center justify-end gap-x-6 gap-y-1">
              <span className="text-sm text-brand-brown/70">Subtotal: {formatoCOP(subtotal)}</span>
              {c.entrega === "domicilio" && (
                <span className="text-sm text-brand-brown/70">Domicilio: {formatoCOP(dom)}</span>
              )}
              <span className="text-base font-bold text-brand-wine">Total parcial: {formatoCOP(total)}</span>
            </div>
          </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-brand-brown/10 px-5 py-4">
          <button
            onClick={() => {
              if (confirm(`¿Eliminar el congelado CONG-${c.tempConsecutivo}?`)) onEliminar(c.id);
            }}
            title="Eliminar el pedido congelado"
            className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Eliminar
          </button>
          <button
            onClick={() => onDescongelar(c)}
            title="Descongelar y continuar el pedido"
            className="rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white hover:bg-brand-amber/90"
          >
            Descongelar y continuar
          </button>
          <button onClick={onCerrar} title="Cerrar" className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Wizard de creación de pedido                                     */
/* ---------------------------------------------------------------- */
function WizardPedido({ onCerrar, onCrear, onCongelar, pedidos, inicial, clon, borrador }: { onCerrar: () => void; onCrear: (p: Pedido) => void; onCongelar?: (b: PedidoCongelado) => void; pedidos: Pedido[]; inicial?: Pedido | null; clon?: Pedido | null; borrador?: PedidoCongelado | null }) {
  // Fuente para precargar el formulario: edición o clonación.
  const base = inicial ?? clon ?? null;
  // En modo edición solo se permite cambiar entrega/pago/fecha (paso 2). Para
  // corregir cliente o productos hay que anular y clonar el pedido.
  const modoEdicion = !!inicial;
  const [paso, setPaso] = useState(modoEdicion ? 2 : borrador?.paso ?? 0);
  const [cliente, setCliente] = useState<Cliente | null>(borrador ? borrador.cliente : base?.cliente ?? null);
  const [carrito, setCarrito] = useState<ItemCarrito[]>(() => {
    if (borrador) return borrador.carrito;
    const src = base?.carrito ?? [];
    // Al clonar, copiamos los ítems para no mutar el pedido original.
    return clon ? structuredClone(src) : src;
  });
  const [entrega, setEntrega] = useState<"domicilio" | "recoge" | null>(borrador ? borrador.entrega : base?.entrega ?? null);
  const [pago, setPago] = useState<string | null>(borrador ? borrador.pago : base?.pago ?? null);
  const [valorDomicilio, setValorDomicilio] = useState<number>(borrador ? borrador.valorDomicilio : base?.valorDomicilio ?? 0);
  // Fecha de entrega: programado=false => hoy; programado=true => fecha elegida.
  const [programado, setProgramado] = useState<boolean>(borrador ? borrador.programado : base?.entregaProgramada ?? false);
  const [fechaProgramada, setFechaProgramada] = useState<string>(borrador ? borrador.fechaProgramada : base?.fechaProgramada ?? "");
  const [horaDespacho, setHoraDespacho] = useState<string>(borrador ? borrador.horaDespacho ?? "" : base?.horaDespacho ?? "");
  // Observación general del pedido (indicaciones para despacho/cocina).
  const [observacion, setObservacion] = useState<string>(borrador ? borrador.observacion : base?.observacion ?? "");
  const [pedidoCreado, setPedidoCreado] = useState<Pedido | null>(null);
  // Guarda contra doble envío (evita crear el pedido/clon dos veces).
  const finalizandoRef = useRef(false);
  // Autorización con clave dinámica: al CLONAR cambiando el punto de venta se
  // exige el código dinámico de un administrador antes de crear/subir a Drivin.
  const [autorizacionAbierta, setAutorizacionAbierta] = useState(false);
  const [codigoAuth, setCodigoAuth] = useState("");
  const [verificandoAuth, setVerificandoAuth] = useState(false);
  const [errorAuth, setErrorAuth] = useState<string | null>(null);
  // Estado del envío directo a Drivin (solo La 93) tras crear el pedido.
  const [drivinEstado, setDrivinEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [drivinMsg, setDrivinMsg] = useState<string>("");
  const [editandoItem, setEditandoItem] = useState<ItemCarrito | null>(null);

  // Punto de venta del pedido
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [punto, setPunto] = useState<PuntoVenta | null>(borrador ? borrador.punto : base?.punto ?? null);
  const [cargandoPuntos, setCargandoPuntos] = useState(true);
  const [errorPuntos, setErrorPuntos] = useState<string | null>(null);
  // El usuario pidió CAMBIAR el punto (desde el chip de la cabecera): muestra el
  // selector en cualquier paso, sin perder el punto actual hasta que elija otro.
  const [cambiandoPunto, setCambiandoPunto] = useState(false);

  useEffect(() => {
    misPuntosVenta()
      .then((ps) => {
        setPuntos(ps);
        if (ps.length === 1) setPunto(ps[0]); // un solo punto: directo
      })
      .catch((e) =>
        setErrorPuntos(
          e instanceof Error ? e.message : "No se pudieron cargar los puntos de venta",
        ),
      )
      .finally(() => setCargandoPuntos(false));
  }, []);

  // Mientras no haya punto elegido (y haya varios), se muestra el selector.
  // El paso 0 (cliente) puede verse sin punto. A partir del paso 1, si el
  // usuario tiene varios puntos asignados, debe elegirlo MANUALMENTE. También
  // se muestra si el usuario pulsó "cambiar punto" desde la cabecera.
  const eligiendoPunto = cambiandoPunto || (!punto && paso >= 1);

  // Selecciona el cliente y avanza. La selección del punto de venta es MANUAL
  // cuando hay varios puntos (no se auto-asigna). Si solo hay 1 punto, ya está
  // preseleccionado por el efecto de misPuntosVenta.
  function seleccionarCliente(c: Cliente) {
    setCliente(c);
    setPaso(1);
  }

  // Punto de venta MÁS CERCANO al cliente (según su dirección). Se conserva la
  // lógica de "redirección por dirección" solo como SUGERENCIA: se resalta en
  // el selector manual, pero no se auto-selecciona.
  const puntoSugerido = useMemo(() => {
    if (!cliente || !coordenadasValidas(cliente.lat, cliente.lng)) return null;
    return (
      puntoMasCercano(puntos, cliente.lat as number, cliente.lng as number)
        ?.punto ?? null
    );
  }, [cliente, puntos]);

  // Distancia (km) en línea recta entre el cliente y el punto seleccionado.
  const distanciaClientePunto = useMemo(() => {
    if (
      !punto ||
      !cliente ||
      !coordenadasValidas(punto.lat, punto.lng) ||
      !coordenadasValidas(cliente.lat, cliente.lng)
    )
      return null;
    return distanciaKm(
      cliente.lat as number,
      cliente.lng as number,
      punto.lat as number,
      punto.lng as number,
    );
  }, [punto, cliente]);

  // Valor de la factura (solo productos, sin domicilio). Es el que decide si el
  // pedido califica para domicilio gratis.
  const subtotalProductos = useMemo(
    () => carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0),
    [carrito],
  );

  // ¿El pedido califica para domicilio gratis según la tarifa del punto?
  const domicilioGratis = useMemo(
    () => (punto ? domicilioGratisAplica(punto, subtotalProductos) : false),
    [punto, subtotalProductos],
  );

  // Valor de domicilio sugerido según la tarifa del punto y la distancia.
  // Si el pedido califica para domicilio gratis, el sugerido es 0.
  const domicilioSugerido = useMemo(() => {
    if (!punto) return null;
    if (domicilioGratis) return 0;
    if (distanciaClientePunto == null) return null;
    return calcularValorDomicilio(punto, distanciaClientePunto);
  }, [distanciaClientePunto, punto, domicilioGratis]);

  // Al calificar para domicilio gratis (y estar en modo domicilio), se pone en 0.
  useEffect(() => {
    if (domicilioGratis && entrega === "domicilio") setValorDomicilio(0);
  }, [domicilioGratis, entrega]);

  // Congela el borrador actual (guarda por dónde va) y cierra el wizard.
  function congelar() {
    if (!onCongelar) return;
    const dom = entrega === "domicilio" ? valorDomicilio : 0;
    const totalParcial =
      carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0) + dom;
    onCongelar({
      id: borrador?.id ?? crypto.randomUUID(),
      tempConsecutivo: borrador?.tempConsecutivo ?? 0,
      creadoEn: new Date().toISOString(),
      paso,
      punto,
      cliente,
      carrito,
      entrega,
      pago,
      valorDomicilio,
      programado,
      fechaProgramada,
      horaDespacho,
      observacion,
      clienteNombre: cliente?.nombre || cliente?.nit_cedula || "Sin cliente",
      numItems: carrito.length,
      totalParcial,
      congeladoPor:
        borrador?.congeladoPor || getUsuario()?.nombre || "Sin nombre",
    });
  }

  // Crea o actualiza el pedido y muestra la pantalla de confirmación.
  async function finalizarPedido() {
    if (finalizandoRef.current) return; // evita doble clic (clon/pedido duplicado)
    if (!punto || !cliente) return;
    if (programado && !fechaProgramada) {
      alert("Selecciona la fecha de entrega programada.");
      return;
    }
    // Clonar cambiando el punto de venta es un movimiento sensible (el pedido
    // pasa a otro punto y puede subir a Drivin): requiere autorización con la
    // clave dinámica de un administrador antes de ejecutarse.
    if (requiereAutorizacion) {
      setCodigoAuth("");
      setErrorAuth(null);
      setAutorizacionAbierta(true);
      return;
    }
    ejecutarCreacion();
  }

  // ¿La operación necesita autorización de administrador? Solo al CLONAR hacia
  // un punto de venta distinto al del pedido original.
  const requiereAutorizacion =
    !!clon &&
    !!clon.punto &&
    !!punto &&
    String(punto.id) !== String(clon.punto.id);

  // Verifica el código dinámico dictado por el administrador y, si es válido,
  // ejecuta la creación del clon. Si no, bloquea la operación.
  async function autorizarYCrear() {
    if (verificandoAuth) return;
    const codigo = codigoAuth.replace(/\D/g, "");
    if (codigo.length !== 6) {
      setErrorAuth("Ingresa el código de 6 dígitos.");
      return;
    }
    setVerificandoAuth(true);
    setErrorAuth(null);
    try {
      const { valido } = await verificarClaveDinamica(codigo);
      if (!valido) {
        setErrorAuth("Código incorrecto o expirado. Solicítalo de nuevo.");
        return;
      }
      setAutorizacionAbierta(false);
      ejecutarCreacion();
    } catch {
      setErrorAuth("No se pudo verificar el código. Inténtalo de nuevo.");
    } finally {
      setVerificandoAuth(false);
    }
  }

  async function ejecutarCreacion() {
    if (finalizandoRef.current) return; // evita doble clic (clon/pedido duplicado)
    if (!punto || !cliente) return;
    finalizandoRef.current = true;
    const ahora = new Date();
    const dom = entrega === "domicilio" ? valorDomicilio : 0;
    const total = carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0) + dom;
    // El consecutivo y la comanda de un pedido NUEVO los asigna el
    // backend de forma atómica por punto (evita duplicados en ventas
    // simultáneas). En edición se conservan los originales. Aquí solo
    // enviamos un valor provisional que el servidor reemplaza.
    const consecutivo = inicial ? inicial.consecutivo : 0;
    const numeroPunto = ((punto.codigo ?? "").match(/\d+/)?.[0] ?? "").trim();
    const prefijo = `${numeroPunto}CS`;
    const pedido: Pedido = {
      id: inicial?.id ?? crypto.randomUUID(),
      consecutivo,
      comanda: inicial?.comanda ?? `${prefijo}${String(consecutivo).padStart(8, "0")}`,
      fecha: inicial?.fecha ?? ahora.toISOString(),
      punto,
      cliente,
      carrito,
      entrega,
      pago,
      total,
      valorDomicilio: dom,
      observacion: observacion.trim() || undefined,
      entregaProgramada: programado,
      fechaProgramada: programado ? fechaProgramada : undefined,
      horaDespacho: horaDespacho || undefined,
      vendedorNombre: inicial?.vendedorNombre ?? getUsuario()?.nombre ?? "",
      vendedorCedula: inicial?.vendedorCedula ?? getUsuario()?.cedula ?? "",
      estado: inicial?.estado ?? "En proceso",
      // Si es una clonación, referencia la comanda del pedido de origen
      // (normalmente el anulado). En edición conserva la referencia previa.
      clonadoDe: clon ? clon.comanda : inicial?.clonadoDe,
    };
    // Persistimos primero: el servidor devuelve el pedido con su
    // consecutivo/comanda definitivos. Solo entonces lo mostramos e
    // imprimimos, garantizando que no haya consecutivos duplicados.
    let finalPedido: Pedido;
    try {
      finalPedido = await guardarPedidoApi(pedido);
    } catch {
      finalizandoRef.current = false;
      alert("No se pudo crear el pedido. Verifica tu conexión e inténtalo de nuevo.");
      return;
    }
    onCrear(finalPedido);
    setPedidoCreado(finalPedido);
    // Si el pedido es de un punto integrado con Drivin (La 93 o Alameda), se
    // ENVÍA automáticamente al crearlo. El Excel ya NO se descarga solo: queda
    // como respaldo manual por si el envío directo falla.
    if (esPuntoDrivin(finalPedido.punto)) {
      enviarDrivinCreacion(finalPedido);
    } else {
      setDrivinEstado("idle");
    }
  }

  // Puntos integrados con Drivin (envío automático): La 93, Alameda, Olaya y
  // San Felipe. Cada uno usa su propio schema en el backend (93->01, Alameda I->04,
  // Alameda II->05, Olaya->06, San Felipe->07).
  function esPuntoDrivin(p?: { nombre?: string } | null): boolean {
    const nombre = String(p?.nombre ?? "").toLowerCase();
    return (
      /\b93\b/.test(nombre) ||
      nombre.includes("alameda") ||
      nombre.includes("olaya") ||
      nombre.includes("felipe")
    );
  }

  // Envía el pedido recién creado a Drivin y refleja el resultado en el modal.
  async function enviarDrivinCreacion(p: Pedido) {
    setDrivinEstado("enviando");
    setDrivinMsg("");
    try {
      await enviarADrivinApi(p.id);
      setDrivinEstado("ok");
    } catch (e) {
      setDrivinEstado("error");
      setDrivinMsg(e instanceof Error ? e.message : "");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/50 p-4">
      {/* Modal de autorización con clave dinámica (clonar cambiando de punto) */}
      {autorizacionAbierta && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-wine/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 text-brand-wine">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h3 className="mt-4 text-center font-serif text-xl font-bold text-brand-wine">
              Autorización requerida
            </h3>
            <p className="mt-1 text-center text-sm text-brand-brown/70">
              Estás clonando este pedido a{" "}
              <b>{punto?.nombre}</b> (distinto al punto original
              {clon?.punto ? ` "${clon.punto.nombre}"` : ""}). Pídele a un
              administrador su <b>clave dinámica</b> e ingrésala para autorizar
              el cambio.
            </p>
            <input
              inputMode="numeric"
              autoFocus
              value={codigoAuth}
              onChange={(e) => {
                setCodigoAuth(e.target.value.replace(/\D/g, "").slice(0, 6));
                setErrorAuth(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") autorizarYCrear();
              }}
              placeholder="••••••"
              className="mt-4 w-full rounded-xl border border-brand-brown/20 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-brand-wine outline-none focus:border-brand-wine"
            />
            {errorAuth && (
              <p className="mt-2 text-center text-sm font-medium text-red-600">{errorAuth}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAutorizacionAbierta(false);
                  setCodigoAuth("");
                  setErrorAuth(null);
                }}
                className="flex-1 rounded-xl border border-brand-brown/20 px-4 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={autorizarYCrear}
                disabled={verificandoAuth || codigoAuth.length !== 6}
                className="flex-1 rounded-xl bg-brand-wine px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-50"
              >
                {verificandoAuth ? "Verificando…" : "Autorizar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-3 border-b border-brand-brown/10 px-6 py-4">
          <h2 className="font-serif text-xl font-bold text-brand-wine">
            {inicial ? `Editar pedido ${inicial.comanda}` : clon ? `Clonar pedido ${clon.comanda}` : borrador ? `Pedido congelado CONG-${borrador.tempConsecutivo}` : "Nuevo pedido"}
          </h2>
          <div className="flex items-center gap-3">
            {punto && (
              !modoEdicion && puntos.length > 1 ? (
                <div className="relative" title="Cambiar el punto de venta">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-wine">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />
                  </svg>
                  <select
                    value={String(punto.id)}
                    onChange={(e) => {
                      const sel = puntos.find((p) => String(p.id) === e.target.value);
                      if (sel) setPunto(sel);
                    }}
                    className="cursor-pointer appearance-none rounded-full bg-brand-wine/10 py-1 pl-8 pr-7 text-xs font-semibold text-brand-wine outline-none transition hover:bg-brand-wine/20 focus:ring-1 focus:ring-brand-wine/40"
                  >
                    {puntos.map((p) => (
                      <option key={p.id} value={String(p.id)} className="text-brand-black">
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-brand-wine/70">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              ) : (
                <span
                  title={punto.nombre}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-wine/10 px-3 py-1 text-xs font-semibold text-brand-wine"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />
                  </svg>
                  {punto.nombre}
                </span>
              )
            )}
            <button
              onClick={onCerrar}
              className="rounded-lg p-1.5 text-brand-brown/50 transition hover:bg-brand-cream-soft hover:text-brand-brown"
              aria-label="Cerrar"
              title="Cerrar"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {pedidoCreado ? (
          <>
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 text-green-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="mt-4 font-serif text-2xl font-bold text-brand-wine">{inicial ? "Pedido actualizado" : clon ? "Pedido clonado" : "Pedido creado"}</h3>
              <p className="mt-1 text-sm text-brand-brown/60">
                Comanda <b>{pedidoCreado.comanda}</b> · Total {formatoCOP(pedidoCreado.total)}
              </p>

              {/* Estado del envío directo a Drivin (solo La 93) */}
              {esPuntoDrivin(pedidoCreado.punto) && drivinEstado !== "idle" && (
                <div className="mt-4 w-full max-w-md">
                  {drivinEstado === "enviando" && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                      Enviando el pedido a Drivin…
                    </div>
                  )}
                  {drivinEstado === "ok" && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Envío exitoso del pedido {pedidoCreado.comanda} a Drivin.
                    </div>
                  )}
                  {drivinEstado === "error" && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
                      <p className="font-semibold">Error al subir el pedido a Drivin.</p>
                      <p className="mt-0.5">Por favor genera el Excel e inténtalo manual.</p>
                      {drivinMsg && (
                        <p className="mt-1 break-words text-xs text-red-500/80">{drivinMsg}</p>
                      )}
                      <button
                        onClick={() => enviarDrivinCreacion(pedidoCreado)}
                        className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                      >
                        Reintentar envío
                      </button>
                    </div>
                  )}
                </div>
              )}

              <p className="mt-4 max-w-sm text-sm text-brand-brown/60">
                El pedido quedó guardado. Imprime la comanda ahora o vuelve a imprimirla cuando quieras desde la lista.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => imprimirComanda(pedidoCreado, numerosDelDia([...pedidos, pedidoCreado]).get(pedidoCreado.id))}
                  title="Imprimir la comanda del pedido"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-wine/90"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171L17.66 18M18 10.5h.008v.008H18V10.5Z" />
                  </svg>
                  Imprimir comanda
                </button>
                {esPuntoDrivin(pedidoCreado.punto) ? (
                  // Excel como ÍCONO de respaldo (ya no botón grande): úsalo si el
                  // envío directo a Drivin falla.
                  <button
                    onClick={() => descargarExcelDespacho(pedidoCreado.id)}
                    title="Descargar el Excel de despacho (respaldo)"
                    aria-label="Descargar Excel de respaldo"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-brand-brown/15 text-brand-brown transition hover:bg-brand-cream-soft"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={() => descargarExcelDespacho(pedidoCreado.id)}
                    title="Descargar el Excel de despacho"
                    className="inline-flex items-center gap-2 rounded-xl border border-brand-brown/15 px-6 py-3 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Descargar Excel
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end border-t border-brand-brown/10 px-6 py-4">
              <button
                onClick={onCerrar}
                title="Cerrar"
                className="rounded-xl border border-brand-brown/15 px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft"
              >
                Cerrar
              </button>
            </div>
          </>
        ) : eligiendoPunto ? (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <PasoPunto
                puntos={puntos}
                cargando={cargandoPuntos}
                error={errorPuntos}
                onSeleccionar={(p) => {
                  setPunto(p);
                  setCambiandoPunto(false);
                }}
                sugeridoId={puntoSugerido ? String(puntoSugerido.id) : undefined}
              />
            </div>
            <div className="flex items-center justify-end border-t border-brand-brown/10 px-6 py-4">
              <button
                onClick={() => {
                  // Si solo estaba cambiando el punto, vuelve al paso actual sin
                  // cerrar el wizard (conserva el punto que ya tenía).
                  if (cambiandoPunto && punto) setCambiandoPunto(false);
                  else onCerrar();
                }}
                title="Cancelar y cerrar"
                className="rounded-xl border border-brand-brown/15 px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : modoEdicion ? (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-brand-amber/40 bg-brand-amber/5 px-4 py-3 text-sm text-brand-brown">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 h-4 w-4 shrink-0 text-brand-amber">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
                <span>
                  En edición solo puedes cambiar la <strong>entrega</strong>, el{" "}
                  <strong>método de pago</strong> y la <strong>fecha/hora de
                  entrega</strong>. Para corregir el cliente o los productos, anula
                  el pedido y clónalo.
                </span>
              </div>
              <div className="space-y-6">
                <PasoEntrega cliente={cliente} punto={punto} valor={entrega} onCambiar={setEntrega} domicilio={valorDomicilio} onDomicilio={setValorDomicilio} sugerido={domicilioSugerido} distancia={distanciaClientePunto} gratis={domicilioGratis} />
                <PasoPago valor={pago} onCambiar={setPago} />
                <PasoFechaEntrega
                  programado={programado}
                  onCambiar={setProgramado}
                  fecha={fechaProgramada}
                  onFecha={setFechaProgramada}
                  hora={horaDespacho}
                  onHora={setHoraDespacho}
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-brand-brown/10 px-6 py-4">
              <button
                onClick={onCerrar}
                title="Cancelar y cerrar"
                className="rounded-xl border border-brand-brown/15 px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft"
              >
                Cancelar
              </button>
              <button
                onClick={finalizarPedido}
                disabled={!entrega || !pago}
                title="Guardar los cambios del pedido"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-wine/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Guardar cambios
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <>
            <Stepper paso={paso} />

            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {paso === 0 && (
                  <PasoCliente
                    seleccionado={cliente}
                    pedidos={pedidos}
                    onSeleccionar={seleccionarCliente}
                  />
                )}
                {paso === 1 && punto && (
                  <PasoProductos
                    punto={punto}
                    carrito={carrito}
                    onCambiar={setCarrito}
                    cliente={cliente}
                    pedidos={pedidos}
                  />
                )}
                {paso === 2 && (
                  <div className="space-y-6">
                    <PasoEntrega cliente={cliente} punto={punto} valor={entrega} onCambiar={setEntrega} domicilio={valorDomicilio} onDomicilio={setValorDomicilio} sugerido={domicilioSugerido} distancia={distanciaClientePunto} gratis={domicilioGratis} />
                    <PasoPago valor={pago} onCambiar={setPago} />
                    <PasoFechaEntrega
                      programado={programado}
                      onCambiar={setProgramado}
                      fecha={fechaProgramada}
                      onFecha={setFechaProgramada}
                      hora={horaDespacho}
                      onHora={setHoraDespacho}
                    />
                  </div>
                )}
                {paso === 3 && punto && (
                  <PasoConfirmar
                    punto={punto}
                    cliente={cliente}
                    carrito={carrito}
                    entrega={entrega}
                    pago={pago}
                    valorDomicilio={valorDomicilio}
                    observacion={observacion}
                    onObservacion={setObservacion}
                  />
                )}
              </div>
              <ResumenPedido
                punto={punto}
                cliente={cliente}
                carrito={carrito}
                onQuitar={(id) => setCarrito(carrito.filter((i) => i.id !== id))}
                onEditar={(item) => setEditandoItem(item)}
              />
            </div>

            <div className="flex items-center justify-between border-t border-brand-brown/10 px-6 py-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => (paso === 0 ? onCerrar() : setPaso((p) => p - 1))}
                  title={paso === 0 ? "Cancelar el pedido" : "Volver al paso anterior"}
                  className="rounded-xl border border-brand-brown/15 px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft"
                >
                  {paso === 0 ? "Cancelar" : "Atrás"}
                </button>
                {onCongelar && (cliente || carrito.length > 0) && (
                  <button
                    onClick={congelar}
                    title="Guardar este pedido en espera para retomarlo luego"
                    className="inline-flex items-center gap-2 rounded-xl border border-brand-wine/30 bg-brand-wine/5 px-4 py-2.5 text-sm font-semibold text-brand-wine transition hover:bg-brand-wine/10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m0-18 4 4m-4-4-4 4m4 10 4-4m-4 4-4-4M3 12h18" />
                    </svg>
                    Congelar
                  </button>
                )}
              </div>
              {paso < PASOS.length - 1 ? (
                <button
                  onClick={() => setPaso((p) => Math.min(PASOS.length - 1, p + 1))}
                  disabled={
                    (paso === 0 && !cliente) ||
                    (paso === 1 && carrito.length === 0) ||
                    (paso === 2 && (!entrega || !pago))
                  }
                  title="Continuar al siguiente paso"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continuar
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={finalizarPedido}
                  title={inicial ? "Guardar los cambios del pedido" : clon ? "Clonar el pedido" : "Confirmar y crear el pedido"}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-wine/90"
                >
                  {inicial ? "Guardar cambios" : clon ? "Clonar pedido" : "Confirmar pedido"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {editandoItem && (
        <ConfigProducto
          producto={editandoItem.producto}
          inicial={editandoItem}
          onCerrar={() => setEditandoItem(null)}
          onAgregar={(item) => {
            setCarrito((prev) => prev.map((i) => (i.id === item.id ? item : i)));
            setEditandoItem(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Paso previo: seleccionar punto de venta (solo si hay varios)     */
/* ---------------------------------------------------------------- */

function PasoPunto({
  puntos,
  cargando,
  error,
  onSeleccionar,
  sugeridoId,
}: {
  puntos: PuntoVenta[];
  cargando: boolean;
  error: string | null;
  onSeleccionar: (p: PuntoVenta) => void;
  sugeridoId?: string;
}) {
  const [descripciones, setDescripciones] = useState<Record<string, string>>({});

  useEffect(() => {
    listarListasPrecio()
      .then((ls) => {
        const m: Record<string, string> = {};
        for (const l of ls) if (l.desc_lista) m[l.lista_precio] = l.desc_lista;
        setDescripciones(m);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-brand-black">
        ¿En qué punto de venta tomas el pedido?
      </p>
      <p className="mb-4 text-xs text-brand-brown/60">
        Determina la lista de precios que se aplicará al pedido.
      </p>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {cargando ? (
        <p className="py-10 text-center text-sm text-brand-brown/50">
          Cargando puntos de venta…
        </p>
      ) : puntos.length === 0 ? (
        <p className="py-10 text-center text-sm text-brand-brown/50">
          No tienes puntos de venta asignados.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {puntos.map((p) => {
            const recomendado = sugeridoId != null && String(p.id) === sugeridoId;
            return (
              <button
                key={p.id}
                onClick={() => onSeleccionar(p)}
                title={`Seleccionar el punto de venta ${p.nombre}`}
                className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left transition hover:bg-brand-cream-soft/40 ${
                  recomendado
                    ? "border-brand-amber ring-1 ring-brand-amber/40"
                    : "border-brand-brown/10 hover:border-brand-amber/50"
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-wine/10 text-brand-wine">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold text-brand-black">
                      {p.nombre}
                    </span>
                    {recomendado && (
                      <span className="shrink-0 rounded-full bg-brand-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-amber">
                        Recomendado
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-brand-brown/60">
                    {p.lista_precio
                      ? descripciones[p.lista_precio] ?? `Lista ${p.lista_precio}`
                      : "Sin lista asignada"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stepper({ paso }: { paso: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-brand-brown/10 bg-brand-cream-soft/40 px-6 py-3">
      {PASOS.map((label, i) => {
        const activo = i === paso;
        const hecho = i < paso;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                hecho
                  ? "bg-brand-amber text-white"
                  : activo
                    ? "bg-brand-wine text-white"
                    : "bg-brand-brown/10 text-brand-brown/50"
              }`}
            >
              {hecho ? "✓" : i + 1}
            </span>
            <span
              className={`text-xs font-medium ${
                activo ? "text-brand-wine" : "text-brand-brown/50"
              }`}
            >
              {label}
            </span>
            {i < PASOS.length - 1 && (
              <span className="mx-1 hidden h-px flex-1 bg-brand-brown/15 sm:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Paso 1: seleccionar cliente                                      */
/* ---------------------------------------------------------------- */

function PasoCliente({
  seleccionado,
  pedidos,
  onSeleccionar,
}: {
  seleccionado: Cliente | null;
  pedidos: Pedido[];
  onSeleccionar: (c: Cliente) => void;
}) {
  const [input, setInput] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [items, setItems] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  // Pedido a visualizar (solo lectura) al hacer clic en un consecutivo.
  const [verPedido, setVerPedido] = useState<Pedido | null>(null);

  // Pedidos de HOY por cliente (para avisar posibles duplicados). Se indexan
  // por NIT/cédula. Se excluyen los anulados.
  const pedidosHoyPorNit = useMemo(() => {
    const hoy = new Date();
    const claveHoy = `${hoy.getFullYear()}-${hoy.getMonth()}-${hoy.getDate()}`;
    const mapa = new Map<string, Pedido[]>();
    for (const p of pedidos) {
      if (p.anulado || (p.estado && p.estado === "Anulado")) continue;
      if (!p.fecha) continue;
      const d = new Date(p.fecha);
      const clave = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (clave !== claveHoy) continue;
      const nit = (p.cliente?.nit_cedula ?? "").trim();
      if (!nit) continue;
      const arr = mapa.get(nit);
      if (arr) arr.push(p);
      else mapa.set(nit, [p]);
    }
    return mapa;
  }, [pedidos]);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(input), 350);
    return () => clearTimeout(t);
  }, [input]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await listarClientes(busqueda, 30, 0);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los clientes");
    } finally {
      setCargando(false);
    }
  }, [busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div>
      <p className="mb-3 text-sm font-medium text-brand-black">
        ¿Para quién es el pedido?
      </p>

      {/* Buscador */}
      <div className="relative mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
        </svg>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Buscar por nombre, NIT/cédula, teléfono o barrio"
          className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-amber"
        />
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Resultados */}
      <div className="space-y-2">
        {cargando ? (
          <p className="py-10 text-center text-sm text-brand-brown/50">
            Cargando clientes…
          </p>
        ) : items.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-brand-brown/50">No se encontraron clientes.</p>
            <button
              onClick={() => setCreando(true)}
              title="Crear un nuevo cliente"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-amber px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
              Crear cliente{input.trim() ? ` “${input.trim()}”` : ""}
            </button>
          </div>
        ) : (
          items.map((c) => {
            const activo = seleccionado?.id === c.id;
            const pedidosHoy = pedidosHoyPorNit.get((c.nit_cedula ?? "").trim()) ?? [];
            return (
              <div key={c.id}>
                <button
                  onClick={() => onSeleccionar(c)}
                  title={`Seleccionar el cliente ${c.nombre || c.nit_cedula}`}
                  className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    activo
                      ? "border-brand-amber bg-brand-amber/5 ring-1 ring-brand-amber"
                      : pedidosHoy.length > 0
                        ? "border-amber-300 bg-amber-50/40 hover:bg-amber-50"
                        : "border-brand-brown/10 bg-white hover:border-brand-amber/40 hover:bg-brand-cream-soft/40"
                  }`}
                >
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-cream-soft text-sm font-bold text-brand-wine">
                    {(c.nombre || c.nit_cedula).charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-brand-black">
                        {c.nombre || "Sin nombre"}
                      </span>
                      {!c.activo && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                          Inactivo
                        </span>
                      )}
                    </span>

                    <span className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-brand-brown/70 sm:grid-cols-2">
                      <DatoCliente icono="id" valor={c.nit_cedula} />
                      {c.direccion && <DatoCliente icono="dir" valor={c.direccion} ancho />}
                      {c.referencia && <DatoCliente icono="ref" valor={c.referencia} ancho />}
                      {(c.barrio || c.ciudad) && (
                        <DatoCliente
                          icono="loc"
                          valor={[c.barrio, c.ciudad].filter(Boolean).join(", ")}
                          ancho
                        />
                      )}
                      {c.telefono && <DatoCliente icono="tel" valor={c.telefono} />}
                    </span>
                  </span>
                  {activo && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-0.5 h-5 w-5 shrink-0 text-brand-amber">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </button>

                {pedidosHoy.length > 0 && (
                  <div className="mt-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
                    <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-800">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-3.5 w-3.5 shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                      </svg>
                      Este cliente ya tuvo {pedidosHoy.length}{" "}
                      {pedidosHoy.length === 1 ? "pedido" : "pedidos"} el día de hoy.
                      Revisa antes de crear uno nuevo (posible duplicado).
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {pedidosHoy
                        .slice()
                        .sort((a, b) => (a.consecutivo ?? 0) - (b.consecutivo ?? 0))
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setVerPedido(p)}
                            title={`Ver detalle del pedido #${p.comanda} (solo lectura)`}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-white px-2 py-1 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </svg>
                            #{p.comanda}
                            {p.vendedorNombre ? (
                              <span className="font-normal text-amber-700/80">· {p.vendedorNombre}</span>
                            ) : null}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {creando && (
        <CrearClienteModal
          nitInicial={input.trim()}
          onCerrar={() => setCreando(false)}
          onCreado={(c) => {
            setCreando(false);
            onSeleccionar(c);
          }}
        />
      )}

      {verPedido && (
        <DetallePedido pedido={verPedido} numeroDia={numerosDelDia(pedidos).get(verPedido.id)} onCerrar={() => setVerPedido(null)} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Paso 2: ver productos según la lista de precios del punto         */
/* ---------------------------------------------------------------- */

interface ItemCarrito {
  id: string;
  producto: ProductoPrecio;
  cantidad: number;
  alVacio: boolean;
  porcionado: boolean;
  corte: string;
  gramos: number;
  unidades: number;
  notas: string;
}

function PasoProductos({
  punto,
  carrito,
  onCambiar,
  cliente,
  pedidos,
}: {
  punto: PuntoVenta;
  carrito: ItemCarrito[];
  onCambiar: (items: ItemCarrito[]) => void;
  cliente: Cliente | null;
  pedidos: Pedido[];
}) {
  const [input, setInput] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [items, setItems] = useState<ProductoPrecio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ProductoPrecio | null>(null);

  // Historial de productos pedidos antes por este cliente (más recientes primero)
  const historial = useMemo(() => {
    if (!cliente) return [] as ProductoPrecio[];
    const vistos = new Set<string>();
    const out: ProductoPrecio[] = [];
    for (const p of pedidos) {
      if (p.anulado) continue;
      if (p.cliente?.id !== cliente.id) continue;
      for (const it of p.carrito) {
        const key = it.producto.id;
        if (vistos.has(key)) continue;
        vistos.add(key);
        out.push(it.producto);
      }
    }
    return out;
  }, [cliente, pedidos]);

  // Precios actuales para los productos del historial (si están en el catálogo cargado)
  const preciosActuales = useMemo(() => {
    const m = new Map<string, ProductoPrecio>();
    for (const p of items) m.set(p.id, p);
    return m;
  }, [items]);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (!punto.lista_precio) {
      setError("Este punto de venta no tiene lista de precios asignada.");
      setCargando(false);
      return;
    }
    setCargando(true);
    listarProductos(punto.lista_precio, busqueda)
      .then(setItems)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudieron cargar los productos"),
      )
      .finally(() => setCargando(false));
  }, [punto.lista_precio, busqueda]);

  function quitar(id: string) {
    onCambiar(carrito.filter((i) => i.id !== id));
  }

  const enCarrito = (id: string) => carrito.some((i) => i.producto.id === id);

  return (
    <div className="flex gap-3">
      {/* Historial del cliente (columna lateral) */}
      {historial.length > 0 && (
        <div className="hidden w-52 shrink-0 flex-col rounded-xl border border-brand-wine/15 bg-brand-wine/5 p-2.5 sm:flex">
          <div className="mb-2 flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0 text-brand-wine">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <p className="text-xs font-semibold leading-tight text-brand-wine">
              Pedidos anteriores
            </p>
            <span className="ml-auto rounded-full bg-brand-wine/10 px-2 py-0.5 text-[10px] font-semibold text-brand-wine">
              {historial.length}
            </span>
          </div>
          <div className="flex max-h-[56vh] flex-col gap-2 overflow-y-auto pr-1">
            {historial.map((h) => {
              const p = preciosActuales.get(h.id) ?? h;
              return (
                <button
                  key={h.id}
                  onClick={() => setConfig(p)}
                  title={`Agregar ${p.producto || "producto"} al pedido`}
                  className={`flex flex-col rounded-lg border p-2 text-left transition ${
                    enCarrito(p.id)
                      ? "border-brand-amber bg-brand-amber/10"
                      : "border-brand-wine/15 bg-white hover:border-brand-amber/60 hover:shadow-sm"
                  }`}
                >
                  <span className="line-clamp-2 text-xs font-medium text-brand-black">
                    {p.producto || "Sin nombre"}
                  </span>
                  <span className="mt-0.5 text-[10px] text-brand-brown/50">
                    {p.referencia} · {p.um || "U"}
                  </span>
                  <span className="mt-1 text-xs font-bold text-brand-wine">
                    {formatoCOP(p.precio)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Catálogo */}
      <div className="min-w-0 flex-1">
        <div className="relative mb-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
          </svg>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Buscar carne, corte o referencia…"
            className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-amber"
          />
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            {error}
          </div>
        )}

        <div className="grid max-h-[56vh] grid-cols-2 gap-2 overflow-y-auto pr-1 lg:grid-cols-3">
          {cargando ? (
            <p className="col-span-full py-10 text-center text-sm text-brand-brown/50">
              Cargando productos…
            </p>
          ) : items.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-brand-brown/50">
              No se encontraron productos.
            </p>
          ) : (
            items.map((p) => (
              <button
                key={p.id}
                onClick={() => setConfig(p)}
                title={`Agregar ${p.producto || "producto"} al pedido`}
                className={`flex flex-col rounded-xl border p-3 text-left transition ${
                  enCarrito(p.id)
                    ? "border-brand-amber bg-brand-amber/5"
                    : "border-brand-brown/10 bg-white hover:border-brand-amber/50 hover:shadow-sm"
                }`}
              >
                <span className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-brand-black">
                  {p.producto || "Sin nombre"}
                </span>
                <span className="mt-1 text-[11px] text-brand-brown/50">
                  {p.referencia} · {p.um || "U"}
                </span>
                {p.categoria && (
                  <span className="mt-1.5 inline-flex w-fit items-center rounded-full bg-brand-wine px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {p.categoria.replace(/^\s*\d+\s*-\s*/, "")}
                  </span>
                )}
                <span className="mt-2 text-sm font-bold text-brand-wine">
                  {formatoCOP(p.precio)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {config && (
        <ConfigProducto
          producto={config}
          onCerrar={() => setConfig(null)}
          onAgregar={(item) => {
            onCambiar([...carrito, item]);
            setConfig(null);
            // Limpia el buscador para agregar el siguiente sin borrar a mano.
            setInput("");
            setBusqueda("");
          }}
        />
      )}
    </div>
  );
}

/* ---------- Panel de resumen siempre visible ---------- */

function ResumenPedido({
  punto,
  cliente,
  carrito,
  onQuitar,
  onEditar,
}: {
  punto: PuntoVenta | null;
  cliente: Cliente | null;
  carrito: ItemCarrito[];
  onQuitar: (id: string) => void;
  onEditar?: (item: ItemCarrito) => void;
}) {
  const total = carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0);
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col overflow-hidden border-l border-brand-brown/10 bg-brand-cream-soft/30 lg:flex">
      <div className="border-b border-brand-brown/10 px-4 py-3">
        <p className="font-serif text-sm font-bold text-brand-wine">Detalle del pedido</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col text-sm">
        {/* Punto + Cliente (fijos) */}
        <div className="shrink-0 space-y-3 p-4 pb-2">
          {/* Punto */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">Punto de venta</p>
            <p className="font-medium text-brand-black">{punto?.nombre ?? "Sin asignar"}</p>
            <p className="mt-1 text-xs font-medium text-brand-wine">
              Ítems seleccionados: <span className="font-bold">{carrito.length}</span>
            </p>
          </div>
          {/* Cliente */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">Cliente</p>
            {cliente ? (
              <div className="rounded-xl border border-brand-brown/10 bg-white px-3 py-2">
                <p className="font-medium text-brand-black">{cliente.nombre || "Sin nombre"}</p>
                <p className="text-xs text-brand-brown/60">{cliente.nit_cedula}</p>
                {(cliente.direccion || cliente.barrio) && (
                  <p className="mt-0.5 text-xs text-brand-brown/60">
                    {[cliente.direccion, cliente.barrio].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs italic text-brand-brown/40">Sin seleccionar</p>
            )}
          </div>
        </div>
        {/* Productos (scroll interno) */}
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          <p className="shrink-0 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">
            Productos ({carrito.length})
          </p>
          {carrito.length === 0 ? (
            <p className="text-xs italic text-brand-brown/40">Aún sin productos</p>
          ) : (
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {carrito.map((i) => (
                <div
                  key={i.id}
                  onClick={() => onEditar?.(i)}
                  role={onEditar ? "button" : undefined}
                  title={onEditar ? "Editar producto" : undefined}
                  className={`rounded-lg border border-brand-brown/10 bg-white px-2.5 py-2 ${
                    onEditar ? "cursor-pointer transition hover:border-brand-amber/50 hover:bg-brand-cream-soft/40" : ""
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-brand-black">
                      {i.producto.producto || i.producto.referencia}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-brand-wine">
                      {formatoCOP(i.producto.precio * i.cantidad)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuitar(i.id);
                      }}
                      className="shrink-0 text-brand-brown/30 hover:text-red-600"
                      aria-label="Quitar"
                      title="Quitar el producto del pedido"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-brand-brown/60">
                    <span>{cantidadLabel(i.cantidad, i.producto.um)} | {formatoCOP(i.producto.precio)}</span>
                    {i.alVacio && <Tag>Vacío</Tag>}
                    {i.porcionado && <Tag>Porciones {i.unidades} | Gramos {i.gramos} grs.</Tag>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-brand-brown/10 px-4 py-3">
        <span className="text-sm text-brand-brown/70">Total</span>
        <span className="text-lg font-bold text-brand-wine">{formatoCOP(total)}</span>
      </div>
    </aside>
  );
}

/* ---------- Sub-panel: configurar producto ---------- */

function ConfigProducto({
  producto,
  onCerrar,
  onAgregar,
  inicial,
}: {
  producto: ProductoPrecio;
  onCerrar: () => void;
  onAgregar: (item: ItemCarrito) => void;
  inicial?: ItemCarrito;
}) {
  const [cantidad, setCantidad] = useState(inicial ? String(inicial.cantidad) : "1");
  const [alVacio, setAlVacio] = useState(inicial?.alVacio ?? false);
  const [porcionado, setPorcionado] = useState(inicial?.porcionado ?? false);
  const [corte, setCorte] = useState(inicial?.corte ?? "");
  const [cortes, setCortes] = useState<string[]>([]);
  const [gramos, setGramos] = useState(inicial?.gramos ? String(inicial.gramos) : "");
  const [unidades, setUnidades] = useState(inicial?.unidades ? String(inicial.unidades) : "");
  const [notas, setNotas] = useState(inicial?.notas ?? "");

  useEffect(() => {
    obtenerTiposCorteCache().then(setCortes).catch(() => {});
  }, []);

  const esKilo = (producto.um || "").trim().toUpperCase() === "KG";
  const paso = esKilo ? 0.5 : 1;
  const minimo = esKilo ? 0.5 : 1;
  const cant = parseFloat(cantidad.replace(",", ".")) || 0;
  const g = parseFloat(gramos) || 0;
  const u = parseFloat(unidades) || 0;
  const pesoG = cant * 1000;
  const cortesG = g * u;
  const exceso = cortesG - pesoG;
  const fueraRango = porcionado && cortesG > 0 && exceso > 100;
  // Porciones recomendadas = total de gramos (peso) / gramos por pieza.
  const recomendadas = g > 0 && pesoG > 0 ? Math.round(pesoG / g) : 0;
  // Las porciones suman EXACTAMENTE el peso -> barra completa en verde.
  const exacto = porcionado && cortesG > 0 && cortesG === pesoG;
  const subtotal = producto.precio * cant;
  const pct = pesoG > 0 ? Math.min(100, (cortesG / pesoG) * 100) : 0;

  function confirmar() {
    if (cant <= 0) return;
    if (!esKilo && !Number.isInteger(cant)) return;
    if (porcionado && (g <= 0 || u <= 0 || fueraRango)) return;
    onAgregar({
      id: inicial?.id ?? crypto.randomUUID(),
      producto,
      cantidad: cant,
      alVacio,
      porcionado,
      corte: corte.trim(),
      gramos: g,
      unidades: u,
      notas: notas.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/40 p-4">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-brand-brown/10 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate font-serif text-lg font-bold text-brand-wine">
              {producto.producto || "Producto"}
            </h3>
            <p className="text-xs text-brand-brown/50">
              Ref {producto.referencia} · {formatoCOP(producto.precio)} / {producto.um || "U"}
            </p>
          </div>
          <button onClick={onCerrar} title="Cerrar" className="rounded-lg p-1.5 text-brand-brown/50 hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Cantidad */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-brand-brown/70">
              Cantidad / peso ({producto.um || "U"})
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCantidad(String(Math.max(minimo, +(cant - paso).toFixed(2))))}
                title="Disminuir la cantidad"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-brown/15 text-lg text-brand-brown hover:bg-brand-cream-soft"
              >−</button>
              <input
                type="text"
                inputMode={esKilo ? "decimal" : "numeric"}
                value={cantidad}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  const re = esKilo ? /^\d*\.?\d*$/ : /^\d*$/;
                  if (re.test(v)) setCantidad(v);
                }}
                className="h-10 w-24 rounded-xl border border-brand-brown/15 text-center text-base font-semibold outline-none focus:border-brand-amber"
              />
              <button
                onClick={() => setCantidad(String(+(cant + paso).toFixed(2)))}
                title="Aumentar la cantidad"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-brown/15 text-lg text-brand-brown hover:bg-brand-cream-soft"
              >+</button>
              <span className="ml-auto text-lg font-bold text-brand-wine">{formatoCOP(subtotal)}</span>
            </div>
          </div>

          {/* Empaque al vacío */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-brand-black">Empaque al vacío</span>
            <button
              onClick={() => setAlVacio((v) => !v)}
              title="Activar o desactivar empaque al vacío"
              className={`relative h-6 w-11 rounded-full transition ${alVacio ? "bg-brand-wine" : "bg-brand-brown/20"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${alVacio ? "left-5" : "left-0.5"}`} />
            </button>
          </div>

          {/* Porcionado */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-brand-black">Porcionado</span>
            <button
              onClick={() => setPorcionado((v) => !v)}
              title="Activar o desactivar porcionado"
              className={`relative h-6 w-11 rounded-full transition ${porcionado ? "bg-brand-wine" : "bg-brand-brown/20"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${porcionado ? "left-5" : "left-0.5"}`} />
            </button>
          </div>

          {porcionado && (
            <div className="rounded-xl bg-brand-cream-soft/50 p-3">
              <select
                value={corte}
                onChange={(e) => setCorte(e.target.value)}
                className="mb-2 w-full rounded-lg border border-brand-brown/15 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber"
              >
                <option value="">Tipo de corte (cómo lo necesita)</option>
                {corte && !cortes.includes(corte) && (
                  <option value={corte}>{corte}</option>
                )}
                {[...cortes]
                  .sort((a, b) => a.localeCompare(b, "es"))
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number" min="0" value={gramos}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGramos(val);
                    // Auto-sugiere las porciones si aún no se han ingresado.
                    const gn = parseFloat(val) || 0;
                    if (gn > 0 && pesoG > 0 && !unidades.trim()) {
                      setUnidades(String(Math.round(pesoG / gn)));
                    }
                  }}
                  placeholder="Gramos c/u"
                  className="rounded-lg border border-brand-brown/15 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber"
                />
                <input
                  type="number" min="0" value={unidades}
                  onChange={(e) => setUnidades(e.target.value)}
                  placeholder="N° porciones"
                  className="rounded-lg border border-brand-brown/15 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber"
                />
              </div>
              {/* Porciones recomendadas según el peso y los gramos por pieza */}
              {g > 0 && recomendadas > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-brand-wine/10 px-2.5 py-1 font-medium text-brand-wine">
                    Recomendado: {recomendadas} porción{recomendadas === 1 ? "" : "es"} de {g} g
                  </span>
                  {u !== recomendadas && (
                    <button
                      type="button"
                      onClick={() => setUnidades(String(recomendadas))}
                      className="rounded-full border border-brand-amber/50 px-2.5 py-1 font-semibold text-brand-amber transition hover:bg-brand-amber/10"
                    >
                      Aplicar
                    </button>
                  )}
                </div>
              )}
              {/* Barra de ajuste */}
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-brand-brown/10">
                  <div
                    className={`h-full transition-all ${
                      exacto ? "bg-green-500" : fueraRango ? "bg-red-500" : "bg-brand-amber"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p
                  className={`mt-1.5 text-xs ${
                    exacto ? "text-green-600" : fueraRango ? "text-red-600" : "text-brand-brown/60"
                  }`}
                >
                  {(cortesG / 1000).toFixed(2)} kg de {cantidad} kg
                  {exacto && " · completo ✓"}
                  {fueraRango && " · supera por más de 100 g"}
                </p>
              </div>
            </div>
          )}

          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Notas del producto (opcional)"
            className="w-full resize-none rounded-xl border border-brand-brown/15 px-3 py-2.5 text-sm outline-none focus:border-brand-amber"
          />
        </div>

        <div className="flex gap-2 border-t border-brand-brown/10 px-5 py-4">
          <button onClick={onCerrar} title="Cancelar" className="flex-1 rounded-xl border border-brand-brown/15 py-2.5 text-sm font-medium text-brand-brown hover:bg-brand-cream-soft">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={cant <= 0 || (porcionado && (g <= 0 || u <= 0 || fueraRango))}
            title={inicial ? "Guardar los cambios del producto" : "Agregar el producto al pedido"}
            className="flex-1 rounded-xl bg-brand-amber py-2.5 text-sm font-semibold text-white hover:bg-brand-amber/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {inicial ? "Guardar cambios" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-brand-cream-soft px-2 py-0.5 font-medium text-brand-wine">
      {children}
    </span>
  );
}

export function formatoCOP(v: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v);
}

function cantidadLabel(cant: number, um: string | null): string {
  const u = (um || "").trim().toUpperCase();
  const n = Number.isInteger(cant) ? cant : cant.toFixed(2);
  if (u === "KG") return `${n} ${cant === 1 ? "kilo" : "kilos"}`;
  return `${n} ${cant === 1 ? "unidad" : "unidades"}`;
}

/**
 * Convierte kilos a libras colombianas (1 kilo = 2 libras de 500 g) para que
 * los alistadores puedan trabajar el peso en la unidad que usan. Devuelve una
 * etiqueta lista para imprimir, p. ej. "3 libras" o "2.5 libras".
 */
function librasLabel(kilos: number): string {
  const libras = kilos * 2;
  const n = Number.isInteger(libras) ? libras : Number(libras.toFixed(2));
  return `${n} ${libras === 1 ? "libra" : "libras"}`;
}

/* ---------------------------------------------------------------- */
/* Paso 3: tipo de entrega                                          */
/* ---------------------------------------------------------------- */

function PasoEntrega({
  cliente,
  punto,
  valor,
  onCambiar,
  domicilio,
  onDomicilio,
  sugerido,
  distancia,
  gratis,
}: {
  cliente: Cliente | null;
  punto: PuntoVenta | null;
  valor: "domicilio" | "recoge" | null;
  onCambiar: (v: "domicilio" | "recoge") => void;
  domicilio: number;
  onDomicilio: (n: number) => void;
  sugerido: number | null;
  distancia: number | null;
  gratis: boolean;
}) {
  const ops = [
    {
      id: "domicilio" as const,
      titulo: "Domicilio",
      desc: cliente?.direccion ? `Se lleva a ${cliente.direccion}` : "Envío a la dirección del cliente",
      icon: "M2.25 12 11.2 3.05c.4-.4 1.1-.4 1.5 0L21.75 12M4.5 9.75V21h15V9.75",
    },
    {
      id: "recoge" as const,
      titulo: "Recoge en punto de venta",
      desc: "El cliente pasa por el pedido",
      icon: "M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25",
    },
  ];

  // Al elegir "domicilio" se autocompleta el valor sugerido si aún está en 0.
  function elegir(id: "domicilio" | "recoge") {
    onCambiar(id);
    if (id === "domicilio" && sugerido != null && !domicilio) {
      onDomicilio(sugerido);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm font-medium text-brand-black">¿Cómo se entrega el pedido?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ops.map((o) => (
          <button
            key={o.id}
            onClick={() => elegir(o.id)}
            title={`Elegir entrega: ${o.titulo}`}
            className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
              valor === o.id
                ? "border-brand-amber bg-brand-amber/5 ring-1 ring-brand-amber"
                : "border-brand-brown/10 bg-white hover:border-brand-amber/50"
            }`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-wine/10 text-brand-wine">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
                <path strokeLinecap="round" strokeLinejoin="round" d={o.icon} />
              </svg>
            </span>
            <span>
              <span className="block font-semibold text-brand-black">{o.titulo}</span>
              <span className="block text-xs text-brand-brown/60">{o.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {valor === "domicilio" && (
        <div className="mt-4 rounded-2xl border border-brand-amber/40 bg-brand-amber/5 p-4">
          <label className="mb-1.5 block text-sm font-semibold text-brand-wine">Valor del domicilio</label>
          <p className="mb-2 text-xs text-brand-brown/60">Costo adicional del envío. Se suma al total del pedido.</p>
          {gratis && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Este pedido califica para domicilio GRATIS
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-brand-brown/60">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={domicilio ? String(domicilio) : ""}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                onDomicilio(v ? parseInt(v, 10) : 0);
              }}
              placeholder="0"
              className="h-10 w-40 rounded-xl border border-brand-brown/15 px-3 text-base font-semibold outline-none focus:border-brand-amber"
            />
            <span className="ml-2 text-sm font-bold text-brand-wine">{formatoCOP(domicilio)}</span>
          </div>

          {sugerido != null ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-brand-brown/70">
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-wine/10 px-2.5 py-1 font-medium text-brand-wine">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                Sugerido {gratis ? "GRATIS" : formatoCOP(sugerido)}
                {distancia != null && ` · ${distancia.toFixed(1)} km`}
              </span>
              {domicilio !== sugerido && (
                <button
                  type="button"
                  onClick={() => onDomicilio(sugerido)}
                  className="rounded-full border border-brand-amber/50 px-2.5 py-1 font-semibold text-brand-amber transition hover:bg-brand-amber/10"
                >
                  Aplicar sugerido
                </button>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-brand-brown/50">
              {!punto?.lat || !punto?.lng
                ? "El punto de venta no tiene ubicación configurada para calcular el domicilio."
                : !cliente?.lat || !cliente?.lng
                  ? "El cliente no tiene ubicación en el mapa para calcular el domicilio."
                  : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
/* ---------------------------------------------------------------- */

export const METODOS = ["Efectivo", "QR", "Tarjeta", "Transferencia", "Crédito", "Mixto"];

function PasoPago({
  valor,
  onCambiar,
}: {
  valor: string | null;
  onCambiar: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-4 text-sm font-medium text-brand-black">Método de pago</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {METODOS.map((m) => (
          <button
            key={m}
            onClick={() => onCambiar(m)}
            title={`Pagar con ${m}`}
            className={`rounded-2xl border p-4 text-left font-semibold transition ${
              valor === m
                ? "border-brand-amber bg-brand-amber/5 text-brand-wine ring-1 ring-brand-amber"
                : "border-brand-brown/10 bg-white text-brand-black hover:border-brand-amber/50"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Fecha de entrega: hoy o programado para mañana                  */
/* ---------------------------------------------------------------- */

function PasoFechaEntrega({
  programado,
  onCambiar,
  fecha,
  onFecha,
  hora,
  onHora,
}: {
  programado: boolean;
  onCambiar: (v: boolean) => void;
  fecha: string;
  onFecha: (v: string) => void;
  hora: string;
  onHora: (v: string) => void;
}) {
  // Fecha mínima seleccionable: mañana (no se puede programar para hoy ni atrás).
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const minFecha = manana.toLocaleDateString("en-CA");

  const ops = [
    { id: false, titulo: "Hoy", desc: "Entrega el mismo día (ventana de 2 horas)" },
    { id: true, titulo: "Programar fecha", desc: "Elige el día de entrega (ventana 8:00 a 9:00 a. m.)" },
  ];
  return (
    <div>
      <p className="mb-4 text-sm font-medium text-brand-black">Fecha de entrega</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ops.map((o) => (
          <button
            key={String(o.id)}
            onClick={() => onCambiar(o.id)}
            title={o.titulo}
            className={`rounded-2xl border p-4 text-left transition ${
              programado === o.id
                ? "border-brand-amber bg-brand-amber/5 ring-1 ring-brand-amber"
                : "border-brand-brown/10 bg-white hover:border-brand-amber/50"
            }`}
          >
            <span className="block font-semibold text-brand-black">{o.titulo}</span>
            <span className="block text-xs text-brand-brown/60">{o.desc}</span>
          </button>
        ))}
      </div>
      {programado && (
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-brand-brown/70">
            Día de entrega
          </label>
          <input
            type="date"
            value={fecha}
            min={minFecha}
            onChange={(e) => onFecha(e.target.value)}
            className="w-full rounded-xl border border-brand-brown/15 bg-white px-4 py-2.5 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber sm:w-auto"
          />
        </div>
      )}
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium text-brand-brown/70">
          Hora de despacho (opcional)
        </label>
        <input
          type="time"
          value={hora}
          onChange={(e) => onHora(e.target.value)}
          className="w-full rounded-xl border border-brand-brown/15 bg-white px-4 py-2.5 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber sm:w-auto"
        />
        <p className="mt-1 text-xs text-brand-brown/50">
          Si el cliente pide una hora (ej. 4:00 p. m.), la ventana de 2 horas se
          activa 2 horas antes para cumplir la promesa.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Paso 5: confirmar (resumen total)                               */
/* ---------------------------------------------------------------- */

function PasoConfirmar({
  punto,
  cliente,
  carrito,
  entrega,
  pago,
  valorDomicilio,
  observacion,
  onObservacion,
}: {
  punto: PuntoVenta;
  cliente: Cliente | null;
  carrito: ItemCarrito[];
  entrega: "domicilio" | "recoge" | null;
  pago: string | null;
  valorDomicilio: number;
  observacion: string;
  onObservacion: (v: string) => void;
}) {
  const dom = entrega === "domicilio" ? valorDomicilio : 0;
  const total = carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0) + dom;
  return (
    <div className="space-y-4 text-sm">
      <p className="font-medium text-brand-black">Revisa el pedido antes de confirmar</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Bloque titulo="Punto de venta">{punto.nombre}</Bloque>
        <Bloque titulo="Entrega">
          {entrega === "domicilio" ? "Domicilio" : "Recoge en punto"}
        </Bloque>
        <Bloque titulo="Pago">{pago || "—"}</Bloque>
      </div>

      <Bloque titulo="Cliente">
        <p className="font-medium text-brand-black">{cliente?.nombre || "—"}</p>
        <p className="text-xs text-brand-brown/60">{cliente?.nit_cedula}</p>
        {cliente?.direccion && <p className="text-xs text-brand-brown/60">{cliente.direccion}</p>}
        {(cliente?.barrio || cliente?.ciudad) && (
          <p className="text-xs text-brand-brown/60">
            {[cliente.barrio, cliente.ciudad].filter(Boolean).join(", ")}
          </p>
        )}
        {cliente?.telefono && <p className="text-xs text-brand-brown/60">Tel: {cliente.telefono}</p>}
      </Bloque>

      <div className="rounded-xl border border-brand-brown/10 bg-white">
        <div className="border-b border-brand-brown/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand-brown/50">
          Productos
        </div>
        <div className="divide-y divide-brand-brown/5">
          {carrito.map((i) => (
            <div key={i.id} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-brand-black">{i.producto.producto || i.producto.referencia}</span>
                <span className="font-semibold text-brand-wine">{formatoCOP(i.producto.precio * i.cantidad)}</span>
              </div>
              <p className="text-xs text-brand-brown/60">
                {cantidadLabel(i.cantidad, i.producto.um)} · {formatoCOP(i.producto.precio)}
                {i.alVacio && " · Al vacío"}
                {i.porcionado && ` · Porciones ${i.unidades} | Gramos ${i.gramos} grs.`}
                {i.corte && ` · ${i.corte}`}
              </p>
              {i.notas && <p className="text-xs italic text-brand-brown/50">“{i.notas}”</p>}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-brand-brown/10 px-4 py-3">
          <span className="font-medium text-brand-brown/70">Total</span>
          <span className="text-lg font-bold text-brand-wine">{formatoCOP(total)}</span>
        </div>
      </div>
      {dom > 0 && (
        <div className="flex justify-between rounded-xl bg-brand-cream-soft/60 px-4 py-2 text-sm text-brand-brown/70">
          <span>Incluye domicilio</span><span className="font-semibold">{formatoCOP(dom)}</span>
        </div>
      )}

      {/* Observación general del pedido */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-brown/50">
          Observación general del pedido
        </label>
        <textarea
          value={observacion}
          onChange={(e) => onObservacion(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Indicaciones generales para el despacho o la cocina (opcional)"
          className="w-full resize-y rounded-xl border border-brand-brown/15 bg-white px-4 py-2.5 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
        />
      </div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-brand-brown/10 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">{titulo}</p>
      <div className="mt-0.5 text-brand-black">{children}</div>
    </div>
  );
}

/** Par etiqueta/valor compacto (sin borde), para agrupar varios en una sola card. */
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-brown/40">{label}</p>
      <div className="break-words text-brand-black">{children}</div>
    </div>
  );
}

/** Sección con título y UNA sola card que agrupa varios Dato en grilla (2 columnas). */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">{titulo}</p>
      <div className="rounded-xl border border-brand-brown/10 bg-white p-3">
        <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {children}
        </div>
      </div>
    </div>
  );
}

interface DatosComanda {
  punto: PuntoVenta;
  cliente: Cliente;
  carrito: ItemCarrito[];
  entrega: "domicilio" | "recoge" | null;
  pago: string | null;
  valorDomicilio?: number;
  /** Observación general del pedido (indicaciones para despacho/cocina). */
  observacion?: string;
}

export interface Pedido extends DatosComanda {
  id: string;
  comanda: string;
  consecutivo: number;
  fecha: string;
  total: number;
  vendedorNombre?: string;
  vendedorCedula?: string;
  estado?: "En proceso" | "En producción" | "Alistado" | "Facturado" | "Despachado" | "Anulado" | "Cancelado";
  anulado?: boolean;
  /** Motivo de anulación o cancelación (se guarda al anular/cancelar). */
  motivo?: string;
  /** Comanda del pedido del que se clonó este (para referenciar la clonación). */
  clonadoDe?: string;
  /** ¿Retenido por cartera? Si es falso/indefinido, el pago está liberado. */
  retenido?: boolean;
  /** ¿Pedido programado para otra fecha? Si es falso/indefinido, es para hoy. */
  entregaProgramada?: boolean;
  /** Fecha programada de entrega (YYYY-MM-DD) cuando entregaProgramada es true. */
  fechaProgramada?: string;
  /** Hora de despacho pedida por el cliente (HH:MM). La ventana de 2h se activa 2h antes. */
  horaDespacho?: string;
  /** Historial de cambios (creación, estados, anulación). Lo asigna el backend. */
  trazabilidad?: TrazaEvento[];
  /** Número del día (turno) por punto. Lo asigna el backend de forma atómica. */
  numeroDia?: number;
}

/** Evento de trazabilidad del pedido (lo registra el backend con hora del servidor). */
export interface TrazaEvento {
  tipo: "creacion" | "estado" | "anulacion";
  estadoAnterior?: string | null;
  estadoNuevo?: string | null;
  fecha: string;
  usuarioId?: string | null;
  usuarioNombre?: string | null;
  usuarioCedula?: string | null;
}

/**
 * Calcula el "número del día" (turno) por pedido, igual que en despacho: agrupa
 * por día efectivo de entrega (programado o creación); los pedidos ACTIVOS
 * arrastrados de días anteriores cuentan para HOY y toman los primeros números.
 * Así la comanda impresa desde Pedidos coincide con la de Despacho.
 */
export function numerosDelDia(pedidos: Pedido[]): Map<string, number> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const claveISO = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoy = claveISO(new Date());
  const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();
  const diaEntrega = (p: Pedido) =>
    p.entregaProgramada && p.fechaProgramada
      ? p.fechaProgramada
      : claveISO(new Date(p.fecha));
  const diaEfectivo = (p: Pedido) => {
    const dia = diaEntrega(p);
    if (dia < hoy) {
      const e = norm(p.estado);
      if (!p.anulado && e !== "despachado" && e !== "anulado") return hoy;
    }
    return dia;
  };
  const porDia = new Map<string, Pedido[]>();
  for (const p of pedidos) {
    // Agrupa por PUNTO + día efectivo: la numeración es independiente por punto
    // (puede existir un 31 en un punto y otro 31 en otro, pero no dos 31 en el
    // mismo punto el mismo día).
    const clave = `${String(p.punto?.id ?? "?")}|${diaEfectivo(p)}`;
    const arr = porDia.get(clave);
    if (arr) arr.push(p);
    else porDia.set(clave, [p]);
  }
  const mapa = new Map<string, number>();
  for (const grupo of porDia.values()) {
    grupo.sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
    );
    grupo.forEach((p, i) => mapa.set(p.id, p.numeroDia ?? i + 1));
  }
  return mapa;
}

export function DetallePedido({ pedido, onCerrar, numeroDia, meta, clones }: { pedido: Pedido; onCerrar: () => void; numeroDia?: number; meta?: DespachoMeta; clones?: string[] }) {
  const dest = pedido.entrega === "domicilio" ? "Domicilio" : pedido.entrega === "recoge" ? "Recoge en punto" : "—";
  const c = pedido.cliente;
  const fH = (iso?: string) => (iso ? new Date(iso).toLocaleString("es-CO") : "—");
  const hayDespacho = Boolean(
    meta &&
      (meta.porcionador ||
        meta.domiciliario ||
        meta.inicio ||
        meta.fin ||
        meta.despachoFin ||
        meta.pagoConfirmado ||
        meta.facturaNumero ||
        (meta.replicas && meta.replicas.length > 0)),
  );
  const [verTraza, setVerTraza] = useState(false);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-brand-wine">Pedido {pedido.comanda}</h3>
            <p className="text-xs text-brand-brown/50">{new Date(pedido.fecha).toLocaleString("es-CO")} · {pedido.punto.nombre}{pedido.anulado ? " · ANULADO" : ""}</p>
            {pedido.clonadoDe && (
              <p className="mt-0.5 text-xs font-medium text-brand-amber">
                Clonado del pedido #{pedido.clonadoDe}
              </p>
            )}
            {clones && clones.length > 0 && (
              <p className="mt-0.5 text-xs font-medium text-brand-wine">
                Ya clonado en #{clones.join(", #")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setVerTraza(true)}
              title="Ver la trazabilidad del pedido"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-wine/30 px-3 py-1.5 text-xs font-semibold text-brand-wine transition hover:bg-brand-wine/10"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
              </svg>
              Ver trazabilidad
            </button>
            <button onClick={onCerrar} title="Cerrar" className="rounded-lg p-1.5 text-brand-brown/50 hover:bg-brand-cream-soft">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden px-5 py-4 text-sm">
          {/* NIT / Cédula destacado */}
          <div className="mb-4 rounded-xl border border-brand-wine/15 bg-brand-wine/5 px-4 py-3 text-center">
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-brown/50">NIT / Cédula</p>
            <p className="text-2xl font-bold text-brand-wine">{c.nit_cedula}</p>
          </div>

          {/* Secciones en 2 columnas (van bajando) para ahorrar espacio */}
          <div className="gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid lg:columns-2">
          {/* Cliente */}
          <Seccion titulo="Cliente">
            <Dato label="Nombre">{c.nombre || "—"}</Dato>
            <Dato label="Teléfono">{c.telefono || "—"}</Dato>
            <Dato label="Ciudad">{c.ciudad || "—"}</Dato>
            <Dato label="Barrio">{c.barrio || "—"}</Dato>
            <Dato label="Dirección">{c.direccion || "—"}</Dato>
            <Dato label="Referencia">{c.referencia || "—"}</Dato>
          </Seccion>

          {/* Pedido */}
          <Seccion titulo="Pedido">
            <Dato label="Comanda">{pedido.comanda}</Dato>
            <Dato label="Estado">{pedido.anulado ? "Anulado" : pedido.estado || "En proceso"}</Dato>
            <Dato label="Consecutivo">{pedido.consecutivo}</Dato>
            <Dato label="Entrega">{dest}</Dato>
            <Dato label="Punto de venta">{pedido.punto.nombre}</Dato>
            <Dato label="Método de pago">{pedido.pago || "—"}</Dato>
            {pedido.entrega === "domicilio" && (
              <Dato label="Valor domicilio">{formatoCOP(pedido.valorDomicilio ?? 0)}</Dato>
            )}
            {pedido.entregaProgramada && pedido.fechaProgramada && (
              <Dato label="Entrega programada">{pedido.fechaProgramada}</Dato>
            )}
            <Dato label="Vendedor">{pedido.vendedorNombre || "—"}</Dato>
            <Dato label="Cédula vendedor">{pedido.vendedorCedula || "—"}</Dato>
          </Seccion>

          {/* Productos */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">Productos ({pedido.carrito.length})</p>
            <div className="grid max-h-[20rem] gap-2 overflow-y-auto rounded-xl border border-brand-brown/10 p-2 sm:grid-cols-2">
              {pedido.carrito.map((i) => (
                <div key={i.id} className="flex justify-between gap-2 rounded-lg bg-brand-cream-soft/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium text-brand-black break-words">{i.producto.producto} <span className="text-xs text-brand-brown/40">Ref {i.producto.referencia}</span></p>
                    <p className="text-xs text-brand-brown/60">Cantidad: {cantidadLabel(i.cantidad, i.producto.um)} · {formatoCOP(i.producto.precio)} c/u</p>
                    {i.alVacio && <p className="text-xs text-brand-brown/60">Empaque al vacío: Sí</p>}
                    {i.porcionado && <p className="text-xs text-brand-brown/60">Porcionado: {i.unidades} und x {i.gramos} g{i.corte ? ` · ${i.corte}` : ""}</p>}
                    {i.notas && <p className="text-xs italic text-brand-brown/60">Nota: {i.notas}</p>}
                  </div>
                  <span className="shrink-0 whitespace-nowrap font-medium">{formatoCOP(i.producto.precio * i.cantidad)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-end gap-x-6 gap-y-1">
              {pedido.entrega === "domicilio" && (
                <span className="text-sm text-brand-brown/70">Domicilio: {formatoCOP(pedido.valorDomicilio ?? 0)}</span>
              )}
              <span className="text-base font-bold text-brand-wine">Total: {formatoCOP(pedido.total)}</span>
            </div>
          </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-brand-brown/10 px-5 py-4">
          {!pedido.anulado && (
            <button onClick={() => imprimirComanda(pedido, numeroDia)} title="Reimprimir la comanda del pedido" className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft">Reimprimir</button>
          )}
          <button onClick={onCerrar} title="Cerrar" className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90">Cerrar</button>
        </div>
      </div>

      {verTraza && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-brand-black/50 p-4" onClick={() => setVerTraza(false)}>
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-brown/10 px-5 py-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-brand-wine">Trazabilidad del pedido</h3>
                <p className="text-xs text-brand-brown/50">Pedido {pedido.comanda}</p>
              </div>
              <button onClick={() => setVerTraza(false)} title="Cerrar" className="rounded-lg p-1.5 text-brand-brown/50 hover:bg-brand-cream-soft">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm">
              {/* Aviso de anulación/cancelación con su motivo */}
              {pedido.anulado && (
                <div
                  className={`mb-4 rounded-xl border px-4 py-3 ${
                    pedido.estado === "Cancelado"
                      ? "border-orange-200 bg-orange-50"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <p
                    className={`text-sm font-bold ${
                      pedido.estado === "Cancelado" ? "text-orange-700" : "text-red-600"
                    }`}
                  >
                    Pedido {pedido.estado === "Cancelado" ? "cancelado" : "anulado"}
                  </p>
                  {pedido.motivo && (
                    <p className="mt-0.5 text-xs text-brand-brown/70">
                      Motivo: <span className="font-semibold">{pedido.motivo}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Historial: creación, cambios de estado y anulación (quién y cuándo) */}
              {pedido.trazabilidad && pedido.trazabilidad.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">Historial</p>
                  <ol className="relative space-y-3 border-l border-brand-brown/15 pl-4">
                    {pedido.trazabilidad.map((ev, i) => {
                      const esAnul = ev.tipo === "anulacion";
                      const esCancel = esAnul && ev.estadoNuevo === "Cancelado";
                      const color =
                        ev.tipo === "creacion"
                          ? "bg-emerald-500"
                          : esAnul
                            ? esCancel
                              ? "bg-orange-500"
                              : "bg-red-500"
                            : "bg-brand-amber";
                      const titulo =
                        ev.tipo === "creacion"
                          ? "Pedido creado"
                          : esAnul
                            ? esCancel
                              ? "Pedido cancelado"
                              : "Pedido anulado"
                            : `Cambió a ${ev.estadoNuevo ?? "—"}${ev.estadoAnterior ? ` desde ${ev.estadoAnterior}` : ""}`;
                      return (
                        <li key={i} className="relative">
                          <span className={`absolute -left-[1.30rem] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${color}`} />
                          <p className="font-semibold text-brand-black">{titulo}</p>
                          {esAnul && pedido.motivo && (
                            <p className="text-xs text-brand-brown/70">
                              Motivo: <span className="font-medium">{pedido.motivo}</span>
                            </p>
                          )}
                          <p className="text-xs text-brand-brown/50">
                            {ev.usuarioNombre ? `Por ${ev.usuarioNombre}` : "Usuario no registrado"}
                            {ev.usuarioCedula ? ` · ${ev.usuarioCedula}` : ""}
                            {" · "}
                            {fH(ev.fecha)}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

              {/* Despacho: personal y horas del proceso */}
              {hayDespacho ? (
                <div className="mb-4">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">Despacho</p>
                  <div className="rounded-xl border border-brand-brown/10 bg-white p-3">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                      {meta?.porcionador && <Dato label="Porcionador">{meta.porcionador}</Dato>}
                      {meta?.domiciliario && <Dato label="Domiciliario">{meta.domiciliario}</Dato>}
                      {meta?.inicio && <Dato label="Inició alistamiento">{fH(meta.inicio)}</Dato>}
                      {meta?.fin && <Dato label="Alistado (listo)">{fH(meta.fin)}</Dato>}
                      {meta?.pagoConfirmado && <Dato label="Pago confirmado">{fH(meta.pagoConfirmado)}</Dato>}
                      {meta?.despachoFin && <Dato label="Despachado">{fH(meta.despachoFin)}</Dato>}
                      {meta?.facturaNumero && <Dato label="N° factura">{meta.facturaNumero}</Dato>}
                      {typeof meta?.facturaValor === "number" && meta.facturaValor > 0 && (
                        <Dato label="Valor facturado">{formatoCOP(meta.facturaValor)}</Dato>
                      )}
                    </div>
                    {meta?.replicas && meta.replicas.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {meta.replicas
                          .slice()
                          .sort((a, b) => a.numero - b.numero)
                          .map((r) => (
                            <span
                              key={r.numero}
                              className="inline-flex items-center gap-1 rounded-lg border border-brand-brown/15 bg-white px-2 py-1 text-[11px] font-semibold text-brand-brown"
                            >
                              Réplica -{r.numero}
                              {r.domiciliario ? (
                                <span className="font-normal text-brand-brown/60">· {r.domiciliario}</span>
                              ) : null}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-brand-brown/10 bg-brand-cream-soft/30 px-3 py-4 text-center text-xs text-brand-brown/50">
                  Este pedido aún no tiene información de despacho.
                </p>
              )}
            </div>
            <div className="flex justify-end border-t border-brand-brown/10 px-5 py-3">
              <button onClick={() => setVerTraza(false)} className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export async function imprimirComanda({ punto, cliente, carrito, entrega, pago, comanda, fecha: fechaIso, valorDomicilio, vendedorNombre, observacion, horaDespacho, id, entregaProgramada, fechaProgramada, numeroDia: numeroDiaGuardado }: Pedido, numeroDia?: number) {
  // Prefiere el número del día asignado por el backend (estable y único por
  // punto); si el pedido es antiguo y no lo tiene, usa el calculado localmente.
  const numeroDiaFinal = numeroDiaGuardado ?? numeroDia;
  const subtotal = carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0);
  const dom = entrega === "domicilio" ? (valorDomicilio ?? 0) : 0;
  const total = subtotal + dom;
  const f = new Date(fechaIso);
  const fecha = f.toLocaleDateString("es-CO");
  const hora = f.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });
  // Fecha de entrega: la programada si el pedido se dejó para otro día; si no, la de creación.
  const fechaEntrega =
    entregaProgramada && fechaProgramada
      ? new Date(`${fechaProgramada}T00:00:00`).toLocaleDateString("es-CO")
      : fecha;
  // Hora de despacho pedida por el cliente (si la hay), en formato 12h.
  let horaDespTxt = "";
  const horaDesp = (horaDespacho ?? "").trim();
  if (/^\d{1,2}:\d{2}$/.test(horaDesp)) {
    const [hh, mm] = horaDesp.split(":").map(Number);
    const ampm = hh >= 12 ? "p. m." : "a. m.";
    const h12 = ((hh + 11) % 12) + 1;
    horaDespTxt = `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
  }
  // Renderiza un producto de la comanda.
  const renderItem = (i: ItemCarrito) => {
    // El empaque al vacío solo se anota cuando es SÍ (si es NO, no se muestra).
    const notas: string[] = [];
    if (i.alVacio) notas.push("Empaque al vacío: SÍ");
    if (i.porcionado) notas.push(`relajado ${i.unidades} und a ${i.gramos} grm`);
    if (i.corte) notas.push(i.corte);
    if (i.notas) notas.push(i.notas);
    // Si el producto se vende por kilos, mostramos también el peso en libras
    // (1 kilo = 2 libras) para que los alistadores trabajen en su unidad.
    const esKilo = (i.producto.um || "").trim().toUpperCase() === "KG";
    return `<div class="prod">
        <div class="pi">Ítem: ${i.producto.referencia}</div>
        <div class="pn">${(i.producto.producto || "").toUpperCase()}</div>
        <div class="pl">Cantidad/Peso: <b>${cantidadLabel(i.cantidad, i.producto.um)}${esKilo ? ` (${librasLabel(i.cantidad)})` : ""}</b></div>
        <div class="pl">Valor: <b>${formatoCOP(i.producto.precio * i.cantidad)}</b></div>
        ${notas.length ? `<div class="pn-nota">Nota: ${notas.join(" | ")}</div>` : ""}
      </div>`;
  };
  // Agrupa los productos por categoría (conservando el orden de aparición):
  // cada categoría muestra su nombre como encabezado y debajo sus productos.
  const gruposCategoria = new Map<string, ItemCarrito[]>();
  for (const i of carrito) {
    const cat =
      (i.producto.categoria || "")
        .replace(/^\s*\d+\s*-\s*/, "")
        .trim()
        .toUpperCase() || "SIN CATEGORÍA";
    const arr = gruposCategoria.get(cat);
    if (arr) arr.push(i);
    else gruposCategoria.set(cat, [i]);
  }
  const filas = [...gruposCategoria.entries()]
    .map(
      ([cat, items]) =>
        `<div class="catsec">${cat}</div>${items.map(renderItem).join("")}`,
    )
    .join("");
  const dest = entrega === "domicilio" ? "Domicilio" : entrega === "recoge" ? "Recoge en punto" : "—";
  const ciudad = [cliente.barrio, cliente.ciudad].filter(Boolean).join(", ");
  const logo = `${window.location.origin}/LOGOCARNESSANTACRUZ.png`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comanda ${comanda}</title>
  <style>
    *{font-family:Arial,sans-serif;color:#000;font-weight:bold;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{size:80mm auto;margin:0}
    html,body{background:#fff}
    body{width:80mm;margin:0;padding:4px 5px;font-size:13px;line-height:1.2}
    .top{display:flex;justify-content:space-between;align-items:flex-start;font-size:12px;font-weight:bold}
    .logo{text-align:center;margin:3px 0}
    .logo img{max-width:52mm;max-height:20mm;object-fit:contain}
    .logo .b{display:inline-block;background:#000;color:#fff;border-radius:6px;padding:4px 12px;font-weight:bold;letter-spacing:1px}
    h1{font-size:18px;text-align:center;margin:4px 0 2px}
    .ndia{display:block;text-align:center;font-size:13px;margin:2px 0 4px}
    .ndia b{display:inline-block;background:#000;color:#fff;border-radius:6px;padding:2px 12px;font-size:18px}
    .nit{text-align:left;margin:4px 0 2px}
    .nitlabel{font-size:12px;font-weight:bold;display:block}
    .nitnum{font-size:21px;font-weight:bold;display:block;line-height:1.1;word-break:break-all}
    .emp{text-align:center;font-size:13px;color:#000;margin-bottom:4px}
    .row{margin:2px 0}
    .label{font-weight:bold}
    .com{font-size:16px;font-weight:bold;margin:4px 0}
    hr{border:none;border-top:2px solid #000;margin:5px 0}
    .sec{font-weight:bold;font-size:14px;margin:4px 0 3px}
    .catsec{font-weight:bold;font-size:13px;margin:5px 0 3px;background:#000;color:#fff;padding:2px 6px;border-radius:4px;text-align:center;letter-spacing:.5px}
    .prod{margin-bottom:4px;font-size:12.5px;border-bottom:1px dashed #000;padding-bottom:4px;line-height:1.2}
    .prod:last-child{border-bottom:none}
    .pi{font-size:11px}
    .pn{font-weight:bold;font-size:13px}
    .pl{margin:1px 0}
    .pn-nota{color:#000;margin-top:1px}
    .tot{font-size:17px;font-weight:bold;margin:5px 0}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
    <div class="top"><span>${fecha}</span><span>${hora}</span></div>
    <div class="logo"><img src="${logo}" alt="Carnes Santacruz" onerror="this.style.display='none'"></div>
    <h1>Detalle del pedido</h1>
    ${numeroDiaFinal != null ? `<div class="ndia">N° del día: <b>${numeroDiaFinal}</b></div>` : ""}
    <div class="emp">Carnes Santacruz</div>
    <div class="row" style="text-align:center">${punto.nombre}</div>
    <hr>
    <div class="com">COMANDA: ${comanda}</div>
    <div class="nit"><span class="nitlabel">NIT o Cédula:</span><span class="nitnum">${cliente.nit_cedula}</span></div>
    <div class="row"><span class="label">Cliente:</span> ${cliente.nombre || "—"}</div>
    ${cliente.direccion ? `<div class="row"><span class="label">Dirección:</span> ${cliente.direccion}</div>` : ""}
    ${cliente.telefono ? `<div class="row"><span class="label">Teléfono:</span> ${cliente.telefono}</div>` : ""}
    ${ciudad ? `<div class="row"><span class="label">Ciudad:</span> ${ciudad}</div>` : ""}
    <div class="row"><span class="label">Medio de pago:</span> ${pago || "—"}</div>
    <div class="row"><span class="label">Vendedor:</span> ${vendedorNombre || "—"}</div>
    <div class="row"><span class="label">Entrega:</span> ${dest}</div>
    <div class="row"><span class="label">Fecha entrega:</span> ${fechaEntrega}</div>
    ${horaDespTxt ? `<div class="row"><span class="label">Hora de despacho:</span> ${horaDespTxt}</div>` : ""}
    <hr>
    <div class="sec">PRODUCTOS</div>
    ${filas}
    <hr>
    ${entrega === "domicilio" ? `<div class="row"><span class="label">Subtotal:</span> ${formatoCOP(subtotal)}</div><div class="row"><span class="label">Domicilio:</span> ${formatoCOP(dom)}</div>` : ""}
    <div class="tot">Total: ${formatoCOP(total)}</div>
    ${observacion ? `<hr><div class="sec">OBSERVACIÓN</div><div class="row">${observacion}</div>` : ""}
  </body></html>`;
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  const img = w.document.querySelector("img");
  if (img && !img.complete) {
    img.onload = () => w.print();
    img.onerror = () => w.print();
  } else {
    w.print();
  }
}

const ICONOS: Record<string, string> = {
  id: "M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0ZM10.5 16.5a3 3 0 0 0-6 0v.75h6v-.75Z",
  tel: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z",
  dir: "M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z",
  ref: "M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z",
  loc: "M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z",
};

function DatoCliente({
  icono,
  valor,
  ancho,
}: {
  icono: keyof typeof ICONOS;
  valor: string;
  ancho?: boolean;
}) {
  return (
    <span className={`flex items-start gap-1.5 ${ancho ? "sm:col-span-2" : ""}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-brown/40">
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONOS[icono]} />
      </svg>
      <span className="break-words">{valor}</span>
    </span>
  );
}