"use client";

import { useEffect, useState } from "react";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ApiError } from "@/lib/api";
import { getClientes, crearCliente, actualizarCliente, eliminarCliente, type Cliente } from "@/lib/runErrandsApi";

const vacio = {
  nombre: "", direccion: "", referencia: "", barrio: "", ciudad: "", region: "", telefono: "", email: "", observaciones: "",
};

export default function ClientesPage() {
  const usuario = getUsuario();
  const puedeEditar = puedeAccion(usuario, "run_errands.editar");
  const [items, setItems] = useState<Cliente[]>([]);
  const [buscar, setBuscar] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [form, setForm] = useState(vacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  function cargar() {
    setLoading(true);
    getClientes(buscar, true)
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }
  useEffect(cargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  function editar(c: Cliente) {
    setEditandoId(c.id);
    setForm({
      nombre: c.nombre, direccion: c.direccion ?? "", referencia: c.referencia ?? "", barrio: c.barrio ?? "",
      ciudad: c.ciudad ?? "", region: c.region ?? "", telefono: c.telefono ?? "", email: c.email ?? "",
      observaciones: c.observaciones ?? "",
    });
    setMostrarForm(true);
  }

  function cancelar() {
    setEditandoId(null);
    setForm(vacio);
    setMostrarForm(false);
  }

  async function guardar() {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    setAviso(null);
    try {
      const data = {
        nombre: form.nombre.trim(),
        direccion: form.direccion.trim() || undefined,
        referencia: form.referencia.trim() || undefined,
        barrio: form.barrio.trim() || undefined,
        ciudad: form.ciudad.trim() || undefined,
        region: form.region.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        email: form.email.trim() || undefined,
        observaciones: form.observaciones.trim() || undefined,
      };
      const r = editandoId ? await actualizarCliente(editandoId, data) : await crearCliente(data);
      if (!r.drivinOk) setAviso(`Cliente guardado, pero no se pudo sincronizar con Drivin: ${r.drivinMensaje ?? "error desconocido"}`);
      cancelar();
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(c: Cliente) {
    if (!confirm(`¿Desactivar a "${c.nombre}"?`)) return;
    await eliminarCliente(c.id);
    cargar();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-brand-wine">Clientes</h1>
          <p className="mt-1 text-sm text-brand-black/60">Destinos de entrega de Run Errands (sincronizados con Drivin).</p>
        </div>
        {puedeEditar && (
          <button onClick={() => { cancelar(); setMostrarForm(true); }} className="rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white">
            Nuevo cliente
          </button>
        )}
      </div>

      {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}
      {aviso && <div className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{aviso}</div>}

      <div className="mt-4 flex gap-2">
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && cargar()}
          placeholder="Buscar por nombre o código…"
          className="flex-1 rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber"
        />
        <button onClick={cargar} className="rounded-xl border border-brand-brown/20 px-4 py-2 text-sm font-medium">Buscar</button>
      </div>

      {mostrarForm && puedeEditar && (
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-brand-brown/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
          <input placeholder="Nombre *" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <input placeholder="Dirección" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <input placeholder="Referencia" value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <input placeholder="Barrio" value={form.barrio} onChange={(e) => setForm({ ...form, barrio: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <input placeholder="Ciudad" value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <input placeholder="Región/Departamento" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <input placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <input placeholder="Observaciones" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className="rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber" />
          <div className="flex gap-2 lg:col-span-3">
            <button onClick={guardar} disabled={guardando || !form.nombre.trim()} className="rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {editandoId ? "Guardar cambios" : "Crear cliente"}
            </button>
            <button onClick={cancelar} className="rounded-xl border border-brand-brown/20 px-4 py-2 text-sm">Cancelar</button>
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
        {loading ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Sin clientes.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-cream-soft text-xs font-semibold uppercase tracking-wide text-brand-black/50">
              <tr>
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Dirección</th>
                <th className="px-4 py-2.5">Ciudad</th>
                <th className="px-4 py-2.5">Estado</th>
                {puedeEditar && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/10">
              {items.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-mono text-xs text-brand-black/70">{c.codigo}</td>
                  <td className="px-4 py-2 font-medium text-brand-black">{c.nombre}</td>
                  <td className="px-4 py-2 text-brand-black/70">{c.direccion ?? "—"}</td>
                  <td className="px-4 py-2 text-brand-black/70">{c.ciudad ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.activo ? "bg-emerald-50 text-emerald-700" : "bg-brand-black/5 text-brand-black/50"}`}>
                      {c.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => editar(c)} className="mr-3 text-xs font-medium text-brand-amber hover:underline">Editar</button>
                      <button onClick={() => eliminar(c)} className="text-xs font-medium text-rose-600 hover:underline">Eliminar</button>
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
