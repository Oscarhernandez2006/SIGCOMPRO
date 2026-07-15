"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUsuario, tieneAccesoAdministrativo, type Usuario } from "@/lib/auth";
import { puedeVerModulo } from "@/lib/permisos";
import { listarPuntosVenta, misPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";
import {
  cargarEstadoPedidos,
  actualizarMetaApi,
  guardarPedidoApi,
  type DespachoMeta,
} from "@/lib/pedidos";
import { verificarClaveDinamica } from "@/lib/clave-dinamica";
import { cuadreCerrado as consultarCuadreCerrado, cerrarCuadre, reabrirCuadre } from "@/lib/configuracion";
import { METODOS, type Pedido } from "@/app/(panel)/pedidos/page";

const cop = (n: number) =>
  "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");

/** Fecha local (YYYY-MM-DD) de un instante ISO. */
function diaLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ¿El método de pago es "efectivo"? El resto son Otros Medios de Pago (O.M.P.). */
function esEfectivo(pago?: string | null): boolean {
  return (pago ?? "").trim().toLowerCase() === "efectivo";
}

/**
 * Nombre de quien despachó el pedido: se toma del último evento de trazabilidad
 * que dejó el pedido en "Despachado" (lo registra el backend con el usuario que
 * hizo el cambio). Así funciona también para pedidos ya despachados antes.
 */
function despachadoPorNombre(p: Pedido): string {
  const eventos = p.trazabilidad ?? [];
  for (let i = eventos.length - 1; i >= 0; i--) {
    const ev = eventos[i];
    if ((ev.estadoNuevo ?? "").trim().toLowerCase() === "despachado" && ev.usuarioNombre) {
      return ev.usuarioNombre;
    }
  }
  return "";
}

interface Liq {
  efectivo: string;
  omp: string;
}

export default function CuadreCajaPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [meta, setMeta] = useState<Record<string, DespachoMeta>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const [puntoSel, setPuntoSel] = useState<string>("todos");
  const [fecha, setFecha] = useState<string>(hoyISO());
  const [filtroPago, setFiltroPago] = useState<string>("todos");
  const [filtroDomiciliario, setFiltroDomiciliario] = useState<string>("todos");
  // Id del pedido cuya ventanita de detalle (creó/alistó/domiciliario) está abierta.
  const [detalleId, setDetalleId] = useState<string | null>(null);
  // Orden de "completados" (autoguardados con valor): van al final para facilitar
  // el llenado (el que se acaba de liquidar baja y sube el siguiente).
  const [completados, setCompletados] = useState<Record<string, number>>({});
  const completadoSeq = useRef(0);

  // Ediciones locales de liquidación por pedido (texto de los inputs).
  const [liq, setLiq] = useState<Record<string, Liq>>({});
  // Espejo de `liq` para leer el valor más reciente dentro del autoguardado.
  const liqRef = useRef<Record<string, Liq>>({});
  useEffect(() => {
    liqRef.current = liq;
  }, [liq]);
  // Temporizadores de autoguardado por pedido (debounce al escribir).
  const autosaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [autoguardando, setAutoguardando] = useState(false);
  // Limpia los temporizadores pendientes al desmontar.
  useEffect(() => {
    const timers = autosaveTimers.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  // Autorización para EDITAR un cuadre ya cerrado (con clave dinámica de admin).
  const [autorizado, setAutorizado] = useState(false);
  const [authAbierta, setAuthAbierta] = useState(false);
  const [codigoAuth, setCodigoAuth] = useState("");
  const [verificandoAuth, setVerificandoAuth] = useState(false);
  const [errorAuth, setErrorAuth] = useState<string | null>(null);

  const esAdmin = tieneAccesoAdministrativo(usuario?.rol);

  useEffect(() => {
    const u = getUsuario();
    if (!puedeVerModulo(u, "cuadre_caja")) {
      router.replace("/");
      return;
    }
    setUsuario(u);
  }, [router]);

  const cargar = useCallback(async () => {
    if (usuario === null) return;
    setCargando(true);
    setError(null);
    try {
      const cargaPuntos = esAdmin ? listarPuntosVenta() : misPuntosVenta();
      const [ps, estado] = await Promise.all([cargaPuntos, cargarEstadoPedidos()]);
      setPuntos(ps);
      setPedidos(estado.pedidos ?? []);
      setMeta(estado.meta ?? {});
      if (ps.length === 1) setPuntoSel(String(ps[0].id));
      // Inicializa las liquidaciones locales desde la metadata guardada. Un
      // valor 0 se muestra como VACÍO (no como "0"), para que la celda quede
      // limpia y no confunda al escribir.
      const inicial: Record<string, Liq> = {};
      for (const [id, m] of Object.entries(estado.meta ?? {})) {
        inicial[id] = {
          efectivo: m.cuadreEfectivo ? String(m.cuadreEfectivo) : "",
          omp: m.cuadreOmp ? String(m.cuadreOmp) : "",
        };
      }
      setLiq(inicial);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la información");
    } finally {
      setCargando(false);
    }
  }, [usuario, esAdmin]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const idsVisibles = useMemo(
    () => new Set(puntos.map((p) => String(p.id))),
    [puntos],
  );

  // Pedidos DESPACHADOS del día y punto elegidos.
  const filas = useMemo(() => {
    return pedidos
      .filter((p) => {
        if (p.estado !== "Despachado") return false;
        // Punto: acotado a los visibles del usuario y al punto seleccionado.
        if (!esAdmin && !idsVisibles.has(String(p.punto?.id))) return false;
        if (puntoSel !== "todos" && String(p.punto?.id) !== puntoSel) return false;
        // Día de despacho: usa el instante de despacho; si no, la fecha del pedido.
        const dia = diaLocal(meta[p.id]?.despachoFin) || diaLocal(p.fecha);
        if (fecha && dia !== fecha) return false;
        // Filtro por método de pago.
        if (filtroPago === "efectivo" && !esEfectivo(p.pago)) return false;
        if (filtroPago === "omp" && esEfectivo(p.pago)) return false;
        // Filtro por domiciliario (para liquidar por domiciliario).
        if (
          filtroDomiciliario !== "todos" &&
          (meta[p.id]?.domiciliario ?? "") !== filtroDomiciliario
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        // Los ya liquidados (autoguardados) bajan al final, en orden de
        // finalización, para que el siguiente por llenar quede arriba.
        const ca = completados[a.id];
        const cb = completados[b.id];
        if (ca != null && cb == null) return 1;
        if (ca == null && cb != null) return -1;
        if (ca != null && cb != null) return ca - cb;
        return (a.consecutivo ?? 0) - (b.consecutivo ?? 0);
      });
  }, [pedidos, meta, esAdmin, idsVisibles, puntoSel, fecha, filtroPago, filtroDomiciliario, completados]);

  // Domiciliarios presentes en los despachados del punto/día (para el filtro).
  const domiciliarios = useMemo(() => {
    const set = new Set<string>();
    for (const p of pedidos) {
      if (p.estado !== "Despachado") continue;
      if (!esAdmin && !idsVisibles.has(String(p.punto?.id))) continue;
      if (puntoSel !== "todos" && String(p.punto?.id) !== puntoSel) continue;
      const dia = diaLocal(meta[p.id]?.despachoFin) || diaLocal(p.fecha);
      if (fecha && dia !== fecha) continue;
      const d = (meta[p.id]?.domiciliario ?? "").trim();
      if (d) set.add(d);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [pedidos, meta, esAdmin, idsVisibles, puntoSel, fecha]);

  const valorFacturado = useCallback(
    (p: Pedido) => Number(meta[p.id]?.facturaValor ?? p.total ?? 0) || 0,
    [meta],
  );

  const numero = (s: string): number => {
    const n = Number(String(s).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const diferenciaFila = useCallback(
    (p: Pedido) => {
      const l = liq[p.id] ?? { efectivo: "", omp: "" };
      // Cada pedido se liquida por su medio: efectivo -> columna Efectivo; el
      // resto (transferencia, tarjeta, crédito…) -> columna O.M.P.
      const liquidado = esEfectivo(p.pago) ? numero(l.efectivo) : numero(l.omp);
      return liquidado - valorFacturado(p);
    },
    [liq, valorFacturado],
  );

  // Totales.
  const totales = useMemo(() => {
    let facturado = 0;
    let efectivo = 0;
    let omp = 0;
    for (const p of filas) {
      const l = liq[p.id] ?? { efectivo: "", omp: "" };
      facturado += valorFacturado(p);
      if (esEfectivo(p.pago)) efectivo += numero(l.efectivo);
      else omp += numero(l.omp);
    }
    return { facturado, efectivo, omp, diferencia: efectivo + omp - facturado };
  }, [filas, liq, valorFacturado]);

  // El cuadre se cierra POR PUNTO y POR DÍA (no global). `cerrado` se consulta
  // al backend para el punto y la fecha elegidos.
  const [cerrado, setCerrado] = useState(false);
  // Bloqueado = cerrado y sin autorización de administrador para editar.
  const bloqueado = cerrado && !autorizado;

  // Al cambiar de día o de punto: re-bloquea y consulta si ese punto+día ya
  // tiene el cuadre cerrado. Con "todos" no aplica cierre (elige un punto).
  useEffect(() => {
    setAutorizado(false);
    if (puntoSel === "todos" || !fecha) {
      setCerrado(false);
      return;
    }
    let cancelado = false;
    consultarCuadreCerrado(puntoSel, fecha)
      .then((r) => {
        if (!cancelado) setCerrado(Boolean(r.cerrado));
      })
      .catch(() => {
        if (!cancelado) setCerrado(false);
      });
    return () => {
      cancelado = true;
    };
  }, [fecha, puntoSel]);

  // Cambia el método de pago de un pedido y lo persiste (se refleja en Pedidos
  // y Despacho, ya que edita el pedido real con ese consecutivo).
  function cambiarPago(id: string, pago: string) {
    if (bloqueado) return;
    setPedidos((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, pago } : p));
      const actualizado = next.find((p) => p.id === id);
      if (actualizado) {
        guardarPedidoApi(actualizado).catch(() => {
          setError("No se pudo cambiar el método de pago. Inténtalo de nuevo.");
        });
      }
      return next;
    });
  }

  function cambiarLiq(id: string, campo: keyof Liq, valor: string) {
    if (bloqueado) return; // cuadre cerrado: requiere autorización para editar
    setGuardadoOk(false);
    setLiq((prev) => {
      const actual: Liq = prev[id] ?? { efectivo: "", omp: "" };
      return { ...prev, [id]: { ...actual, [campo]: valor } };
    });
    // Autoguardado (debounce 10 s): persiste la celda tras 10 s sin escribir y
    // baja la fila al final (si tiene valor) para facilitar el llenado.
    const timers = autosaveTimers.current;
    if (timers[id]) clearTimeout(timers[id]);
    timers[id] = setTimeout(async () => {
      const l = liqRef.current[id] ?? { efectivo: "", omp: "" };
      const cambios = { cuadreEfectivo: numero(l.efectivo), cuadreOmp: numero(l.omp) };
      setAutoguardando(true);
      try {
        await actualizarMetaApi(id, cambios);
        setMeta((m) => ({ ...m, [id]: { ...m[id], ...cambios } }));
        // Solo baja al final si realmente se liquidó (algún valor > 0).
        const tieneValor = cambios.cuadreEfectivo > 0 || cambios.cuadreOmp > 0;
        if (tieneValor) {
          setCompletados((prev) =>
            prev[id] != null ? prev : { ...prev, [id]: ++completadoSeq.current },
          );
        }
      } catch {
        /* si falla, el valor sigue en pantalla; se reintenta al reguardar */
      } finally {
        setAutoguardando(false);
      }
    }, 10000);
  }

  // Verifica la clave dinámica del administrador y, si es válida, REABRE el
  // cuadre (queda editable y lo sigue estando aunque se recargue la página).
  async function autorizarEdicion() {
    if (verificandoAuth) return;
    const codigo = codigoAuth.replace(/\D/g, "");
    if (codigo.length !== 6) {
      setErrorAuth("Ingresa el código de 6 dígitos.");
      return;
    }
    setVerificandoAuth(true);
    setErrorAuth(null);
    try {
      const { valido } = await verificarClaveDinamica(codigo);
      if (!valido) {
        setErrorAuth("Código incorrecto o expirado. Solicítalo de nuevo.");
        return;
      }
      // Reabre el cuadre en el backend: así la edición persiste tras refrescar.
      try {
        if (puntoSel !== "todos") await reabrirCuadre(puntoSel, fecha);
      } catch {
        /* si falla la reapertura, igual se permite editar en esta sesión */
      }
      setCerrado(false);
      setAutorizado(true);
      setAuthAbierta(false);
      setCodigoAuth("");
    } catch {
      setErrorAuth("No se pudo verificar el código. Inténtalo de nuevo.");
    } finally {
      setVerificandoAuth(false);
    }
  }

  /** Genera un PDF (ventana de impresión) con todo el cuadre digitado. */
  function generarPdf() {
    const logo = `${window.location.origin}/LOGOCARNESSANTACRUZ.png`;
    const esc = (s: unknown) =>
      String(s ?? "").replace(/[&<>"]/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
      );
    const ahora = new Date();
    const generado = ahora.toLocaleString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const filasHtml = filas
      .map((p) => {
        const l = liq[p.id] ?? { efectivo: "", omp: "" };
        const dif = diferenciaFila(p);
        const difTxt = dif === 0 ? "—" : `${cop(Math.abs(dif))} ${dif < 0 ? "(falta)" : "(sobra)"}`;
        const difCls = dif === 0 ? "" : dif < 0 ? "neg" : "pos";
        return `<tr>
          <td>${esc(meta[p.id]?.facturaNumero || "—")}</td>
          <td>${esc(p.comanda || p.consecutivo)}</td>
          <td>${esc(p.cliente?.nombre || p.cliente?.nit_cedula || "—")}</td>
          <td>${esc(p.cliente?.nit_cedula || "—")}</td>
          <td>${esc(p.pago || "Sin definir")}</td>
          <td class="r">${cop(valorFacturado(p))}</td>
          <td class="r">${cop(numero(l.efectivo))}</td>
          <td class="r">${cop(numero(l.omp))}</td>
          <td class="r ${difCls}">${difTxt}</td>
        </tr>`;
      })
      .join("");
    const resumen =
      totales.diferencia === 0
        ? "Caja cuadrada"
        : totales.diferencia < 0
          ? `Falta ${cop(Math.abs(totales.diferencia))}`
          : `Sobra ${cop(totales.diferencia)}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cuadre de caja ${esc(fecha)}</title>
      <style>
        @page { size: Letter; margin: 12mm; }
        * { font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; }
        body { margin: 0; color: #000; }
        .logo { text-align: center; margin-bottom: 10px; }
        .logo img { max-width: 55mm; max-height: 24mm; object-fit: contain; filter: grayscale(1); }
        h1 { color: #000; margin: 0 0 4px; font-size: 20px; text-align: center; }
        .meta { font-size: 11px; color: #000; margin-bottom: 14px; line-height: 1.5; }
        .meta b { color: #000; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th, td { border: 1px solid #000; padding: 5px 6px; text-align: left; }
        th { background: #e6e6e6; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; }
        td.r, th.r { text-align: right; }
        tfoot td { font-weight: bold; background: #eee; }
        .neg, .pos { color: #000; font-weight: bold; }
        .resumen { margin-top: 12px; font-size: 13px; font-weight: bold; color: #000; }
        .firma { margin-top: 36px; font-size: 11px; }
        .firma .linea { margin-top: 30px; border-top: 1px solid #000; width: 240px; padding-top: 4px; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>
      <div class="logo"><img src="${esc(logo)}" alt="Carnes Santacruz"></div>
      <h1>Cuadre de caja</h1>
      <div class="meta">
        <div><b>Punto de venta:</b> ${esc(nombrePunto)}</div>
        <div><b>Fecha del cuadre:</b> ${esc(fecha)}</div>
        <div><b>Realizado por:</b> ${esc(usuario?.nombre ?? "—")}${usuario?.rol ? ` (${esc(usuario.rol)})` : ""}${usuario?.cedula ? ` · C.C. ${esc(usuario.cedula)}` : ""}</div>
        <div><b>Generado:</b> ${esc(generado)}</div>
        <div><b>Pedidos:</b> ${filas.length}</div>
      </div>
      <table>
        <thead><tr>
          <th>No. Factura</th><th>Consecutivo</th><th>Cliente</th><th>NIT / Cédula</th><th>Método de pago</th>
          <th class="r">Valor facturado</th><th class="r">Liq. efectivo</th><th class="r">Liq. O.M.P.</th><th class="r">Diferencia</th>
        </tr></thead>
        <tbody>${filasHtml}</tbody>
        <tfoot><tr>
          <td colspan="5">Total general</td>
          <td class="r">${cop(totales.facturado)}</td>
          <td class="r">${cop(totales.efectivo)}</td>
          <td class="r">${cop(totales.omp)}</td>
          <td class="r ${totales.diferencia === 0 ? "" : totales.diferencia < 0 ? "neg" : "pos"}">${totales.diferencia === 0 ? "$ 0" : `${cop(Math.abs(totales.diferencia))} ${totales.diferencia < 0 ? "(falta)" : "(sobra)"}`}</td>
        </tr></tfoot>
      </table>
      <div class="resumen">${esc(resumen)}</div>
      <div class="firma"><div class="linea">Firma de quien cuadra</div></div>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    // Espera a que el logo cargue antes de imprimir (si no, sale sin imagen).
    const img = w.document.querySelector("img");
    if (img && !img.complete) {
      img.onload = () => w.print();
      img.onerror = () => w.print();
    } else {
      w.print();
    }
  }

  async function guardar() {
    if (guardando) return;
    if (puntoSel === "todos") {
      setError("Selecciona un punto de venta específico para guardar y cerrar su cuadre.");
      return;
    }
    setGuardando(true);
    setError(null);
    setGuardadoOk(false);
    try {
      // Persiste la liquidación de cada pedido visible.
      await Promise.all(
        filas.map((p) => {
          const l = liq[p.id] ?? { efectivo: "", omp: "" };
          return actualizarMetaApi(p.id, {
            cuadreEfectivo: numero(l.efectivo),
            cuadreOmp: numero(l.omp),
          });
        }),
      );
      // Refleja los valores guardados en la metadata local.
      setMeta((prev) => {
        const copia = { ...prev };
        for (const p of filas) {
          const l = liq[p.id] ?? { efectivo: "", omp: "" };
          copia[p.id] = {
            ...copia[p.id],
            cuadreEfectivo: numero(l.efectivo),
            cuadreOmp: numero(l.omp),
          };
        }
        return copia;
      });
      // Cierra el cuadre de ESTE punto y ESTE día (no afecta otros puntos/días).
      await cerrarCuadre(puntoSel, fecha);
      setCerrado(true);
      setAutorizado(false);
      setGuardadoOk(true);
      // Genera el PDF del cuadre con toda la información digitada.
      generarPdf();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el cuadre");
    } finally {
      setGuardando(false);
    }
  }

  const nombrePunto =
    puntoSel === "todos"
      ? esAdmin
        ? "Todos los puntos"
        : "Todos mis puntos"
      : puntos.find((p) => String(p.id) === puntoSel)?.nombre ?? "Punto";

  const sinAcceso = usuario && !puedeVerModulo(usuario, "cuadre_caja");
  if (sinAcceso) {
    return (
      <div className="rounded-2xl border border-brand-brown/10 bg-white py-16 text-center text-sm text-brand-brown/60 shadow-sm">
        No tienes acceso al Cuadre de caja.
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* Encabezado + filtros */}
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">Cuadre de caja</h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Liquida los pedidos <b>despachados</b> de {nombrePunto}. La diferencia debe quedar en <b>$ 0</b>.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-[11px] font-semibold uppercase tracking-wide text-brand-brown/60">
            Punto de venta
            <select
              value={puntoSel}
              onChange={(e) => setPuntoSel(e.target.value)}
              className="mt-1 min-w-[13rem] rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm font-semibold text-brand-black outline-none focus:border-brand-wine"
            >
              <option value="todos">{esAdmin ? "Todos los puntos" : "Todos mis puntos"}</option>
              {puntos.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-[11px] font-semibold uppercase tracking-wide text-brand-brown/60">
            Fecha
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm font-semibold text-brand-black outline-none focus:border-brand-wine"
            />
          </label>
          <div className="flex flex-col text-[11px] font-semibold uppercase tracking-wide text-brand-brown/60">
            Método de pago
            <div className="mt-1 inline-flex rounded-xl border border-brand-brown/15 bg-brand-cream-soft/60 p-0.5">
              {(
                [
                  ["todos", "Todos"],
                  ["efectivo", "Efectivo"],
                  ["omp", "Otros (O.M.P.)"],
                ] as [string, string][]
              ).map(([v, lbl]) => (
                <button
                  key={v}
                  onClick={() => setFiltroPago(v)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    filtroPago === v
                      ? "bg-brand-wine text-white shadow-sm"
                      : "text-brand-brown/70 hover:bg-white"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col text-[11px] font-semibold uppercase tracking-wide text-brand-brown/60">
            Domiciliario
            <select
              value={filtroDomiciliario}
              onChange={(e) => setFiltroDomiciliario(e.target.value)}
              title="Filtrar por domiciliario (para liquidar por domiciliario)"
              className="mt-1 min-w-[11rem] rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm font-semibold text-brand-black outline-none focus:border-brand-wine"
            >
              <option value="todos">Todos</option>
              {domiciliarios.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={cargar}
            title="Recargar la información"
            className="rounded-xl border border-brand-brown/20 bg-white px-4 py-2 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
          >
            Recargar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
        </div>
      ) : filas.length === 0 ? (
        <div className="rounded-2xl border border-brand-brown/10 bg-white py-16 text-center text-sm text-brand-brown/60 shadow-sm">
          No hay pedidos despachados para el día y punto seleccionados.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr className="border-b border-brand-brown/10 bg-brand-cream-soft/50 text-left text-[10px] font-bold uppercase tracking-wide text-brand-brown/60">
                  <th className="w-[9%] px-2 py-2.5">No. Factura</th>
                  <th className="w-[10%] px-2 py-2.5">Consecutivo</th>
                  <th className="w-[15%] px-2 py-2.5">Cliente</th>
                  <th className="w-[9%] px-2 py-2.5">NIT / Cédula</th>
                  <th className="w-[10%] px-2 py-2.5">Método de pago</th>
                  <th className="w-[11%] px-2 py-2.5">Despachado por</th>
                  <th className="w-[9%] px-2 py-2.5 text-right">Facturado</th>
                  <th className="w-[9%] px-2 py-2.5 text-right">Liq. efectivo</th>
                  <th className="w-[9%] px-2 py-2.5 text-right">Liq. O.M.P.</th>
                  <th className="w-[9%] px-2 py-2.5 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => {
                  const l = liq[p.id] ?? { efectivo: "", omp: "" };
                  const dif = diferenciaFila(p);
                  const difColor =
                    dif === 0
                      ? "text-brand-brown/40"
                      : dif < 0
                        ? "text-red-600"
                        : "text-emerald-600";
                  const efectivoRow = esEfectivo(p.pago);
                  return (
                    <tr key={p.id} className="border-b border-brand-brown/5 last:border-0">
                      <td className="truncate px-2 py-2 font-semibold text-brand-wine">
                        {meta[p.id]?.facturaNumero || "—"}
                      </td>
                      <td className="relative px-2 py-2 tabular-nums text-brand-brown/80">
                        <button
                          type="button"
                          onClick={() => setDetalleId((prev) => (prev === p.id ? null : p.id))}
                          title="Ver quién creó, alistó y el domiciliario del pedido"
                          className="group inline-flex items-center gap-1 text-left font-semibold text-brand-wine transition hover:text-brand-wine/80"
                        >
                          <span className="underline decoration-brand-brown/20 decoration-dotted underline-offset-2 group-hover:decoration-brand-wine">
                            {p.comanda || p.consecutivo}
                          </span>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={`h-3 w-3 shrink-0 text-brand-brown/40 transition ${detalleId === p.id ? "rotate-180" : ""}`}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                        {detalleId === p.id && (
                          <div className="absolute left-3 top-11 z-30 w-60 rounded-xl border border-brand-brown/20 bg-white p-3 text-xs shadow-xl">
                            <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-brand-brown/10 pb-1.5">
                              <p className="truncate font-bold text-brand-black">#{p.comanda || p.consecutivo}</p>
                              <button
                                type="button"
                                onClick={() => setDetalleId(null)}
                                title="Cerrar"
                                className="shrink-0 rounded p-0.5 text-brand-brown/60 transition hover:bg-brand-cream-soft hover:text-brand-wine"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            <div className="space-y-1">
                              <p className="text-brand-brown/80">
                                <span className="font-semibold text-brand-black">Creó el pedido:</span> {p.vendedorNombre || "—"}
                              </p>
                              <p className="text-brand-brown/80">
                                <span className="font-semibold text-brand-black">Alistador:</span> {meta[p.id]?.porcionador || "—"}
                              </p>
                              <p className="text-brand-brown/80">
                                <span className="font-semibold text-brand-black">Domiciliario:</span> {meta[p.id]?.domiciliario || "—"}
                              </p>
                              <p className="text-brand-brown/80">
                                <span className="font-semibold text-brand-black">Despachado por:</span> {despachadoPorNombre(p) || meta[p.id]?.despachadoPor || "—"}
                              </p>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="truncate px-2 py-2 font-medium text-brand-black">
                        {p.cliente?.nombre || p.cliente?.nit_cedula || "—"}
                      </td>
                      <td className="truncate px-2 py-2 tabular-nums text-brand-brown/70">
                        {p.cliente?.nit_cedula || "—"}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={p.pago ?? ""}
                          disabled={bloqueado}
                          onChange={(e) => cambiarPago(p.id, e.target.value)}
                          title="Cambiar el método de pago (afecta este pedido en Pedidos y Despacho)"
                          className={`w-full cursor-pointer rounded-md border-0 px-1.5 py-1 text-[11px] font-semibold outline-none focus:ring-1 focus:ring-brand-wine disabled:cursor-not-allowed disabled:opacity-70 ${
                            efectivoRow
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          <option value="" disabled>
                            Sin definir
                          </option>
                          {METODOS.map((m) => (
                            <option key={m} value={m} className="bg-white text-brand-black">
                              {m}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="truncate px-2 py-2 text-brand-brown/70">
                        {despachadoPorNombre(p) || meta[p.id]?.despachadoPor || "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums text-brand-black">
                        {cop(valorFacturado(p))}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          inputMode="numeric"
                          value={efectivoRow ? l.efectivo : ""}
                          disabled={bloqueado || !efectivoRow}
                          title={efectivoRow ? "" : "Este pedido no es en efectivo; liquídalo en la columna O.M.P."}
                          onChange={(e) => cambiarLiq(p.id, "efectivo", e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, ""))}
                          placeholder={efectivoRow ? "0" : "—"}
                          className="w-full rounded-lg border border-brand-brown/20 px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-brand-wine disabled:cursor-not-allowed disabled:bg-brand-cream-soft/60 disabled:text-brand-brown/40"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          inputMode="numeric"
                          value={efectivoRow ? "" : l.omp}
                          disabled={bloqueado || efectivoRow}
                          title={efectivoRow ? "Este pedido es en efectivo; liquídalo en la columna Efectivo" : ""}
                          onChange={(e) => cambiarLiq(p.id, "omp", e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, ""))}
                          placeholder={efectivoRow ? "—" : "0"}
                          className="w-full rounded-lg border border-brand-brown/20 px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-brand-wine disabled:cursor-not-allowed disabled:bg-brand-cream-soft/60 disabled:text-brand-brown/40"
                        />
                      </td>
                      <td className={`px-2 py-2 text-right font-bold tabular-nums ${difColor}`}>
                        {dif === 0 ? "—" : cop(dif)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-brown/15 bg-brand-cream-soft/40 font-bold text-brand-black">
                  <td className="truncate px-2 py-2.5" colSpan={6}>
                    Total general · {filas.length} pedido{filas.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{cop(totales.facturado)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{cop(totales.efectivo)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{cop(totales.omp)}</td>
                  <td
                    className={`px-2 py-2.5 text-right tabular-nums ${
                      totales.diferencia === 0
                        ? "text-emerald-600"
                        : totales.diferencia < 0
                          ? "text-red-600"
                          : "text-emerald-600"
                    }`}
                  >
                    {totales.diferencia === 0 ? "$ 0" : cop(totales.diferencia)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Resumen del cuadre + guardar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                totales.diferencia === 0
                  ? "bg-emerald-50 text-emerald-700"
                  : totales.diferencia < 0
                    ? "bg-red-50 text-red-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {totales.diferencia === 0
                ? "✓ Caja cuadrada"
                : totales.diferencia < 0
                  ? `Falta ${cop(Math.abs(totales.diferencia))}`
                  : `Sobra ${cop(totales.diferencia)}`}
            </div>
            <div className="flex items-center gap-3">
              {cerrado && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    bloqueado ? "bg-brand-brown/10 text-brand-brown/70" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d={bloqueado ? "M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" : "M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"} />
                  </svg>
                  {bloqueado ? "Cuadre cerrado" : "Edición autorizada"}
                </span>
              )}
              {guardadoOk && (
                <span className="text-sm font-medium text-emerald-600">Cuadre guardado ✓</span>
              )}
              {!guardadoOk && (
                <span className="text-xs font-medium text-brand-brown/50">
                  {autoguardando ? "Guardando…" : "Guardado automático"}
                </span>
              )}
              <button
                onClick={generarPdf}
                title="Volver a generar el PDF del cuadre (sin guardar)"
                className="inline-flex items-center gap-2 rounded-xl border border-brand-brown/20 bg-white px-4 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Z" />
                </svg>
                Imprimir cuadre
              </button>
              {bloqueado ? (
                <button
                  onClick={() => {
                    setCodigoAuth("");
                    setErrorAuth(null);
                    setAuthAbierta(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-brand-wine/30 bg-white px-5 py-2.5 text-sm font-semibold text-brand-wine transition hover:bg-brand-wine/5"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  Editar cuadre (autorización)
                </button>
              ) : (
                <button
                  onClick={guardar}
                  disabled={guardando}
                  className="rounded-xl bg-brand-wine px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : cerrado ? "Guardar cambios" : "Guardar cuadre"}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal de autorización con clave dinámica para editar un cuadre cerrado */}
      {authAbierta && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-wine/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 text-brand-wine">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h3 className="mt-4 text-center font-serif text-xl font-bold text-brand-wine">
              Autorización requerida
            </h3>
            <p className="mt-1 text-center text-sm text-brand-brown/70">
              Este cuadre ya fue cerrado. Para editarlo, pídele a un administrador
              su <b>clave dinámica</b> e ingrésala.
            </p>
            <input
              inputMode="numeric"
              autoFocus
              value={codigoAuth}
              onChange={(e) => {
                setCodigoAuth(e.target.value.replace(/\D/g, "").slice(0, 6));
                setErrorAuth(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") autorizarEdicion();
              }}
              placeholder="••••••"
              className="mt-4 w-full rounded-xl border border-brand-brown/20 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-brand-wine outline-none focus:border-brand-wine"
            />
            {errorAuth && (
              <p className="mt-2 text-center text-sm font-medium text-red-600">{errorAuth}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuthAbierta(false);
                  setCodigoAuth("");
                  setErrorAuth(null);
                }}
                className="flex-1 rounded-xl border border-brand-brown/20 px-4 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={autorizarEdicion}
                disabled={verificandoAuth || codigoAuth.length !== 6}
                className="flex-1 rounded-xl bg-brand-wine px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-50"
              >
                {verificandoAuth ? "Verificando…" : "Autorizar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
