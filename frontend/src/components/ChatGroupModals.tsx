"use client";

import { useMemo, useState } from "react";
import {
  actualizarGrupoChat,
  crearGrupoChat,
  leerArchivoComoBase64,
  type ContactoChat,
  type GrupoChatDetalle,
} from "@/lib/chat";

/** Tamaño máximo de imagen de grupo (antes de base64). */
const MAX_IMAGEN_BYTES = 5 * 1024 * 1024; // 5 MB

function AvatarGrupo({ nombre, imagen, tamano = "h-16 w-16" }: { nombre: string; imagen: string | null; tamano?: string }) {
  if (imagen) {
    return <img src={imagen} alt={nombre} className={`${tamano} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <div className={`flex ${tamano} shrink-0 items-center justify-center rounded-full bg-brand-wine/10 text-lg font-bold text-brand-wine`}>
      {nombre.charAt(0).toUpperCase() || "G"}
    </div>
  );
}

interface ModalCrearGrupoProps {
  contactos: ContactoChat[];
  onClose: () => void;
  onCreado: (grupo: GrupoChatDetalle) => void;
}

/** Modal para crear un grupo de chat: nombre, imagen y selección de participantes. */
export function ModalCrearGrupo({ contactos, onClose, onCreado }: ModalCrearGrupoProps) {
  const [nombre, setNombre] = useState("");
  const [imagen, setImagen] = useState<string | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const contactosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return contactos;
    return contactos.filter((c) => c.nombre.toLowerCase().includes(q) || c.rol.toLowerCase().includes(q));
  }, [contactos, busqueda]);

  function alternarSeleccion(id: string) {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  async function seleccionarImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    if (archivo.size > MAX_IMAGEN_BYTES) {
      setError("La imagen supera el máximo de 5 MB.");
      return;
    }
    try {
      const data = await leerArchivoComoBase64(archivo);
      setImagen(data);
    } catch {
      setError("No se pudo leer la imagen.");
    }
  }

  async function crear() {
    const n = nombre.trim();
    if (!n) {
      setError("Ponle un nombre al grupo.");
      return;
    }
    if (seleccionados.size === 0) {
      setError("Selecciona al menos un participante.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const grupo = await crearGrupoChat({ nombre: n, imagen, miembros: Array.from(seleccionados) });
      onCreado(grupo);
    } catch {
      setError("No se pudo crear el grupo. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-bold text-brand-black">Nuevo grupo</p>
          <button onClick={onClose} className="rounded-full p-1 text-brand-brown/50 hover:bg-brand-cream-soft" title="Cerrar">
            ×
          </button>
        </div>

        <div className="mb-3 flex items-center gap-3">
          <AvatarGrupo nombre={nombre || "G"} imagen={imagen} />
          <label className="cursor-pointer rounded-full border border-brand-brown/15 px-3 py-1.5 text-xs font-semibold text-brand-wine transition hover:bg-brand-cream-soft">
            {imagen ? "Cambiar imagen" : "Subir imagen"}
            <input type="file" accept="image/*" onChange={seleccionarImagen} className="hidden" />
          </label>
          {imagen && (
            <button onClick={() => setImagen(null)} className="text-xs text-brand-brown/50 underline">
              Quitar
            </button>
          )}
        </div>

        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del grupo"
          maxLength={120}
          className="mb-3 w-full rounded-lg border border-brand-brown/15 px-3 py-2 text-sm outline-none focus:border-brand-wine"
        />

        <p className="mb-1 text-xs font-semibold text-brand-brown/60">
          Participantes {seleccionados.size > 0 ? `(${seleccionados.size})` : ""}
        </p>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar usuario..."
          className="mb-2 w-full rounded-lg border border-brand-brown/15 bg-brand-cream-soft px-3 py-1.5 text-sm outline-none focus:border-brand-wine"
        />
        <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-brand-brown/10">
          {contactosFiltrados.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-brand-brown/40">Sin usuarios para mostrar.</p>
          )}
          {contactosFiltrados.map((c) => {
            const marcado = seleccionados.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => alternarSeleccion(c.id)}
                className="flex w-full items-center gap-2 border-b border-brand-brown/5 px-3 py-2 text-left last:border-b-0 hover:bg-brand-cream-soft"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    marcado ? "border-brand-wine bg-brand-wine text-white" : "border-brand-brown/30"
                  }`}
                >
                  {marcado && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-brand-black">{c.nombre}</span>
                  <span className="block truncate text-[11px] text-brand-brown/50">{c.rol}</span>
                </span>
              </button>
            );
          })}
        </div>

        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-1.5 text-sm font-semibold text-brand-brown/60 hover:bg-brand-cream-soft">
            Cancelar
          </button>
          <button
            onClick={crear}
            disabled={guardando}
            className="rounded-full bg-brand-wine px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-40"
          >
            {guardando ? "Creando..." : "Crear grupo"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ModalDetalleGrupoProps {
  grupo: GrupoChatDetalle;
  contactos: ContactoChat[];
  usuarioId: string;
  onClose: () => void;
  onActualizado: (grupo: GrupoChatDetalle) => void;
}

/** Modal de detalle de grupo: ver/editar nombre, imagen y participantes. */
export function ModalDetalleGrupo({ grupo, contactos, usuarioId, onClose, onActualizado }: ModalDetalleGrupoProps) {
  const [nombre, setNombre] = useState(grupo.nombre);
  const [imagen, setImagen] = useState<string | null>(grupo.imagen);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [agregando, setAgregando] = useState(false);

  const idsMiembros = useMemo(() => new Set(grupo.miembros.map((m) => m.id)), [grupo.miembros]);
  const disponibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return contactos.filter((c) => !idsMiembros.has(c.id) && c.nombre.toLowerCase().includes(q));
  }, [contactos, idsMiembros, busqueda]);

  const huboCambios = nombre.trim() !== grupo.nombre || imagen !== grupo.imagen;

  async function seleccionarImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    if (archivo.size > MAX_IMAGEN_BYTES) {
      setError("La imagen supera el máximo de 5 MB.");
      return;
    }
    try {
      const data = await leerArchivoComoBase64(archivo);
      setImagen(data);
    } catch {
      setError("No se pudo leer la imagen.");
    }
  }

  async function guardarCambios() {
    const n = nombre.trim();
    if (!n) {
      setError("El nombre no puede quedar vacío.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const actualizado = await actualizarGrupoChat(grupo.id, { nombre: n, imagen });
      onActualizado(actualizado);
    } catch {
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  async function agregarMiembro(id: string) {
    setAgregando(true);
    setError(null);
    try {
      const actualizado = await actualizarGrupoChat(grupo.id, { agregar: [id] });
      onActualizado(actualizado);
    } catch {
      setError("No se pudo agregar al usuario.");
    } finally {
      setAgregando(false);
    }
  }

  async function quitarMiembro(id: string) {
    setAgregando(true);
    setError(null);
    try {
      const actualizado = await actualizarGrupoChat(grupo.id, { quitar: [id] });
      onActualizado(actualizado);
    } catch {
      setError("No se pudo quitar al usuario.");
    } finally {
      setAgregando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-bold text-brand-black">Detalle del grupo</p>
          <button onClick={onClose} className="rounded-full p-1 text-brand-brown/50 hover:bg-brand-cream-soft" title="Cerrar">
            ×
          </button>
        </div>

        <div className="mb-3 flex items-center gap-3">
          <AvatarGrupo nombre={nombre || grupo.nombre} imagen={imagen} />
          <div className="flex flex-col gap-1">
            <label className="cursor-pointer rounded-full border border-brand-brown/15 px-3 py-1.5 text-xs font-semibold text-brand-wine transition hover:bg-brand-cream-soft">
              Cambiar imagen
              <input type="file" accept="image/*" onChange={seleccionarImagen} className="hidden" />
            </label>
            {imagen && (
              <button onClick={() => setImagen(null)} className="text-left text-xs text-brand-brown/50 underline">
                Quitar imagen
              </button>
            )}
          </div>
        </div>

        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del grupo"
          maxLength={120}
          className="mb-2 w-full rounded-lg border border-brand-brown/15 px-3 py-2 text-sm outline-none focus:border-brand-wine"
        />
        {huboCambios && (
          <button
            onClick={guardarCambios}
            disabled={guardando}
            className="mb-3 self-start rounded-full bg-brand-wine px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-40"
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        )}

        <p className="mb-1 text-xs font-semibold text-brand-brown/60">Participantes ({grupo.miembros.length})</p>
        <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-brand-brown/10">
          {grupo.miembros.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 border-b border-brand-brown/5 px-3 py-2 last:border-b-0">
              <div className="min-w-0">
                <p className="truncate text-sm text-brand-black">
                  {m.nombre}
                  {m.id === usuarioId ? " (Tú)" : ""}
                </p>
                <p className="truncate text-[11px] text-brand-brown/50">{m.rol}</p>
              </div>
              {m.id !== usuarioId && (
                <button
                  onClick={() => quitarMiembro(m.id)}
                  disabled={agregando}
                  className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="mb-1 text-xs font-semibold text-brand-brown/60">Agregar participantes</p>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar usuario..."
          className="mb-2 w-full rounded-lg border border-brand-brown/15 bg-brand-cream-soft px-3 py-1.5 text-sm outline-none focus:border-brand-wine"
        />
        <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-brand-brown/10">
          {disponibles.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-brand-brown/40">No hay más usuarios para agregar.</p>
          )}
          {disponibles.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 border-b border-brand-brown/5 px-3 py-2 last:border-b-0">
              <div className="min-w-0">
                <p className="truncate text-sm text-brand-black">{c.nombre}</p>
                <p className="truncate text-[11px] text-brand-brown/50">{c.rol}</p>
              </div>
              <button
                onClick={() => agregarMiembro(c.id)}
                disabled={agregando}
                className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-brand-wine hover:bg-brand-cream-soft disabled:opacity-40"
              >
                Agregar
              </button>
            </div>
          ))}
        </div>

        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

        <div className="flex items-center justify-end">
          <button onClick={onClose} className="rounded-full px-4 py-1.5 text-sm font-semibold text-brand-brown/60 hover:bg-brand-cream-soft">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
