"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listarClientes,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
  buscarBarrios,
  importarClientesDB,
  estadisticasClientes,
  estadoUbicacion,
  type Cliente,
  type ClienteInput,
  type ImportacionResumen,
  type EstadisticasClientes,
} from "@/lib/clientes";
import { buscarCiudades } from "@/lib/ubicaciones";
import { onChangeNombrePropio } from "@/lib/format";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ModalSinPermiso, useSinPermiso } from "@/components/SinPermisoModal";
import DireccionInput from "@/components/DireccionInput";
import ReferenciaInput from "@/components/ReferenciaInput";
import AutocompleteInput from "@/components/AutocompleteInput";
import MapaDireccion from "@/components/MapaDireccion";

const POR_PAGINA = 25;

type FormState = ClienteInput;

const FORM_VACIO: FormState = {
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
};

export default function ClientesPage() {
  const [items, setItems] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<EstadisticasClientes | null>(null);
  const [pagina, setPagina] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaInput, setBusquedaInput] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal crear/editar
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  // Tipo de cliente: excluyente y obligatorio (hogar / HORECA).
  const [tipoCliente, setTipoCliente] = useState<"hogar" | "horeca" | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  // Modal eliminar
  const [aEliminar, setAEliminar] = useState<Cliente | null>(null);
  const [eliminando, setEliminando] = useState(false);

  // Importar DB y permisos granulares por acción.
  const [usuario, setUsuario] = useState<ReturnType<typeof getUsuario>>(null);
  useEffect(() => setUsuario(getUsuario()), []);
  const sinPermiso = useSinPermiso();
  const permite = useMemo(
    () => ({
      crear: puedeAccion(usuario, "clientes.crear"),
      editar: puedeAccion(usuario, "clientes.editar"),
      eliminar: puedeAccion(usuario, "clientes.eliminar"),
      estado: puedeAccion(usuario, "clientes.estado"),
      importar: puedeAccion(usuario, "clientes.importar"),
    }),
    [usuario],
  );
  const puedeImportar = permite.importar;
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [resumenImport, setResumenImport] = useState<ImportacionResumen | null>(
    null,
  );
  const [errorImport, setErrorImport] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await listarClientes(busqueda, POR_PAGINA, pagina * POR_PAGINA);
      setItems(data.items);
      setTotal(data.total);
      estadisticasClientes()
        .then(setStats)
        .catch(() => { /* ignore */ });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los clientes");
    } finally {
      setCargando(false);
    }
  }, [busqueda, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Buscar con un pequeño retraso al escribir.
  useEffect(() => {
    const t = setTimeout(() => {
      setPagina(0);
      setBusqueda(busquedaInput);
    }, 350);
    return () => clearTimeout(t);
  }, [busquedaInput]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  function abrirCrear() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setNombres("");
    setApellidos("");
    setTipoCliente(null);
    setErrorForm(null);
    setModalAbierto(true);
  }

  function abrirEditar(c: Cliente) {
    setEditandoId(c.id);
    setForm({
      nit_cedula: c.nit_cedula,
      nombre: c.nombre ?? "",
      direccion: c.direccion ?? "",
      referencia: c.referencia ?? "",
      barrio: c.barrio ?? "",
      ciudad: c.ciudad ?? "",
      telefono: c.telefono ?? "",
      correo: c.correo ?? "",
      lat: c.lat,
      lng: c.lng,
      activo: c.activo,
      horeca: c.horeca,
      direccion_incorrecta: c.direccion_incorrecta ?? false,
    });
    // Si el cliente ya tiene apellidos guardados, respetamos la división exacta.
    const apel = (c.apellidos ?? "").trim();
    const full = (c.nombre ?? "").trim();
    if (apel && full.endsWith(apel)) {
      setNombres(full.slice(0, full.length - apel.length).trim());
      setApellidos(apel);
    } else if (apel) {
      setNombres(full);
      setApellidos(apel);
    } else {
      // Datos antiguos sin apellidos separados: repartimos por heurística.
      const palabras = full.split(/\s+/).filter(Boolean);
      const corte = palabras.length >= 4 ? Math.ceil(palabras.length / 2) : Math.max(1, palabras.length - 1);
      setNombres(palabras.slice(0, corte).join(" "));
      setApellidos(palabras.slice(corte).join(" "));
    }
    setTipoCliente(c.horeca ? "horeca" : "hogar");
    setErrorForm(null);
    setModalAbierto(true);
  }

  function cambiar<K extends keyof FormState>(campo: K, valor: FormState[K]) {
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
      setErrorForm(
        "La dirección es obligatoria: completa tipo de vía, vía, cruce y placa.",
      );
      return;
    }
    if (!tipoCliente) {
      setErrorForm("Selecciona el tipo de cliente: hogar o HORECA.");
      return;
    }
    setGuardando(true);
    setErrorForm(null);
    try {
      const datos = {
        ...form,
        nombre: nombreCompleto,
        apellidos: apellidos.trim().replace(/\s+/g, " ") || undefined,
        horeca: tipoCliente === "horeca",
        correo: form.correo?.trim() ? form.correo.trim() : undefined,
      };
      if (editandoId) {
        await actualizarCliente(editandoId, datos);
      } else {
        await crearCliente(datos);
      }
      setModalAbierto(false);
      await cargar();
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : "No se pudo guardar el cliente");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await eliminarCliente(aEliminar.id);
      setAEliminar(null);
      // Si era el último de la página, retrocede una página.
      if (items.length === 1 && pagina > 0) {
        setPagina((p) => p - 1);
      } else {
        await cargar();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el cliente");
      setAEliminar(null);
    } finally {
      setEliminando(false);
    }
  }

  const rango = useMemo(() => {
    if (total === 0) return "0";
    const desde = pagina * POR_PAGINA + 1;
    const hasta = Math.min(total, (pagina + 1) * POR_PAGINA);
    return `${desde}–${hasta} de ${total}`;
  }, [pagina, total]);

  async function onArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a subir el mismo archivo
    if (!archivo) return;
    setImportando(true);
    setErrorImport(null);
    setResumenImport(null);
    try {
      const resumen = await importarClientesDB(archivo);
      setResumenImport(resumen);
      setPagina(0);
      await cargar();
    } catch (err) {
      setErrorImport(
        err instanceof Error ? err.message : "No se pudo importar el archivo",
      );
    } finally {
      setImportando(false);
    }
  }

  return (
    <div>
      {/* Encabezado */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Directorio de clientes del negocio.
          </p>
        </div>
        <button
          onClick={permite.crear ? abrirCrear : sinPermiso.mostrar}
          title="Crear un nuevo cliente"
          className={`inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90 ${
            permite.crear ? "" : "opacity-50"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
          Nuevo cliente
        </button>
      </div>

      {/* Importar DB: solo administrador / desarrollador */}
      {puedeImportar && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-brand-amber/30 bg-brand-cream-soft/60 px-4 py-3">
          <input
            ref={inputArchivoRef}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            className="hidden"
            onChange={onArchivoSeleccionado}
          />
          <button
            onClick={() => inputArchivoRef.current?.click()}
            disabled={importando}
            title="Importar clientes desde un archivo Excel (.xlsx, .xlsm)"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-wine bg-white px-4 py-2.5 text-sm font-semibold text-brand-wine shadow-sm transition hover:bg-brand-wine hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
            </svg>
            {importando ? "Importando…" : "Importar DB"}
          </button>
          <p className="text-xs text-brand-brown/70">
            Sube el Excel de clientes (.xlsx, .xlsm). Crea los nuevos y actualiza
            los que cambiaron, comparando por NIT/cédula.
          </p>

          {importando && (
            <span className="text-xs font-medium text-brand-wine">
              Procesando archivo, no cierres la página…
            </span>
          )}

          {resumenImport && (
            <div className="w-full rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800">
              <span className="font-semibold">Importación completada:</span>{" "}
              {resumenImport.creados} creados · {resumenImport.actualizados}{" "}
              actualizados · {resumenImport.sinCambios} sin cambios
              {resumenImport.descartadas > 0
                ? ` · ${resumenImport.descartadas} filas sin NIT ignoradas`
                : ""}{" "}
              (de {resumenImport.totalFilas} filas).
            </div>
          )}

          {errorImport && (
            <div className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorImport}
            </div>
          )}
        </div>
      )}

      {/* Estadísticas de calidad de datos */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-brand-brown/10 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-brown/50">
            Total clientes
          </p>
          <p className="mt-1 text-2xl font-bold text-brand-brown">
            {stats ? stats.total.toLocaleString("es-CO") : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-green-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Validados
          </p>
          <p className="mt-1 text-2xl font-bold text-green-700">
            {stats ? stats.validados.toLocaleString("es-CO") : "—"}
          </p>
          <p className="text-[11px] text-green-700/70">Con dirección en el mapa</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <circle cx="12" cy="12" r="9" />
            </svg>
            Sin verificar
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {stats ? stats.sinVerificar.toLocaleString("es-CO") : "—"}
          </p>
          <p className="text-[11px] text-amber-600/70">Falta abrir el mapa</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-red-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
            Dirección incorrecta
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {stats ? stats.incorrectos.toLocaleString("es-CO") : "—"}
          </p>
          <p className="text-[11px] text-red-600/70">Coordenadas inválidas</p>
        </div>
      </div>

      {/* Buscador */}
      <div className="mb-4 max-w-md">
        <div className="relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
          </svg>
          <input
            value={busquedaInput}
            onChange={(e) => setBusquedaInput(e.target.value)}
            placeholder="Buscar por nombre, NIT/cédula, teléfono o barrio"
            className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-amber"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
        <div className="max-h-[calc(100vh-300px)] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-brand-cream-soft text-xs uppercase tracking-wide text-brand-brown/60 shadow-sm">
              <tr>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">NIT/Cédula</th>
                <th className="px-4 py-3 font-semibold">Teléfono</th>
                <th className="px-4 py-3 font-semibold">Barrio</th>
                <th className="px-4 py-3 font-semibold">Ciudad</th>
                <th className="px-4 py-3 text-center font-semibold">Dirección</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-brown/5">
              {cargando ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-brand-brown/50">
                    Cargando clientes…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-brand-brown/50">
                    No se encontraron clientes.
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id} className="hover:bg-brand-cream-soft/40">
                    <td className="px-4 py-3">
                      <span className="font-medium text-brand-black">
                        {c.nombre || "—"}
                      </span>
                      {c.direccion && (
                        <span className="block text-xs text-brand-brown/50">
                          {c.direccion}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-brand-brown/80">{c.nit_cedula}</td>
                    <td className="px-4 py-3 text-brand-brown/80">{c.telefono || "—"}</td>
                    <td className="px-4 py-3 text-brand-brown/80">{c.barrio || "—"}</td>
                    <td className="px-4 py-3 text-brand-brown/80">{c.ciudad || "—"}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const estado = estadoUbicacion(c);
                        if (estado === "validado") {
                          return (
                            <span
                              title="Validado"
                              className="mx-auto flex h-6 w-6 items-center justify-center text-green-600"
                            >
                              <svg viewBox="0 0 24 24" className="h-5 w-5">
                                <path
                                  fill="currentColor"
                                  d="M12 2a7 7 0 0 0-7 7c0 4.6 6.1 12.2 6.36 12.53a.82.82 0 0 0 1.28 0C12.9 21.2 19 13.6 19 9a7 7 0 0 0-7-7Z"
                                />
                                <circle cx="12" cy="9" r="2.6" fill="#fff" />
                              </svg>
                            </span>
                          );
                        }
                        if (estado === "incorrecto") {
                          return (
                            <span
                              title="Con dirección incorrecta"
                              className="mx-auto flex h-6 w-6 items-center justify-center text-red-600"
                            >
                              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                                <path d="M13 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M13 2.5 18 7.5V12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M8 8h4.5M8 11h5.5M8 14h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                <path d="M17.3 13.2 21.7 21a1 1 0 0 1-.87 1.5h-8.76A1 1 0 0 1 11.2 21l4.4-7.8a1 1 0 0 1 1.7 0Z" fill="currentColor" />
                                <rect x="15.7" y="16.6" width="1.5" height="3" rx="0.5" fill="#fff" />
                                <circle cx="16.45" cy="20.6" r="0.8" fill="#fff" />
                              </svg>
                            </span>
                          );
                        }
                        return (
                          <span
                            title="Sin verificar"
                            className="mx-auto flex h-6 w-6 items-center justify-center text-amber-500"
                          >
                            <svg viewBox="0 0 24 24" className="h-5 w-5">
                              <g fill="currentColor">
                                <circle cx="9" cy="7" r="4" />
                                <path d="M9 13c-3.9 0-7 2.4-7 5.4V20h9.06A6.5 6.5 0 0 1 15 13.9 9.8 9.8 0 0 0 9 13Z" />
                                <circle cx="17.5" cy="17.5" r="5.5" />
                              </g>
                              <circle cx="17.5" cy="15" r="0.95" fill="#fff" />
                              <rect x="16.75" y="16.4" width="1.5" height="4" rx="0.5" fill="#fff" />
                            </svg>
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={permite.editar ? () => abrirEditar(c) : sinPermiso.mostrar}
                          className={`rounded-lg p-1.5 text-brand-brown/60 transition hover:bg-brand-amber/10 hover:text-brand-amber ${permite.editar ? "" : "opacity-50"}`}
                          aria-label="Editar"
                          title="Editar cliente"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                          </svg>
                        </button>
                        <button
                          onClick={permite.eliminar ? () => setAEliminar(c) : sinPermiso.mostrar}
                          className={`rounded-lg p-1.5 text-brand-brown/60 transition hover:bg-red-50 hover:text-red-600 ${permite.eliminar ? "" : "opacity-50"}`}
                          aria-label="Eliminar"
                          title="Eliminar cliente"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-brown/10 px-4 py-3 text-sm">
          <span className="text-brand-brown/60">{rango}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              disabled={pagina === 0 || cargando}
              title="Ir a la página anterior"
              className="rounded-lg border border-brand-brown/15 px-3 py-1.5 transition hover:bg-brand-cream-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-brand-brown/60">
              {pagina + 1} / {totalPaginas}
            </span>
            <button
              onClick={() => setPagina((p) => (p + 1 < totalPaginas ? p + 1 : p))}
              disabled={pagina + 1 >= totalPaginas || cargando}
              title="Ir a la página siguiente"
              className="rounded-lg border border-brand-brown/15 px-3 py-1.5 transition hover:bg-brand-cream-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Modal crear/editar ---------- */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/50 p-4">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <button
              onClick={() => setModalAbierto(false)}
              disabled={guardando}
              aria-label="Cerrar"
              title="Cerrar sin guardar"
              className="sticky top-0 z-20 float-right -mr-2 -mt-2 rounded-lg bg-white p-1.5 text-brand-brown/50 shadow-sm transition hover:bg-brand-cream-soft hover:text-brand-wine disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="font-serif text-xl font-bold text-brand-wine">
              {editandoId ? "Editar cliente" : "Nuevo cliente"}
            </h2>

            {errorForm && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {errorForm}
              </div>
            )}

            {/* Layout horizontal: bloques a la izquierda, ubicación a la derecha */}
            <div className="mt-3 grid items-start gap-3 lg:grid-cols-[1fr_1fr]">
              {/* Columna izquierda: bloques 1 a 4 */}
              <div className="space-y-3">
                {/* Bloque 1: identificación */}
                <Bloque titulo="Identificación">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo label="NIT / Cédula *">
                      <input
                        value={form.nit_cedula}
                        onChange={(e) => cambiar("nit_cedula", e.target.value)}
                        className="campo"
                      />
                    </Campo>
                    <label
                      className={`flex items-end gap-2 pb-2 text-sm text-brand-brown/80 ${permite.estado ? "" : "opacity-50"}`}
                      onClick={permite.estado ? undefined : (e) => { e.preventDefault(); sinPermiso.mostrar(); }}
                    >
                      <input
                        type="checkbox"
                        checked={form.activo ?? true}
                        disabled={!permite.estado}
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

                {/* Bloque 2: dirección */}
                <Bloque titulo="Dirección">
                  <DireccionInput
                    value={form.direccion ?? ""}
                    onChange={(v) => cambiar("direccion", v)}
                  />
                </Bloque>

                {/* Bloque 3: contacto y referencia */}
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

              {/* Columna derecha: ubicación + barrio y ciudad */}
              <div className="space-y-3">
                {/* Bloque 4: barrio y ciudad */}
                <Bloque titulo="Barrio y ciudad">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo label="Barrio">
                      <AutocompleteInput
                        value={form.barrio ?? ""}
                        onChange={(v) => cambiar("barrio", v)}
                        onBuscar={async (q) =>
                          (await buscarBarrios(q, form.ciudad)).map((b) => ({
                            value: b,
                          }))
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

                <Bloque titulo="Ubicación del pedido">
                  <MapaDireccion
                    direccion={form.direccion ?? ""}
                    barrio={form.barrio ?? ""}
                    ciudad={form.ciudad ?? ""}
                    lat={form.lat ?? null}
                    lng={form.lng ?? null}
                    onUbicacion={(la, lo) =>
                      setForm((p) => ({ ...p, lat: la, lng: lo }))
                    }
                    onBarrio={(b) => cambiar("barrio", b)}
                    onCiudad={(ci) => cambiar("ciudad", ci)}
                  />
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
                onClick={() => setModalAbierto(false)}
                disabled={guardando}
                title="Cancelar y cerrar sin guardar"
                className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-medium text-brand-brown/70 transition hover:bg-brand-cream-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                title="Guardar los datos del cliente"
                className="rounded-xl bg-brand-amber px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90 disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal eliminar ---------- */}
      {aEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="font-serif text-lg font-bold text-brand-wine">
              Eliminar cliente
            </h2>
            <p className="mt-2 text-sm text-brand-brown/70">
              ¿Seguro que deseas eliminar a{" "}
              <span className="font-medium text-brand-black">
                {aEliminar.nombre || aEliminar.nit_cedula}
              </span>
              ? Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setAEliminar(null)}
                disabled={eliminando}
                title="Cancelar"
                className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-medium text-brand-brown/70 transition hover:bg-brand-cream-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEliminar}
                disabled={eliminando}
                title="Eliminar el cliente definitivamente"
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {eliminando ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <ModalSinPermiso abierto={sinPermiso.abierto} onCerrar={sinPermiso.cerrar} />
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
      <span className="mb-1 block text-xs font-medium text-brand-brown/70">
        {label}
      </span>
      {children}
    </label>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-brand-brown/10 bg-brand-cream-soft/30 p-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-wine">
        {titulo}
      </h3>
      {children}
    </section>
  );
}
