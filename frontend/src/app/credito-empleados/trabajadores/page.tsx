"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import {
  buscarTrabajadoresCredito,
  buscarEnSiesa,
  importarTrabajadores,
  guardarTrabajadorCredito,
  type TrabajadorCredito,
} from "@/lib/credito-empleados";

const fmtCop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const money = (v: number) => fmtCop.format(Number.isFinite(v) ? v : 0);

interface FormTrabajador {
  cedula: string;
  nombre: string;
  cupo_asignado: string;
  activo: boolean;
  fecha_proximo_descuento: string;
}
const FORM_VACIO: FormTrabajador = { cedula: "", nombre: "", cupo_asignado: "", activo: true, fecha_proximo_descuento: "" };

// ── Íconos ────────────────────────────────────────────────────────────────────

const Ico = {
  users:     <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />,
  userCheck: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />,
  userX:     <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  plus:      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />,
  search:    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />,
  xmark:     <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />,
  pencil:    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />,
  user:      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />,
  idCard:    <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" />,
  money:     <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.107-.879-1.107-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  check:     <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />,
};

function Icon({ d, cls = "h-4 w-4" }: { d: React.ReactNode; cls?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={cls}>
      {d}
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function iniciales(nombre: string) {
  return nombre.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}

const AVATAR_COLORS = [
  "bg-brand-wine/10 text-brand-wine",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];
function avatarColor(cedula: string) {
  const n = cedula.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

// ── Modal crear/editar trabajador ─────────────────────────────────────────────

function ModalTrabajador({ inicial, esEdicion, onClose, onGuardado }: {
  inicial: FormTrabajador;
  esEdicion: boolean;
  onClose: () => void;
  onGuardado: (t: TrabajadorCredito) => void;
}) {
  const [form, setForm]         = useState<FormTrabajador>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [buscandoSiesa, setBuscandoSiesa] = useState(false);
  const [siesaMsg, setSiesaMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Autocompletar nombre desde Siesa al ingresar la cédula (si está vacío el nombre)
  async function autocompletarSiesa(cedula: string) {
    if (esEdicion || cedula.length < 6 || form.nombre.trim()) return;
    setBuscandoSiesa(true); setSiesaMsg(null);
    try {
      const r = await buscarEnSiesa(cedula);
      if (r.encontrado && r.nombre) {
        setForm((f) => ({ ...f, nombre: r.nombre! }));
        setSiesaMsg(`✓ Nombre encontrado en Siesa`);
      } else {
        setSiesaMsg("No encontrado en Siesa — ingresa el nombre manualmente");
      }
    } catch { /* silencioso */ }
    finally { setBuscandoSiesa(false); }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const cupo = Number(form.cupo_asignado || 0);
    if (!form.cedula.trim()) { setError("La cédula es obligatoria."); return; }
    if (!form.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    if (!Number.isFinite(cupo) || cupo < 0) { setError("El cupo debe ser un número válido ≥ 0."); return; }
    setGuardando(true); setError(null);
    try {
      const t = await guardarTrabajadorCredito({ cedula: form.cedula.trim(), nombre: form.nombre.trim(), cupo_asignado: cupo, activo: form.activo, fecha_proximo_descuento: form.fecha_proximo_descuento.trim() || null });
      onGuardado(t); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : "No se pudo guardar el trabajador."); }
    finally { setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm" onClick={() => !guardando && onClose()} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-brand-brown/10 px-5 py-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${esEdicion ? "bg-amber-100 text-amber-700" : "bg-brand-wine/10 text-brand-wine"}`}>
            <Icon d={esEdicion ? Ico.pencil : Ico.plus} cls="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-serif text-lg font-bold text-brand-wine">
              {esEdicion ? "Editar trabajador" : "Nuevo trabajador"}
            </h2>
            <p className="text-xs text-brand-brown/55">
              {esEdicion ? "Modifica los datos del colaborador o su cupo." : "Registra el colaborador para habilitar crédito."}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={guardando} aria-label="Cerrar"
            className="rounded-lg p-1.5 text-brand-brown/40 transition hover:bg-brand-cream-soft hover:text-brand-brown disabled:opacity-40">
            <Icon d={Ico.xmark} cls="h-5 w-5" />
          </button>
        </div>

        {/* Preview avatar si hay nombre */}
        {form.nombre.trim() && (
          <div className="flex items-center gap-3 border-b border-brand-brown/8 bg-neutral-50/60 px-5 py-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor(form.cedula || "0")}`}>
              {iniciales(form.nombre)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-black">{form.nombre}</p>
              {form.cedula && <p className="text-xs text-brand-brown/55">CC {form.cedula}</p>}
            </div>
            {form.cupo_asignado && Number(form.cupo_asignado) > 0 && (
              <span className="ml-auto rounded-full bg-brand-wine/10 px-2.5 py-0.5 text-xs font-bold text-brand-wine">
                {money(Number(form.cupo_asignado))}
              </span>
            )}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={guardar} className="px-5 py-4 space-y-4">
          {/* Cédula */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-brown/60">
              <Icon d={Ico.idCard} cls="h-3.5 w-3.5" />Cédula
            </label>
            <input
              ref={inputRef}
              value={form.cedula}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setForm((f) => ({ ...f, cedula: v }));
                setSiesaMsg(null);
                if (v.length >= 6) autocompletarSiesa(v);
              }}
              onBlur={(e) => { if (e.target.value.length >= 6) autocompletarSiesa(e.target.value); }}
              disabled={esEdicion}
              placeholder="Número de documento"
              className="h-11 w-full rounded-xl border border-brand-brown/25 px-3 text-sm outline-none transition focus:border-brand-wine disabled:bg-neutral-50 disabled:text-brand-brown/50"
            />
            {esEdicion && <p className="mt-1 text-xs text-brand-brown/35">La cédula no puede modificarse.</p>}
            {!esEdicion && buscandoSiesa && (
              <p className="mt-1 flex items-center gap-1 text-xs text-brand-brown/50">
                <span className="h-3 w-3 animate-spin rounded-full border border-brand-wine/30 border-t-brand-wine" />
                Buscando en Siesa…
              </p>
            )}
            {!esEdicion && siesaMsg && !buscandoSiesa && (
              <p className={`mt-1 text-xs ${siesaMsg.startsWith("✓") ? "text-brand-wine font-medium" : "text-brand-brown/40 italic"}`}>
                {siesaMsg}
              </p>
            )}
          </div>

          {/* Nombre */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-brown/60">
              <Icon d={Ico.user} cls="h-3.5 w-3.5" />Nombre completo
            </label>
            <input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Juan Pérez Gómez"
              className="h-11 w-full rounded-xl border border-brand-brown/25 px-3 text-sm outline-none transition focus:border-brand-wine"
            />
          </div>

          {/* Cupo */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-brown/60">
              <Icon d={Ico.money} cls="h-3.5 w-3.5" />Cupo asignado (COP)
            </label>
            <input
              value={form.cupo_asignado}
              onChange={(e) => setForm((f) => ({ ...f, cupo_asignado: e.target.value.replace(/[^\d]/g, "") }))}
              placeholder="Ej: 500000"
              className="h-11 w-full rounded-xl border border-brand-brown/25 px-3 text-sm outline-none transition focus:border-brand-wine"
            />
            {form.cupo_asignado && Number(form.cupo_asignado) > 0 && (
              <p className="mt-1 text-xs font-semibold text-brand-wine">{money(Number(form.cupo_asignado))}</p>
            )}
          </div>

          {/* Activo */}
          {/* Fecha próximo descuento */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-brown/60">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
              Próximo descuento <span className="font-normal normal-case text-brand-brown/35">(opcional)</span>
            </label>
            <input
              type="date"
              value={form.fecha_proximo_descuento}
              onChange={(e) => setForm((f) => ({ ...f, fecha_proximo_descuento: e.target.value }))}
              className="h-11 w-full rounded-xl border border-brand-brown/25 px-3 text-sm outline-none transition focus:border-brand-wine [color-scheme:light]"
            />
            <p className="mt-1 text-xs text-brand-brown/40">Fecha en que se descontará de nómina</p>
          </div>

          {/* Activo */}
          <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${form.activo ? "border-brand-wine/25 bg-brand-wine/5 hover:bg-brand-wine/5" : "border-brand-brown/15 hover:bg-brand-cream-soft/50"}`}>
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
              className="h-4 w-4 cursor-pointer rounded border-brand-brown/30 accent-brand-wine"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-brand-black">Trabajador activo</p>
              <p className="text-xs text-brand-brown/55">Solo los activos pueden realizar compras a crédito</p>
            </div>
            <div className={`h-2.5 w-2.5 rounded-full ${form.activo ? "bg-brand-wine" : "bg-neutral-300"}`} />
          </label>

          {error && (
            <p className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={guardando}
              className="h-10 rounded-xl border border-brand-brown/25 px-4 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-wine px-5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:cursor-not-allowed disabled:opacity-50">
              {guardando
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <Icon d={esEdicion ? Ico.check : Ico.plus} cls="h-4 w-4" />}
              {guardando ? "Guardando…" : esEdicion ? "Guardar cambios" : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function TrabajadoresCreditoPage() {
  const [usuario]     = useState(() => getUsuario());
  const puedeGestionar = puedeAccion(usuario, "credito_empleados.cupos") || puedeAccion(usuario, "credito_empleados");

  const [busqueda, setBusqueda]         = useState("");
  const [trabajadores, setTrabajadores] = useState<TrabajadorCredito[]>([]);
  const [cargando, setCargando]         = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [modal, setModal]               = useState<{ form: FormTrabajador; esEdicion: boolean } | null>(null);
  const [modalImportar, setModalImportar] = useState(false);
  const [csvTexto, setCsvTexto]           = useState("");
  const [importando, setImportando]       = useState(false);
  const [importResult, setImportResult]   = useState<{ importados: number; errores: Array<{ cedula: string; error: string }> } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { setTrabajadores(await buscarTrabajadoresCredito(busqueda)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "No se pudo cargar el listado."); setTrabajadores([]); }
    finally { setCargando(false); }
  }, [busqueda]);

  useEffect(() => { void cargar(); }, [cargar]);

  function abrirNuevo() { setModal({ form: FORM_VACIO, esEdicion: false }); }

  async function procesarImportacion() {
    setImportando(true); setImportResult(null);
    const filas = csvTexto.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
    const lista = filas.map((fila) => {
      const cols = fila.split(/[,;\t]+/).map((c) => c.trim().replace(/^["']|["']$/g, ""));
      return { cedula: cols[0] ?? "", nombre: cols[1] ?? "", cupo_asignado: Number(cols[2]) || 0 };
    }).filter((r) => r.cedula && r.nombre);
    try {
      const r = await importarTrabajadores(lista);
      setImportResult(r);
      if (r.importados > 0) { void cargar(); }
    } catch { setImportResult({ importados: 0, errores: [{ cedula: "—", error: "No se pudo conectar con el servidor." }] }); }
    finally { setImportando(false); }
  }
  function abrirEditar(t: TrabajadorCredito) {
    setModal({ form: { cedula: t.cedula, nombre: t.nombre, cupo_asignado: String(Number(t.cupo_asignado) || 0), activo: t.activo, fecha_proximo_descuento: t.fecha_proximo_descuento ?? "" }, esEdicion: true });
  }
  function onGuardado(t: TrabajadorCredito) {
    setTrabajadores((prev) => {
      const idx = prev.findIndex((x) => x.cedula === t.cedula);
      return idx >= 0 ? prev.map((x, i) => (i === idx ? t : x)) : [t, ...prev];
    });
  }

  const activos   = trabajadores.filter((t) => t.activo).length;
  const inactivos = trabajadores.filter((t) => !t.activo).length;

  const kpis = [
    { label: "Total",     val: String(trabajadores.length), color: "text-brand-black",   bg: "bg-brand-brown/8",  ico: Ico.users     },
    { label: "Activos",   val: String(activos),              color: "text-brand-wine",   bg: "bg-brand-wine/5",     ico: Ico.userCheck },
    { label: "Inactivos", val: String(inactivos),            color: "text-brand-brown/60", bg: "bg-neutral-100",   ico: Ico.userX     },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-brand-wine">Trabajadores y cupos</h1>
          <p className="mt-0.5 text-sm text-brand-brown/60">Gestiona los colaboradores habilitados para compras a crédito.</p>
        </div>
        {puedeGestionar && (
          <div className="flex gap-2">
            <button type="button" onClick={() => { setModalImportar(true); setCsvTexto(""); setImportResult(null); }}
              className="flex h-10 items-center gap-2 rounded-xl border border-brand-wine px-4 text-sm font-semibold text-brand-wine transition hover:bg-brand-wine/5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              Importar CSV
            </button>
            <button type="button" onClick={abrirNuevo}
              className="flex h-10 items-center gap-2 rounded-xl bg-brand-wine px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-wine/90">
              <Icon d={Ico.plus} cls="h-4 w-4" />
              Nuevo trabajador
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="flex items-center gap-3 rounded-2xl border border-brand-brown/10 bg-white px-4 py-3 shadow-sm">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${k.bg}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={`h-5 w-5 ${k.color}`}>
                {k.ico}
              </svg>
            </div>
            <div>
              <p className="text-xs text-brand-brown/55">{k.label}</p>
              <p className={`mt-0.5 text-xl font-bold ${k.color}`}>{k.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Buscador */}
      <div className="flex gap-2 rounded-2xl border border-brand-brown/10 bg-white px-4 py-3 shadow-sm">
        <div className="relative flex-1">
          <Icon d={Ico.search} cls="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/35" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cédula o nombre…"
            className="h-9 w-full rounded-lg border border-brand-brown/20 pl-9 pr-3 text-sm outline-none transition focus:border-brand-wine"
          />
        </div>
        <button type="button" onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-brand-wine px-4 text-sm font-semibold text-brand-wine transition hover:bg-brand-wine/5">
          <Icon d={Ico.search} cls="h-3.5 w-3.5" />Buscar
        </button>
        {busqueda && (
          <button type="button" onClick={() => setBusqueda("")}
            className="h-9 rounded-lg border border-brand-brown/20 px-3 text-sm text-brand-brown/55 transition hover:bg-brand-cream-soft">
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-hidden rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
        {error && (
          <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-sm text-rose-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brand-brown/10 bg-neutral-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-brand-brown/55">
                <th className="px-4 py-3">Colaborador</th>
                <th className="px-4 py-3 text-right">Cupo</th>
                <th className="px-4 py-3 text-right">Deuda</th>
                <th className="px-4 py-3 text-right">Disponible</th>
                <th className="px-4 py-3">Estado</th>
                {puedeGestionar && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-brand-brown/50">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-wine border-t-transparent align-middle" />
                    <span className="ml-2 align-middle">Cargando…</span>
                  </td>
                </tr>
              ) : trabajadores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-brown/8 text-brand-brown/30">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
                        {Ico.users}
                      </svg>
                    </div>
                    <p className="mt-3 text-sm font-medium text-brand-brown/50">
                      {busqueda ? "No se encontraron colaboradores." : "Aún no hay colaboradores registrados."}
                    </p>
                    {!busqueda && puedeGestionar && (
                      <button type="button" onClick={abrirNuevo}
                        className="mt-3 flex items-center gap-1.5 mx-auto rounded-xl bg-brand-wine px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-wine/90">
                        <Icon d={Ico.plus} cls="h-3.5 w-3.5" />Registrar el primero
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                trabajadores.map((t) => {
                  const disponible = Number(t.cupo_disponible ?? 0);
                  return (
                    <tr key={t.cedula} className="border-b border-brand-brown/8 transition hover:bg-neutral-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor(t.cedula)}`}>
                            {iniciales(t.nombre)}
                          </div>
                          <div>
                            <p className="font-medium text-brand-black leading-tight">{t.nombre}</p>
                            <p className="text-[11px] text-brand-brown/50">CC {t.cedula}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-brand-brown/75">{money(Number(t.cupo_asignado) || 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-700">{money(Number(t.deuda_vigente) || 0)}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${disponible > 0 ? "text-brand-wine" : "text-rose-600"}`}>
                        {money(disponible)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${t.activo ? "border-brand-wine/25 bg-brand-wine/5 text-brand-wine" : "border-neutral-200 bg-neutral-100 text-neutral-500"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${t.activo ? "bg-brand-wine" : "bg-neutral-400"}`} />
                          {t.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      {puedeGestionar && (
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => abrirEditar(t)}
                            className="flex items-center gap-1 rounded-lg border border-brand-brown/20 px-2.5 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-brand-cream-soft hover:border-brand-wine/30 hover:text-brand-wine">
                            <Icon d={Ico.pencil} cls="h-3.5 w-3.5" />Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <ModalTrabajador
          inicial={modal.form}
          esEdicion={modal.esEdicion}
          onClose={() => setModal(null)}
          onGuardado={onGuardado}
        />
      )}

      {/* ── Modal importar CSV ── */}
      {modalImportar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-black/50 backdrop-blur-sm" onClick={() => !importando && setModalImportar(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-brand-brown/10 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-wine/10 text-brand-wine">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="font-serif text-lg font-bold text-brand-wine">Importar trabajadores</h2>
                <p className="text-xs text-brand-brown/55">Pega aquí una lista: cédula, nombre, cupo (opcional)</p>
              </div>
              <button onClick={() => setModalImportar(false)} disabled={importando}
                className="rounded-lg p-1.5 text-brand-brown/40 hover:bg-brand-cream-soft disabled:opacity-40">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-xl border border-brand-brown/10 bg-brand-cream-soft/50 p-3 text-xs text-brand-brown/60 space-y-1">
                <p className="font-semibold">Formato aceptado (una fila por trabajador):</p>
                <p className="font-mono">cédula, nombre completo, cupo_asignado</p>
                <p className="font-mono text-brand-brown/40">1234567890, Juan Pérez Gómez, 500000</p>
                <p>Separador: coma (,) punto y coma (;) o tabulador. El cupo es opcional.</p>
              </div>
              <textarea
                value={csvTexto}
                onChange={(e) => { setCsvTexto(e.target.value); setImportResult(null); }}
                rows={8}
                placeholder={"1234567890, Juan Pérez, 500000\n0987654321, María López, 300000"}
                disabled={importando}
                className="w-full resize-none rounded-xl border border-brand-brown/25 px-3 py-2.5 font-mono text-xs outline-none transition focus:border-brand-wine disabled:opacity-50"
              />
              {importResult && (
                <div className={`rounded-xl border px-4 py-3 text-sm ${importResult.errores.length === 0 ? "border-brand-wine/25 bg-brand-wine/5" : "border-amber-200 bg-amber-50"}`}>
                  <p className="font-semibold text-brand-black">
                    ✓ {importResult.importados} importados
                    {importResult.errores.length > 0 && ` · ${importResult.errores.length} errores`}
                  </p>
                  {importResult.errores.map((e, i) => (
                    <p key={i} className="mt-0.5 text-xs text-rose-600">CC {e.cedula}: {e.error}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-brand-brown/10 px-5 py-4">
              <button onClick={() => setModalImportar(false)} disabled={importando}
                className="h-10 rounded-xl border border-brand-brown/25 px-4 text-sm font-medium text-brand-brown hover:bg-brand-cream-soft disabled:opacity-50">
                Cerrar
              </button>
              <button onClick={procesarImportacion} disabled={importando || !csvTexto.trim()}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-wine px-5 text-sm font-semibold text-white hover:bg-brand-wine/90 disabled:opacity-50">
                {importando ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Importando…</> : "Importar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
