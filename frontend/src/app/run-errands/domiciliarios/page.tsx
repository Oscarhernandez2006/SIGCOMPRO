"use client";

import { useEffect, useState } from "react";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ApiError } from "@/lib/api";
import {
  getDomiciliarios,
  crearDomiciliario,
  actualizarDomiciliario,
  eliminarDomiciliario,
  getPuntosVenta,
  type Domiciliario,
  type PuntoVenta,
} from "@/lib/runErrandsApi";

const vacio = { nombre: "", telefono: "", cedula: "", email: "", puntoVentaId: "" };

export default function DomiciliariosPage() {
  const usuario = getUsuario();
  const puedeEditar = puedeAccion(usuario, "run_errands.editar");
  const [items, setItems] = useState<Domiciliario[]>([]);
  const [pdvs, setPdvs] = useState<PuntoVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(vacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    setLoading(true);
    Promise.all([getDomiciliarios({ todos: true }), getPuntosVenta(true)])
      .then(([d, p]) => { setItems(d); setPdvs(p); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  function editar(d: Domiciliario) {
    setEditandoId(d.id);
    setForm({
      nombre: d.nombre, telefono: d.telefono ?? "", cedula: d.cedula ?? "",
      email: d.email ?? "", puntoVentaId: d.puntoVentaId ?? "",
    });
  }

  function cancelar() {
    setEditandoId(null);
    setForm(vacio);
  }

  async function guardar() {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    try {
      const data = {
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim() || undefined,
        cedula: form.cedula.trim() || undefined,
        email: form.email.trim() || undefined,
        puntoVentaId: form.puntoVentaId || null,
      };
      if (editandoId) await actualizarDomiciliario(editandoId, data);
      else await crearDomiciliario(data);
      cancelar();
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(d: Domiciliario) {
    await actualizarDomiciliario(d.id, { activo: !d.activo });
    cargar();
  }

  async function eliminar(d: Domiciliario) {
    if (!confirm(`¿Desactivar a "${d.nombre}"?`)) return;
    await eliminarDomiciliario(d.id);
    cargar();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-serif text-2xl font-bold text-brand-wine">Domiciliarios</h1>
      <p className="mt-1 text-sm text-brand-black/60">Mensajeros de Run Errands, asignables por punto de venta.</p>

      {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}

      {puedeEditar && (
        <div className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-brand-brown/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
          <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <input placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <input placeholder="Cédula" value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <select value={form.puntoVentaId} onChange={(e) => setForm({ ...form, puntoVentaId: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber">
            <option value="">Sin PDV</option>
            {pdvs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={guardar} disabled={guardando || !form.nombre.trim()} className="flex-1 rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {editandoId ? "Guardar" : "Agregar"}
            </button>
            {editandoId && <button onClick={cancelar} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm">Cancelar</button>}
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
        {loading ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Sin domiciliarios.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-cream-soft text-xs font-semibold uppercase tracking-wide text-brand-black/50">
              <tr>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Teléfono</th>
                <th className="px-4 py-2.5">PDV</th>
                <th className="px-4 py-2.5">Estado</th>
                {puedeEditar && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/10">
              {items.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2 font-medium text-brand-black">{d.nombre}</td>
                  <td className="px-4 py-2 text-brand-black/70">{d.telefono ?? "—"}</td>
                  <td className="px-4 py-2 text-brand-black/70">{d.puntoVenta?.nombre ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.activo ? "bg-emerald-50 text-emerald-700" : "bg-brand-black/5 text-brand-black/50"}`}>
                      {d.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => editar(d)} className="mr-3 text-xs font-medium text-brand-amber hover:underline">Editar</button>
                      <button onClick={() => toggleActivo(d)} className="mr-3 text-xs font-medium text-brand-amber hover:underline">{d.activo ? "Desactivar" : "Activar"}</button>
                      <button onClick={() => eliminar(d)} className="text-xs font-medium text-rose-600 hover:underline">Eliminar</button>
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
