"use client";

import { useEffect, useState } from "react";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ApiError } from "@/lib/api";
import { MapPin, Pencil, Plus, Search, Trash2, UserCheck, Users } from "lucide-react";
import { ActiveBadge, EmptyState, ErrorBanner, fieldClass, IconAction, Metric, Modal, PageHeader, primaryClass, secondaryClass, tableClass } from "@/components/RunErrandsUI";
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
    setError(null);
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
    try { await eliminarCliente(c.id); cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo desactivar el cliente."); }
  }

  return (
    <div className="mx-auto max-w-[1400px] pb-6">
      <PageHeader title="Clientes" icon={<Users className="h-6 w-6" />}>
        {puedeEditar && (
          <button onClick={() => { cancelar(); setError(null); setMostrarForm(true); }} className={primaryClass}>
            <Plus className="h-4 w-4" />Nuevo cliente
          </button>
        )}
      </PageHeader>

      <ErrorBanner message={mostrarForm ? null : error} />
      {aviso && <div className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{aviso}</div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3"><Metric title="Clientes encontrados" value={items.length} icon={<Users className="h-5 w-5" />} /><Metric title="Activos" value={items.filter((c) => c.activo).length} icon={<UserCheck className="h-5 w-5" />} tone="green" /><Metric title="Ciudades" value={new Set(items.map((c) => c.ciudad).filter(Boolean)).size} icon={<MapPin className="h-5 w-5" />} tone="blue" /></div>
      <div className="mb-4 flex gap-2">
        <input
          value={buscar}
          aria-label="Buscar clientes"
          onChange={(e) => setBuscar(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && cargar()}
          placeholder="Buscar por nombre, código, dirección, barrio o ciudad…"
          className={`${fieldClass} flex-1`}
        />
        <button onClick={cargar} title="Buscar clientes" aria-label="Buscar clientes" className={secondaryClass}><Search className="h-4 w-4" /></button>
      </div>

      {mostrarForm && puedeEditar && (
        <Modal title={editandoId ? "Editar cliente" : "Nuevo cliente"} onClose={cancelar} busy={guardando}>
          <form onSubmit={(event) => { event.preventDefault(); void guardar(); }}>
            <ErrorBanner message={error} />
            <div className="grid gap-4 sm:grid-cols-2">{([['nombre', 'Nombre completo'], ['direccion', 'Dirección'], ['referencia', 'Referencia'], ['barrio', 'Barrio'], ['ciudad', 'Ciudad'], ['region', 'Departamento'], ['telefono', 'Teléfono'], ['email', 'Correo electrónico'], ['observaciones', 'Observaciones']] as const).map(([campo, etiqueta]) => <label key={campo} className={`text-xs font-semibold text-brand-black ${campo === 'nombre' || campo === 'direccion' || campo === 'observaciones' ? 'sm:col-span-2' : ''}`}>{etiqueta}<input required={campo === 'nombre'} autoFocus={campo === 'nombre'} type={campo === 'email' ? 'email' : campo === 'telefono' ? 'tel' : 'text'} value={form[campo]} onChange={(e) => setForm({ ...form, [campo]: e.target.value })} className={`${fieldClass} mt-1.5 w-full`} /></label>)}</div>
            <div className="mt-6 flex justify-end gap-2 border-t border-brand-brown/10 pt-4"><button type="button" className={secondaryClass} onClick={cancelar} disabled={guardando}>Cancelar</button><button type="submit" className={primaryClass} disabled={guardando || !form.nombre.trim()}>{guardando ? "Guardando..." : "Guardar cliente"}</button></div>
          </form>
        </Modal>
      )}

      <div className="overflow-x-auto rounded-lg border border-brand-brown/10 bg-white">
        {loading ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Cargando…</div>
        ) : items.length === 0 ? (
          <EmptyState text="No hay clientes que coincidan con la búsqueda." />
        ) : (
          <table className={`${tableClass} min-w-[780px]`}>
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
                    <ActiveBadge active={c.activo} />
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1"><IconAction label={`Editar ${c.nombre}`} onClick={() => editar(c)}><Pencil className="h-4 w-4" /></IconAction><IconAction label={`Desactivar ${c.nombre}`} danger onClick={() => void eliminar(c)}><Trash2 className="h-4 w-4" /></IconAction></div>
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
