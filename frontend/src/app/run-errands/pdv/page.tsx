"use client";

import { useEffect, useState } from "react";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ApiError } from "@/lib/api";
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
      await crearPuntoVenta(nombreNuevo.trim());
      setNombreNuevo("");
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear");
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(p: PuntoVenta) {
    await actualizarPuntoVenta(p.id, { activo: !p.activo });
    cargar();
  }

  async function eliminar(p: PuntoVenta) {
    if (!confirm(`¿Desactivar "${p.nombre}"?`)) return;
    await eliminarPuntoVenta(p.id);
    cargar();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-2xl font-bold text-brand-wine">Puntos de venta</h1>
      <p className="mt-1 text-sm text-brand-black/60">Puntos de venta (PDV) de Run Errands.</p>

      {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}

      {puedeEditar && (
        <div className="mt-6 flex gap-2">
          <input
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre del nuevo PDV"
            className="flex-1 rounded-xl border border-brand-brown/20 px-3 py-2 text-sm outline-none focus:border-brand-amber"
          />
          <button
            onClick={crear}
            disabled={guardando || !nombreNuevo.trim()}
            className="rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
        {loading ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-brand-black/50">Sin puntos de venta.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-cream-soft text-xs font-semibold uppercase tracking-wide text-brand-black/50">
              <tr>
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Estado</th>
                {puedeEditar && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/10">
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 tabular-nums text-brand-black/60">{p.indicador}</td>
                  <td className="px-4 py-2 font-medium text-brand-black">{p.nombre}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.activo ? "bg-emerald-50 text-emerald-700" : "bg-brand-black/5 text-brand-black/50"}`}>
                      {p.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => toggleActivo(p)} className="mr-3 text-xs font-medium text-brand-amber hover:underline">
                        {p.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button onClick={() => eliminar(p)} className="text-xs font-medium text-rose-600 hover:underline">
                        Eliminar
                      </button>
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
