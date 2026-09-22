"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUsuario } from "@/lib/auth";
import {
  listarContactosChat,
  historialChat,
  enviarMensajeChat,
  listarGruposChat,
  obtenerGrupoChat,
  historialGrupoChat,
  enviarMensajeGrupoChat,
  tipoAdjuntoDe,
  leerArchivoComoBase64,
  type ContactoChat,
  type MensajeChat,
  type AdjuntoChat,
  type GrupoChatResumen,
  type GrupoChatDetalle,
} from "@/lib/chat";
import { ModalCrearGrupo, ModalDetalleGrupo } from "./ChatGroupModals";

/** Tamaño máximo de archivo adjunto (antes de base64) para no reventar el body del backend. */
const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024; // 10 MB

/** Item unificado de la lista (contacto directo o grupo) para reutilizar el mismo renderizado. */
type ItemChat =
  | { tipo: "contacto"; id: string; nombre: string; imagen: null; subtitulo: string; noLeidos: number; ultimoMensaje: string | null; ultimoMensajeEn: string | null; ultimoMensajeEsMio: boolean; datos: ContactoChat }
  | { tipo: "grupo"; id: string; nombre: string; imagen: string | null; subtitulo: string; noLeidos: number; ultimoMensaje: string | null; ultimoMensajeEn: string | null; ultimoMensajeEsMio: boolean; datos: GrupoChatResumen };

function contactoAItem(c: ContactoChat): ItemChat {
  return {
    tipo: "contacto",
    id: c.id,
    nombre: c.nombre,
    imagen: null,
    subtitulo: `${c.rol}${c.puntos ? ` · ${c.puntos}` : ""}${!c.activo ? " · Inactivo" : ""}`,
    noLeidos: c.noLeidos || 0,
    ultimoMensaje: c.ultimoMensaje,
    ultimoMensajeEn: c.ultimoMensajeEn,
    ultimoMensajeEsMio: c.ultimoMensajeEsMio,
    datos: c,
  };
}

function grupoAItem(g: GrupoChatResumen): ItemChat {
  return {
    tipo: "grupo",
    id: g.id,
    nombre: g.nombre,
    imagen: g.imagen,
    subtitulo: `${g.miembros} participante${g.miembros === 1 ? "" : "s"}`,
    noLeidos: g.noLeidos || 0,
    ultimoMensaje: g.ultimoMensaje,
    ultimoMensajeEn: g.ultimoMensajeEn,
    ultimoMensajeEsMio: g.ultimoMensajeEsMio,
    datos: g,
  };
}


/** Timbre de notificación (campana de dos golpes con armónicos), más fuerte y lleno que un simple beep. */
function reproducirTimbre() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const ahora = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    // Dos golpes descendentes (mi -> si), cada uno con un armónico superpuesto
    // para que suene más a campana/timbre que a un pitido plano.
    const golpes = [
      { freq: 1318.5, inicio: 0, dur: 0.5 },
      { freq: 987.77, inicio: 0.16, dur: 0.55 },
    ];
    for (const g of golpes) {
      [1, 2].forEach((armonico) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = g.freq * armonico;
        const inicio = ahora + g.inicio;
        const pico = armonico === 1 ? 0.5 : 0.15;
        gain.gain.setValueAtTime(0, inicio);
        gain.gain.linearRampToValueAtTime(pico, inicio + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, inicio + g.dur);
        osc.connect(gain);
        gain.connect(master);
        osc.start(inicio);
        osc.stop(inicio + g.dur + 0.05);
      });
    }
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* el navegador puede bloquear audio sin interacción previa del usuario */
  }
}

/** Burbuja flotante de mensajería interna (visible en todo el panel/admin). */
export default function ChatBubble() {
  const usuario = getUsuario();
  const [abierto, setAbierto] = useState(false);
  const [contactos, setContactos] = useState<ContactoChat[]>([]);
  const [grupos, setGrupos] = useState<GrupoChatResumen[]>([]);
  const [activo, setActivo] = useState<ItemChat | null>(null);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [respondiendoA, setRespondiendoA] = useState<MensajeChat | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [totalNoLeidos, setTotalNoLeidos] = useState(0);
  const [adjuntoPendiente, setAdjuntoPendiente] = useState<AdjuntoChat | null>(null);
  const [errorAdjunto, setErrorAdjunto] = useState<string | null>(null);
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null);
  const [mostrarCrearGrupo, setMostrarCrearGrupo] = useState(false);
  const [detalleGrupo, setDetalleGrupo] = useState<GrupoChatDetalle | null>(null);
  // Preview flotante ("llegó un mensaje") arriba del ícono, se cierra sola a los 5s.
  const [preview, setPreview] = useState<{ item: ItemChat; texto: string } | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const archivoInputRef = useRef<HTMLInputElement>(null);
  const ahoraRef = useRef<string | undefined>(undefined);
  const enVueloRef = useRef(false);
  const listaRef = useRef<HTMLDivElement>(null);
  // No leídos por contacto/grupo de la consulta anterior (para saber a QUIÉN le llegó
  // un mensaje nuevo y mostrar su preview). null = aún no se cargó ninguna vez.
  const noLeidosPorContactoRef = useRef<Map<string, number> | null>(null);
  const noLeidosPorGrupoRef = useRef<Map<string, number> | null>(null);
  // La primera consulta del historial de una conversación es la carga inicial
  // (no "llegó un mensaje"); solo se suena el timbre desde la segunda en adelante.
  const primerPollRef = useRef(true);

  /** Combina mensajes evitando duplicados (mismo id ya presente en la lista). */
  const agregarMensajes = useCallback((nuevos: MensajeChat[]) => {
    if (nuevos.length === 0) return;
    setMensajes((prev) => {
      const vistos = new Set(prev.map((m) => m.id));
      const inedito = nuevos.filter((m) => !vistos.has(m.id));
      return inedito.length > 0 ? [...prev, ...inedito] : prev;
    });
  }, []);

  /** Muestra el preview flotante de un contacto/grupo y lo cierra solo a los 5 s. */
  const mostrarPreview = useCallback((item: ItemChat, texto: string) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setPreview({ item, texto });
    previewTimerRef.current = setTimeout(() => setPreview(null), 5000);
  }, []);

  /** Abre una conversación (directa o de grupo) desde el preview o la lista. */
  const abrirConversacion = useCallback((item: ItemChat) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setPreview(null);
    setActivo(item);
    setAbierto(true);
  }, []);

  // Contactos + grupos + no leídos: se consulta SIEMPRE (esté o no abierto el chat).
  // Por cada contacto/grupo cuyo `noLeidos` SUBIÓ desde la consulta anterior, es que le
  // llegó un mensaje nuevo: suena el timbre y muestra el preview flotante (salvo
  // que ya esté viendo esa misma conversación, donde ya se encarga el polling
  // del historial de abajo).
  useEffect(() => {
    if (!usuario) return;
    let cancelado = false;
    const revisar = async () => {
      try {
        const [datosContactos, datosGrupos] = await Promise.all([
          listarContactosChat(),
          listarGruposChat().catch(() => [] as GrupoChatResumen[]),
        ]);
        if (cancelado) return;
        setContactos(datosContactos);
        setGrupos(datosGrupos);
        setTotalNoLeidos(
          datosContactos.reduce((s, c) => s + (c.noLeidos || 0), 0) +
            datosGrupos.reduce((s, g) => s + (g.noLeidos || 0), 0),
        );

        const previosContactos = noLeidosPorContactoRef.current;
        const previosGrupos = noLeidosPorGrupoRef.current;
        if (previosContactos && previosGrupos) {
          let destacado: ItemChat | null = null;
          for (const c of datosContactos) {
            const antes = previosContactos.get(c.id) ?? 0;
            if (c.noLeidos > antes && !(abierto && activo?.tipo === "contacto" && activo.id === c.id)) {
              destacado = contactoAItem(c);
            }
          }
          for (const g of datosGrupos) {
            const antes = previosGrupos.get(g.id) ?? 0;
            if (g.noLeidos > antes && !(abierto && activo?.tipo === "grupo" && activo.id === g.id)) {
              destacado = grupoAItem(g);
            }
          }
          if (destacado) {
            reproducirTimbre();
            mostrarPreview(destacado, destacado.ultimoMensaje || "Nuevo mensaje");
          }
        }
        noLeidosPorContactoRef.current = new Map(datosContactos.map((c) => [c.id, c.noLeidos || 0]));
        noLeidosPorGrupoRef.current = new Map(datosGrupos.map((g) => [g.id, g.noLeidos || 0]));
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
  }, [usuario, abierto, activo, mostrarPreview]);

  // Historial de la conversación activa: polling incremental (contacto directo o grupo).
  useEffect(() => {
    if (!abierto || !activo) return;
    ahoraRef.current = undefined;
    primerPollRef.current = true;
    setMensajes([]);
    setRespondiendoA(null);
    setAdjuntoPendiente(null);
    setErrorAdjunto(null);

    const poll = async () => {
      if (enVueloRef.current) return;
      enVueloRef.current = true;
      try {
        const { mensajes: nuevos, ahora } =
          activo.tipo === "grupo"
            ? await historialGrupoChat(activo.id, ahoraRef.current)
            : await historialChat(activo.id, ahoraRef.current);
        ahoraRef.current = ahora;
        // Suena el timbre si llegó un mensaje NUEVO del otro (no en la carga inicial).
        if (!primerPollRef.current && nuevos.some((m) => m.remitente_id !== usuario?.id)) {
          reproducirTimbre();
        }
        primerPollRef.current = false;
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
  }, [abierto, activo, agregarMensajes, usuario?.id]);

  // Auto-scroll al final cuando llegan mensajes nuevos.
  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [mensajes]);

  // Limpia el temporizador del preview al desmontar.
  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);

  const gruposItems = useMemo(() => grupos.map(grupoAItem), [grupos]);
  const contactosItems = useMemo(() => contactos.map(contactoAItem), [contactos]);

  const gruposFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return gruposItems;
    return gruposItems.filter((g) => g.nombre.toLowerCase().includes(q));
  }, [gruposItems, busqueda]);

  const contactosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return contactosItems;
    return contactosItems.filter(
      (c) => c.nombre.toLowerCase().includes(q) || c.subtitulo.toLowerCase().includes(q),
    );
  }, [contactosItems, busqueda]);

  /** Nombre a mostrar para un remitente dentro de la conversación activa. */
  const nombreDeRemitente = useCallback(
    (remitenteId: string, remitenteNombre?: string | null) => {
      if (remitenteId === usuario?.id) return "Tú";
      if (remitenteNombre) return remitenteNombre;
      if (activo && activo.tipo === "contacto") return activo.nombre;
      return "Alguien";
    },
    [usuario?.id, activo],
  );

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
      const enviado =
        activo.tipo === "grupo"
          ? await enviarMensajeGrupoChat(activo.id, t, respondeAId, adjunto)
          : await enviarMensajeChat(activo.id, t, respondeAId, adjunto);
      agregarMensajes([enviado]);
      ahoraRef.current = enviado.creado_en;
    } catch {
      setTexto(t);
      if (adjunto) setAdjuntoPendiente(adjunto);
    } finally {
      setEnviando(false);
    }
  }

  async function abrirDetalleGrupo() {
    if (!activo || activo.tipo !== "grupo") return;
    try {
      const detalle = await obtenerGrupoChat(activo.id);
      setDetalleGrupo(detalle);
    } catch {
      /* silencioso */
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
            {activo && activo.tipo === "grupo" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 text-xs font-bold">
                {activo.imagen ? (
                  <img src={activo.imagen} alt={activo.nombre} className="h-full w-full object-cover" />
                ) : (
                  activo.nombre.charAt(0).toUpperCase()
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {activo ? activo.nombre : "Mensajes"}
              </p>
              {activo && <p className="truncate text-[11px] text-white/70">{activo.subtitulo}</p>}
            </div>
            {activo && activo.tipo === "grupo" && (
              <button
                onClick={abrirDetalleGrupo}
                className="rounded-full p-1 transition hover:bg-white/10"
                title="Ver detalle del grupo"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" d="M12 8h.01M11 12h1v4h1" />
                </svg>
              </button>
            )}
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
              <div className="flex items-center gap-2 border-b border-brand-brown/10 p-2">
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar usuario o grupo..."
                  className="min-w-0 flex-1 rounded-lg border border-brand-brown/15 bg-brand-cream-soft px-3 py-1.5 text-sm outline-none focus:border-brand-wine"
                />
                <button
                  onClick={() => setMostrarCrearGrupo(true)}
                  title="Nuevo grupo"
                  className="flex shrink-0 items-center gap-1 rounded-full bg-brand-wine px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-wine/90"
                >
                  + Grupo
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {gruposFiltrados.length === 0 && contactosFiltrados.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-brand-brown/50">
                    Sin usuarios para mostrar.
                  </p>
                )}
                {gruposFiltrados.length > 0 && (
                  <p className="px-4 pt-2 text-[11px] font-bold uppercase tracking-wide text-brand-brown/40">
                    Grupos
                  </p>
                )}
                {gruposFiltrados.map((g) => (
                  <button
                    key={`grupo-${g.id}`}
                    onClick={() => abrirConversacion(g)}
                    className="flex w-full items-center gap-3 border-b border-brand-brown/5 px-4 py-2.5 text-left transition hover:bg-brand-cream-soft"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-wine/10 text-sm font-bold text-brand-wine">
                      {g.imagen ? (
                        <img src={g.imagen} alt={g.nombre} className="h-full w-full object-cover" />
                      ) : (
                        g.nombre.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-brand-black">{g.nombre}</p>
                        {g.noLeidos > 0 && (
                          <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-brand-wine px-1 text-[10px] font-bold text-white">
                            {g.noLeidos}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-brand-brown/50">{g.subtitulo}</p>
                      {g.ultimoMensaje && (
                        <p className="truncate text-xs text-brand-brown/60">
                          {g.ultimoMensajeEsMio ? "Tú: " : ""}
                          {g.ultimoMensaje}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
                {contactosFiltrados.length > 0 && (
                  <p className="px-4 pt-2 text-[11px] font-bold uppercase tracking-wide text-brand-brown/40">
                    Contactos
                  </p>
                )}
                {contactosFiltrados.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => abrirConversacion(c)}
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
                      <p className="truncate text-[11px] text-brand-brown/50">{c.subtitulo}</p>
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
                  const mensajeCitado = m.responde_a_id
                    ? mensajes.find((x) => x.id === m.responde_a_id)
                    : undefined;
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
                        {!esMio && activo.tipo === "grupo" && (
                          <p className="mb-0.5 text-xs font-bold text-brand-wine">
                            {m.remitente_nombre ?? "Alguien"}
                          </p>
                        )}
                        {m.responde_a_contenido && (
                          <div
                            className={`mb-1 rounded-lg border-l-2 px-2 py-1 text-xs ${
                              esMio
                                ? "border-white/60 bg-white/10 text-white/80"
                                : "border-brand-wine/60 bg-black/5 text-brand-brown/70"
                            }`}
                          >
                            <p className="font-semibold">
                              {nombreDeRemitente(m.responde_a_remitente_id ?? "", mensajeCitado?.remitente_nombre)}
                            </p>
                            <p className="truncate">{m.responde_a_contenido}</p>
                          </div>
                        )}
                        {m.adjunto_data && m.adjunto_tipo === "imagen" && (
                          <button
                            type="button"
                            onClick={() => setImagenAmpliada(m.adjunto_data)}
                            className="block w-full"
                          >                            <img
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
                      {nombreDeRemitente(respondiendoA.remitente_id, respondiendoA.remitente_nombre)}
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

      {preview && (
        <button
          type="button"
          onClick={() => abrirConversacion(preview.item)}
          className={`fixed right-6 z-[55] flex w-72 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-2xl border border-brand-brown/10 bg-white p-3 text-left shadow-2xl transition hover:shadow-[0_0_0_2px_rgba(122,25,54,0.15)] ${
            abierto ? "bottom-[33rem]" : "bottom-24"
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-wine text-sm font-bold text-white">
            {preview.item.imagen ? (
              <img src={preview.item.imagen} alt={preview.item.nombre} className="h-full w-full object-cover" />
            ) : (
              preview.item.nombre.slice(0, 1).toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-bold text-brand-black">{preview.item.nombre}</span>
              <span className="shrink-0 rounded-full bg-brand-wine/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-wine">
                Nuevo
              </span>
            </span>
            <span className="mt-0.5 line-clamp-2 block text-xs text-brand-brown/70">{preview.texto}</span>
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setPreview(null);
              if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
            }}
            title="Cerrar"
            className="shrink-0 rounded-md p-0.5 text-brand-brown/40 transition hover:bg-brand-cream-soft hover:text-brand-brown"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </span>
        </button>
      )}

      {mostrarCrearGrupo && (
        <ModalCrearGrupo
          contactos={contactos}
          onClose={() => setMostrarCrearGrupo(false)}
          onCreado={(grupo) => {
            setMostrarCrearGrupo(false);
            setGrupos((prev) => [
              { id: grupo.id, nombre: grupo.nombre, imagen: grupo.imagen, miembros: grupo.miembros.length, noLeidos: 0, ultimoMensaje: null, ultimoMensajeEn: null, ultimoMensajeEsMio: false },
              ...prev,
            ]);
            abrirConversacion(grupoAItem({
              id: grupo.id,
              nombre: grupo.nombre,
              imagen: grupo.imagen,
              miembros: grupo.miembros.length,
              noLeidos: 0,
              ultimoMensaje: null,
              ultimoMensajeEn: null,
              ultimoMensajeEsMio: false,
            }));
          }}
        />
      )}

      {detalleGrupo && (
        <ModalDetalleGrupo
          grupo={detalleGrupo}
          contactos={contactos}
          usuarioId={usuario.id}
          onClose={() => setDetalleGrupo(null)}
          onActualizado={(actualizado) => {
            setDetalleGrupo(actualizado);
            setGrupos((prev) =>
              prev.map((g) =>
                g.id === actualizado.id
                  ? { ...g, nombre: actualizado.nombre, imagen: actualizado.imagen, miembros: actualizado.miembros.length }
                  : g,
              ),
            );
            setActivo((prev) =>
              prev && prev.tipo === "grupo" && prev.id === actualizado.id
                ? grupoAItem({ ...prev.datos, nombre: actualizado.nombre, imagen: actualizado.imagen, miembros: actualizado.miembros.length })
                : prev,
            );
          }}
        />
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
