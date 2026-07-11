"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { aNombrePropio, onChangeSoloDigitos } from "@/lib/format";
import { tieneAccesoAdministrativo } from "@/lib/auth";
import {
  actualizarUsuario,
  crearUsuario,
  eliminarUsuario,
  listarUsuarios,
  CATALOGO_PERMISOS,
  ROLES_SUGERIDOS,
  type Usuario,
} from "@/lib/usuarios";
import {
  listarPuntosVenta,
  puntosDeUsuarioIds,
  asignarPuntosAUsuario,
  type PuntoVenta,
} from "@/lib/puntos-venta";

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

/** Pasos del asistente de administración de usuarios. */
const PASOS_WIZARD = ["Datos", "Permisos", "Puntos de venta"] as const;

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Estado del asistente (wizard) de 3 pasos: datos -> permisos -> puntos.
  const [wizardAbierto, setWizardAbierto] = useState(false);
  const [paso, setPaso] = useState(0);
  const [editando, setEditando] = useState<Usuario | null>(null);
  // Usuario ya creado/actualizado (tiene id); necesario para permisos y puntos.
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [permisos, setPermisos] = useState<string[]>([]);
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [puntosSel, setPuntosSel] = useState<string[]>([]);
  const [buscarPunto, setBuscarPunto] = useState("");
  // Combobox "Copiar permisos de" (paso de permisos).
  const [buscarCopiar, setBuscarCopiar] = useState("");
  const [copiarAbierto, setCopiarAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  // Estado del modal de confirmación de borrado
  const [porEliminar, setPorEliminar] = useState<Usuario | null>(null);
  const [eliminando, setEliminando] = useState(false);

  // Búsqueda de la tabla de usuarios.
  const [busqueda, setBusqueda] = useState("");

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

  // Carga la lista de puntos de venta una vez (para el paso 3 del asistente).
  useEffect(() => {
    listarPuntosVenta()
      .then(setPuntos)
      .catch(() => {});
  }, []);

  const accesoTotal = usuarioActual
    ? tieneAccesoAdministrativo(usuarioActual.rol)
    : tieneAccesoAdministrativo(form.rol);

  function abrirCrear() {
    setEditando(null);
    setUsuarioActual(null);
    setForm(FORM_VACIO);
    setPermisos([]);
    setPuntosSel([]);
    setBuscarPunto("");
    setBuscarCopiar("");
    setCopiarAbierto(false);
    setPaso(0);
    setErrorForm(null);
    setWizardAbierto(true);
  }

  async function abrirEditar(u: Usuario) {
    setEditando(u);
    setUsuarioActual(u);
    setForm({
      cedula: u.cedula,
      nombre: u.nombre,
      rol: u.rol,
      password: "",
      activo: u.activo,
    });
    setPermisos(u.permisos ?? []);
    setPuntosSel([]);
    setBuscarPunto("");
    setPaso(0);
    setErrorForm(null);
    setWizardAbierto(true);
    // Carga los puntos ya asignados a este usuario.
    try {
      setPuntosSel(await puntosDeUsuarioIds(u.id));
    } catch {
      /* si falla, queda sin preselección */
    }
  }

  function cerrarWizard() {
    if (guardando) return;
    setWizardAbierto(false);
  }

  // Paso 1: crea o actualiza los datos del usuario y avanza a permisos.
  async function guardarDatos(e: React.FormEvent) {
    e.preventDefault();
    setErrorForm(null);
    setGuardando(true);
    try {
      let u: Usuario;
      if (usuarioActual) {
        u = await actualizarUsuario(usuarioActual.id, {
          cedula: form.cedula.trim(),
          nombre: form.nombre.trim(),
          rol: form.rol.trim(),
          activo: form.activo,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        u = await crearUsuario({
          cedula: form.cedula.trim(),
          nombre: form.nombre.trim(),
          rol: form.rol.trim(),
          password: form.password,
          activo: form.activo,
        });
        setPermisos(u.permisos ?? []);
      }
      setUsuarioActual(u);
      await cargar();
      setPaso(1);
    } catch (e) {
      setErrorForm(
        e instanceof ApiError ? e.message : "No se pudo guardar el usuario",
      );
    } finally {
      setGuardando(false);
    }
  }

  // Paso 2: guarda los permisos y avanza a puntos de venta.
  async function guardarPermisos() {
    if (!usuarioActual) return;
    setErrorForm(null);
    setGuardando(true);
    try {
      const u = await actualizarUsuario(usuarioActual.id, { permisos });
      setUsuarioActual(u);
      await cargar();
      setPaso(2);
    } catch (e) {
      setErrorForm(
        e instanceof ApiError ? e.message : "No se pudieron guardar los permisos",
      );
    } finally {
      setGuardando(false);
    }
  }

  // Paso 3: guarda los puntos de venta asignados y cierra el asistente.
  async function guardarPuntos() {
    if (!usuarioActual) return;
    setErrorForm(null);
    setGuardando(true);
    try {
      await asignarPuntosAUsuario(usuarioActual.id, puntosSel);
      setWizardAbierto(false);
      await cargar();
    } catch (e) {
      setErrorForm(
        e instanceof ApiError
          ? e.message
          : "No se pudieron guardar los puntos de venta",
      );
    } finally {
      setGuardando(false);
    }
  }

  // Activa/desactiva un módulo. Al desactivarlo, quita también sus acciones.
  function alternarModulo(key: string, acciones: string[]) {
    setPermisos((prev) => {
      if (prev.includes(key)) {
        return prev.filter((p) => p !== key && !acciones.includes(p));
      }
      return [...prev, key];
    });
  }

  // Activa/desactiva una acción. Al activarla, garantiza el acceso al módulo.
  function alternarAccion(accionKey: string, moduloKey: string) {
    setPermisos((prev) => {
      if (prev.includes(accionKey)) {
        return prev.filter((p) => p !== accionKey);
      }
      const set = new Set(prev);
      set.add(accionKey);
      set.add(moduloKey);
      return Array.from(set);
    });
  }

  function alternarPunto(id: string) {
    setPuntosSel((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // Usuarios filtrados por la búsqueda y ordenados alfabéticamente por nombre.
  const usuariosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = q
      ? usuarios.filter(
          (u) =>
            u.nombre.toLowerCase().includes(q) ||
            u.cedula.toLowerCase().includes(q) ||
            u.rol.toLowerCase().includes(q),
        )
      : usuarios;
    return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [usuarios, busqueda]);

  const puntosFiltrados = useMemo(() => {
    const q = buscarPunto.trim().toLowerCase();
    if (!q) return puntos;
    return puntos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.codigo ?? "").toLowerCase().includes(q) ||
        (p.ciudad ?? "").toLowerCase().includes(q),
    );
  }, [puntos, buscarPunto]);

  // Usuarios candidatos para copiar permisos (excluye el actual y los de acceso total).
  const candidatosCopiar = useMemo(() => {
    const q = buscarCopiar.trim().toLowerCase();
    return usuarios
      .filter(
        (u) => u.id !== usuarioActual?.id && !tieneAccesoAdministrativo(u.rol),
      )
      .filter(
        (u) =>
          !q ||
          u.nombre.toLowerCase().includes(q) ||
          u.cedula.toLowerCase().includes(q) ||
          u.rol.toLowerCase().includes(q),
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      .slice(0, 50);
  }, [usuarios, buscarCopiar, usuarioActual]);

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
            Administración de usuarios
          </h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Crea un usuario y, en el mismo asistente, define sus permisos y sus
            puntos de venta.
          </p>
        </div>
        <button
          onClick={abrirCrear}
          title="Crear un nuevo usuario"
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

      {/* Buscador */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, cédula o rol"
            className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-3 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
          />
        </div>
        <span className="text-xs text-brand-brown/50">
          {usuariosFiltrados.length} de {usuarios.length}
        </span>
      </div>

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
        ) : usuariosFiltrados.length === 0 ? (
          <div className="py-16 text-center text-sm text-brand-brown/60">
            No se encontraron usuarios.
          </div>
        ) : (
          <div className="max-h-[calc(100vh-320px)] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-brand-brown/10 bg-brand-cream-soft text-xs uppercase tracking-wide text-brand-brown/60 shadow-sm">
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
                {usuariosFiltrados.map((u) => (
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

      {/* ---------- Asistente (wizard) de administración de usuarios ---------- */}
      {wizardAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm"
            onClick={cerrarWizard}
          />
          <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Encabezado + pasos */}
            <div className="border-b border-brand-brown/10 px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-xl font-bold text-brand-wine">
                    {editando ? "Editar usuario" : "Nuevo usuario"}
                  </h2>
                  <p className="mt-0.5 text-sm text-brand-brown/60">
                    {usuarioActual
                      ? usuarioActual.nombre
                      : "Completa los datos para registrar un usuario."}
                  </p>
                </div>
                <button
                  onClick={cerrarWizard}
                  title="Cerrar"
                  className="rounded-lg p-1.5 text-brand-brown/50 transition hover:bg-brand-cream-soft hover:text-brand-brown"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 flex items-center gap-2">
                {PASOS_WIZARD.map((etiqueta, i) => (
                  <div key={etiqueta} className="flex flex-1 items-center gap-2">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                        i < paso
                          ? "bg-green-500 text-white"
                          : i === paso
                            ? "bg-brand-wine text-white"
                            : "bg-brand-brown/10 text-brand-brown/50"
                      }`}
                    >
                      {i < paso ? "✓" : i + 1}
                    </div>
                    <span
                      className={`whitespace-nowrap text-xs font-semibold ${
                        i === paso ? "text-brand-wine" : "text-brand-brown/50"
                      }`}
                    >
                      {etiqueta}
                    </span>
                    {i < PASOS_WIZARD.length - 1 && (
                      <div className="h-px flex-1 bg-brand-brown/15" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {errorForm && (
              <div className="mx-6 mt-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-2.5 text-sm text-brand-wine">
                {errorForm}
              </div>
            )}

            {/* Cuerpo por paso */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* Paso 1: datos */}
              {paso === 0 && (
                <form id="form-datos-usuario" onSubmit={guardarDatos} className="space-y-4">
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
                      onChange={onChangeSoloDigitos((v) => setForm({ ...form, cedula: v }))}
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
                      {usuarioActual && (
                        <span className="font-normal text-brand-brown/50">
                          (dejar vacío para no cambiarla)
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      required={!usuarioActual}
                      minLength={6}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder={usuarioActual ? "••••••••" : "Mínimo 6 caracteres"}
                      className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                    />
                  </div>

                  <label className="flex items-center gap-2.5 text-sm font-medium text-brand-brown">
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                      className="h-4 w-4 rounded border-brand-brown/30 text-brand-amber focus:ring-brand-amber/30"
                    />
                    Usuario activo
                  </label>
                </form>
              )}

              {/* Paso 2: permisos */}
              {paso === 1 && (
                <div>
                  {accesoTotal ? (
                    <p className="rounded-xl bg-brand-amber/10 px-4 py-3 text-sm text-brand-brown/80">
                      El rol{" "}
                      <strong className="capitalize">{form.rol || usuarioActual?.rol}</strong>{" "}
                      tiene acceso total a todos los módulos. No necesita permisos
                      individuales.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {/* Copiar permisos de otro usuario (buscador) */}
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-brown/10 bg-brand-cream-soft/40 px-3 py-2.5">
                        <span className="text-sm font-medium text-brand-brown">
                          Copiar permisos de:
                        </span>
                        <div className="relative min-w-[220px] flex-1">
                          <input
                            type="text"
                            value={buscarCopiar}
                            onChange={(e) => {
                              setBuscarCopiar(e.target.value);
                              setCopiarAbierto(true);
                            }}
                            onFocus={() => setCopiarAbierto(true)}
                            onBlur={() => setTimeout(() => setCopiarAbierto(false), 150)}
                            placeholder="Buscar usuario por nombre, cédula o rol…"
                            className="w-full rounded-lg border border-brand-brown/15 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-amber"
                          />
                          {copiarAbierto && (
                            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-brand-brown/15 bg-white shadow-lg">
                              {candidatosCopiar.length === 0 ? (
                                <p className="px-3 py-2 text-sm text-brand-brown/50">
                                  Sin resultados.
                                </p>
                              ) : (
                                candidatosCopiar.map((u) => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      setPermisos([...(u.permisos ?? [])]);
                                      setBuscarCopiar(u.nombre);
                                      setCopiarAbierto(false);
                                    }}
                                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-brand-cream-soft"
                                  >
                                    <span className="text-brand-black">{u.nombre}</span>
                                    <span className="text-xs capitalize text-brand-brown/50">
                                      {u.rol}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                        {permisos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPermisos([])}
                            title="Quitar todos los permisos"
                            className="rounded-lg border border-brand-brown/20 px-3 py-2 text-xs font-semibold text-brand-brown transition hover:bg-white"
                          >
                            Limpiar
                          </button>
                        )}
                      </div>

                      {CATALOGO_PERMISOS.map((apartado) => (
                        <div key={apartado.key}>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-wine/70">
                            {apartado.label}
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {apartado.modulos.map((modulo) => {
                              const accionKeys = (modulo.acciones ?? []).map((a) => a.key);
                              const moduloActivo = permisos.includes(modulo.key);
                              return (
                                <div key={modulo.key} className="rounded-lg border border-brand-brown/10 bg-brand-cream-soft/40 p-3">
                                  <label className="flex items-center gap-2.5 text-sm font-semibold text-brand-black">
                                    <input
                                      type="checkbox"
                                      checked={moduloActivo}
                                      onChange={() => alternarModulo(modulo.key, accionKeys)}
                                      className="h-4 w-4 rounded border-brand-brown/30 text-brand-amber focus:ring-brand-amber/30"
                                    />
                                    {modulo.label}
                                    <span className="text-xs font-normal text-brand-brown/50">
                                      (ver / navegar)
                                    </span>
                                  </label>
                                  {(modulo.acciones?.length ?? 0) > 0 && (
                                    <div className="mt-2 grid gap-1.5 pl-6">
                                      {modulo.acciones!.map((accion) => (
                                        <label
                                          key={accion.key}
                                          className={`flex items-center gap-2 text-sm ${
                                            moduloActivo ? "text-brand-black" : "text-brand-brown/40"
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={permisos.includes(accion.key)}
                                            onChange={() => alternarAccion(accion.key, modulo.key)}
                                            className="h-4 w-4 rounded border-brand-brown/30 text-brand-amber focus:ring-brand-amber/30"
                                          />
                                          {accion.label}
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Paso 3: puntos de venta */}
              {paso === 2 && (
                <div>
                  <p className="mb-3 text-sm text-brand-brown/70">
                    Selecciona los puntos de venta donde trabajará este usuario.
                  </p>
                  <input
                    type="text"
                    value={buscarPunto}
                    onChange={(e) => setBuscarPunto(e.target.value)}
                    placeholder="Buscar por nombre, código o ciudad…"
                    className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2.5 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
                  />
                  <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-brand-brown/10 bg-brand-cream-soft/60 p-3">
                    {puntosFiltrados.length === 0 ? (
                      <p className="py-6 text-center text-sm text-brand-brown/60">
                        {puntos.length === 0 ? "No hay puntos de venta." : "Sin resultados."}
                      </p>
                    ) : (
                      puntosFiltrados.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-brand-black hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={puntosSel.includes(String(p.id))}
                            onChange={() => alternarPunto(String(p.id))}
                            className="h-4 w-4 rounded border-brand-brown/30 text-brand-amber focus:ring-brand-amber/30"
                          />
                          <span className="flex-1">{p.nombre}</span>
                          <span className="text-xs text-brand-brown/50">
                            {p.codigo ?? p.ciudad ?? ""}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="mt-2 text-xs text-brand-brown/50">
                    {puntosSel.length} punto(s) seleccionado(s)
                  </p>
                </div>
              )}
            </div>

            {/* Pie con navegación */}
            <div className="flex items-center justify-between border-t border-brand-brown/10 px-6 py-4">
              <button
                type="button"
                onClick={() => (paso === 0 ? cerrarWizard() : setPaso((p) => p - 1))}
                disabled={guardando}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-brown/5 disabled:opacity-50"
              >
                {paso === 0 ? "Cancelar" : "Atrás"}
              </button>
              {paso === 0 ? (
                <button
                  type="submit"
                  form="form-datos-usuario"
                  disabled={guardando}
                  title="Guardar datos y continuar a permisos"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-amber-light disabled:opacity-60"
                >
                  {guardando && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  Continuar
                </button>
              ) : paso === 1 ? (
                <button
                  type="button"
                  onClick={guardarPermisos}
                  disabled={guardando}
                  title="Guardar permisos y continuar a puntos de venta"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-amber-light disabled:opacity-60"
                >
                  {guardando && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  Continuar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={guardarPuntos}
                  disabled={guardando}
                  title="Guardar los puntos de venta y finalizar"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine-dark disabled:opacity-60"
                >
                  {guardando && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  Finalizar
                </button>
              )}
            </div>
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
                title="Cancelar"
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-brown/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEliminar}
                disabled={eliminando}
                title="Eliminar el usuario"
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
