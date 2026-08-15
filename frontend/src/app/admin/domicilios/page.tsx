"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import MapaDireccion from "@/components/MapaDireccion";
import {
  actualizarPuntoVenta,
  calcularValorDomicilio,
  listarPuntosVenta,
  type PuntoVenta,
} from "@/lib/puntos-venta";

const fmtMoneda = (n: number) => "$ " + Math.round(n || 0).toLocaleString("es-CO");

interface FormState {
  direccion: string;
  barrio: string;
  ciudad: string;
  lat: number | null;
  lng: number | null;
  dom_km_base: string;
  dom_valor_base: string;
  dom_valor_km: string;
  dom_gratis_desde: string;
  dom_gratis_margen: string;
}

export default function AdminDomiciliosPage() {
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [editando, setEditando] = useState<PuntoVenta | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

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

  function abrir(p: PuntoVenta) {
    setEditando(p);
    setErrorForm(null);
    setForm({
      direccion: p.direccion ?? "",
      barrio: p.barrio ?? "",
      ciudad: p.ciudad ?? "",
      lat: p.lat,
      lng: p.lng,
      dom_km_base: String(p.dom_km_base ?? 4),
      dom_valor_base: String(p.dom_valor_base ?? 4000),
      dom_valor_km: String(p.dom_valor_km ?? 1000),
      dom_gratis_desde: String(p.dom_gratis_desde ?? 225000),
      dom_gratis_margen: String(p.dom_gratis_margen ?? 3000),
    });
  }

  function cerrar() {
    if (guardando) return;
    setEditando(null);
    setForm(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!editando || !form) return;
    setErrorForm(null);

    const kmBase = Number(form.dom_km_base);
    const valorBase = Number(form.dom_valor_base);
    const valorKm = Number(form.dom_valor_km);
    const gratisDesde = Number(form.dom_gratis_desde);
    const gratisMargen = Number(form.dom_gratis_margen);

    if (
      [kmBase, valorBase, valorKm, gratisDesde, gratisMargen].some(
        (n) => !Number.isFinite(n) || n < 0,
      )
    ) {
      setErrorForm("Los valores de la tarifa deben ser números válidos (≥ 0).");
      return;
    }
    if (form.lat == null || form.lng == null) {
      setErrorForm("Debes ubicar el punto de venta en el mapa.");
      return;
    }

    setGuardando(true);
    try {
      const actualizado = await actualizarPuntoVenta(editando.id, {
        direccion: form.direccion.trim() || undefined,
        barrio: form.barrio.trim() || undefined,
        ciudad: form.ciudad.trim() || undefined,
        lat: form.lat,
        lng: form.lng,
        dom_km_base: Math.round(kmBase),
        dom_valor_base: Math.round(valorBase),
        dom_valor_km: Math.round(valorKm),
        dom_gratis_desde: Math.round(gratisDesde),
        dom_gratis_margen: Math.round(gratisMargen),
      });
      setPuntos((prev) =>
        prev.map((p) => (p.id === actualizado.id ? { ...p, ...actualizado } : p)),
      );
      cerrar();
    } catch (err) {
      setErrorForm(
        err instanceof ApiError ? err.message : "No se pudo guardar la tarifa.",
      );
    } finally {
      setGuardando(false);
    }
  }

  // Vista previa del cálculo con la tarifa actual del formulario.
  const preview = form
    ? {
        km5: calcularValorDomicilio(
          {
            dom_km_base: Number(form.dom_km_base) || 0,
            dom_valor_base: Number(form.dom_valor_base) || 0,
            dom_valor_km: Number(form.dom_valor_km) || 0,
          } as PuntoVenta,
          5,
        ),
        km8: calcularValorDomicilio(
          {
            dom_km_base: Number(form.dom_km_base) || 0,
            dom_valor_base: Number(form.dom_valor_base) || 0,
            dom_valor_km: Number(form.dom_valor_km) || 0,
          } as PuntoVenta,
          8,
        ),
      }
    : null;

  // Filtra los puntos por nombre, código o dirección.
  const puntosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return puntos;
    return puntos.filter((p) =>
      [p.nombre, p.codigo, p.direccion, p.barrio, p.ciudad]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [puntos, busqueda]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">
          Valor domicilio
        </h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Ubica cada punto de venta en el mapa y configura su tarifa de
          domicilio. El sistema usa estas coordenadas para sugerir el punto más
          cercano y calcular el valor del domicilio por distancia.
        </p>
      </div>

      {errorCarga && (
        <div className="mb-4 rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-3 text-sm text-brand-wine">
          {errorCarga}
        </div>
      )}

      {!cargando && puntos.length > 0 && (
        <div className="relative mb-4 max-w-md">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
          </svg>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar punto por nombre, código o dirección"
            className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-brand-amber"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              title="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-brand-brown/40 transition hover:bg-brand-cream-soft hover:text-brand-wine"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
        </div>
      ) : puntos.length === 0 ? (
        <div className="rounded-2xl border border-brand-brown/10 bg-white py-16 text-center text-sm text-brand-brown/60 shadow-sm">
          No hay puntos de venta registrados.
        </div>
      ) : puntosFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-brand-brown/10 bg-white py-16 text-center text-sm text-brand-brown/60 shadow-sm">
          No se encontraron puntos que coincidan con “{busqueda}”.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {puntosFiltrados.map((p) => {
            const configurado = p.lat != null && p.lng != null;
            return (
              <div
                key={p.id}
                className="flex flex-col rounded-2xl border border-brand-brown/10 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-serif text-lg font-bold text-brand-wine">
                      {p.nombre}
                    </h2>
                    {p.codigo && (
                      <p className="font-mono text-xs text-brand-brown/60">
                        {p.codigo}
                      </p>
                    )}
                  </div>
                  {configurado ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      Ubicado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Sin ubicar
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm text-brand-brown/70">
                  {p.direccion || "Sin dirección"}
                </p>

                <dl className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-brand-brown/60">Base ({p.dom_km_base} km)</dt>
                    <dd className="font-medium text-brand-black">
                      {fmtMoneda(p.dom_valor_base)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-brown/60">Km adicional</dt>
                    <dd className="font-medium text-brand-black">
                      {fmtMoneda(p.dom_valor_km)}
                    </dd>
                  </div>
                </dl>

                <button
                  onClick={() => abrir(p)}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber-light"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  Configurar domicilio
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Modal configurar ---------- */}
      {editando && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm"
            onClick={cerrar}
          />
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
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
              {editando.nombre}
            </h2>
            <p className="mt-1 text-sm text-brand-brown/70">
              Ubica el punto y define la tarifa de domicilio.
            </p>

            <form onSubmit={guardar} className="mt-4">
              <div className="grid gap-5 md:grid-cols-2">
                {/* Columna izquierda: ubicación */}
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-brown">
                      Dirección del punto
                    </label>
                    <input
                      type="text"
                      value={form.direccion}
                      onChange={(e) =>
                        setForm((f) => (f ? { ...f, direccion: e.target.value } : f))
                      }
                      className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/20"
                      placeholder="Ej: Calle 10 # 20-30"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-brand-brown">
                        Barrio
                      </label>
                      <input
                        type="text"
                        value={form.barrio}
                        onChange={(e) =>
                          setForm((f) => (f ? { ...f, barrio: e.target.value } : f))
                        }
                        className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/20"
                        placeholder="Opcional"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-brand-brown">
                        Ciudad
                      </label>
                      <input
                        type="text"
                        value={form.ciudad}
                        onChange={(e) =>
                          setForm((f) => (f ? { ...f, ciudad: e.target.value } : f))
                        }
                        className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/20"
                        placeholder="Ej: Barranquilla"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-brand-brown">
                      Ubicación en el mapa
                    </label>
                    <p className="mb-1.5 text-xs text-brand-brown/60">
                      Escribe la ciudad y usa “Ver sugerencias” para ubicar el
                      punto con precisión. La ubicación en el mapa es la que se
                      usa para calcular el domicilio.
                    </p>
                    <MapaDireccion
                      direccion={form.direccion}
                      barrio={form.barrio}
                      ciudad={form.ciudad}
                      lat={form.lat}
                      lng={form.lng}
                      onUbicacion={(lat, lng) =>
                        setForm((f) => (f ? { ...f, lat, lng } : f))
                      }
                      onBarrio={(b) =>
                        setForm((f) => (f ? { ...f, barrio: b } : f))
                      }
                      onCiudad={(c) =>
                        setForm((f) => (f ? { ...f, ciudad: c } : f))
                      }
                    />
                  </div>
                </div>

                {/* Columna derecha: tarifa */}
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-brand-brown">
                        Km incluidos
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.dom_km_base}
                        onChange={(e) =>
                          setForm((f) =>
                            f ? { ...f, dom_km_base: e.target.value } : f,
                          )
                        }
                        className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-brand-brown">
                        Valor base
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.dom_valor_base}
                        onChange={(e) =>
                          setForm((f) =>
                            f ? { ...f, dom_valor_base: e.target.value } : f,
                          )
                        }
                        className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-brand-brown">
                        Km adicional
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.dom_valor_km}
                        onChange={(e) =>
                          setForm((f) =>
                            f ? { ...f, dom_valor_km: e.target.value } : f,
                          )
                        }
                        className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-brand-brown">
                        Domicilio gratis desde
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.dom_gratis_desde}
                        onChange={(e) =>
                          setForm((f) =>
                            f ? { ...f, dom_gratis_desde: e.target.value } : f,
                          )
                        }
                        placeholder="0 = sin gratis"
                        className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-brand-brown">
                        Margen de error
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.dom_gratis_margen}
                        onChange={(e) =>
                          setForm((f) =>
                            f ? { ...f, dom_gratis_margen: e.target.value } : f,
                          )
                        }
                        className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-amber focus:ring-2 focus:ring-brand-amber/20"
                      />
                    </div>
                  </div>

                  {Number(form.dom_gratis_desde) > 0 && (
                    <p className="rounded-xl bg-green-50 px-3 py-2.5 text-xs text-green-700">
                      El domicilio será <strong>gratis</strong> cuando el valor
                      del pedido alcance{" "}
                      {fmtMoneda(
                        Math.max(
                          0,
                          (Number(form.dom_gratis_desde) || 0) -
                            (Number(form.dom_gratis_margen) || 0),
                        ),
                      )}{" "}
                      (umbral {fmtMoneda(Number(form.dom_gratis_desde) || 0)} con
                      margen de {fmtMoneda(Number(form.dom_gratis_margen) || 0)}).
                    </p>
                  )}

                  <p className="rounded-xl bg-brand-cream-soft px-3 py-2.5 text-xs text-brand-brown/70">
                    El valor base cubre los primeros {form.dom_km_base || 0} km.
                    Cada km adicional suma{" "}
                    {fmtMoneda(Number(form.dom_valor_km) || 0)}.
                    {preview && (
                      <>
                        <br />
                        Ejemplo: 5 km → {fmtMoneda(preview.km5)} · 8 km →{" "}
                        {fmtMoneda(preview.km8)}
                      </>
                    )}
                  </p>

                  {errorForm && (
                    <div className="rounded-xl border border-brand-wine/30 bg-brand-wine/10 px-4 py-3 text-sm text-brand-wine">
                      {errorForm}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
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
