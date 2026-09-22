"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUsuario } from "@/lib/auth";
import {
  listarContactosChat,
  noLeidosChat,
  historialChat,
  enviarMensajeChat,
  type ContactoChat,
  type MensajeChat,
  type AdjuntoChat,
} from "@/lib/chat";

/** Tamaño máximo de archivo adjunto (antes de base64) para no reventar el body del backend. */
const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024; // 10 MB

function tipoAdjuntoDe(mime: string): "imagen" | "video" | "archivo" {
  if (mime.startsWith("image/")) return "imagen";
  if (mime.startsWith("video/")) return "video";
  return "archivo";
}

function leerArchivoComoBase64(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
}

/** Burbuja flotante de mensajería interna (visible en todo el panel/admin). */
export default function ChatBubble() {
  const usuario = getUsuario();
  const [abierto, setAbierto] = useState(false);
  const [contactos, setContactos] = useState<ContactoChat[]>([]);
  const [activo, setActivo] = useState<ContactoChat | null>(null);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [respondiendoA, setRespondiendoA] = useState<MensajeChat | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [totalNoLeidos, setTotalNoLeidos] = useState(0);
  const [adjuntoPendiente, setAdjuntoPendiente] = useState<AdjuntoChat | null>(null);
  const [errorAdjunto, setErrorAdjunto] = useState<string | null>(null);
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null);
  const archivoInputRef = useRef<HTMLInputElement>(null);
  const ahoraRef = useRef<string | undefined>(undefined);
  const enVueloRef = useRef(false);
  const listaRef = useRef<HTMLDivElement>(null);

  /** Combina mensajes evitando duplicados (mismo id ya presente en la lista). */
  const agregarMensajes = useCallback((nuevos: MensajeChat[]) => {
    if (nuevos.length === 0) return;
    setMensajes((prev) => {
      const vistos = new Set(prev.map((m) => m.id));
      const inedito = nuevos.filter((m) => !vistos.has(m.id));
      return inedito.length > 0 ? [...prev, ...inedito] : prev;
    });
  }, []);

  const cargarContactos = useCallback(async () => {
    try {
      const data = await listarContactosChat();
      setContactos(data);
    } catch {
      /* silencioso: no interrumpe la navegación por un fallo de red puntual */
    }
  }, []);

  // Badge de no leídos: se consulta siempre (esté o no abierto el chat).
  useEffect(() => {
    if (!usuario) return;
    let cancelado = false;
    const revisar = async () => {
      try {
        const { total } = await noLeidosChat();
        if (!cancelado) setTotalNoLeidos(total);
      } catch {
        /* silencioso */
      }
    };
    revisar();
    const id = setInterval(revisar, 8000);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [usuario]);

  // Lista de contactos: se refresca mientras el panel está abierto.
  useEffect(() => {
    if (!abierto) return;
    cargarContactos();
    const id = setInterval(cargarContactos, 8000);
    return () => clearInterval(id);
  }, [abierto, cargarContactos]);

  // Historial de la conversación activa: polling incremental.
  useEffect(() => {
    if (!abierto || !activo) return;
    ahoraRef.current = undefined;
    setMensajes([]);
    setRespondiendoA(null);
    setAdjuntoPendiente(null);
    setErrorAdjunto(null);

    const poll = async () => {
      if (enVueloRef.current) return;
      enVueloRef.current = true;
      try {
        const { mensajes: nuevos, ahora } = await historialChat(
          activo.id,
          ahoraRef.current,
        );
        ahoraRef.current = ahora;
        agregarMensajes(nuevos);
      } catch {
        /* silencioso */
      } finally {
        enVueloRef.current = false;
      }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [abierto, activo, agregarMensajes]);

  // Auto-scroll al final cuando llegan mensajes nuevos.
  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [mensajes]);

  const contactosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return contactos;
    return contactos.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.rol.toLowerCase().includes(q) ||
        c.puntos.toLowerCase().includes(q),
    );
  }, [contactos, busqueda]);

  async function seleccionarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setErrorAdjunto(null);
    if (archivo.size > MAX_ADJUNTO_BYTES) {
      setErrorAdjunto("El archivo supera el máximo de 10 MB.");
      return;
    }
    try {
      const data = await leerArchivoComoBase64(archivo);
      setAdjuntoPendiente({
        data,
        mime: archivo.type || "application/octet-stream",
        nombre: archivo.name,
        tipo: tipoAdjuntoDe(archivo.type || ""),
      });
    } catch {
      setErrorAdjunto("No se pudo leer el archivo.");
    }
  }

  async function enviar() {
    const t = texto.trim();
    if ((!t && !adjuntoPendiente) || !activo || enviando) return;
    setEnviando(true);
    setTexto("");
    const adjunto = adjuntoPendiente ?? undefined;
    setAdjuntoPendiente(null);
    const respondeAId = respondiendoA?.id;
    setRespondiendoA(null);
    try {
      const enviado = await enviarMensajeChat(activo.id, t, respondeAId, adjunto);
      agregarMensajes([enviado]);
      ahoraRef.current = enviado.creado_en;
    } catch {
      setTexto(t);
      if (adjunto) setAdjuntoPendiente(adjunto);
    } finally {
      setEnviando(false);
    }
  }

  if (!usuario) return null;

  return (
    <>
      {abierto && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-2xl">
          {/* Cabecera */}
          <div className="flex items-center gap-2 bg-brand-wine px-4 py-3 text-white">
            {activo && (
              <button
                onClick={() => setActivo(null)}
                className="rounded-full p-1 transition hover:bg-white/10"
                title="Volver"
              >
                ←
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {activo ? activo.nombre : "Mensajes"}
              </p>
              {activo && (
                <p className="truncate text-[11px] text-white/70">
                  {activo.rol}
                  {activo.puntos ? ` · ${activo.puntos}` : ""}
                </p>
              )}
            </div>
            <button
              onClick={() => setAbierto(false)}
              className="rounded-full p-1 text-lg leading-none transition hover:bg-white/10"
              title="Cerrar"
            >
              ×
            </button>
          </div>

          {!activo ? (
            <>
              <div className="border-b border-brand-brown/10 p-2">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar usuario..."
                  className="w-full rounded-lg border border-brand-brown/15 bg-brand-cream-soft px-3 py-1.5 text-sm outline-none focus:border-brand-wine"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {contactosFiltrados.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-brand-brown/50">
                    Sin usuarios para mostrar.
                  </p>
                )}
                {contactosFiltrados.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActivo(c)}
                    className="flex w-full items-center gap-3 border-b border-brand-brown/5 px-4 py-2.5 text-left transition hover:bg-brand-cream-soft"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-wine/10 text-sm font-bold text-brand-wine">
                      {c.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-brand-black">{c.nombre}</p>
                        {c.noLeidos > 0 && (
                          <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-brand-wine px-1 text-[10px] font-bold text-white">
                            {c.noLeidos}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-brand-brown/50">
                        {c.rol}
                        {c.puntos ? ` · ${c.puntos}` : ""}
                        {!c.activo ? " · Inactivo" : ""}
                      </p>
                      {c.ultimoMensaje && (
                        <p className="truncate text-xs text-brand-brown/60">
                          {c.ultimoMensajeEsMio ? "Tú: " : ""}
                          {c.ultimoMensaje}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div ref={listaRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {mensajes.length === 0 && (
                  <p className="mt-4 text-center text-xs text-brand-brown/40">
                    Aún no hay mensajes. ¡Escribe el primero!
                  </p>
                )}
                {mensajes.map((m) => {
                  const esMio = m.remitente_id === usuario.id;
                  const botonResponder = (
                    <button
                      onClick={() => setRespondiendoA(m)}
                      title="Responder"
                      className="mb-1 shrink-0 self-end rounded-full p-1 text-brand-brown/30 opacity-0 transition group-hover:opacity-100 hover:bg-brand-cream-soft hover:text-brand-wine"
                    >
                      ↩
                    </button>
                  );
                  return (
                    <div key={m.id} className={`group flex items-end gap-1 ${esMio ? "justify-end" : "justify-start"}`}>
                      {esMio && botonResponder}
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-sm ${
                          esMio
                            ? "rounded-br-sm bg-brand-wine text-white"
                            : "rounded-bl-sm bg-brand-cream-soft text-brand-black"
                        }`}
                      >
                        {m.responde_a_contenido && (
                          <div
                            className={`mb-1 rounded-lg border-l-2 px-2 py-1 text-xs ${
                              esMio
                                ? "border-white/60 bg-white/10 text-white/80"
                                : "border-brand-wine/60 bg-black/5 text-brand-brown/70"
                            }`}
                          >
                            <p className="font-semibold">
                              {m.responde_a_remitente_id === usuario.id ? "Tú" : activo.nombre}
                            </p>
                            <p className="truncate">{m.responde_a_contenido}</p>
                          </div>
                        )}
                        {m.adjunto_data && m.adjunto_tipo === "imagen" && (
                          <button
                            type="button"
                            onClick={() => setImagenAmpliada(m.adjunto_data)}
                            className="block w-full"
                          >
                            <img
                              src={m.adjunto_data}
                              alt={m.adjunto_nombre ?? "Imagen"}
                              className="mb-1 max-h-48 w-full cursor-zoom-in rounded-lg object-cover"
                            />
                          </button>
                        )}
                        {m.adjunto_data && m.adjunto_tipo === "video" && (
                          <video
                            src={m.adjunto_data}
                            controls
                            className="mb-1 max-h-48 w-full rounded-lg"
                          />
                        )}
                        {m.adjunto_data && m.adjunto_tipo === "archivo" && (
                          <a
                            href={m.adjunto_data}
                            download={m.adjunto_nombre ?? undefined}
                            className={`mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs underline ${
                              esMio ? "bg-white/10 text-white" : "bg-black/5 text-brand-black"
                            }`}
                          >
                            📎 {m.adjunto_nombre ?? "Archivo"}
                          </a>
                        )}
                        {m.contenido && (
                          <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
                        )}
                        <p className={`mt-0.5 text-[10px] ${esMio ? "text-white/60" : "text-brand-brown/40"}`}>
                          {new Date(m.creado_en).toLocaleTimeString("es-CO", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {!esMio && botonResponder}
                    </div>
                  );
                })}
              </div>
              {respondiendoA && (
                <div className="flex items-center gap-2 border-t border-brand-brown/10 bg-brand-cream-soft px-3 py-2">
                  <div className="min-w-0 flex-1 border-l-2 border-brand-wine pl-2">
                    <p className="text-xs font-semibold text-brand-wine">
                      {respondiendoA.remitente_id === usuario.id ? "Tú" : activo.nombre}
                    </p>
                    <p className="truncate text-xs text-brand-brown/60">{respondiendoA.contenido}</p>
                  </div>
                  <button
                    onClick={() => setRespondiendoA(null)}
                    className="shrink-0 rounded-full p-1 text-brand-brown/50 transition hover:bg-brand-brown/10"
                    title="Cancelar respuesta"
                  >
                    ×
                  </button>
                </div>
              )}
              {errorAdjunto && (
                <div className="flex items-center justify-between gap-2 border-t border-brand-brown/10 bg-red-50 px-3 py-1.5">
                  <p className="text-xs text-red-600">{errorAdjunto}</p>
                  <button
                    onClick={() => setErrorAdjunto(null)}
                    className="shrink-0 rounded-full p-1 text-red-500 hover:bg-red-100"
                  >
                    ×
                  </button>
                </div>
              )}
              {adjuntoPendiente && (
                <div className="flex items-center gap-2 border-t border-brand-brown/10 bg-brand-cream-soft px-3 py-2">
                  {adjuntoPendiente.tipo === "imagen" ? (
                    <img
                      src={adjuntoPendiente.data}
                      alt={adjuntoPendiente.nombre}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : adjuntoPendiente.tipo === "video" ? (
                    <video src={adjuntoPendiente.data} className="h-12 w-12 rounded-lg object-cover" muted />
                  ) : (
                    <span className="text-2xl">📎</span>
                  )}
                  <p className="min-w-0 flex-1 truncate text-xs text-brand-brown/70">{adjuntoPendiente.nombre}</p>
                  <button
                    onClick={() => setAdjuntoPendiente(null)}
                    className="shrink-0 rounded-full p-1 text-brand-brown/50 transition hover:bg-brand-brown/10"
                    title="Quitar adjunto"
                  >
                    ×
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 border-t border-brand-brown/10 p-2">
                <input
                  ref={archivoInputRef}
                  type="file"
                  onChange={seleccionarArchivo}
                  className="hidden"
                />
                <button
                  onClick={() => archivoInputRef.current?.click()}
                  disabled={enviando}
                  title="Adjuntar foto o video"
                  className="shrink-0 rounded-full p-2 text-brand-brown/60 transition hover:bg-brand-cream-soft hover:text-brand-wine disabled:opacity-40"
                >
                  📎
                </button>
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviar();
                    }
                  }}
                  disabled={enviando}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 rounded-full border border-brand-brown/15 px-3 py-1.5 text-sm outline-none focus:border-brand-wine disabled:opacity-60"
                />
                <button
                  onClick={enviar}
                  disabled={(!texto.trim() && !adjuntoPendiente) || enviando}
                  className="rounded-full bg-brand-wine px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-40"
                >
                  Enviar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setAbierto((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-wine text-white shadow-2xl transition hover:bg-brand-wine/90"
        title="Chatear"
      >
        {abierto ? (
          <span className="text-2xl leading-none">×</span>
        ) : (
          <span className="text-2xl leading-none">💬</span>
        )}
        {!abierto && totalNoLeidos > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {totalNoLeidos > 99 ? "99+" : totalNoLeidos}
          </span>
        )}
      </button>

      {imagenAmpliada && (
        <div
          onClick={() => setImagenAmpliada(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
        >
          <button
            onClick={() => setImagenAmpliada(null)}
            title="Cerrar"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-2xl leading-none text-white transition hover:bg-white/20"
          >
            ×
          </button>
          <img
            src={imagenAmpliada}
            alt="Imagen ampliada"
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </>
  );
}
