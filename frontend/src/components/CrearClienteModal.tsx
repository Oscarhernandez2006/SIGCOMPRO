"use client";

import { useState } from "react";
import {
  crearCliente,
  buscarBarrios,
  type ClienteInput,
  type Cliente,
} from "@/lib/clientes";
import { buscarCiudades } from "@/lib/ubicaciones";
import { aNombrePropio } from "@/lib/format";
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
};

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
  // Si lo escrito es solo dígitos, lo tomamos como cédula; si no, como nombre.
  const soloDigitos = /^\d+$/.test(nitInicial.trim());
  const [form, setForm] = useState<ClienteInput>({
    ...FORM_VACIO,
    nit_cedula: soloDigitos ? nitInicial.trim() : "",
  });
  const [nombres, setNombres] = useState(soloDigitos ? "" : aNombrePropio(nitInicial.trim()));
  const [apellidos, setApellidos] = useState("");
  // Tipo de cliente: excluyente, empieza sin seleccionar.
  const [tipoCliente, setTipoCliente] = useState<"hogar" | "horeca" | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  function cambiar<K extends keyof ClienteInput>(campo: K, valor: ClienteInput[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function guardar() {
    if (!form.nit_cedula.trim()) {
      setErrorForm("El NIT/cédula es obligatorio.");
      return;
    }
    const nombreCompleto = `${nombres} ${apellidos}`.trim().replace(/\s+/g, " ");
    if (!nombreCompleto) {
      setErrorForm("El nombre es obligatorio.");
      return;
    }
    if (!form.direccion?.trim()) {
      setErrorForm("La dirección es obligatoria: completa tipo de vía, vía, cruce y placa.");
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
        horeca: tipoCliente === "horeca",
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/50 p-4">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
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

        <div className="mt-3 grid items-start gap-3 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <Bloque titulo="Identificación">
              <div className="grid gap-3 sm:grid-cols-2">
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
                    onChange={(e) => setNombres(aNombrePropio(e.target.value))}
                    className="campo"
                  />
                </Campo>
                <Campo label="Apellidos *">
                  <input
                    value={apellidos}
                    onChange={(e) => setApellidos(aNombrePropio(e.target.value))}
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
                    onChange={(e) => cambiar("telefono", e.target.value)}
                    inputMode="tel"
                    maxLength={15}
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
              <div className="mt-3">
                <ReferenciaInput
                  value={form.referencia ?? ""}
                  onChange={(v) => cambiar("referencia", v)}
                />
              </div>
            </Bloque>
          </div>

          <div className="space-y-3">
            <Bloque titulo="Ubicación del pedido">
              <MapaDireccion
                direccion={form.direccion ?? ""}
                barrio={form.barrio ?? ""}
                ciudad={form.ciudad ?? ""}
                lat={form.lat ?? null}
                lng={form.lng ?? null}
                onUbicacion={(la, lo) => setForm((p) => ({ ...p, lat: la, lng: lo }))}
              />
            </Bloque>

            <Bloque titulo="Barrio y ciudad">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Barrio">
                  <AutocompleteInput
                    value={form.barrio ?? ""}
                    onChange={(v) => cambiar("barrio", v)}
                    onBuscar={async (q) =>
                      (await buscarBarrios(q, form.ciudad)).map((b) => ({ value: b }))
                    }
                    placeholder="Barrio"
                  />
                </Campo>
                <Campo label="Ciudad">
                  <AutocompleteInput
                    value={form.ciudad ?? ""}
                    onChange={(v) => cambiar("ciudad", v)}
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
            </Bloque>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
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
      <span className="mb-1 block text-xs font-medium text-brand-brown/70">{label}</span>
      {children}
    </label>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-brand-brown/10 bg-brand-cream-soft/30 p-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-wine">{titulo}</h3>
      {children}
    </section>
  );
}
