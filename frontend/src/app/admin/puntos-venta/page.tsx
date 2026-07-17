"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { listarUsuarios, type Usuario } from "@/lib/usuarios";
import { listarListasPrecio, type ListaPrecio } from "@/lib/productos";
import {
  actualizarPuntoVenta,
  asignarUsuariosPunto,
  crearPuntoVenta,
  eliminarPuntoVenta,
  listarPuntosVenta,
  usuariosDePunto,
  type PuntoVenta,
} from "@/lib/puntos-venta";
import MapaDireccion from "@/components/MapaDireccion";

interface FormState {
  nombre: string;
  codigo: string;
  direccion: string;
  telefono: string;
  lista_precio: string;
  barrio: string;
  ciudad: string;
  lat: number | null;
  lng: number | null;
  activo: boolean;
}

const FORM_VACIO: FormState = {
  nombre: "",
  codigo: "",
  direccion: "",
  telefono: "",
  lista_precio: "",
  barrio: "",
  ciudad: "",
  lat: null,
  lng: null,
  activo: true,
};

export default function AdminPuntosVentaPage() {
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [listas, setListas] = useState<ListaPrecio[]>([]);

  // Modal crear/editar
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<PuntoVenta | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  // Modal eliminar
  const [porEliminar, setPorEliminar] = useState<PuntoVenta | null>(null);
  const [eliminando, setEliminando] = useState(false);

  // Modal asignar usuarios
  const [asignando, setAsignando] = useState<PuntoVenta | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [cargandoAsign, setCargandoAsign] = useState(false);
  const [guardandoAsign, setGuardandoAsign] = useState(false);
  const [errorAsign, setErrorAsign] = useState<string | null>(null);
  const [buscarUsuario, setBuscarUsuario] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setPuntos(await listarPuntosVenta());
    } catch (e) {
      setErrorCarga(
        e instanceof ApiError
          ? e.message
          : "No se pudieron cargar los puntos de venta",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    listarListasPrecio()
      .then(setListas)
      .catch(() => setListas([]));
  }, []);

  function abrirCrear() {
    setEditando(null);
    setForm(FORM_VACIO);
    setErrorForm(null);
    setModalAbierto(true);
  }

  function abrirEditar(p: PuntoVenta) {
    setEditando(p);
    setForm({
      nombre: p.nombre,
      codigo: p.codigo ?? "",
      direccion: p.direccion ?? "",
      telefono: p.telefono ?? "",
      lista_precio: p.lista_precio ?? "",
      barrio: p.barrio ?? "",
      ciudad: p.ciudad ?? "",
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      activo: p.activo,
    });
    setErrorForm(null);
    setModalAbierto(true);
  }

  function cerrarModal() {
    if (guardando) return;
    setModalAbierto(false);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setErrorForm(null);
    if (!form.nombre.trim()) {
      setErrorForm("El nombre es obligatorio");
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        nombre: form.nombre.trim(),
        codigo: form.codigo.trim(),
        direccion: form.direccion.trim(),
        telefono: form.telefono.trim(),
        lista_precio: form.lista_precio.trim(),
        barrio: form.barrio.trim(),
        ciudad: form.ciudad.trim(),
        lat: form.lat,
        lng: form.lng,
        activo: form.activo,
      };
      if (editando) {
        await actualizarPuntoVenta(editando.id, datos);
      } else {
        await crearPuntoVenta(datos);
      }
      setModalAbierto(false);
      await cargar();
    } catch (e) {
      setErrorForm(
        e instanceof ApiError ? e.message : "No se pudo guardar el punto",
      );
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarPuntoVenta(porEliminar.id);
      setPorEliminar(null);
      await cargar();
    } catch (e) {
      setErrorCarga(
        e instanceof ApiError ? e.message : "No se pudo eliminar el punto",
      );
      setPorEliminar(null);
    } finally {
      setEliminando(false);
    }
  }

  async function abrirAsignar(p: PuntoVenta) {
    setAsignando(p);
    setErrorAsign(null);
    setBuscarUsuario("");
    setCargandoAsign(true);
    try {
      const [lista, asignados] = await Promise.all([
        listarUsuarios(),
        usuariosDePunto(p.id),
      ]);
      setUsuarios(lista);
      setSeleccion(asignados);
    } catch (e) {
      setErrorAsign(
        e instanceof ApiError ? e.message : "No se pudieron cargar los usuarios",
      );
    } finally {
      setCargandoAsign(false);
    }
  }

  function alternarUsuario(id: string) {
    setSeleccion((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function guardarAsignacion() {
    if (!asignando) return;
    setGuardandoAsign(true);
    setErrorAsign(null);
    try {
      await asignarUsuariosPunto(asignando.id, seleccion);
      setAsignando(null);
      await cargar();
    } catch (e) {
      setErrorAsign(
        e instanceof ApiError ? e.message : "No se pudo guardar la asignación",
      );
    } finally {
      setGuardandoAsign(false);
    }
  }

  const termino = buscarUsuario.trim().toLowerCase();
  const usuariosFiltrados = termino
    ? usuarios.filter(
        (u) =>
          u.nombre.toLowerCase().includes(termino) ||
          u.cedula.toLowerCase().includes(termino),
      )
    : usuarios;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">
            Puntos de venta
          </h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Gestiona los puntos de venta y asigna los usuarios que trabajan en
            cada uno.
          </p>
        </div>
        <button
          onClick={abrirCrear}
          title="Crear un nuevo punto de venta"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber-light"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nuevo punto
        </button>
      </div>

      {errorCarga && (
        <div className="mb-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-3 text-sm text-brand-wine">
          {errorCarga}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
          </div>
        ) : puntos.length === 0 ? (
          <div className="py-16 text-center text-sm text-brand-brown/60">
            No hay puntos de venta registrados.
          </div>
        ) : (
          <div className="max-h-[calc(100vh-320px)] overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-brand-brown/10 bg-brand-cream-soft text-xs uppercase tracking-wide text-brand-brown/60 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Usuarios</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-brown/5">
                {puntos.map((p) => (
                  <tr key={p.id} className="transition hover:bg-brand-cream-soft/60">
                    <td className="px-4 py-3 font-mono text-xs text-brand-brown/80">
                      {p.codigo ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-brand-black">
                      {p.nombre}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-brand-wine/10 px-2.5 py-0.5 text-xs font-medium text-brand-wine">
                        {p.usuarios ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.activo ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-brown/10 px-2.5 py-0.5 text-xs font-medium text-brand-brown/60">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-brown/40" />
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => abrirEditar(p)}
                          className="rounded-lg p-2 text-brand-brown/70 transition hover:bg-brand-amber/10 hover:text-brand-amber"
                          aria-label={`Editar ${p.nombre}`}
                          title="Editar"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setPorEliminar(p)}
                          className="rounded-lg p-2 text-brand-brown/70 transition hover:bg-brand-wine/10 hover:text-brand-wine"
                          aria-label={`Eliminar ${p.nombre}`}
                          title="Eliminar"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- Modal crear/editar ---------- */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm" onClick={cerrarModal} />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="font-serif text-xl font-bold text-brand-wine">
              {editando ? "Editar punto de venta" : "Nuevo punto de venta"}
            </h2>
            <p className="mt-1 text-sm text-brand-brown/60">
              El código identifica la localidad ante el software de pedidos.
            </p>

            {errorForm && (
              <div className="mt-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-2.5 text-sm text-brand-wine">
                {errorForm}
              </div>
            )}

            <form onSubmit={guardar} className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-brown">Nombre *</label>
                <input
                  type="text"
                  required
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-brown">Código (número del punto)</label>
                <input
                  type="text"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="Ej. 1"
                  className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 font-mono text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-brown">Dirección</label>
                <input
                  type="text"
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-brown">Teléfono</label>
                <input
                  type="text"
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-brand-brown">Barrio</label>
                  <input
                    type="text"
                    value={form.barrio}
                    onChange={(e) => setForm({ ...form, barrio: e.target.value })}
                    className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-brand-brown">Ciudad</label>
                  <input
                    type="text"
                    value={form.ciudad}
                    onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                    className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-brown">
                  Ubicación en el mapa
                </label>
                <p className="mb-2 text-xs text-brand-brown/60">
                  Ubica el punto con precisión (latitud/longitud) para recomendar
                  correctamente el punto más cercano a cada cliente.
                </p>
                <MapaDireccion
                  direccion={form.direccion}
                  barrio={form.barrio}
                  ciudad={form.ciudad}
                  lat={form.lat}
                  lng={form.lng}
                  ocultarPuntos
                  onUbicacion={(la, lo) => setForm((p) => ({ ...p, lat: la, lng: lo }))}
                  onBarrio={(b) => setForm((p) => ({ ...p, barrio: b }))}
                  onCiudad={(ci) => setForm((p) => ({ ...p, ciudad: ci }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-brown">Lista de precios</label>
                <select
                  value={form.lista_precio}
                  onChange={(e) => setForm({ ...form, lista_precio: e.target.value })}
                  className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                >
                  <option value="">Sin lista asignada</option>
                  {listas.map((l) => (
                    <option key={l.lista_precio} value={l.lista_precio}>
                      {l.desc_lista ?? `Lista ${l.lista_precio}`}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-brand-brown/50">
                  Define los productos y precios que ve este punto en pedidos.
                </p>
              </div>
              <label className="flex items-center gap-2.5 text-sm font-medium text-brand-brown">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                  className="h-4 w-4 rounded border-brand-brown/30 text-brand-amber focus:ring-brand-amber/30"
                />
                Punto activo
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={cerrarModal} disabled={guardando} title="Cancelar" className="rounded-xl px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-brown/5 disabled:opacity-50">
                  Cancelar
                </button>
                <button type="submit" disabled={guardando} title={editando ? "Guardar los cambios del punto" : "Crear el punto de venta"} className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-amber-light disabled:opacity-60">
                  {guardando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  {editando ? "Guardar cambios" : "Crear punto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- Modal asignar usuarios ---------- */}
      {asignando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm" onClick={() => !guardandoAsign && setAsignando(null)} />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="font-serif text-xl font-bold text-brand-wine">Asignar usuarios</h2>
            <p className="mt-1 text-sm text-brand-brown/60">{asignando.nombre}</p>

            {errorAsign && (
              <div className="mt-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-2.5 text-sm text-brand-wine">
                {errorAsign}
              </div>
            )}

            {cargandoAsign ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
              </div>
            ) : (
              <>
                <div className="mt-4">
                  <input
                    type="text"
                    value={buscarUsuario}
                    onChange={(e) => setBuscarUsuario(e.target.value)}
                    placeholder="Buscar por nombre o cédula…"
                    className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                  />
                </div>
                <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-brand-brown/10 bg-brand-cream-soft/60 p-3">
                  {usuariosFiltrados.length === 0 ? (
                    <p className="py-6 text-center text-sm text-brand-brown/60">
                      {usuarios.length === 0
                        ? "No hay usuarios."
                        : "Sin resultados."}
                    </p>
                  ) : (
                    usuariosFiltrados.map((u) => (
                      <label key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-brand-black hover:bg-white">
                        <input
                          type="checkbox"
                          checked={seleccion.includes(u.id)}
                          onChange={() => alternarUsuario(u.id)}
                          className="h-4 w-4 rounded border-brand-brown/30 text-brand-amber focus:ring-brand-amber/30"
                        />
                        <span className="flex-1">{u.nombre}</span>
                        <span className="text-xs text-brand-brown/50">{u.cedula}</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="mt-2 text-xs text-brand-brown/50">
                  {seleccion.length} usuario(s) seleccionado(s)
                </p>
              </>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAsignando(null)} disabled={guardandoAsign} title="Cancelar" className="rounded-xl px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-brown/5 disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={guardarAsignacion} disabled={guardandoAsign || cargandoAsign} title="Guardar la asignación de usuarios" className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-amber-light disabled:opacity-60">
                {guardandoAsign && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                Guardar asignación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal eliminar ---------- */}
      {porEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm" onClick={() => !eliminando && setPorEliminar(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="font-serif text-xl font-bold text-brand-wine">Eliminar punto</h2>
            <p className="mt-2 text-sm text-brand-brown/70">
              ¿Seguro que deseas eliminar <strong>{porEliminar.nombre}</strong>? Se quitarán sus asignaciones de usuarios.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPorEliminar(null)} disabled={eliminando} title="Cancelar" className="rounded-xl px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-brown/5 disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={confirmarEliminar} disabled={eliminando} title="Eliminar el punto de venta" className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-60">
                {eliminando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
