"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  guardarPersonalDespachoPunto,
  obtenerPersonalDespachoPunto,
} from "@/lib/configuracion";
import { listarPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";

export default function AdminConfiguracionPage() {
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [puntoId, setPuntoId] = useState<string>("");
  const [porcionadores, setPorcionadores] = useState<string[]>([]);
  const [domiciliarios, setDomiciliarios] = useState<string[]>([]);
  const [cargandoPuntos, setCargandoPuntos] = useState(true);
  const [cargandoPersonal, setCargandoPersonal] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);

  // Carga los puntos de venta disponibles para seleccionar.
  useEffect(() => {
    setCargandoPuntos(true);
    setErrorCarga(null);
    listarPuntosVenta()
      .then((ps) => setPuntos(ps))
      .catch((e) =>
        setErrorCarga(
          e instanceof ApiError
            ? e.message
            : "No se pudieron cargar los puntos de venta",
        ),
      )
      .finally(() => setCargandoPuntos(false));
  }, []);

  // Carga el personal del punto seleccionado.
  const cargarPersonal = useCallback(async (id: string) => {
    if (!id) {
      setPorcionadores([]);
      setDomiciliarios([]);
      return;
    }
    setCargandoPersonal(true);
    setErrorCarga(null);
    setGuardadoOk(false);
    try {
      const datos = await obtenerPersonalDespachoPunto(id);
      setPorcionadores(datos.porcionadores ?? []);
      setDomiciliarios(datos.domiciliarios ?? []);
    } catch (e) {
      setErrorCarga(
        e instanceof ApiError
          ? e.message
          : "No se pudo cargar la configuración del punto",
      );
    } finally {
      setCargandoPersonal(false);
    }
  }, []);

  function seleccionarPunto(id: string) {
    setPuntoId(id);
    setErrorGuardar(null);
    setGuardadoOk(false);
    cargarPersonal(id);
  }

  async function guardar() {
    if (!puntoId) return;
    setErrorGuardar(null);
    setGuardadoOk(false);
    setGuardando(true);
    try {
      const datos = await guardarPersonalDespachoPunto(puntoId, {
        porcionadores,
        domiciliarios,
      });
      setPorcionadores(datos.porcionadores ?? []);
      setDomiciliarios(datos.domiciliarios ?? []);
      setGuardadoOk(true);
    } catch (e) {
      setErrorGuardar(
        e instanceof ApiError ? e.message : "No se pudo guardar la configuración",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">
          Configuración
        </h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Ajustes generales del sistema y de los módulos del panel operativo.
        </p>
      </div>

      <section className="rounded-2xl border border-brand-brown/15 bg-white p-6">
        <div className="mb-5">
          <h2 className="font-serif text-xl font-bold text-brand-wine">
            Selectores de despacho por punto de venta
          </h2>
          <p className="mt-1 text-sm text-brand-brown/70">
            Selecciona un punto de venta y administra sus{" "}
            <strong>Porcionadores</strong> y <strong>Domiciliarios</strong>. Cada
            punto tiene su propia lista: los usuarios de ese punto solo verán a su
            personal en el módulo de despacho.
          </p>
        </div>

        {/* Selector de punto de venta */}
        <div className="mb-6 max-w-md">
          <label className="mb-1 block text-sm font-semibold text-brand-brown">
            Punto de venta
          </label>
          <select
            value={puntoId}
            onChange={(e) => seleccionarPunto(e.target.value)}
            disabled={cargandoPuntos}
            className="w-full rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm text-brand-brown outline-none focus:border-brand-wine disabled:opacity-60"
          >
            <option value="">
              {cargandoPuntos ? "Cargando puntos…" : "Selecciona un punto de venta"}
            </option>
            {puntos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.codigo ? ` (${p.codigo})` : ""}
              </option>
            ))}
          </select>
        </div>

        {errorCarga && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorCarga}
          </div>
        )}

        {!puntoId ? (
          <p className="rounded-xl border border-dashed border-brand-brown/20 bg-brand-cream/20 px-4 py-8 text-center text-sm text-brand-brown/60">
            Selecciona un punto de venta para configurar su personal de despacho.
          </p>
        ) : cargandoPersonal ? (
          <p className="text-sm text-brand-brown/60">Cargando personal…</p>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <ListaEditor
                titulo="Porcionadores"
                descripcion="Personas que porcionan/alistan el pedido."
                placeholder="Nombre del porcionador"
                items={porcionadores}
                onChange={(items) => {
                  setPorcionadores(items);
                  setGuardadoOk(false);
                }}
              />
              <ListaEditor
                titulo="Domiciliarios"
                descripcion="Personas que realizan la entrega a domicilio."
                placeholder="Nombre del domiciliario"
                items={domiciliarios}
                onChange={(items) => {
                  setDomiciliarios(items);
                  setGuardadoOk(false);
                }}
              />
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="rounded-lg bg-brand-wine px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
              {guardadoOk && (
                <span className="text-sm font-medium text-green-700">
                  Configuración guardada correctamente.
                </span>
              )}
              {errorGuardar && (
                <span className="text-sm font-medium text-red-700">
                  {errorGuardar}
                </span>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Editor de una lista de nombres: agregar (input + Enter/botón) y eliminar. */
function ListaEditor({
  titulo,
  descripcion,
  placeholder,
  items,
  onChange,
}: {
  titulo: string;
  descripcion: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [nuevo, setNuevo] = useState("");

  function agregar() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    const existe = items.some((i) => i.toLowerCase() === nombre.toLowerCase());
    if (!existe) {
      onChange([...items, nombre]);
    }
    setNuevo("");
  }

  function eliminar(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="rounded-xl border border-brand-brown/15 bg-brand-cream/30 p-4">
      <h3 className="font-semibold text-brand-wine">{titulo}</h3>
      <p className="mt-0.5 text-xs text-brand-brown/60">{descripcion}</p>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={nuevo}
          placeholder={placeholder}
          onChange={(e) => setNuevo(e.target.value)}
          onBlur={agregar}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregar();
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm text-brand-brown outline-none focus:border-brand-wine"
        />
        <button
          type="button"
          onClick={agregar}
          className="shrink-0 rounded-lg border border-brand-wine px-3 py-2 text-sm font-semibold text-brand-wine transition hover:bg-brand-wine hover:text-white"
        >
          Agregar
        </button>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-brand-brown/50">
          Aún no hay nombres. Agrega el primero.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {items.map((nombre, index) => (
            <li
              key={`${nombre}-${index}`}
              className="flex items-center justify-between rounded-lg border border-brand-brown/10 bg-white px-3 py-2 text-sm text-brand-brown"
            >
              <span className="truncate">{nombre}</span>
              <button
                type="button"
                onClick={() => eliminar(index)}
                className="ml-3 shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                aria-label={`Eliminar ${nombre}`}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
