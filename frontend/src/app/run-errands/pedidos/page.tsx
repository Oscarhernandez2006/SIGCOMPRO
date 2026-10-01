"use client";

import { useEffect, useMemo, useState } from "react";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ApiError } from "@/lib/api";
import {
  getPedidos, crearPedido, cambiarEstadoPedido, reenviarDrivin, syncDrivin,
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
  const [mostrarForm, setMostrarForm] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const [form, setForm] = useState({
    clienteId: "", puntoVentaId: "", domiciliarioId: "", kilos: "1", observaciones: "", schemaName: "",
  });

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

  const domiciliariosFiltrados = useMemo(
    () => (form.puntoVentaId ? domiciliarios.filter((d) => d.puntoVentaId === form.puntoVentaId) : domiciliarios),
    [domiciliarios, form.puntoVentaId],
  );

  async function crear() {
    if (!form.clienteId) return;
    setGuardando(true);
    setError(null);
    try {
      await crearPedido({
        clienteId: form.clienteId,
        puntoVentaId: form.puntoVentaId || null,
        domiciliarioId: form.domiciliarioId || null,
        kilos: Number(form.kilos) || 1,
        observaciones: form.observaciones.trim() || undefined,
        schemaName: form.schemaName || undefined,
      });
      setForm({ clienteId: "", puntoVentaId: "", domiciliarioId: "", kilos: "1", observaciones: "", schemaName: "" });
      setMostrarForm(false);
      cargarPedidos();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el pedido");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(p: Pedido, estado: string) {
    await cambiarEstadoPedido(p.id, estado);
    cargarPedidos();
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
      alert(`${r.actualizados} pedido(s) actualizados desde Drivin.`);
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
          <h1 className="font-serif text-2xl font-bold text-brand-wine">Pedidos</h1>
          <p className="mt-1 text-sm text-brand-black/60">Mandados de Run Errands, enviados a Drivin.</p>
        </div>
        <div className="flex gap-2">
          {puedeEditar && (
            <button onClick={sincronizar} disabled={sincronizando} className="rounded-xl border border-brand-brown/20 px-4 py-2 text-sm font-medium disabled:opacity-50">
              {sincronizando ? "Sincronizando…" : "Sincronizar con Drivin"}
            </button>
          )}
          {puedeEditar && (
            <button onClick={() => setMostrarForm((v) => !v)} className="rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white">
              {mostrarForm ? "Cerrar" : "Nuevo pedido"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}

      {mostrarForm && puedeEditar && (
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-brand-brown/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
          <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber">
            <option value="">Cliente…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
          </select>
          <select value={form.puntoVentaId} onChange={(e) => setForm({ ...form, puntoVentaId: e.target.value, domiciliarioId: "" })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber">
            <option value="">Punto de venta…</option>
            {pdvs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select value={form.domiciliarioId} onChange={(e) => setForm({ ...form, domiciliarioId: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber">
            <option value="">Domiciliario…</option>
            {domiciliariosFiltrados.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <input type="number" step="0.1" min="0.1" placeholder="Kilos" value={form.kilos} onChange={(e) => setForm({ ...form, kilos: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <select value={form.schemaName} onChange={(e) => setForm({ ...form, schemaName: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber">
            <option value="">Esquema Drivin (auto por PDV)…</option>
            {esquemas.map((e) => <option key={e.code} value={e.name}>{e.name}</option>)}
          </select>
          <input placeholder="Observaciones" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <div className="lg:col-span-3">
            <button onClick={crear} disabled={guardando || !form.clienteId} className="rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {guardando ? "Enviando…" : "Crear y enviar a Drivin"}
            </button>
          </div>
        </div>
      )}

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
          <div className="p-6 text-center text-sm text-brand-black/50">Sin pedidos.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-cream-soft text-xs font-semibold uppercase tracking-wide text-brand-black/50">
              <tr>
                <th className="px-4 py-2.5">N° Pedido</th>
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
                    <td className="px-4 py-2 text-right">
                      {p.drivinEstadoEnvio === "ERROR" && (
                        <button onClick={() => reintentar(p)} className="text-xs font-medium text-brand-amber hover:underline">Reintentar Drivin</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
