"use client";

import { useEffect, useState } from "react";
import {
  crearCliente,
  buscarBarrios,
  listarClientes,
  type ClienteInput,
  type Cliente,
} from "@/lib/clientes";
import { buscarCiudades } from "@/lib/ubicaciones";
import { aNombrePropio, onChangeNombrePropio } from "@/lib/format";
import DireccionInput from "@/components/DireccionInput";
import ReferenciaInput from "@/components/ReferenciaInput";
import AutocompleteInput from "@/components/AutocompleteInput";
import MapaDireccion from "@/components/MapaDireccion";

const FORM_VACIO: ClienteInput = {
  nit_cedula: "",
  nombre: "",
  direccion: "",
  referencia: "",
  barrio: "",
  ciudad: "",
  telefono: "",
  correo: "",
  lat: null,
  lng: null,
  activo: true,
  horeca: false,
  direccion_incorrecta: false,
  dias_despacho: [],
};

/** Días de la semana para el despacho de clientes HORECA. */
const DIAS_SEMANA = [
  { key: "lun", label: "L" },
  { key: "mar", label: "Ma" },
  { key: "mie", label: "Mi" },
  { key: "jue", label: "J" },
  { key: "vie", label: "V" },
  { key: "sab", label: "S" },
  { key: "dom", label: "D" },
] as const;

/**
 * Modal de creación rápida de cliente.
 * Al guardar, devuelve el cliente creado mediante onCreado para que el flujo
 * que lo abrió pueda seleccionarlo automáticamente.
 */
export default function CrearClienteModal({
  nitInicial = "",
  onCerrar,
  onCreado,
}: {
  nitInicial?: string;
  onCerrar: () => void;
  onCreado: (c: Cliente) => void;
}) {
  // Lo escrito puede ser una cédula (solo dígitos) o una cédula ALTERNA (misma
  // cédula con sufijo "-N" para distinguir direcciones alternas del cliente).
  // En ambos casos va al campo NIT; si no es numérico, se toma como nombre.
  const initTrim = nitInicial.trim();
  const esNit = /^\d+(-\d+)?$/.test(initTrim);
  const esAlterna = /^\d+-\d+$/.test(initTrim);
  const [form, setForm] = useState<ClienteInput>({
    ...FORM_VACIO,
    nit_cedula: esNit ? initTrim : "",
  });
  const [nombres, setNombres] = useState(esNit ? "" : aNombrePropio(initTrim));
  const [apellidos, setApellidos] = useState("");
  // Tipo de cliente: excluyente, empieza sin seleccionar.
  const [tipoCliente, setTipoCliente] = useState<"hogar" | "horeca" | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  // Cédula alterna ("1140833798-1"): trae los datos del cliente BASE
  // ("1140833798") —nombre, teléfono, correo, ciudad, tipo, punto de venta—
  // pero NO la dirección/barrio/referencia ni las coordenadas, que varían en
  // cada dirección alterna y debe llenarlas la persona.
  useEffect(() => {
    if (!esAlterna) return;
    const base = initTrim.replace(/-\d+$/, "");
    let cancelado = false;
    listarClientes(base, 5, 0)
      .then((r) => {
        if (cancelado) return;
        const c = r.items.find((x) => (x.nit_cedula ?? "").trim() === base);
        if (!c) return;
        setForm((prev) => ({
          ...prev,
          telefono: c.telefono ?? "",
          correo: c.correo ?? "",
          ciudad: c.ciudad ?? "",
          punto_venta: c.punto_venta ?? "",
          horeca: c.horeca ?? false,
          dias_despacho: c.dias_despacho ?? [],
        }));
        // `nombre` guarda el nombre COMPLETO y `apellidos` solo el apellido: se
        // separan para no duplicar el apellido al reconstruir el nombre.
        const full = (c.nombre ?? "").trim();
        const ape = (c.apellidos ?? "").trim();
        const nom =
          ape && full.toLowerCase().endsWith(ape.toLowerCase())
            ? full.slice(0, full.length - ape.length).trim()
            : full;
        if (nom) setNombres(nom);
        if (ape) setApellidos(ape);
        setTipoCliente(c.horeca ? "horeca" : "hogar");
      })
      .catch(() => {
        /* si falla, se crea desde cero */
      });
    return () => {
      cancelado = true;
    };
  }, [esAlterna, initTrim]);

  function cambiar<K extends keyof ClienteInput>(campo: K, valor: ClienteInput[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function guardar() {
    if (!form.nit_cedula.trim()) {
      setErrorForm("El NIT/cédula es obligatorio.");
      return;
    }
    if (!nombres.trim()) {
      setErrorForm("Los nombres son obligatorios.");
      return;
    }
    if (!apellidos.trim()) {
      setErrorForm("Los apellidos son obligatorios.");
      return;
    }
    const nombreCompleto = `${nombres} ${apellidos}`.trim().replace(/\s+/g, " ");
    if (!form.direccion?.trim()) {
      setErrorForm("La dirección es obligatoria: completa tipo de vía, vía, cruce y placa.");
      return;
    }
    if (!form.barrio?.trim()) {
      setErrorForm("El barrio es obligatorio.");
      return;
    }
    if (!form.ciudad?.trim()) {
      setErrorForm("La ciudad es obligatoria.");
      return;
    }
    if (!tipoCliente) {
      setErrorForm("Selecciona el tipo de cliente: hogar o HORECA.");
      return;
    }
    setGuardando(true);
    setErrorForm(null);
    try {
      const nuevo = await crearCliente({
        ...form,
        nombre: nombreCompleto,
        apellidos: apellidos.trim().replace(/\s+/g, " ") || undefined,
        horeca: tipoCliente === "horeca",
        dias_despacho: tipoCliente === "horeca" ? (form.dias_despacho ?? []) : [],
        correo: form.correo?.trim() ? form.correo.trim() : undefined,
      });
      onCreado(nuevo);
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : "No se pudo guardar el cliente");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/50 p-2">
      <div className="max-h-[96vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-3 shadow-2xl">
        <button
          onClick={onCerrar}
          disabled={guardando}
          aria-label="Cerrar"
          title="Cerrar"
          className="sticky top-0 z-20 float-right -mr-2 -mt-2 rounded-lg bg-white p-1.5 text-brand-brown/50 shadow-sm transition hover:bg-brand-cream-soft hover:text-brand-wine disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="font-serif text-xl font-bold text-brand-wine">Nuevo cliente</h2>

        {errorForm && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {errorForm}
          </div>
        )}

        <div className="mt-1.5 grid items-start gap-2 lg:grid-cols-2">
          {/* Columna izquierda */}
          <div className="space-y-1.5">
            <Bloque titulo="Identificación">
              <div className="grid gap-2 sm:grid-cols-2">
                <Campo label="NIT / Cédula *">
                  <input
                    value={form.nit_cedula}
                    onChange={(e) => cambiar("nit_cedula", e.target.value)}
                    autoFocus={!form.nit_cedula}
                    className="campo"
                  />
                </Campo>
                <label className="flex items-end gap-2 pb-2 text-sm text-brand-brown/80">
                  <input
                    type="checkbox"
                    checked={form.activo ?? true}
                    onChange={(e) => cambiar("activo", e.target.checked)}
                    className="h-4 w-4 accent-brand-amber"
                  />
                  Cliente activo
                </label>
                <Campo label="Nombres *">
                  <input
                    value={nombres}
                    onChange={onChangeNombrePropio(setNombres)}
                    className="campo"
                  />
                </Campo>
                <Campo label="Apellidos *">
                  <input
                    value={apellidos}
                    onChange={onChangeNombrePropio(setApellidos)}
                    className="campo"
                  />
                </Campo>
              </div>
            </Bloque>

            <Bloque titulo="Dirección">
              <DireccionInput
                value={form.direccion ?? ""}
                onChange={(v) => cambiar("direccion", v)}
              />
            </Bloque>

            <Bloque titulo="Contacto y referencia">
              <div className="flex flex-wrap gap-3">
                <Campo label="Teléfono">
                  <input
                    value={form.telefono ?? ""}
                    onChange={(e) =>
                      cambiar("telefono", e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="3001234567"
                    className="campo max-w-[10rem]"
                  />
                </Campo>
                <Campo label="Correo electrónico">
                  <input
                    value={form.correo ?? ""}
                    onChange={(e) => cambiar("correo", e.target.value)}
                    type="email"
                    inputMode="email"
                    placeholder="correo@ejemplo.com"
                    className="campo min-w-[14rem]"
                  />
                </Campo>
              </div>
              <div className="mt-2">
                <ReferenciaInput
                  value={form.referencia ?? ""}
                  onChange={(v) => cambiar("referencia", v)}
                />
              </div>
            </Bloque>

            <Bloque titulo="Clasificación">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-sm text-brand-brown/80">
                  <input
                    type="radio"
                    name="tipo-cliente"
                    checked={tipoCliente === "hogar"}
                    onChange={() => setTipoCliente("hogar")}
                    className="h-4 w-4 accent-brand-amber"
                  />
                  Cliente hogar
                </label>
                <label className="flex items-center gap-2 text-sm text-brand-brown/80">
                  <input
                    type="radio"
                    name="tipo-cliente"
                    checked={tipoCliente === "horeca"}
                    onChange={() => setTipoCliente("horeca")}
                    className="h-4 w-4 accent-brand-amber"
                  />
                  Cliente HORECA (hotel, restaurante o café)
                </label>
              </div>

              {/* Días de despacho: solo para clientes HORECA. */}
              {tipoCliente === "horeca" && (
                <div className="mt-2 border-t border-brand-brown/10 pt-2">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/60">
                    Días de despacho
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {DIAS_SEMANA.map((d) => {
                      const activo = (form.dias_despacho ?? []).includes(d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() =>
                            cambiar(
                              "dias_despacho",
                              activo
                                ? (form.dias_despacho ?? []).filter((x) => x !== d.key)
                                : [...(form.dias_despacho ?? []), d.key],
                            )
                          }
                          title={activo ? "Quitar día" : "Agregar día"}
                          className={`h-8 min-w-[2.25rem] rounded-md border px-2 text-xs font-bold transition ${
                            activo
                              ? "border-brand-wine bg-brand-wine text-white"
                              : "border-brand-brown/20 bg-white text-brand-brown hover:bg-brand-cream-soft"
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[11px] text-brand-brown/50">
                    Días en que se le puede despachar a este cliente.
                  </p>
                </div>
              )}
            </Bloque>
          </div>

          {/* Columna derecha */}
          <div className="space-y-1.5">
            <Bloque titulo="Barrio y ciudad">
              <div className="grid gap-2 sm:grid-cols-2">
                <Campo label="Barrio *">
                  <AutocompleteInput
                    value={form.barrio ?? ""}
                    onChange={(v) => cambiar("barrio", v)}
                    formato={aNombrePropio}
                    onBuscar={async (q) =>
                      (await buscarBarrios(q, form.ciudad)).map((b) => ({ value: b }))
                    }
                    placeholder="Barrio"
                  />
                </Campo>
                <Campo label="Ciudad *">
                  <AutocompleteInput
                    value={form.ciudad ?? ""}
                    onChange={(v) => cambiar("ciudad", v)}
                    formato={aNombrePropio}
                    onBuscar={async (q) =>
                      (await buscarCiudades(q)).map((c) => ({
                        value: c.nombre,
                        hint: c.departamento ?? undefined,
                      }))
                    }
                    placeholder="Ciudad"
                  />
                </Campo>
              </div>
            </Bloque>

            <Bloque titulo="Ubicación del pedido">
              <MapaDireccion
                direccion={form.direccion ?? ""}
                barrio={form.barrio ?? ""}
                ciudad={form.ciudad ?? ""}
                referencia={form.referencia ?? ""}
                puntoVenta={form.punto_venta ?? ""}
                horeca={tipoCliente === "horeca"}
                lat={form.lat ?? null}
                lng={form.lng ?? null}
                altoMapa={120}
                onUbicacion={(la, lo) => setForm((p) => ({ ...p, lat: la, lng: lo }))}
                onBarrio={(b) => cambiar("barrio", b)}
                onCiudad={(ci) => cambiar("ciudad", ci)}
                onPuntoVenta={(n) => cambiar("punto_venta", n)}
              />
            </Bloque>
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            disabled={guardando}
            title="Cancelar"
            className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-medium text-brand-brown/70 transition hover:bg-brand-cream-soft disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            title="Crear el cliente y seleccionarlo"
            className="rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Crear y seleccionar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-0.5 block text-xs font-medium text-brand-brown/70">{label}</span>
      {children}
    </label>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-brand-brown/10 bg-brand-cream-soft/30 p-2">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-brand-wine">{titulo}</h3>
      {children}
    </section>
  );
}
