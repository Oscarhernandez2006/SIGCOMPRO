"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, Clock3, History, Package, Pencil, Plus, RefreshCw, Search, Send, Truck, XCircle } from "lucide-react";
import { EmptyState, ErrorBanner, fieldClass, IconAction, Metric, PageHeader, primaryClass, secondaryClass, tableClass } from "@/components/RunErrandsUI";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ApiError } from "@/lib/api";
import {
  getPedidos, crearPedidosLote, actualizarPedido, cambiarEstadoPedido, reenviarDrivin, syncDrivin,
  getClientes, getPuntosVenta, getDomiciliarios, getEsquemasDrivin,
  type Pedido, type Cliente, type PuntoVenta, type Domiciliario, type EsquemaDrivin,
} from "@/lib/runErrandsApi";

const ESTADOS = ["REVISADO", "EN_PROCESO", "ENTREGADO", "CANCELADO"];
const fechaBogota = (dias = 0) => new Date(Date.now() - dias * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const LABEL_ESTADO: Record<string, string> = { REVISADO: "Revisado", EN_PROCESO: "En proceso", ENTREGADO: "Entregado", CANCELADO: "Cancelado" };

const ESTADO_COLOR: Record<string, string> = {
  REVISADO: "bg-sky-50 text-sky-700",
  EN_PROCESO: "bg-amber-50 text-amber-700",
  ENTREGADO: "bg-emerald-50 text-emerald-700",
  CANCELADO: "bg-rose-50 text-rose-700",
};

interface FilaForm {
  clienteId: string;
  puntoVentaId: string;
  domiciliarioId: string;
  kilos: string;
  observaciones: string;
  schemaName: string;
}
const FILA_VACIA: FilaForm = { clienteId: "", puntoVentaId: "", domiciliarioId: "", kilos: "1", observaciones: "", schemaName: "" };

export default function PedidosPage() {
  const pathname = usePathname();
  const esHistorico = pathname.endsWith("/historicos");
  const esDespacho = pathname.endsWith("/despacho");
  const usuario = getUsuario();
  const puedeEditar = puedeAccion(usuario, "run_errands.editar");
  const [items, setItems] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pdvs, setPdvs] = useState<PuntoVenta[]>([]);
  const [domiciliarios, setDomiciliarios] = useState<Domiciliario[]>([]);
  const [esquemas, setEsquemas] = useState<EsquemaDrivin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Pedido | null>(null);
  const [buscar, setBuscar] = useState("");
  const [puntoFiltro, setPuntoFiltro] = useState("");
  const [desde, setDesde] = useState(() => fechaBogota(6));
  const [hasta, setHasta] = useState(() => fechaBogota());
  const [aviso, setAviso] = useState<string | null>(null);
  const cargaActual = useRef(0);
  const sincronizacionEnCurso = useRef(false);

  function cargarListas() {
    Promise.all([getClientes("", false), getPuntosVenta(false), getDomiciliarios({}), getEsquemasDrivin()])
      .then(([c, p, d, e]) => { setClientes(c); setPdvs(p); setDomiciliarios(d); setEsquemas(e); })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar las listas."));
  }

  const cargarPedidos = useCallback(async (silencioso = false) => {
    const carga = ++cargaActual.current;
    if (!silencioso) setLoading(true);
    try {
      if (desde && hasta && desde > hasta) throw new Error("La fecha inicial no puede ser posterior a la final.");
      const resultado = await getPedidos({ estado: filtroEstado || undefined, desde: desde || undefined, hasta: hasta || undefined });
      if (carga === cargaActual.current) { setItems(resultado); if (!silencioso) setError(null); }
    } catch (e) {
      if (carga === cargaActual.current) setError(e instanceof Error ? e.message : "No se pudieron cargar los mandados.");
    } finally {
      if (carga === cargaActual.current) setLoading(false);
    }
  }, [filtroEstado, desde, hasta]);

  useEffect(() => { cargarListas(); }, []);
  useEffect(() => {
    const inicial = setTimeout(() => void cargarPedidos(), 0);
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible" && !sincronizacionEnCurso.current) void cargarPedidos(true);
    }, 30000);
    return () => { cargaActual.current++; clearTimeout(inicial); clearInterval(intervalo); };
  }, [cargarPedidos]);
  useEffect(() => {
    const busqueda = new URLSearchParams(window.location.search).get("buscar");
    const inicial = setTimeout(() => { if (busqueda) setBuscar(busqueda); }, 0);
    return () => clearTimeout(inicial);
  }, []);
  const visibles = items.filter((pedido) => {
    if (esHistorico && !["approved", "rejected"].includes(pedido.drivinEstadoEntrega ?? "")) return false;
    if (puntoFiltro && pedido.puntoVentaId !== puntoFiltro) return false;
    const texto = [pedido.numeroPedido, pedido.cliente?.nombre, pedido.cliente?.direccion, pedido.domiciliario?.nombre].join(" ").toLowerCase();
    return texto.includes(buscar.trim().toLowerCase());
  });

  function abrirCrear() {
    setEditando(null);
    setModalAbierto(true);
  }

  function abrirEditar(p: Pedido) {
    setEditando(p);
    setModalAbierto(true);
  }

  async function cambiarEstado(p: Pedido, estado: string) {
    try { await cambiarEstadoPedido(p.id, estado); await cargarPedidos(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo cambiar el estado."); }
  }

  async function cancelar(p: Pedido) {
    if (!confirm(`¿Cancelar el mandado ${p.numeroPedido}? Si ya se envió a Drivin, también se intentará cancelar allá.`)) return;
    await cambiarEstado(p, "CANCELADO");
  }

  async function reintentar(p: Pedido) {
    try { await reenviarDrivin(p.id); await cargarPedidos(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo reenviar a Drivin."); }
  }

  async function sincronizar() {
    if (sincronizacionEnCurso.current) return;
    if (!desde || !hasta || desde > hasta) { setError("Selecciona un periodo válido para sincronizar."); return; }
    const cantidad = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1;
    if (!Number.isFinite(cantidad) || cantidad > 31) { setError("Sincroniza periodos de hasta 31 días."); return; }
    sincronizacionEnCurso.current = true;
    setSincronizando(true);
    setError(null);
    let actualizados = 0;
    try {
      for (let indice = 0; indice < cantidad; indice++) {
        setAviso(`Sincronizando Drivin: día ${indice + 1} de ${cantidad}...`);
        const dia = new Date(Date.parse(desde) + indice * 86400000).toISOString().slice(0, 10);
        actualizados += (await syncDrivin(dia, dia)).actualizados;
      }
      await cargarPedidos();
      setAviso(`${actualizados} mandados actualizados desde Drivin.`);
    } catch (e) {
      await cargarPedidos();
      setAviso(actualizados ? `${actualizados} mandados actualizados antes de la interrupción.` : null);
      setError(e instanceof Error ? e.message : "No se pudo sincronizar con Drivin");
    } finally {
      sincronizacionEnCurso.current = false;
      setSincronizando(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] pb-6">
      <PageHeader title={esHistorico ? "Históricos" : esDespacho ? "Despacho" : "Run-Errands"} icon={esHistorico ? <History className="h-6 w-6" /> : esDespacho ? <Truck className="h-6 w-6" /> : <Package className="h-6 w-6" />}>
          <IconAction label="Actualizar listado" onClick={() => void cargarPedidos()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></IconAction>
          {puedeEditar && (
            <button onClick={sincronizar} disabled={sincronizando} className={secondaryClass}>
              <RefreshCw className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} />
              {sincronizando ? "Sincronizando…" : "Sincronizar con Drivin"}
            </button>
          )}
          {puedeEditar && !esHistorico && !esDespacho && (
            <button onClick={abrirCrear} className={primaryClass}>
              <Plus className="h-4 w-4" />Nuevo mandado
            </button>
          )}
      </PageHeader>

      <ErrorBanner message={error} />
      {aviso && <p role="status" className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{aviso}</p>}
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric title="Resultados" value={visibles.length} icon={<Package className="h-5 w-5" />} /><Metric title="Pendientes en Drivin" value={visibles.filter((p) => !['approved', 'rejected'].includes(p.drivinEstadoEntrega ?? '')).length} icon={<Clock3 className="h-5 w-5" />} tone="amber" /><Metric title="Entregados confirmados" value={visibles.filter((p) => p.drivinEstadoEntrega === 'approved').length} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" /><Metric title="Rechazados" value={visibles.filter((p) => p.drivinEstadoEntrega === 'rejected').length} icon={<XCircle className="h-5 w-5" />} tone="red" /></div>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-[180px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-brand-black/40" /><input aria-label="Buscar Run-Errands" placeholder="Número, cliente o dirección..." value={buscar} onChange={(e) => setBuscar(e.target.value)} className={`${fieldClass} w-full pl-9`} /></div>
        <label className="flex items-center gap-2 text-xs text-brand-black/60">Desde<input aria-label="Desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className={fieldClass} /></label>
        <label className="flex items-center gap-2 text-xs text-brand-black/60">Hasta<input aria-label="Hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className={fieldClass} /></label>
        <select aria-label="Filtrar por punto" value={puntoFiltro} onChange={(e) => setPuntoFiltro(e.target.value)} className={fieldClass}>
          <option value="">Todos los puntos</option>
          {pdvs.map((punto) => <option key={punto.id} value={punto.id}>{punto.nombre}</option>)}
        </select>
        <select aria-label="Filtrar por estado" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={fieldClass}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{LABEL_ESTADO[e]}</option>)}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-brand-brown/10 bg-white">
        {loading ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Cargando…</div>
        ) : visibles.length === 0 ? (
          <EmptyState text={esHistorico ? "No hay cierres confirmados en este periodo." : "No hay mandados para estos filtros."} />
        ) : (
          <table className={`${tableClass} min-w-[1100px]`}>
            <thead className="bg-brand-cream-soft text-xs font-semibold uppercase tracking-wide text-brand-black/50">
              <tr>
                <th className="px-4 py-2.5">N° Mandado</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">PDV</th>
                <th className="px-4 py-2.5">Domiciliario</th>
                <th className="px-4 py-2.5 text-right">Kg</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Drivin</th>
                <th className="px-4 py-2.5">Cierre en Drivin</th>
                {puedeEditar && !esHistorico && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/10">
              {visibles.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-mono text-xs text-brand-black/70">{p.numeroPedido}</td>
                  <td className="px-4 py-2 font-medium text-brand-black">{p.cliente?.nombre ?? "—"}<p className="mt-1 max-w-56 truncate text-xs font-normal text-brand-black/50" title={p.cliente?.direccion ?? undefined}>{p.cliente?.direccion}</p></td>
                  <td className="px-4 py-2 text-brand-black/70">{p.puntoVenta?.nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-brand-black/70">{p.domiciliario?.nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.kilos}</td>
                  <td className="px-4 py-2">
                    {puedeEditar && !esHistorico ? (
                      <select value={p.estado} onChange={(e) => cambiarEstado(p, e.target.value)} className={`rounded-full border-0 px-2 py-0.5 text-xs font-semibold ${ESTADO_COLOR[p.estado] ?? ""}`}>
                        {ESTADOS.map((e) => <option key={e} value={e}>{LABEL_ESTADO[e]}</option>)}
                      </select>
                    ) : (
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${ESTADO_COLOR[p.estado] ?? ""}`}>{LABEL_ESTADO[p.estado] ?? p.estado}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      title={p.drivinMensajeEnvio ?? ""}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.drivinEstadoEnvio === "ENVIADO" ? "bg-sky-50 text-sky-700" : p.drivinEstadoEnvio === "ERROR" ? "bg-rose-50 text-rose-700" : "bg-brand-black/5 text-brand-black/50"
                      }`}
                    >
                      {p.drivinEstadoEnvio}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${["approved", "rejected"].includes(p.drivinEstadoEntrega ?? "") ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                      {p.drivinEstadoEntrega === "approved" ? "Cerrado: entregado" : p.drivinEstadoEntrega === "rejected" ? "Cerrado: rechazado" : p.drivinEstadoEntrega === "in-transit" ? "Pendiente: en ruta" : p.drivinEstadoEntrega === "partial" ? "Pendiente: entrega parcial" : p.drivinEstadoEntrega === "pending" ? "Pendiente" : "Sin confirmar"}
                    </span>
                    {p.drivinMotivoEntrega && <p className="mt-1 text-xs text-brand-black">{p.drivinMotivoEntrega}</p>}
                    {p.drivinSyncAt && <p className="mt-1 text-xs text-brand-black/60">{new Date(p.drivinSyncAt).toLocaleString("es-CO")}</p>}
                  </td>
                  {puedeEditar && !esHistorico && (
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        {p.drivinEstadoEnvio === "ERROR" && (
                          <IconAction label={`Reenviar ${p.numeroPedido} a Drivin`} onClick={() => void reintentar(p)}><Send className="h-4 w-4" /></IconAction>
                        )}
                        <IconAction label={`Editar ${p.numeroPedido}`} onClick={() => abrirEditar(p)}><Pencil className="h-4 w-4" /></IconAction>
                        {p.estado !== "CANCELADO" && p.estado !== "ENTREGADO" && (
                          <IconAction label={`Cancelar ${p.numeroPedido}`} danger onClick={() => void cancelar(p)}><XCircle className="h-4 w-4" /></IconAction>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalAbierto && puedeEditar && (
        <ModalPedido
          clientes={clientes}
          pdvs={pdvs}
          domiciliarios={domiciliarios}
          esquemas={esquemas}
          editando={editando}
          onCerrar={() => setModalAbierto(false)}
          onGuardado={() => { setModalAbierto(false); cargarPedidos(); }}
        />
      )}
    </div>
  );
}

/** Combobox con buscador: escribe para filtrar clientes por nombre o código. */
function ClienteCombo({
  clientes,
  value,
  onChange,
}: {
  clientes: Cliente[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);
  const cerrarTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seleccionado = clientes.find((c) => c.id === value);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const lista = !q
      ? clientes
      : clientes.filter((c) => [c.nombre, c.codigo, c.direccion, c.barrio, c.ciudad].some((valor) => valor?.toLowerCase().includes(q)));
    return lista.slice(0, 50);
  }, [clientes, query]);

  return (
    <div className="relative">
      <input
        value={abierto ? query : seleccionado ? `${seleccionado.codigo} — ${seleccionado.nombre}` : ""}
        onChange={(e) => { setQuery(e.target.value); setAbierto(true); }}
        onFocus={() => { setQuery(""); setAbierto(true); }}
        onBlur={() => { cerrarTimeout.current = setTimeout(() => setAbierto(false), 150); }}
        placeholder="Buscar cliente por nombre o dirección…"
        className="w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber"
      />
      {abierto && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-brand-brown/20 bg-white shadow-lg"
        >
          {filtrados.length === 0 ? (
            <div className="px-3 py-2 text-sm text-brand-black/40">Sin resultados.</div>
          ) : (
            filtrados.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id); setQuery(""); setAbierto(false); }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-cream-soft"
              >
                <span className="font-medium text-brand-black">{c.nombre}</span>{" "}
                <span className="text-xs text-brand-black/40">{c.codigo}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Modal de pedido: si `editando` viene con datos, edita ese pedido solo. Si no,
 * permite ir "Añadiendo y siguiendo" varios mandados a una cola y guardarlos
 * (y enviarlos a Drivin) todos juntos al final.
 */
function ModalPedido({
  clientes,
  pdvs,
  domiciliarios,
  esquemas,
  editando,
  onCerrar,
  onGuardado,
}: {
  clientes: Cliente[];
  pdvs: PuntoVenta[];
  domiciliarios: Domiciliario[];
  esquemas: EsquemaDrivin[];
  editando: Pedido | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [form, setForm] = useState<FilaForm>(() =>
    editando
      ? {
          clienteId: editando.clienteId,
          puntoVentaId: editando.puntoVentaId ?? "",
          domiciliarioId: editando.domiciliarioId ?? "",
          kilos: String(editando.kilos ?? 1),
          observaciones: editando.observaciones ?? "",
          schemaName: editando.drivinSchemaName ?? "",
        }
      : FILA_VACIA,
  );
  const [cola, setCola] = useState<FilaForm[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const domiciliariosFiltrados = useMemo(
    () => (form.puntoVentaId ? domiciliarios.filter((d) => d.todosLosPuntos || d.puntoVentaId === form.puntoVentaId) : domiciliarios),
    [domiciliarios, form.puntoVentaId],
  );

  function agregarYSeguir() {
    if (!form.clienteId) {
      setError("Elige un cliente para agregar el mandado.");
      return;
    }
    setError(null);
    setCola((prev) => [...prev, form]);
    // Conserva PDV/domiciliario/esquema (suele ser el mismo lote) y limpia el resto.
    setForm((f) => ({ ...FILA_VACIA, puntoVentaId: f.puntoVentaId, domiciliarioId: f.domiciliarioId, schemaName: f.schemaName }));
  }

  function quitarDeCola(idx: number) {
    setCola((prev) => prev.filter((_, i) => i !== idx));
  }

  function nombreCliente(id: string) {
    return clientes.find((c) => c.id === id)?.nombre ?? "—";
  }

  function filaAPayload(f: FilaForm) {
    return {
      clienteId: f.clienteId,
      puntoVentaId: f.puntoVentaId || null,
      domiciliarioId: f.domiciliarioId || null,
      kilos: Number(f.kilos) || 1,
      observaciones: f.observaciones.trim() || undefined,
      schemaName: f.schemaName || undefined,
    };
  }

  async function guardar() {
    setError(null);
    if (editando) {
      if (!form.clienteId) { setError("Elige un cliente."); return; }
      setGuardando(true);
      try {
        await actualizarPedido(editando.id, {
          clienteId: form.clienteId,
          puntoVentaId: form.puntoVentaId || null,
          domiciliarioId: form.domiciliarioId || null,
          kilos: Number(form.kilos) || 1,
          observaciones: form.observaciones.trim(),
          drivinSchemaName: form.schemaName || undefined,
        });
        onGuardado();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "No se pudo guardar el mandado");
      } finally {
        setGuardando(false);
      }
      return;
    }
    // Modo creación: la cola + la fila actual (si tiene cliente elegido).
    const filas = [...cola];
    if (form.clienteId) filas.push(form);
    if (filas.length === 0) {
      setError("Agrega al menos un mandado.");
      return;
    }
    setGuardando(true);
    try {
      await crearPedidosLote(filas.map(filaAPayload));
      onGuardado();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron guardar los mandados");
    } finally {
      setGuardando(false);
    }
  }

  const totalAGuardar = cola.length + (!editando && form.clienteId ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-bold text-brand-wine">
            {editando ? `Editar mandado ${editando.numeroPedido}` : "Nuevo mandado"}
          </h2>
          <button onClick={onCerrar} className="text-sm text-brand-black/40 hover:text-brand-black">✕</button>
        </div>

        {error && <div className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-brand-black/60">Cliente</label>
            <ClienteCombo clientes={clientes} value={form.clienteId} onChange={(id) => setForm({ ...form, clienteId: id })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-black/60">Punto de venta</label>
            <select value={form.puntoVentaId} onChange={(e) => setForm({ ...form, puntoVentaId: e.target.value, domiciliarioId: "" })} className="w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber">
              <option value="">Punto de venta…</option>
              {pdvs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-black/60">Domiciliario</label>
            <select value={form.domiciliarioId} onChange={(e) => setForm({ ...form, domiciliarioId: e.target.value })} className="w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber">
              <option value="">Domiciliario…</option>
              {domiciliariosFiltrados.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-black/60">Kilos</label>
            <input type="number" step="0.1" min="0.1" placeholder="Kilos" value={form.kilos} onChange={(e) => setForm({ ...form, kilos: e.target.value })} className="w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-black/60">Esquema Drivin</label>
            <select value={form.schemaName} onChange={(e) => setForm({ ...form, schemaName: e.target.value })} className="w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber">
              <option value="">Auto por PDV…</option>
              {esquemas.map((e) => <option key={e.code} value={e.name}>{e.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-brand-black/60">Observaciones</label>
            <input placeholder="Observaciones (opcional)" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className="w-full rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          </div>
        </div>

        {!editando && (
          <>
            <div className="mt-3 flex justify-end">
              <button onClick={agregarYSeguir} className="rounded-xl border border-brand-amber px-4 py-2 text-sm font-semibold text-brand-amber hover:bg-brand-amber/5">
                Añadir y seguir
              </button>
            </div>
            {cola.length > 0 && (
              <div className="mt-3 rounded-xl border border-brand-brown/10 bg-brand-cream-soft/40 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-black/50">
                  En la cola ({cola.length})
                </p>
                <ul className="space-y-1.5">
                  {cola.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-sm">
                      <span className="truncate">{nombreCliente(f.clienteId)} · {f.kilos} kg</span>
                      <button onClick={() => quitarDeCola(i)} className="shrink-0 text-xs font-medium text-rose-600 hover:underline">Quitar</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex justify-end gap-2 border-t border-brand-brown/10 pt-4">
          <button onClick={onCerrar} className="rounded-xl border border-brand-brown/20 px-4 py-2 text-sm font-medium">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {guardando
              ? "Guardando…"
              : editando
                ? "Guardar cambios"
                : totalAGuardar > 1
                  ? `Guardar ${totalAGuardar} y enviar a Drivin`
                  : "Crear y enviar a Drivin"}
          </button>
        </div>
      </div>
    </div>
  );
}

