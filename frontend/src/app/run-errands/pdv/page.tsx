"use client";

import { useEffect, useState } from "react";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ApiError } from "@/lib/api";
import { MapPin, Pencil, Plus, Power, Search, Store, Trash2 } from "lucide-react";
import { ActiveBadge, EmptyState, ErrorBanner, fieldClass, IconAction, Metric, Modal, PageHeader, primaryClass, secondaryClass, tableClass } from "@/components/RunErrandsUI";
import {
  getPuntosVenta,
  crearPuntoVenta,
  actualizarPuntoVenta,
  eliminarPuntoVenta,
  type PuntoVenta,
} from "@/lib/runErrandsApi";

export default function PuntosVentaPage() {
  const usuario = getUsuario();
  const puedeEditar = puedeAccion(usuario, "run_errands.editar");
  const [items, setItems] = useState<PuntoVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState<PuntoVenta | null>(null);
  const [buscar, setBuscar] = useState("");
  const filtrados = items.filter((punto) => punto.nombre.toLowerCase().includes(buscar.trim().toLowerCase()));

  function cargar() {
    setLoading(true);
    getPuntosVenta(true)
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  async function crear() {
    if (!nombreNuevo.trim()) return;
    setGuardando(true);
    try {
      if (editando) await actualizarPuntoVenta(editando.id, { nombre: nombreNuevo.trim() });
      else await crearPuntoVenta(nombreNuevo.trim());
      setNombreNuevo("");
      setMostrarForm(false);
      setEditando(null);
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear");
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(p: PuntoVenta) {
    try { await actualizarPuntoVenta(p.id, { activo: !p.activo }); cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar el punto."); }
  }

  async function eliminar(p: PuntoVenta) {
    if (!confirm(`¿Desactivar "${p.nombre}"?`)) return;
    try { await eliminarPuntoVenta(p.id); cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo desactivar el punto."); }
  }

  return (
    <div className="mx-auto max-w-[1200px] pb-6">
      <PageHeader title="Puntos de venta" icon={<Store className="h-6 w-6" />}>{puedeEditar && <button className={primaryClass} onClick={() => { setEditando(null); setNombreNuevo(""); setError(null); setMostrarForm(true); }}><Plus className="h-4 w-4" />Nuevo punto</button>}</PageHeader>
      <ErrorBanner message={mostrarForm ? null : error} />
      <div className="mb-6 grid grid-cols-2 gap-3"><Metric title="Puntos registrados" value={items.length} icon={<Store className="h-5 w-5" />} /><Metric title="Puntos activos" value={items.filter((p) => p.activo).length} icon={<MapPin className="h-5 w-5" />} tone="green" /></div>
      <div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-brand-black/40" /><input aria-label="Buscar punto de venta" placeholder="Buscar punto de venta..." value={buscar} onChange={(e) => setBuscar(e.target.value)} className={`${fieldClass} w-full pl-9`} /></div>
      <div className="overflow-x-auto rounded-lg border border-brand-brown/10 bg-white">
        {loading ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <EmptyState text="No hay puntos que coincidan con la búsqueda." />
        ) : (
          <table className={`${tableClass} min-w-[520px]`}>
            <thead className="bg-brand-cream-soft text-xs font-semibold uppercase tracking-wide text-brand-black/50">
              <tr>
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Estado</th>
                {puedeEditar && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/10">
              {filtrados.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 tabular-nums text-brand-black/60">{p.indicador}</td>
                  <td className="px-4 py-2 font-medium text-brand-black">{p.nombre}</td>
                  <td className="px-4 py-2">
                    <ActiveBadge active={p.activo} />
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1"><IconAction label={`Editar ${p.nombre}`} onClick={() => { setEditando(p); setNombreNuevo(p.nombre); setError(null); setMostrarForm(true); }}><Pencil className="h-4 w-4" /></IconAction><IconAction label={`${p.activo ? "Desactivar" : "Activar"} ${p.nombre}`} onClick={() => void toggleActivo(p)}><Power className={`h-4 w-4 ${p.activo ? "text-emerald-600" : ""}`} /></IconAction><IconAction label={`Eliminar ${p.nombre}`} danger onClick={() => void eliminar(p)}><Trash2 className="h-4 w-4" /></IconAction></div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {mostrarForm && <Modal title={editando ? "Editar punto de venta" : "Nuevo punto de venta"} onClose={() => setMostrarForm(false)} busy={guardando}><form onSubmit={(event) => { event.preventDefault(); void crear(); }}><ErrorBanner message={error} /><label className="text-xs font-semibold text-brand-black">Nombre<input autoFocus required value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} className={`${fieldClass} mt-1.5 w-full`} /></label><div className="mt-6 flex justify-end gap-2"><button type="button" className={secondaryClass} disabled={guardando} onClick={() => setMostrarForm(false)}>Cancelar</button><button type="submit" className={primaryClass} disabled={guardando || !nombreNuevo.trim()}>{guardando ? "Guardando..." : "Guardar punto"}</button></div></form></Modal>}
    </div>
  );
}
