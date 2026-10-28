"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import {
  estadoAccesoTrabajador,
  loginTrabajador,
  verificarCedulaTrabajador,
  registrarTrabajador,
  type SesionTrabajador,
} from "@/lib/tienda-empleados";

/** Redimensiona/comprime la foto en el navegador (evita subir 5-12 MP y que el OCR tumbe el backend). */
async function comprimirImagen(file: File, maxLado = 2200, calidad = 0.9): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("No se pudo leer la foto. Vuelve a seleccionarla."));
    r.readAsDataURL(file);
  });
  const img = document.createElement("img");
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("No se pudo abrir la foto. Usa una imagen JPG o PNG."));
    img.src = dataUrl;
  });
  const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no pudo procesar la foto. Intenta con otro navegador actualizado.");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", calidad);
}

type FiltroFoto = "original" | "contraste" | "blanco-negro";

async function filtrarFoto(original: string, filtro: FiltroFoto): Promise<string> {
  if (filtro === "original") return original;
  const imagen = new Image();
  await new Promise<void>((resolve, reject) => {
    imagen.onload = () => resolve();
    imagen.onerror = () => reject(new Error("No se pudo procesar la foto."));
    imagen.src = original;
  });
  const canvas = document.createElement("canvas");
  canvas.width = imagen.naturalWidth;
  canvas.height = imagen.naturalHeight;
  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("No se pudo procesar la foto.");
  contexto.filter = filtro === "contraste" ? "grayscale(1) contrast(1.35)" : "grayscale(1) contrast(2) brightness(1.1)";
  contexto.drawImage(imagen, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Acceso del trabajador a la tienda (contenido del formulario, sin contenedor).
 * Flujo: cédula → si ya tiene contraseña la pide; si es primer ingreso, pide
 * foto de la cédula (verificada por OCR) y crear contraseña.
 */
export default function TiendaAcceso({
  onAutenticado,
}: {
  onAutenticado: (s: SesionTrabajador) => void;
}) {
  const [paso, setPaso] = useState<"cedula" | "clave" | "registro-foto" | "registro-clave">("cedula");
  const [cedula, setCedula] = useState("");
  const [nombre, setNombre] = useState<string | null>(null);
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroFoto>("contraste");
  const [preparando, setPreparando] = useState(false);
  const preparacion = useRef(0);
  const [verClave, setVerClave] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  async function cargarFoto(file?: File) {
    if (!file) return;
    const turno = ++preparacion.current;
    setPreparando(true);
    setError(null);
    setFoto(null);
    setOriginal(null);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("La foto es demasiado pesada. Elige una de menos de 25 MB.");
      const fuente = await comprimirImagen(file);
      const procesada = await filtrarFoto(fuente, "contraste");
      if (turno !== preparacion.current) return;
      setOriginal(fuente);
      setFiltro("contraste");
      setFoto(procesada);
    } catch (e) {
      if (turno === preparacion.current) setError(e instanceof Error ? e.message : "No se pudo abrir la imagen. Usa una foto JPG o PNG.");
    } finally {
      if (turno === preparacion.current) setPreparando(false);
    }
  }

  async function cambiarFiltro(nuevo: FiltroFoto) {
    if (!original) return;
    const turno = ++preparacion.current;
    setPreparando(true);
    setError(null);
    try {
      const procesada = await filtrarFoto(original, nuevo);
      if (turno !== preparacion.current) return;
      setFiltro(nuevo);
      setFoto(procesada);
    } catch (e) {
      if (turno === preparacion.current) setError(e instanceof Error ? e.message : "No se pudo aplicar el filtro.");
    } finally {
      if (turno === preparacion.current) setPreparando(false);
    }
  }

  function limpiarFoto() {
    preparacion.current += 1;
    setFoto(null);
    setOriginal(null);
    setPreparando(false);
    if (fotoRef.current) fotoRef.current.value = "";
    if (galeriaRef.current) galeriaRef.current.value = "";
  }

  async function continuarCedula() {
    const c = cedula.trim();
    if (!c) { setError("Ingresa tu número de cédula."); return; }
    setCargando(true); setError(null);
    try {
      const est = await estadoAccesoTrabajador(c);
      if (!est.encontrado) { setError("Tu cédula no está registrada en el crédito de empleados."); return; }
      if (!est.activo) { setError("Tu crédito no está activo. Comunícate con nómina."); return; }
      setNombre(est.nombre);
      setPaso(est.registrado ? "clave" : "registro-foto");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo verificar tu cédula.");
    } finally {
      setCargando(false);
    }
  }

  async function entrar() {
    if (!clave) { setError("Ingresa tu contraseña."); return; }
    setCargando(true); setError(null);
    try {
      onAutenticado(await loginTrabajador(cedula.trim(), clave));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión.");
    } finally {
      setCargando(false);
    }
  }

  async function verificarFoto() {
    if (preparando) return;
    if (!foto) { setError("Toma la foto de tu cédula para continuar."); return; }
    setCargando(true); setError(null);
    try {
      const r = await verificarCedulaTrabajador({ cedula: cedula.trim(), foto });
      if (r?.nombre) setNombre(r.nombre);
      setPaso("registro-clave");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos verificar tu cédula.");
    } finally {
      setCargando(false);
    }
  }

  async function crearClave() {
    if (clave.length < 4) { setError("La contraseña debe tener al menos 4 caracteres."); return; }
    if (clave !== clave2) { setError("Las contraseñas no coinciden."); return; }
    setCargando(true); setError(null);
    try {
      onAutenticado(await registrarTrabajador({ cedula: cedula.trim(), clave }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la contraseña.");
    } finally {
      setCargando(false);
    }
  }

  function volver() {
    limpiarFoto();
    setPaso("cedula"); setClave(""); setClave2(""); setError(null);
  }

  const inputCls =
    "w-full rounded-2xl border border-brand-brown/15 bg-brand-cream-soft/60 px-4 py-3 text-brand-black outline-none transition focus:border-brand-amber focus:bg-white focus:ring-4 focus:ring-brand-amber/15";
  const btnCls =
    "w-full rounded-2xl bg-brand-amber px-5 py-3 font-extrabold text-white shadow-md shadow-brand-amber/30 transition hover:bg-brand-amber-light active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

  // ── Paso 1: cédula ──────────────────────────────────────────────────────────
  if (paso === "cedula") {
    return (
      <div>
        <h2 className="font-serif text-2xl font-extrabold text-brand-wine">Identifícate</h2>
        <p className="mt-1 text-xs font-medium text-brand-black">Ingresa tu cédula para comprar</p>
        <input
          value={cedula}
          onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && continuarCedula()}
          inputMode="numeric"
          placeholder="Número de cédula"
          className={`mt-5 ${inputCls}`}
          autoFocus
        />
        <button onClick={continuarCedula} disabled={cargando} className={`mt-3 ${btnCls}`}>
          {cargando ? "Verificando…" : "Continuar"}
        </button>
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      </div>
    );
  }

  // ── Paso 2: contraseña (ya registrado) ──────────────────────────────────────
  if (paso === "clave") {
    return (
      <div>
        <button onClick={volver} className="mb-2 text-xs font-semibold text-brand-black hover:text-brand-amber">← Cambiar cédula</button>
        <h2 className="font-serif text-2xl font-extrabold text-brand-wine">Hola, {nombre?.split(" ")[0] ?? ""}</h2>
        <p className="mt-1 text-xs font-medium text-brand-black">Ingresa tu contraseña para continuar</p>
        <div className="relative mt-5">
          <input
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            type={verClave ? "text" : "password"}
            placeholder="Contraseña"
            className={inputCls}
            autoFocus
          />
          <button type="button" onClick={() => setVerClave((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-brand-black hover:text-brand-amber">
            {verClave ? "Ocultar" : "Ver"}
          </button>
        </div>
        <button onClick={entrar} disabled={cargando} className={`mt-3 ${btnCls}`}>
          {cargando ? "Entrando…" : "Entrar"}
        </button>
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      </div>
    );
  }

  // ── Paso 3a: registro · foto de la cédula ───────────────────────────────────
  if (paso === "registro-foto") {
    return (
      <div>
        <button onClick={volver} className="mb-2 text-xs font-semibold text-brand-black hover:text-brand-amber">← Cambiar cédula</button>
        <h2 className="font-serif text-2xl font-extrabold text-brand-wine">¡Bienvenido, {nombre?.split(" ")[0] ?? ""}!</h2>
        <p className="mt-1 text-xs font-medium text-brand-black">
          Es tu primer ingreso. Toma una foto de tu cédula para verificar tu identidad.
        </p>

        <input
          ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { void cargarFoto(e.target.files?.[0]); e.target.value = ""; }}
        />
        <input ref={galeriaRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void cargarFoto(e.target.files?.[0]); e.target.value = ""; }} />
        {foto ? (
          <div className="relative mt-4 overflow-hidden rounded-2xl border border-brand-brown/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto} alt="Cédula" className="max-h-72 w-full bg-white object-contain" />
            <button type="button" disabled={cargando} onClick={limpiarFoto} aria-label="Quitar foto" title="Quitar foto"
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ) : (
          <button type="button" disabled={preparando} onClick={() => fotoRef.current?.click()}
            className="mt-4 flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-brand-brown/30 text-sm font-medium text-brand-black transition hover:border-brand-amber/50 hover:text-brand-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>
            {preparando ? "Preparando foto..." : "Tomar foto de la cédula"}
          </button>
        )}

        {original && (
          <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Filtro de la foto">
            {([["original", "Original"], ["contraste", "Contraste"], ["blanco-negro", "Blanco y negro"]] as const).map(([valor, etiqueta]) => (
              <button key={valor} type="button" aria-pressed={filtro === valor} disabled={preparando || cargando} onClick={() => void cambiarFiltro(valor)} className={`rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${filtro === valor ? "border-brand-wine bg-brand-wine text-white" : "border-brand-brown/20 bg-white text-brand-black"}`}>
                {etiqueta}
              </button>
            ))}
          </div>
        )}
        <button type="button" disabled={preparando || cargando} onClick={() => galeriaRef.current?.click()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-brown/20 px-3 py-2 text-sm font-semibold text-brand-black disabled:opacity-50">
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
          Elegir foto de la galería
        </button>
        <button onClick={verificarFoto} disabled={cargando || preparando || !foto} className={`mt-4 ${btnCls}`}>
          {cargando ? "Verificando cédula…" : "Verificar cédula"}
        </button>
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        {foto && !cargando && (
          <button type="button" onClick={limpiarFoto}
            className="mt-2 w-full text-center text-xs font-semibold text-brand-black hover:text-brand-amber">
            Tomar otra foto
          </button>
        )}
      </div>
    );
  }

  // ── Paso 3b: registro · crear contraseña (tras verificar) ────────────────────
  return (
    <div>
      <h2 className="font-serif text-2xl font-extrabold text-brand-wine">Crea tu contraseña</h2>
      <p className="mt-1 text-xs font-medium text-brand-black">
        ¡Cédula verificada! Crea la contraseña con la que ingresarás la próxima vez.
      </p>
      <div className="mt-5 space-y-2">
        <input value={clave} onChange={(e) => setClave(e.target.value)} type={verClave ? "text" : "password"} placeholder="Crea tu contraseña" className={inputCls} autoFocus />
        <input value={clave2} onChange={(e) => setClave2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && crearClave()} type={verClave ? "text" : "password"} placeholder="Repite la contraseña" className={inputCls} />
        <label className="flex items-center gap-2 text-xs font-medium text-brand-black">
          <input type="checkbox" checked={verClave} onChange={(e) => setVerClave(e.target.checked)} /> Ver contraseña
        </label>
      </div>
      <button onClick={crearClave} disabled={cargando} className={`mt-4 ${btnCls}`}>
        {cargando ? "Creando…" : "Crear contraseña y entrar"}
      </button>
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
