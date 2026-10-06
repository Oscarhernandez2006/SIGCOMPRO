"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ApiError } from "@/lib/api";
import {
  getPedidos, crearPedidosLote, actualizarPedido, cambiarEstadoPedido, reenviarDrivin, syncDrivin,
  getClientes, getPuntosVenta, getDomiciliarios, getEsquemasDrivin,
  type Pedido, type Cliente, type PuntoVenta, type Domiciliario, type EsquemaDrivin,
} from "@/lib/runErrandsApi";

const ESTADOS = ["REVISADO", "EN_PROCESO", "ENTREGADO", "CANCELADO"];

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

  function cargarListas() {
    Promise.all([getClientes("", false), getPuntosVenta(false), getDomiciliarios({}), getEsquemasDrivin()])
      .then(([c, p, d, e]) => { setClientes(c); setPdvs(p); setDomiciliarios(d); setEsquemas(e); })
      .catch(() => {});
  }

  function cargarPedidos() {
    setLoading(true);
    getPedidos(filtroEstado ? { estado: filtroEstado } : {})
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { cargarListas(); }, []);
  useEffect(() => { cargarPedidos(); }, [filtroEstado]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirCrear() {
    setEditando(null);
    setModalAbierto(true);
  }

  function abrirEditar(p: Pedido) {
    setEditando(p);
    setModalAbierto(true);
  }

  async function cambiarEstado(p: Pedido, estado: string) {
    await cambiarEstadoPedido(p.id, estado);
    cargarPedidos();
  }

  async function cancelar(p: Pedido) {
    if (!confirm(`¿Cancelar el mandado ${p.numeroPedido}? Si ya se envió a Drivin, también se intentará cancelar allá.`)) return;
    await cambiarEstado(p, "CANCELADO");
  }

  async function reintentar(p: Pedido) {
    await reenviarDrivin(p.id);
    cargarPedidos();
  }

  async function sincronizar() {
    setSincronizando(true);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const r = await syncDrivin(hace30, hoy);
      cargarPedidos();
      alert(`${r.actualizados} mandado(s) actualizados desde Drivin.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo sincronizar con Drivin");
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-brand-wine">Mandados</h1>
          <p className="mt-1 text-sm text-brand-black/60">Mandados de Run Errands, enviados a Drivin.</p>
        </div>
        <div className="flex gap-2">
          {puedeEditar && (
            <button onClick={sincronizar} disabled={sincronizando} className="rounded-xl border border-brand-brown/20 px-4 py-2 text-sm font-medium disabled:opacity-50">
              {sincronizando ? "Sincronizando…" : "Sincronizar con Drivin"}
            </button>
          )}
          {puedeEditar && (
            <button onClick={abrirCrear} className="rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white">
              Nuevo mandado
            </button>
          )}
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}

      <div className="mt-4 flex gap-2">
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber">
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
        {loading ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Sin mandados.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-cream-soft text-xs font-semibold uppercase tracking-wide text-brand-black/50">
              <tr>
                <th className="px-4 py-2.5">N° Mandado</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">PDV</th>
                <th className="px-4 py-2.5">Domiciliario</th>
                <th className="px-4 py-2.5 text-right">Kg</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Drivin</th>
                {puedeEditar && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/10">
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-mono text-xs text-brand-black/70">{p.numeroPedido}</td>
                  <td className="px-4 py-2 font-medium text-brand-black">{p.cliente?.nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-brand-black/70">{p.puntoVenta?.nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-brand-black/70">{p.domiciliario?.nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.kilos}</td>
                  <td className="px-4 py-2">
                    {puedeEditar ? (
                      <select value={p.estado} onChange={(e) => cambiarEstado(p, e.target.value)} className={`rounded-full border-0 px-2 py-0.5 text-xs font-semibold ${ESTADO_COLOR[p.estado] ?? ""}`}>
                        {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_COLOR[p.estado] ?? ""}`}>{p.estado}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      title={p.drivinMensajeEnvio ?? ""}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.drivinEstadoEnvio === "ENVIADO" ? "bg-emerald-50 text-emerald-700" : p.drivinEstadoEnvio === "ERROR" ? "bg-rose-50 text-rose-700" : "bg-brand-black/5 text-brand-black/50"
                      }`}
                    >
                      {p.drivinEstadoEnvio}
                    </span>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        {p.drivinEstadoEnvio === "ERROR" && (
                          <button onClick={() => reintentar(p)} className="text-xs font-medium text-brand-amber hover:underline">Reintentar Drivin</button>
                        )}
                        <button onClick={() => abrirEditar(p)} className="text-xs font-medium text-brand-black/60 hover:underline">Editar</button>
                        {p.estado !== "CANCELADO" && p.estado !== "ENTREGADO" && (
                          <button onClick={() => cancelar(p)} className="text-xs font-medium text-rose-600 hover:underline">Cancelar</button>
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
      : clientes.filter((c) => c.nombre.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q));
    return lista.slice(0, 50);
  }, [clientes, query]);

  return (
    <div className="relative">
      <input
        value={abierto ? query : seleccionado ? `${seleccionado.codigo} — ${seleccionado.nombre}` : ""}
        onChange={(e) => { setQuery(e.target.value); setAbierto(true); }}
        onFocus={() => { setQuery(""); setAbierto(true); }}
        onBlur={() => { cerrarTimeout.current = setTimeout(() => setAbierto(false), 150); }}
        placeholder="Buscar cliente por nombre…"
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
    () => (form.puntoVentaId ? domiciliarios.filter((d) => d.puntoVentaId === form.puntoVentaId) : domiciliarios),
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

