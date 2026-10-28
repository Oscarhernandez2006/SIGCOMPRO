"use client";

import { useEffect, useState } from "react";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ApiError } from "@/lib/api";
import { Globe2, Pencil, Plus, Power, Search, Trash2, UserCheck, Users, UserX } from "lucide-react";
import { ActiveBadge, EmptyState, ErrorBanner, fieldClass, IconAction, Metric, Modal, PageHeader, primaryClass, secondaryClass, tableClass } from "@/components/RunErrandsUI";
import {
  getDomiciliarios,
  crearDomiciliario,
  actualizarDomiciliario,
  eliminarDomiciliario,
  getPuntosVenta,
  type Domiciliario,
  type PuntoVenta,
} from "@/lib/runErrandsApi";

const vacio = { nombre: "", telefono: "", cedula: "", email: "", puntoVentaId: "", todosLosPuntos: false };

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
  const [buscar, setBuscar] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [puntoFiltro, setPuntoFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtrados = items.filter((item) => normalizar(item.nombre).includes(normalizar(buscar.trim())) &&
    (!puntoFiltro || (puntoFiltro === "GLOBAL" ? item.todosLosPuntos : item.todosLosPuntos || item.puntoVentaId === puntoFiltro)) &&
    (!estadoFiltro || item.activo === (estadoFiltro === "activo")));

  function cargar() {
    setLoading(true);
    Promise.all([getDomiciliarios({ todos: true }), getPuntosVenta(true)])
      .then(([d, p]) => { setItems(d); setPdvs(p); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  function editar(d: Domiciliario) {
    setError(null);
    setMostrarForm(true);
    setEditandoId(d.id);
    setForm({
      nombre: d.nombre, telefono: d.telefono ?? "", cedula: d.cedula ?? "",
      email: d.email ?? "", puntoVentaId: d.puntoVentaId ?? "",
      todosLosPuntos: d.todosLosPuntos ?? false,
    });
  }

  function cancelar() {
    setMostrarForm(false);
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
        puntoVentaId: form.todosLosPuntos ? null : form.puntoVentaId || null,
        todosLosPuntos: form.todosLosPuntos,
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
    try { await actualizarDomiciliario(d.id, { activo: !d.activo }); cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar el domiciliario."); }
  }

  async function eliminar(d: Domiciliario) {
    if (!confirm(`¿Desactivar a "${d.nombre}"?`)) return;
    try { await eliminarDomiciliario(d.id); cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo desactivar el domiciliario."); }
  }

  return (
    <div className="mx-auto max-w-[1400px] pb-6">
      <PageHeader title="Domiciliarios" icon={<Users className="h-6 w-6" />}>
        {puedeEditar && <button className={primaryClass} onClick={() => { cancelar(); setError(null); setMostrarForm(true); }}><Plus className="h-4 w-4" />Nuevo domiciliario</button>}
      </PageHeader>
      <ErrorBanner message={mostrarForm ? null : error} />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric title="Registrados" value={items.length} icon={<Users className="h-5 w-5" />} />
        <Metric title="Activos" value={items.filter((d) => d.activo).length} icon={<UserCheck className="h-5 w-5" />} tone="green" />
        <Metric title="Todos los puntos" value={items.filter((d) => d.todosLosPuntos && d.activo).length} icon={<Globe2 className="h-5 w-5" />} tone="blue" />
        <Metric title="Inactivos" value={items.filter((d) => !d.activo).length} icon={<UserX className="h-5 w-5" />} tone="amber" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-brand-black/40" /><input aria-label="Buscar domiciliario por nombre" placeholder="Buscar por nombre..." value={buscar} onChange={(e) => setBuscar(e.target.value)} className={`${fieldClass} w-full pl-9`} /></div>
        <select aria-label="Filtrar domiciliarios por punto" value={puntoFiltro} onChange={(e) => setPuntoFiltro(e.target.value)} className={fieldClass}><option value="">Todos los puntos</option><option value="GLOBAL">Disponibilidad global</option>{pdvs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
        <select aria-label="Estado del domiciliario" value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className={fieldClass}><option value="">Todos los estados</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select>
        <span className="ml-auto text-xs text-brand-black/55">{filtrados.length} resultados</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-brand-brown/10 bg-white">
        {loading ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <EmptyState text="No hay domiciliarios que coincidan con los filtros." />
        ) : (
          <table className={`${tableClass} min-w-[700px]`}>
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
              {filtrados.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2 font-medium text-brand-black"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-wine/10 text-xs font-bold text-brand-wine">{d.nombre.split(" ").filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("")}</span><div>{d.nombre}<p className="mt-0.5 text-xs font-normal text-brand-black/50">{d.cedula || "Sin documento"}</p></div></div></td>
                  <td className="px-4 py-2 text-brand-black/70">{d.telefono ?? "—"}</td>
                  <td className="px-4 py-2 text-brand-black/70">{d.todosLosPuntos ? "Todos los puntos" : d.puntoVenta?.nombre ?? "Sin PDV"}</td>
                  <td className="px-4 py-2">
                    <ActiveBadge active={d.activo} />
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1"><IconAction label={`Editar ${d.nombre}`} onClick={() => editar(d)}><Pencil className="h-4 w-4" /></IconAction><IconAction label={`${d.activo ? "Desactivar" : "Activar"} ${d.nombre}`} onClick={() => void toggleActivo(d)}><Power className={`h-4 w-4 ${d.activo ? "text-emerald-600" : ""}`} /></IconAction><IconAction label={`Eliminar ${d.nombre}`} danger onClick={() => void eliminar(d)}><Trash2 className="h-4 w-4" /></IconAction></div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {mostrarForm && puedeEditar && <Modal title={editandoId ? "Editar domiciliario" : "Nuevo domiciliario"} busy={guardando} onClose={cancelar}>
        <form onSubmit={(event) => { event.preventDefault(); void guardar(); }}>
          <ErrorBanner message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-brand-black sm:col-span-2">Nombre completo<input required autoFocus value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={`${fieldClass} mt-1.5 w-full`} /></label>
            <label className="text-xs font-semibold text-brand-black">Cédula<input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} className={`${fieldClass} mt-1.5 w-full`} /></label>
            <label className="text-xs font-semibold text-brand-black">Teléfono<input type="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={`${fieldClass} mt-1.5 w-full`} /></label>
            <label className="text-xs font-semibold text-brand-black sm:col-span-2">Correo electrónico<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${fieldClass} mt-1.5 w-full`} /></label>
            <label className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-3 text-sm font-medium text-sky-800 sm:col-span-2"><input type="checkbox" checked={form.todosLosPuntos} onChange={(e) => setForm({ ...form, todosLosPuntos: e.target.checked })} className="h-4 w-4 accent-brand-wine" /><Globe2 className="h-4 w-4" />Disponible en todos los puntos</label>
            <label className="text-xs font-semibold text-brand-black sm:col-span-2">Punto de venta<select disabled={form.todosLosPuntos} value={form.puntoVentaId} onChange={(e) => setForm({ ...form, puntoVentaId: e.target.value })} className={`${fieldClass} mt-1.5 w-full`}><option value="">Sin asignar</option>{pdvs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t border-brand-brown/10 pt-4"><button type="button" className={secondaryClass} onClick={cancelar} disabled={guardando}>Cancelar</button><button type="submit" className={primaryClass} disabled={guardando || !form.nombre.trim()}>{guardando ? "Guardando..." : "Guardar domiciliario"}</button></div>
        </form>
      </Modal>}
    </div>
  );
}
