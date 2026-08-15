"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { tieneAccesoAdministrativo } from "@/lib/auth";
import {
  actualizarUsuario,
  CATALOGO_PERMISOS,
  listarUsuarios,
  type Usuario,
} from "@/lib/usuarios";

export default function AdminPermisosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Usuario seleccionado y su set de permisos en edición.
  const [seleccionado, setSeleccionado] = useState<Usuario | null>(null);
  const [permisos, setPermisos] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);

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

  function seleccionar(u: Usuario) {
    setSeleccionado(u);
    setPermisos(u.permisos ?? []);
    setErrorForm(null);
    setGuardadoOk(false);
  }

  const accesoTotal = seleccionado
    ? tieneAccesoAdministrativo(seleccionado.rol)
    : false;

  // Activa/desactiva un módulo. Al desactivarlo, quita también sus acciones.
  function alternarModulo(key: string, acciones: string[]) {
    setGuardadoOk(false);
    setPermisos((prev) => {
      if (prev.includes(key)) {
        return prev.filter((p) => p !== key && !acciones.includes(p));
      }
      return [...prev, key];
    });
  }

  // Activa/desactiva una acción. Al activarla, garantiza el acceso al módulo.
  function alternarAccion(accionKey: string, moduloKey: string) {
    setGuardadoOk(false);
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

  async function guardar() {
    if (!seleccionado) return;
    setErrorForm(null);
    setGuardando(true);
    try {
      const actualizado = await actualizarUsuario(seleccionado.id, {
        permisos,
      });
      setUsuarios((prev) =>
        prev.map((u) => (u.id === actualizado.id ? actualizado : u)),
      );
      setSeleccionado(actualizado);
      setPermisos(actualizado.permisos ?? []);
      setGuardadoOk(true);
    } catch (e) {
      setErrorForm(
        e instanceof ApiError ? e.message : "No se pudieron guardar los permisos",
      );
    } finally {
      setGuardando(false);
    }
  }

  const usuariosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(
      (u) =>
        u.nombre.toLowerCase().includes(q) ||
        u.cedula.toLowerCase().includes(q) ||
        u.rol.toLowerCase().includes(q),
    );
  }, [usuarios, busqueda]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">Permisos</h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Selecciona un usuario y define los módulos que puede ver y las acciones
          que puede realizar.
        </p>
      </div>

      {errorCarga && (
        <div className="mb-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-3 text-sm text-brand-wine">
          {errorCarga}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* ---------- Lista de usuarios ---------- */}
        <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
          <div className="border-b border-brand-brown/10 p-3">
            <div className="relative">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar usuario…"
                className="w-full rounded-xl border border-brand-brown/15 bg-brand-cream-soft px-3 py-2 pr-9 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/30"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda("")}
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-brand-brown/40 transition hover:bg-brand-cream-soft hover:text-brand-wine"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          {cargando ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
            </div>
          ) : usuariosFiltrados.length === 0 ? (
            <div className="py-16 text-center text-sm text-brand-brown/60">
              No hay usuarios.
            </div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-brand-brown/5 overflow-y-auto">
              {usuariosFiltrados.map((u) => {
                const activo = seleccionado?.id === u.id;
                return (
                  <li key={u.id}>
                    <button
                      onClick={() => seleccionar(u)}
                      title={`Gestionar permisos de ${u.nombre}`}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition ${
                        activo
                          ? "bg-brand-amber/10"
                          : "hover:bg-brand-cream-soft/60"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-brand-black">
                          {u.nombre}
                        </span>
                        <span className="block truncate text-xs capitalize text-brand-brown/60">
                          {u.rol || "sin rol"}
                        </span>
                      </span>
                      {tieneAccesoAdministrativo(u.rol) && (
                        <span className="shrink-0 rounded-full bg-brand-wine/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-wine">
                          Total
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ---------- Editor de permisos ---------- */}
        <div className="rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-sm">
          {!seleccionado ? (
            <div className="flex h-full min-h-[300px] items-center justify-center text-center text-sm text-brand-brown/60">
              Selecciona un usuario de la lista para gestionar sus permisos.
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-brand-brown/10 pb-4">
                <div>
                  <h2 className="font-serif text-xl font-bold text-brand-wine">
                    {seleccionado.nombre}
                  </h2>
                  <p className="text-sm capitalize text-brand-brown/60">
                    {seleccionado.rol || "sin rol"} · {seleccionado.cedula}
                  </p>
                </div>
                {!accesoTotal && (
                  <button
                    onClick={guardar}
                    disabled={guardando}
                    title="Guardar los permisos del usuario"
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-amber-light disabled:opacity-60"
                  >
                    {guardando && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    )}
                    Guardar permisos
                  </button>
                )}
              </div>

              {errorForm && (
                <div className="mb-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-2.5 text-sm text-brand-wine">
                  {errorForm}
                </div>
              )}
              {guardadoOk && (
                <div className="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-2.5 text-sm text-green-700">
                  Permisos actualizados correctamente.
                </div>
              )}

              {accesoTotal ? (
                <p className="rounded-xl bg-brand-amber/10 px-4 py-3 text-sm text-brand-brown/80">
                  El rol{" "}
                  <strong className="capitalize">{seleccionado.rol}</strong>{" "}
                  tiene acceso total a todos los módulos. No es necesario asignar
                  permisos manualmente.
                </p>
              ) : (
                <div className="space-y-4">
                  {CATALOGO_PERMISOS.map((apartado) => (
                    <div key={apartado.key}>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-wine/70">
                        {apartado.label}
                      </p>
                      <div className="space-y-3">
                        {apartado.modulos.map((modulo) => {
                          const accionKeys = (modulo.acciones ?? []).map(
                            (a) => a.key,
                          );
                          const moduloActivo = permisos.includes(modulo.key);
                          return (
                            <div
                              key={modulo.key}
                              className="rounded-lg border border-brand-brown/10 bg-brand-cream-soft/40 p-3"
                            >
                              <label className="flex items-center gap-2.5 text-sm font-semibold text-brand-black">
                                <input
                                  type="checkbox"
                                  checked={moduloActivo}
                                  onChange={() =>
                                    alternarModulo(modulo.key, accionKeys)
                                  }
                                  className="h-4 w-4 rounded border-brand-brown/30 text-brand-amber focus:ring-brand-amber/30"
                                />
                                {modulo.label}
                                <span className="text-xs font-normal text-brand-brown/50">
                                  (ver / navegar)
                                </span>
                              </label>
                              {(modulo.acciones?.length ?? 0) > 0 && (
                                <div className="mt-2 grid gap-1.5 pl-6 sm:grid-cols-2">
                                  {modulo.acciones!.map((accion) => (
                                    <label
                                      key={accion.key}
                                      className={`flex items-center gap-2 text-sm ${
                                        moduloActivo
                                          ? "text-brand-black"
                                          : "text-brand-brown/40"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={permisos.includes(accion.key)}
                                        onChange={() =>
                                          alternarAccion(accion.key, modulo.key)
                                        }
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
