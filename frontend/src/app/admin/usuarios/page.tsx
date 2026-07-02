"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { aNombrePropio } from "@/lib/format";
import {
  actualizarUsuario,
  crearUsuario,
  eliminarUsuario,
  listarUsuarios,
  ROLES_SUGERIDOS,
  type Usuario,
} from "@/lib/usuarios";

interface FormState {
  cedula: string;
  nombre: string;
  rol: string;
  password: string;
  activo: boolean;
}

const FORM_VACIO: FormState = {
  cedula: "",
  nombre: "",
  rol: "",
  password: "",
  activo: true,
};

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Estado del modal de formulario (crear/editar)
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  // Estado del modal de confirmación de borrado
  const [porEliminar, setPorEliminar] = useState<Usuario | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setUsuarios(await listarUsuarios());
    } catch (e) {
      setErrorCarga(
        e instanceof ApiError ? e.message : "No se pudieron cargar los usuarios",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function abrirCrear() {
    setEditando(null);
    setForm(FORM_VACIO);
    setErrorForm(null);
    setModalAbierto(true);
  }

  function abrirEditar(u: Usuario) {
    setEditando(u);
    setForm({
      cedula: u.cedula,
      nombre: u.nombre,
      rol: u.rol,
      password: "",
      activo: u.activo,
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
    setGuardando(true);
    try {
      if (editando) {
        await actualizarUsuario(editando.id, {
          cedula: form.cedula.trim(),
          nombre: form.nombre.trim(),
          rol: form.rol.trim(),
          activo: form.activo,
          // Solo enviamos la contraseña si se escribió una nueva.
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await crearUsuario({
          cedula: form.cedula.trim(),
          nombre: form.nombre.trim(),
          rol: form.rol.trim(),
          password: form.password,
          activo: form.activo,
        });
      }
      setModalAbierto(false);
      await cargar();
    } catch (e) {
      setErrorForm(
        e instanceof ApiError ? e.message : "No se pudo guardar el usuario",
      );
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarUsuario(porEliminar.id);
      setPorEliminar(null);
      await cargar();
    } catch (e) {
      setErrorCarga(
        e instanceof ApiError ? e.message : "No se pudo eliminar el usuario",
      );
      setPorEliminar(null);
    } finally {
      setEliminando(false);
    }
  }

  function formatearFecha(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("es", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">
            Usuarios
          </h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Crea, edita y elimina usuarios del sistema.
          </p>
        </div>
        <button
          onClick={abrirCrear}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber-light"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nuevo usuario
        </button>
      </div>

      {/* Estado de error de carga */}
      {errorCarga && (
        <div className="mb-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-3 text-sm text-brand-wine">
          {errorCarga}
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
          </div>
        ) : usuarios.length === 0 ? (
          <div className="py-16 text-center text-sm text-brand-brown/60">
            No hay usuarios registrados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-brand-brown/10 bg-brand-cream-soft text-xs uppercase tracking-wide text-brand-brown/60">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Cédula</th>
                  <th className="px-4 py-3 font-semibold">Rol</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Creado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-brown/5">
                {usuarios.map((u) => (
                  <tr key={u.id} className="transition hover:bg-brand-cream-soft/60">
                    <td className="px-4 py-3 font-medium text-brand-black">
                      {u.nombre}
                    </td>
                    <td className="px-4 py-3 text-brand-brown/80">{u.cedula}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-brand-wine/10 px-2.5 py-0.5 text-xs font-medium capitalize text-brand-wine">
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.activo ? (
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
                    <td className="px-4 py-3 text-brand-brown/70">
                      {formatearFecha(u.creado_en)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => abrirEditar(u)}
                          className="rounded-lg p-2 text-brand-brown/70 transition hover:bg-brand-amber/10 hover:text-brand-amber"
                          aria-label={`Editar ${u.nombre}`}
                          title="Editar"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setPorEliminar(u)}
                          className="rounded-lg p-2 text-brand-brown/70 transition hover:bg-brand-wine/10 hover:text-brand-wine"
                          aria-label={`Eliminar ${u.nombre}`}
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
          <div
            className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm"
            onClick={cerrarModal}
          />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="font-serif text-xl font-bold text-brand-wine">
              {editando ? "Editar usuario" : "Nuevo usuario"}
            </h2>
            <p className="mt-1 text-sm text-brand-brown/60">
              {editando
                ? "Modifica los datos del usuario."
                : "Completa los datos para registrar un usuario."}
            </p>

            {errorForm && (
              <div className="mt-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-2.5 text-sm text-brand-wine">
                {errorForm}
              </div>
            )}

            <form onSubmit={guardar} className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-brown">
                  Nombre
                </label>
                <input
                  type="text"
                  required
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: aNombrePropio(e.target.value) })}
                  className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-brown">
                  Cédula
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={form.cedula}
                  onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                  className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-brown">
                  Rol
                </label>
                <select
                  required
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value })}
                  className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                >
                  <option value="" disabled>
                    Selecciona un rol…
                  </option>
                  {ROLES_SUGERIDOS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  {form.rol && !ROLES_SUGERIDOS.includes(form.rol as (typeof ROLES_SUGERIDOS)[number]) && (
                    <option value={form.rol}>{form.rol}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-brown">
                  Contraseña{" "}
                  {editando && (
                    <span className="font-normal text-brand-brown/50">
                      (dejar vacío para no cambiarla)
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  required={!editando}
                  minLength={6}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder={editando ? "••••••••" : "Mínimo 6 caracteres"}
                  className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                />
              </div>

              <label className="flex items-center gap-2.5 text-sm font-medium text-brand-brown">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) =>
                    setForm({ ...form, activo: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-brand-brown/30 text-brand-amber focus:ring-brand-amber/30"
                />
                Usuario activo
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={cerrarModal}
                  disabled={guardando}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-brown/5 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-amber-light disabled:opacity-60"
                >
                  {guardando && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  {editando ? "Guardar cambios" : "Crear usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- Modal confirmar borrado ---------- */}
      {porEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm"
            onClick={() => !eliminando && setPorEliminar(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="font-serif text-xl font-bold text-brand-wine">
              Eliminar usuario
            </h2>
            <p className="mt-2 text-sm text-brand-brown/70">
              ¿Seguro que deseas eliminar a{" "}
              <strong className="text-brand-black">{porEliminar.nombre}</strong>?
              Esta acción no se puede deshacer.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPorEliminar(null)}
                disabled={eliminando}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-brown/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEliminar}
                disabled={eliminando}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine-dark disabled:opacity-60"
              >
                {eliminando && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
