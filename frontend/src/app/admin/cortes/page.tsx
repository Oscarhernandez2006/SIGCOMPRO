"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  obtenerTiposCorte,
  guardarTiposCorte,
  invalidarCacheCortes,
} from "@/lib/configuracion";

export default function AdminTiposCortePage() {
  const [cortes, setCortes] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [nuevoCorte, setNuevoCorte] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editValor, setEditValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setErrorCarga(null);
    obtenerTiposCorte()
      .then((cs) => setCortes(cs ?? []))
      .catch((e) =>
        setErrorCarga(
          e instanceof ApiError
            ? e.message
            : "No se pudieron cargar los tipos de corte",
        ),
      )
      .finally(() => setCargando(false));
  }, []);

  // Persiste la lista (guardado optimista, ordenada) e invalida la caché.
  async function persistir(nueva: string[]) {
    const ordenada = [...nueva].sort((a, b) => a.localeCompare(b, "es"));
    setCortes(ordenada);
    setGuardando(true);
    setError(null);
    try {
      const g = await guardarTiposCorte(ordenada);
      setCortes(g ?? []);
      invalidarCacheCortes();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "No se pudo guardar el cambio",
      );
    } finally {
      setGuardando(false);
    }
  }

  function agregar() {
    const limpio = nuevoCorte.trim();
    if (!limpio) return;
    if (cortes.some((c) => c.toLowerCase() === limpio.toLowerCase())) {
      setError("Ese tipo de corte ya existe.");
      return;
    }
    persistir([...cortes, limpio]);
    setNuevoCorte("");
  }

  function guardarEdicion() {
    if (editIdx === null) return;
    const limpio = editValor.trim();
    if (!limpio) return;
    const dup = cortes.some(
      (c, i) => i !== editIdx && c.toLowerCase() === limpio.toLowerCase(),
    );
    if (dup) {
      setError("Ese tipo de corte ya existe.");
      return;
    }
    persistir(cortes.map((c, i) => (i === editIdx ? limpio : c)));
    setEditIdx(null);
    setEditValor("");
  }

  function eliminar(idx: number) {
    if (!confirm(`¿Eliminar el tipo de corte “${cortes[idx]}”?`)) return;
    persistir(cortes.filter((_, i) => i !== idx));
    if (editIdx === idx) {
      setEditIdx(null);
      setEditValor("");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">
            Tipos de corte
          </h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Opciones que aparecen en el selector de corte al porcionar un
            producto en el pedido.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {guardando && (
            <span className="text-xs font-medium text-brand-brown/60">
              Guardando…
            </span>
          )}
          {error && (
            <span className="text-xs font-semibold text-red-600">{error}</span>
          )}
        </div>
      </div>

      {errorCarga && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorCarga}
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-brand-brown/60">Cargando…</p>
      ) : (
        <div className="max-w-2xl overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
          {/* Agregar nuevo corte */}
          <div className="flex items-center gap-2 border-b border-brand-brown/10 bg-brand-cream-soft/40 px-4 py-3">
            <input
              type="text"
              value={nuevoCorte}
              onChange={(e) => {
                setNuevoCorte(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") agregar();
              }}
              placeholder="Nuevo tipo de corte (ej. Mariposa)"
              className="min-w-[200px] flex-1 rounded-xl border border-brand-brown/15 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
            />
            <button
              onClick={agregar}
              title="Agregar el tipo de corte"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
              Agregar
            </button>
          </div>

          {cortes.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-brand-brown/50">
              Aún no hay tipos de corte. Agrega el primero arriba.
            </p>
          ) : (
            <ul className="divide-y divide-brand-brown/5">
              {cortes.map((c, idx) => (
                <li
                  key={`${c}-${idx}`}
                  className="flex items-center gap-2 px-4 py-2.5 hover:bg-brand-cream-soft/40"
                >
                  {editIdx === idx ? (
                    <>
                      <input
                        type="text"
                        value={editValor}
                        onChange={(e) => {
                          setEditValor(e.target.value);
                          setError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") guardarEdicion();
                          if (e.key === "Escape") {
                            setEditIdx(null);
                            setEditValor("");
                          }
                        }}
                        autoFocus
                        className="min-w-[180px] flex-1 rounded-lg border border-brand-brown/15 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-amber"
                      />
                      <button
                        onClick={guardarEdicion}
                        title="Guardar"
                        className="rounded-lg bg-brand-wine px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-wine/90"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => {
                          setEditIdx(null);
                          setEditValor("");
                        }}
                        title="Cancelar"
                        className="rounded-lg border border-brand-brown/20 px-3 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium text-brand-black">
                        {c}
                      </span>
                      <button
                        onClick={() => {
                          setEditIdx(idx);
                          setEditValor(c);
                          setError(null);
                        }}
                        title={`Editar “${c}”`}
                        className="rounded-lg border border-brand-brown/20 px-3 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminar(idx)}
                        title={`Eliminar “${c}”`}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
