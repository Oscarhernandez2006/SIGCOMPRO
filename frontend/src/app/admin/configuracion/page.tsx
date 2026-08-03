"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  guardarRegistroPersonal,
  obtenerRegistroPersonal,
  type PersonaAsignada,
  type RegistroPersonal,
} from "@/lib/configuracion";
import { listarPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";

type Rol = "porcionador" | "domiciliario";

/** Persona con su rol (vista unificada para la tabla). */
interface PersonaConRol extends PersonaAsignada {
  rol: Rol;
}

const CAT: Record<Rol, keyof RegistroPersonal> = {
  porcionador: "porcionadores",
  domiciliario: "domiciliarios",
};

const ETIQUETA_ROL: Record<Rol, string> = {
  porcionador: "Porcionador",
  domiciliario: "Domiciliario",
};

const CHIP_ROL: Record<Rol, string> = {
  porcionador: "bg-violet-100 text-violet-700",
  domiciliario: "bg-teal-100 text-teal-700",
};

export default function AdminConfiguracionPage() {
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [registro, setRegistro] = useState<RegistroPersonal>({
    porcionadores: [],
    domiciliarios: [],
  });
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState<"todos" | Rol>("todos");
  const [modalNuevo, setModalNuevo] = useState(false);
  const [asignando, setAsignando] = useState<PersonaConRol | null>(null);
  const [editando, setEditando] = useState<PersonaConRol | null>(null);

  useEffect(() => {
    setCargando(true);
    setErrorCarga(null);
    Promise.all([listarPuntosVenta(), obtenerRegistroPersonal()])
      .then(([ps, reg]) => {
        setPuntos(ps);
        setRegistro({
          porcionadores: reg.porcionadores ?? [],
          domiciliarios: reg.domiciliarios ?? [],
        });
      })
      .catch((e) =>
        setErrorCarga(
          e instanceof ApiError
            ? e.message
            : "No se pudo cargar la configuración",
        ),
      )
      .finally(() => setCargando(false));
  }, []);

  const nombrePunto = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of puntos) mapa.set(String(p.id), p.nombre);
    return (id: string) => mapa.get(String(id)) ?? id;
  }, [puntos]);

  // Lista unificada, ordenada alfabéticamente.
  const personas = useMemo<PersonaConRol[]>(() => {
    const lista: PersonaConRol[] = [
      ...registro.porcionadores.map((p) => ({ ...p, rol: "porcionador" as Rol })),
      ...registro.domiciliarios.map((p) => ({ ...p, rol: "domiciliario" as Rol })),
    ];
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [registro]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return personas.filter((p) => {
      if (filtroRol !== "todos" && p.rol !== filtroRol) return false;
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [personas, busqueda, filtroRol]);

  const totalPorc = registro.porcionadores.length;
  const totalDomi = registro.domiciliarios.length;

  // Persiste todo el registro (guardado optimista).
  async function persistir(nuevo: RegistroPersonal) {
    setRegistro(nuevo);
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const g = await guardarRegistroPersonal(nuevo);
      setRegistro({
        porcionadores: g.porcionadores ?? [],
        domiciliarios: g.domiciliarios ?? [],
      });
    } catch (e) {
      setErrorGuardar(
        e instanceof ApiError ? e.message : "No se pudo guardar el cambio",
      );
    } finally {
      setGuardando(false);
    }
  }

  function agregarPersona(nombre: string, rol: Rol): boolean {
    const limpio = nombre.trim();
    if (!limpio) return false;
    const cat = CAT[rol];
    const existe = registro[cat].some(
      (p) => p.nombre.toLowerCase() === limpio.toLowerCase(),
    );
    if (existe) return false;
    persistir({ ...registro, [cat]: [...registro[cat], { nombre: limpio, puntos: [] }] });
    return true;
  }

  function eliminarPersona(p: PersonaConRol) {
    if (!confirm(`¿Eliminar a ${p.nombre} (${ETIQUETA_ROL[p.rol]})?`)) return;
    const cat = CAT[p.rol];
    persistir({
      ...registro,
      [cat]: registro[cat].filter(
        (x) => x.nombre.toLowerCase() !== p.nombre.toLowerCase(),
      ),
    });
  }

  // Edita nombre y/o rol. Si cambia el rol, mueve la persona de categoría
  // conservando sus puntos asignados.
  function editarPersona(
    original: PersonaConRol,
    nuevoNombre: string,
    nuevoRol: Rol,
  ): boolean {
    const limpio = nuevoNombre.trim();
    if (!limpio) return false;
    const catOrig = CAT[original.rol];
    const catNuevo = CAT[nuevoRol];
    const duplicado = registro[catNuevo].some(
      (p) =>
        p.nombre.toLowerCase() === limpio.toLowerCase() &&
        !(
          original.rol === nuevoRol &&
          p.nombre.toLowerCase() === original.nombre.toLowerCase()
        ),
    );
    if (duplicado) return false;

    let nuevo: RegistroPersonal = {
      ...registro,
      [catOrig]: registro[catOrig].filter(
        (x) => x.nombre.toLowerCase() !== original.nombre.toLowerCase(),
      ),
    };
    nuevo = {
      ...nuevo,
      [catNuevo]: [...nuevo[catNuevo], { nombre: limpio, puntos: original.puntos, activo: original.activo }],
    };
    persistir(nuevo);
    return true;
  }

  function asignarPuntos(p: PersonaConRol, puntosIds: string[]) {
    const cat = CAT[p.rol];
    persistir({
      ...registro,
      [cat]: registro[cat].map((x) =>
        x.nombre.toLowerCase() === p.nombre.toLowerCase()
          ? { ...x, puntos: puntosIds }
          : x,
      ),
    });
  }

  // Activa/inactiva la persona. Inactiva = no aparece en los selectores de despacho.
  function cambiarActivo(p: PersonaConRol, activo: boolean) {
    const cat = CAT[p.rol];
    persistir({
      ...registro,
      [cat]: registro[cat].map((x) =>
        x.nombre.toLowerCase() === p.nombre.toLowerCase()
          ? { ...x, activo }
          : x,
      ),
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">
            Gestión de recursos
          </h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Personal de despacho: porcionadores y domiciliarios, con sus puntos
            de venta asignados.
          </p>
        </div>
        <button
          onClick={() => setModalNuevo(true)}
          title="Agregar una nueva persona"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
          Nueva persona
        </button>
      </div>

      {/* Toolbar: buscar + filtro por rol + contadores */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre"
            className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-3 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-brand-brown/15 bg-white p-1">
          {([
            ["todos", `Todos (${totalPorc + totalDomi})`],
            ["porcionador", `Porcionadores (${totalPorc})`],
            ["domiciliario", `Domiciliarios (${totalDomi})`],
          ] as const).map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => setFiltroRol(valor)}
              title={`Filtrar: ${etiqueta}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filtroRol === valor
                  ? "bg-brand-wine text-white"
                  : "text-brand-brown hover:bg-brand-cream-soft"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        {guardando && (
          <span className="text-xs font-medium text-brand-brown/60">Guardando…</span>
        )}
        {errorGuardar && (
          <span className="text-xs font-semibold text-red-600">{errorGuardar}</span>
        )}
      </div>

      {errorCarga && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorCarga}
        </div>
      )}

      {/* Tabla */}
      {cargando ? (
        <p className="text-sm text-brand-brown/60">Cargando…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
          <div className="max-h-[calc(100vh-320px)] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-brand-cream-soft text-xs uppercase tracking-wide text-brand-brown/60 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Rol</th>
                  <th className="px-4 py-3 font-semibold">Puntos de venta</th>
                  <th className="px-4 py-3 text-center font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-brown/5">
                {filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-brand-brown/50">
                      {personas.length === 0
                        ? "Aún no hay personas. Agrega la primera con “Nueva persona”."
                        : "No se encontraron resultados."}
                    </td>
                  </tr>
                ) : (
                  filtradas.map((p) => {
                    const activo = p.activo !== false;
                    return (
                    <tr key={`${p.rol}-${p.nombre}`} className={`hover:bg-brand-cream-soft/40 ${activo ? "" : "opacity-60"}`}>
                      <td className="px-4 py-3 font-medium text-brand-black">{p.nombre}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP_ROL[p.rol]}`}>
                          {ETIQUETA_ROL[p.rol]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.puntos.length === 0 ? (
                          <span className="text-xs text-brand-brown/40">Sin puntos asignados</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {p.puntos.map((id) => (
                              <span
                                key={id}
                                className="rounded-full bg-brand-wine/10 px-2 py-0.5 text-[11px] font-semibold text-brand-wine"
                              >
                                {nombrePunto(id)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={activo}
                            onClick={() => cambiarActivo(p, !activo)}
                            title={activo ? "Activo: aparece en los selectores de despacho. Clic para inactivar." : "Inactivo: oculto en despacho. Clic para activar."}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${activo ? "bg-emerald-500" : "bg-brand-brown/25"}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${activo ? "translate-x-4" : "translate-x-1"}`} />
                          </button>
                          <span className={`text-[10px] font-semibold ${activo ? "text-emerald-600" : "text-brand-brown/40"}`}>
                            {activo ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setAsignando(p)}
                            title={`Asignar puntos de venta a ${p.nombre}`}
                            className="rounded-lg border border-brand-wine/30 px-3 py-1.5 text-xs font-semibold text-brand-wine transition hover:bg-brand-wine/10"
                          >
                            Asignar PDV
                          </button>
                          <button
                            onClick={() => setEditando(p)}
                            title={`Editar nombre y rol de ${p.nombre}`}
                            className="rounded-lg border border-brand-brown/20 px-3 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => eliminarPersona(p)}
                            title={`Eliminar a ${p.nombre}`}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalNuevo && (
        <ModalNuevaPersona
          onCerrar={() => setModalNuevo(false)}
          onAgregar={(nombre, rol) => {
            const ok = agregarPersona(nombre, rol);
            if (ok) setModalNuevo(false);
            return ok;
          }}
        />
      )}

      {asignando && (
        <ModalAsignarPuntos
          persona={asignando}
          puntos={puntos}
          onCerrar={() => setAsignando(null)}
          onGuardar={(ids) => {
            asignarPuntos(asignando, ids);
            setAsignando(null);
          }}
        />
      )}

      {editando && (
        <ModalEditarPersona
          persona={editando}
          onCerrar={() => setEditando(null)}
          onGuardar={(nombre, rol) => {
            const ok = editarPersona(editando, nombre, rol);
            if (ok) setEditando(null);
            return ok;
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Modal: nueva persona (nombre + rol)                              */
/* ---------------------------------------------------------------- */
function ModalNuevaPersona({
  onCerrar,
  onAgregar,
}: {
  onCerrar: () => void;
  onAgregar: (nombre: string, rol: Rol) => boolean;
}) {
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Rol>("porcionador");
  const [error, setError] = useState<string | null>(null);

  function agregar() {
    if (!nombre.trim()) {
      setError("Escribe el nombre de la persona.");
      return;
    }
    const ok = onAgregar(nombre, rol);
    if (!ok) setError("Ya existe una persona con ese nombre en ese rol.");
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-brand-brown/10 px-5 py-4">
          <h2 className="font-serif text-lg font-bold text-brand-wine">Nueva persona</h2>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-brand-brown/50 hover:bg-brand-cream-soft" aria-label="Cerrar" title="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-brand-brown">Nombre</label>
            <input
              type="text"
              value={nombre}
              autoFocus
              onChange={(e) => { setNombre(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
              placeholder="Nombre completo"
              className="w-full rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm text-brand-black outline-none focus:border-brand-wine"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-brand-brown">Rol</label>
            <div className="grid grid-cols-2 gap-2">
              {(["porcionador", "domiciliario"] as Rol[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRol(r)}
                  title={`Rol: ${ETIQUETA_ROL[r]}`}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    rol === r
                      ? "border-brand-wine bg-brand-wine/5 text-brand-wine ring-1 ring-brand-wine"
                      : "border-brand-brown/20 text-brand-brown hover:bg-brand-cream-soft"
                  }`}
                >
                  {ETIQUETA_ROL[r]}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-brand-brown/10 px-5 py-4">
          <button onClick={onCerrar} title="Cancelar" className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft">
            Cancelar
          </button>
          <button onClick={agregar} title="Agregar la persona" className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90">
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Modal: asignar puntos de venta a una persona                     */
/* ---------------------------------------------------------------- */
function ModalAsignarPuntos({
  persona,
  puntos,
  onCerrar,
  onGuardar,
}: {
  persona: PersonaConRol;
  puntos: PuntoVenta[];
  onCerrar: () => void;
  onGuardar: (puntosIds: string[]) => void;
}) {
  const [seleccion, setSeleccion] = useState<string[]>(persona.puntos);
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return puntos;
    return puntos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.codigo ?? "").toLowerCase().includes(q),
    );
  }, [puntos, busca]);

  function alternar(id: string) {
    setSeleccion((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-brand-wine">Asignar puntos de venta</h2>
            <p className="text-xs text-brand-brown/50">
              {persona.nombre} · {ETIQUETA_ROL[persona.rol]}
            </p>
          </div>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-brand-brown/50 hover:bg-brand-cream-soft" aria-label="Cerrar" title="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="border-b border-brand-brown/10 px-5 py-3">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar punto de venta"
            className="w-full rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm text-brand-black outline-none focus:border-brand-wine"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filtrados.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-brand-brown/50">
              No se encontraron puntos de venta.
            </p>
          ) : (
            filtrados.map((pv) => {
              const id = String(pv.id);
              const marcado = seleccion.includes(id);
              return (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-brown hover:bg-brand-cream-soft/60"
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternar(id)}
                    className="h-4 w-4 accent-brand-wine"
                  />
                  <span className="min-w-0 truncate">
                    {pv.nombre}
                    {pv.codigo ? <span className="text-brand-brown/40"> ({pv.codigo})</span> : null}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-brand-brown/10 px-5 py-4">
          <span className="text-xs font-medium text-brand-brown/60">
            {seleccion.length} seleccionado{seleccion.length === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <button onClick={onCerrar} title="Cancelar" className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft">
              Cancelar
            </button>
            <button onClick={() => onGuardar(seleccion)} title="Guardar los puntos asignados" className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90">
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Modal: editar persona (nombre + rol)                             */
/* ---------------------------------------------------------------- */
function ModalEditarPersona({
  persona,
  onCerrar,
  onGuardar,
}: {
  persona: PersonaConRol;
  onCerrar: () => void;
  onGuardar: (nombre: string, rol: Rol) => boolean;
}) {
  const [nombre, setNombre] = useState(persona.nombre);
  const [rol, setRol] = useState<Rol>(persona.rol);
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    if (!nombre.trim()) {
      setError("Escribe el nombre de la persona.");
      return;
    }
    const ok = onGuardar(nombre, rol);
    if (!ok) setError("Ya existe una persona con ese nombre en ese rol.");
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-brand-brown/10 px-5 py-4">
          <h2 className="font-serif text-lg font-bold text-brand-wine">Editar persona</h2>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-brand-brown/50 hover:bg-brand-cream-soft" aria-label="Cerrar" title="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-brand-brown">Nombre</label>
            <input
              type="text"
              value={nombre}
              autoFocus
              onChange={(e) => { setNombre(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
              placeholder="Nombre completo"
              className="w-full rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm text-brand-black outline-none focus:border-brand-wine"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-brand-brown">Rol</label>
            <div className="grid grid-cols-2 gap-2">
              {(["porcionador", "domiciliario"] as Rol[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setRol(r); setError(null); }}
                  title={`Rol: ${ETIQUETA_ROL[r]}`}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    rol === r
                      ? "border-brand-wine bg-brand-wine/5 text-brand-wine ring-1 ring-brand-wine"
                      : "border-brand-brown/20 text-brand-brown hover:bg-brand-cream-soft"
                  }`}
                >
                  {ETIQUETA_ROL[r]}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-brand-brown/10 px-5 py-4">
          <button onClick={onCerrar} title="Cancelar" className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft">
            Cancelar
          </button>
          <button onClick={guardar} title="Guardar los cambios" className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
