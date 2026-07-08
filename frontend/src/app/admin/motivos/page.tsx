"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  actualizarMotivo,
  crearMotivo,
  eliminarMotivo,
  listarMotivos,
  type Motivo,
  type TipoMotivo,
} from "@/lib/motivos";

interface FormState {
  id: string | null;
  tipo: TipoMotivo;
  nombre: string;
  activo: boolean;
}

const TITULOS: Record<TipoMotivo, string> = {
  anular: "Motivos de anulación",
  cancelar: "Motivos de cancelación",
};

const DESCRIPCIONES: Record<TipoMotivo, string> = {
  anular: "Causas internas (errores de la televendedora).",
  cancelar: "Causas externas (el cliente no recibió el pedido / devolución).",
};

export default function AdminMotivosPage() {
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setMotivos(await listarMotivos());
    } catch (e) {
      setErrorCarga(
        e instanceof ApiError ? e.message : "No se pudieron cargar los motivos",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const porTipo = useMemo(
    () => ({
      anular: motivos.filter((m) => m.tipo === "anular"),
      cancelar: motivos.filter((m) => m.tipo === "cancelar"),
    }),
    [motivos],
  );

  function abrirNuevo(tipo: TipoMotivo) {
    setErrorForm(null);
    setForm({ id: null, tipo, nombre: "", activo: true });
  }

  function abrirEditar(m: Motivo) {
    setErrorForm(null);
    setForm({ id: m.id, tipo: m.tipo, nombre: m.nombre, activo: m.activo });
  }

  function cerrar() {
    if (guardando) return;
    setForm(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const nombre = form.nombre.trim();
    if (!nombre) {
      setErrorForm("Escribe el nombre del motivo.");
      return;
    }
    setGuardando(true);
    setErrorForm(null);
    try {
      if (form.id) {
        const act = await actualizarMotivo(form.id, {
          tipo: form.tipo,
          nombre,
          activo: form.activo,
        });
        setMotivos((prev) => prev.map((m) => (m.id === act.id ? act : m)));
      } else {
        const nuevo = await crearMotivo({
          tipo: form.tipo,
          nombre,
          activo: form.activo,
        });
        setMotivos((prev) => [...prev, nuevo]);
      }
      cerrar();
    } catch (err) {
      setErrorForm(
        err instanceof ApiError ? err.message : "No se pudo guardar el motivo.",
      );
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(m: Motivo) {
    try {
      const act = await actualizarMotivo(m.id, { activo: !m.activo });
      setMotivos((prev) => prev.map((x) => (x.id === act.id ? act : x)));
    } catch {
      /* si falla, no cambiamos el estado local */
    }
  }

  async function borrar(m: Motivo) {
    if (!confirm(`¿Eliminar el motivo "${m.nombre}"?`)) return;
    try {
      await eliminarMotivo(m.id);
      setMotivos((prev) => prev.filter((x) => x.id !== m.id));
    } catch (e) {
      alert(
        e instanceof ApiError ? e.message : "No se pudo eliminar el motivo.",
      );
    }
  }

  const acento = (tipo: TipoMotivo) =>
    tipo === "anular"
      ? { chip: "bg-red-100 text-red-700", boton: "bg-red-600 hover:bg-red-700" }
      : {
          chip: "bg-orange-100 text-orange-700",
          boton: "bg-orange-600 hover:bg-orange-700",
        };

  function Seccion({ tipo }: { tipo: TipoMotivo }) {
    const lista = porTipo[tipo];
    const c = acento(tipo);
    return (
      <div className="flex flex-col rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-serif text-lg font-bold text-brand-wine">
              {TITULOS[tipo]}
            </h2>
            <p className="mt-0.5 text-xs text-brand-brown/60">
              {DESCRIPCIONES[tipo]}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.chip}`}>
            {lista.length}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {lista.length === 0 ? (
            <p className="rounded-xl bg-brand-cream-soft px-3 py-3 text-center text-sm text-brand-brown/50">
              Sin motivos. Agrega el primero.
            </p>
          ) : (
            lista.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-brand-brown/10 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className={`truncate text-sm font-medium ${m.activo ? "text-brand-black" : "text-brand-brown/40 line-through"}`}>
                    {m.nombre}
                  </p>
                  {!m.activo && (
                    <p className="text-[11px] text-brand-brown/40">Inactivo</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => alternarActivo(m)}
                    title={m.activo ? "Desactivar" : "Activar"}
                    aria-label={m.activo ? "Desactivar" : "Activar"}
                    className={`rounded-lg border p-1.5 transition ${m.activo ? "border-green-200 text-green-600 hover:bg-green-50" : "border-brand-brown/15 text-brand-brown/40 hover:bg-brand-cream-soft"}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                      {m.activo ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      )}
                    </svg>
                  </button>
                  <button
                    onClick={() => abrirEditar(m)}
                    title="Editar motivo"
                    aria-label="Editar motivo"
                    className="rounded-lg border border-brand-brown/15 p-1.5 text-brand-wine transition hover:bg-brand-cream-soft"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  <button
                    onClick={() => borrar(m)}
                    title="Eliminar motivo"
                    aria-label="Eliminar motivo"
                    className="rounded-lg border border-red-200 p-1.5 text-red-600 transition hover:bg-red-50"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <button
          onClick={() => abrirNuevo(tipo)}
          className={`mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ${c.boton}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Agregar motivo
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">Motivos</h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Administra los motivos de anulación y cancelación de pedidos. Los
          motivos activos aparecen al anular o cancelar un pedido.
        </p>
      </div>

      {errorCarga && (
        <div className="mb-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-3 text-sm text-brand-wine">
          {errorCarga}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Seccion tipo="anular" />
          <Seccion tipo="cancelar" />
        </div>
      )}

      {/* ---------- Modal crear/editar ---------- */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm"
            onClick={cerrar}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={cerrar}
              disabled={guardando}
              aria-label="Cerrar"
              title="Cerrar"
              className="absolute right-4 top-4 rounded-lg p-1.5 text-brand-brown/50 transition hover:bg-brand-cream-soft hover:text-brand-brown disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="font-serif text-xl font-bold text-brand-wine">
              {form.id ? "Editar motivo" : "Nuevo motivo"}
            </h2>

            <form onSubmit={guardar} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-brown">
                  Tipo
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["anular", "cancelar"] as TipoMotivo[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => (f ? { ...f, tipo: t } : f))}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                        form.tipo === t
                          ? t === "anular"
                            ? "border-red-400 bg-red-50 text-red-700"
                            : "border-orange-400 bg-orange-50 text-orange-700"
                          : "border-brand-brown/15 text-brand-brown hover:bg-brand-cream-soft"
                      }`}
                    >
                      {t === "anular" ? "Anulación" : "Cancelación"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-brand-brown">
                  Nombre del motivo
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  autoFocus
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, nombre: e.target.value } : f))
                  }
                  className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/20"
                  placeholder="Ej: Pedido Doble"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-brown">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, activo: e.target.checked } : f))
                  }
                  className="h-4 w-4 accent-brand-amber"
                />
                Activo (visible al anular/cancelar)
              </label>

              {errorForm && (
                <div className="rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-3 text-sm text-brand-wine">
                  {errorForm}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={cerrar}
                  disabled={guardando}
                  className="rounded-xl border border-brand-brown/20 px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber-light disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
