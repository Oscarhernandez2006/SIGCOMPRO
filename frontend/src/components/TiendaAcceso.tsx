"use client";

import { useRef, useState } from "react";
import {
  estadoAccesoTrabajador,
  loginTrabajador,
  verificarCedulaTrabajador,
  registrarTrabajador,
  type SesionTrabajador,
} from "@/lib/tienda-empleados";

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
  const [verClave, setVerClave] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

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
    setPaso("cedula"); setClave(""); setClave2(""); setFoto(null); setError(null);
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
        <p className="mt-1 text-xs font-medium text-brand-brown/55">Ingresa tu cédula para comprar</p>
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
        <button onClick={volver} className="mb-2 text-xs font-semibold text-brand-brown/50 hover:text-brand-amber">← Cambiar cédula</button>
        <h2 className="font-serif text-2xl font-extrabold text-brand-wine">Hola, {nombre?.split(" ")[0] ?? ""}</h2>
        <p className="mt-1 text-xs font-medium text-brand-brown/55">Ingresa tu contraseña para continuar</p>
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-brand-brown/45 hover:text-brand-amber">
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
        <button onClick={volver} className="mb-2 text-xs font-semibold text-brand-brown/50 hover:text-brand-amber">← Cambiar cédula</button>
        <h2 className="font-serif text-2xl font-extrabold text-brand-wine">¡Bienvenido, {nombre?.split(" ")[0] ?? ""}!</h2>
        <p className="mt-1 text-xs font-medium text-brand-brown/55">
          Es tu primer ingreso. Toma una foto de tu cédula para verificar tu identidad.
        </p>

        <input
          ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setError(null);
            const reader = new FileReader();
            reader.onload = (ev) => setFoto(ev.target?.result as string);
            reader.readAsDataURL(file);
          }}
        />
        {foto ? (
          <div className="relative mt-4 overflow-hidden rounded-2xl border border-brand-brown/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto} alt="Cédula" className="max-h-52 w-full object-cover" />
            <button type="button" onClick={() => { setFoto(null); if (fotoRef.current) fotoRef.current.value = ""; }}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => fotoRef.current?.click()}
            className="mt-4 flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-brand-brown/30 text-sm font-medium text-brand-brown/55 transition hover:border-brand-amber/50 hover:text-brand-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>
            Tomar foto de la cédula
          </button>
        )}

        <button onClick={verificarFoto} disabled={cargando || !foto} className={`mt-4 ${btnCls}`}>
          {cargando ? "Verificando cédula…" : "Verificar cédula"}
        </button>
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        {foto && !cargando && (
          <button type="button" onClick={() => { setFoto(null); if (fotoRef.current) fotoRef.current.value = ""; }}
            className="mt-2 w-full text-center text-xs font-semibold text-brand-brown/50 hover:text-brand-amber">
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
      <p className="mt-1 text-xs font-medium text-brand-brown/55">
        ¡Cédula verificada! Crea la contraseña con la que ingresarás la próxima vez.
      </p>
      <div className="mt-5 space-y-2">
        <input value={clave} onChange={(e) => setClave(e.target.value)} type={verClave ? "text" : "password"} placeholder="Crea tu contraseña" className={inputCls} autoFocus />
        <input value={clave2} onChange={(e) => setClave2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && crearClave()} type={verClave ? "text" : "password"} placeholder="Repite la contraseña" className={inputCls} />
        <label className="flex items-center gap-2 text-xs font-medium text-brand-brown/55">
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
