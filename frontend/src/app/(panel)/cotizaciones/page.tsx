"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getUsuario, tieneAccesoAdministrativo, type Usuario } from "@/lib/auth";
import { puedeVerModulo, puedeAccion } from "@/lib/permisos";
import {
  misPuntosVenta,
  listarPuntosVenta,
  type PuntoVenta,
} from "@/lib/puntos-venta";
import { listarClientes, type Cliente } from "@/lib/clientes";
import { listarProductos, type ProductoPrecio } from "@/lib/productos";
import type { ItemCarrito } from "@/app/(panel)/pedidos/page";
import {
  listarCotizaciones,
  guardarCotizacion,
  eliminarCotizacion,
  convertirCotizacion,
  type Cotizacion,
} from "@/lib/cotizaciones";
import CrearClienteModal from "@/components/CrearClienteModal";

/* -------------------------------------------------------------- */
/*  Utilidades                                                     */
/* -------------------------------------------------------------- */

function cop(v: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(v) ? v : 0);
}

function cantidadLabel(cant: number, um: string | null): string {
  const u = (um || "").trim().toUpperCase();
  const n = Number.isInteger(cant) ? cant : Number(cant.toFixed(2));
  if (u === "KG") return `${n} ${cant === 1 ? "kilo" : "kilos"}`;
  return `${n} ${cant === 1 ? "unidad" : "unidades"}`;
}

function esKilo(um: string | null): boolean {
  return (um || "").trim().toUpperCase() === "KG";
}

function subtotalItem(i: ItemCarrito): number {
  return (Number(i.producto.precio) || 0) * (Number(i.cantidad) || 0);
}

function totalCotizacion(items: ItemCarrito[]): number {
  return items.reduce((s, i) => s + subtotalItem(i), 0);
}

/** Nota legal que va al pie de la cotización. */
const NOTA_COTIZACION =
  "Este documento es una COTIZACIÓN y no constituye una factura. Los valores " +
  "son aproximados y el precio final de los productos puede variar según los " +
  "precios del mercado, el peso real facturado de los productos vendidos por " +
  "kilo (p. ej. se cotizan 20 kg pero se facturan 20.5 kg) y los impuestos que " +
  "apliquen a cada producto.";

/** Cliente genérico "Consumidor final" (NIT estándar 222222222). */
const CONSUMIDOR_FINAL: Cliente = {
  id: "consumidor-final",
  nit_cedula: "222222222",
  nombre: "Consumidor Final",
  apellidos: null,
  direccion: null,
  referencia: null,
  barrio: null,
  ciudad: null,
  telefono: null,
  correo: null,
  punto_venta: null,
  lat: null,
  lng: null,
  activo: true,
  horeca: false,
  direccion_incorrecta: false,
  creado_en: new Date().toISOString(),
};

/* -------------------------------------------------------------- */
/*  PDF profesional de la cotización                               */
/* -------------------------------------------------------------- */

function generarPdfCotizacion(cot: Cotizacion) {
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
    );
  const logo = `${window.location.origin}/LOGOCARNESSANTACRUZ.png`;
  const fecha = cot.fecha
    ? new Date(cot.fecha).toLocaleDateString("es-CO", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
  const numero = `COT-${String(cot.numero ?? 0).padStart(5, "0")}`;
  const p = cot.punto;
  const c = cot.cliente;
  const ciudadP = [p?.barrio, p?.ciudad].filter(Boolean).join(", ");
  const ciudadC = [c?.barrio, c?.ciudad].filter(Boolean).join(", ");

  const filas = (cot.carrito ?? [])
    .map((i, idx) => {
      const kilo = esKilo(i.producto.um);
      const cant = `${cantidadLabel(i.cantidad, i.producto.um)}`;
      return `<tr>
        <td class="c">${idx + 1}</td>
        <td>${esc(i.producto.referencia)}</td>
        <td>${esc((i.producto.producto || "").toUpperCase())}${i.notas?.trim() ? `<div style="font-size:10px;color:#777;font-weight:normal;margin-top:2px">Nota: ${esc(i.notas)}</div>` : ""}</td>
        <td class="c">${esc(cant)}${kilo ? "" : ""}</td>
        <td class="r">${cop(Number(i.producto.precio) || 0)}${kilo ? " /kg" : ""}</td>
        <td class="r">${cop(subtotalItem(i))}</td>
      </tr>`;
    })
    .join("");

  const total = totalCotizacion(cot.carrito ?? []);

  // Lista de precios (2ª hoja): productos seleccionados con su precio.
  const filasLista = (cot.listaPrecios ?? [])
    .map((pr, idx) => {
      const kilo = esKilo(pr.um);
      return `<tr>
        <td class="c">${idx + 1}</td>
        <td>${esc(pr.referencia)}</td>
        <td>${esc((pr.producto || "").toUpperCase())}</td>
        <td class="c">${esc((pr.um || "U").toUpperCase())}</td>
        <td class="r">${cop(Number(pr.precio) || 0)}${kilo ? " /kg" : ""}</td>
      </tr>`;
    })
    .join("");
  const paginaLista =
    (cot.listaPrecios?.length ?? 0) > 0
      ? `<div style="page-break-before:always">
          <div class="head">
            <div>
              <img src="${logo}" alt="Carnes Santacruz" onerror="this.style.display='none'">
              <div class="emp"><b>Carnes Santacruz</b><br>${esc(p?.nombre ?? "")}</div>
            </div>
            <div class="doc">
              <h1>LISTA DE PRECIOS</h1>
              <div class="num">${esc(numero)}</div>
              <div class="fec">${esc(fecha)}</div>
            </div>
          </div>
          <table>
            <thead><tr>
              <th class="c" style="width:34px">#</th>
              <th style="width:90px">Referencia</th>
              <th>Producto</th>
              <th class="c" style="width:70px">U.M.</th>
              <th class="r" style="width:130px">Precio</th>
            </tr></thead>
            <tbody>${filasLista}</tbody>
          </table>
          <div class="nota">${esc(NOTA_COTIZACION)}</div>
          <div class="pie">Carnes Santacruz · Lista de precios ${esc(numero)}</div>
        </div>`
      : "";

  const html = `<!doctype html><html><head><meta charset="utf-8">
  <title>Cotización ${esc(numero)}</title>
  <style>
    *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{size:letter;margin:14mm}
    body{margin:0;font-size:12px;line-height:1.4}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #7a1f2b;padding-bottom:10px;margin-bottom:14px}
    .head img{max-height:64px;max-width:200px;object-fit:contain}
    .emp{font-size:12px;color:#555;margin-top:4px}
    .doc{text-align:right}
    .doc h1{margin:0;font-size:22px;color:#7a1f2b;letter-spacing:1px}
    .doc .num{font-size:15px;font-weight:bold;margin-top:2px}
    .doc .fec{font-size:12px;color:#555;margin-top:2px}
    .cols{display:flex;gap:14px;margin-bottom:14px}
    .card{flex:1;border:1px solid #e2d9cf;border-radius:8px;padding:9px 11px;background:#faf7f2}
    .card h3{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#7a1f2b;border-bottom:1px solid #e2d9cf;padding-bottom:4px}
    .card p{margin:2px 0}
    .lbl{color:#777}
    table{width:100%;border-collapse:collapse;margin-top:4px}
    thead th{background:#7a1f2b;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.4px;padding:7px 8px;text-align:left}
    tbody td{padding:7px 8px;border-bottom:1px solid #ececec;font-size:12px;vertical-align:top}
    tbody tr:nth-child(even){background:#faf7f2}
    td.c,th.c{text-align:center}
    td.r,th.r{text-align:right}
    .tot{margin-top:12px;display:flex;justify-content:flex-end}
    .tot .box{min-width:260px}
    .tot .row{display:flex;justify-content:space-between;padding:5px 10px}
    .tot .grand{background:#7a1f2b;color:#fff;font-size:16px;font-weight:bold;border-radius:6px}
    .tot .grand span{color:#fff}
    .nota{margin-top:16px;border:1px dashed #c0392b;background:#fff5f4;color:#7a1f2b;border-radius:8px;padding:10px 12px;font-size:11px;line-height:1.5}
    .pie{margin-top:22px;text-align:center;color:#999;font-size:10px}
  </style></head><body>
    <div class="head">
      <div>
        <img src="${logo}" alt="Carnes Santacruz" onerror="this.style.display='none'">
        <div class="emp">
          <b>Carnes Santacruz</b><br>
          ${esc(p?.nombre ?? "")}<br>
          ${p?.direccion ? esc(p.direccion) + "<br>" : ""}
          ${ciudadP ? esc(ciudadP) + "<br>" : ""}
          ${p?.telefono ? "Tel: " + esc(p.telefono) : ""}
        </div>
      </div>
      <div class="doc">
        <h1>COTIZACIÓN</h1>
        <div class="num">${esc(numero)}</div>
        <div class="fec">${esc(fecha)}</div>
      </div>
    </div>

    <div class="cols">
      <div class="card">
        <h3>Cliente</h3>
        <p><b>${esc(c?.nombre || c?.nit_cedula || "—")}</b></p>
        <p><span class="lbl">NIT/Cédula:</span> ${esc(c?.nit_cedula ?? "—")}</p>
        ${c?.direccion ? `<p><span class="lbl">Dirección:</span> ${esc(c.direccion)}</p>` : ""}
        ${ciudadC ? `<p><span class="lbl">Ciudad:</span> ${esc(ciudadC)}</p>` : ""}
        ${c?.telefono ? `<p><span class="lbl">Teléfono:</span> ${esc(c.telefono)}</p>` : ""}
      </div>
      <div class="card">
        <h3>Datos de la cotización</h3>
        <p><span class="lbl">Punto de venta:</span> ${esc(p?.nombre ?? "—")}</p>
        <p><span class="lbl">Asesor(a):</span> ${esc(cot.vendedorNombre || "—")}</p>
        <p><span class="lbl">Fecha:</span> ${esc(fecha)}</p>
        <p><span class="lbl">Validez:</span> sujeta a precios de mercado</p>
      </div>
    </div>

    <table>
      <thead><tr>
        <th class="c" style="width:34px">#</th>
        <th style="width:80px">Referencia</th>
        <th>Descripción</th>
        <th class="c" style="width:110px">Unidades / Kilos</th>
        <th class="r" style="width:110px">Precio</th>
        <th class="r" style="width:110px">Subtotal</th>
      </tr></thead>
      <tbody>${filas || `<tr><td colspan="6" class="c" style="padding:18px;color:#999">Sin productos</td></tr>`}</tbody>
    </table>

    <div class="tot">
      <div class="box">
        <div class="row grand"><span>TOTAL COTIZACIÓN</span><span>${cop(total)}</span></div>
      </div>
    </div>

    ${cot.observacion ? `<div class="nota" style="border-style:solid;border-color:#e2d9cf;background:#faf7f2;color:#333"><b>Observaciones:</b> ${esc(cot.observacion)}</div>` : ""}

    <div class="nota">${esc(NOTA_COTIZACION)}</div>

    <div class="pie">Carnes Santacruz · Documento generado el ${esc(new Date().toLocaleString("es-CO"))}</div>
    ${paginaLista}
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  const img = w.document.querySelector("img");
  if (img && !img.complete) {
    img.onload = () => w.print();
    img.onerror = () => w.print();
  } else {
    w.print();
  }
}

/* -------------------------------------------------------------- */
/*  Página principal                                               */
/* -------------------------------------------------------------- */

export default function CotizacionesPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ inicial: Cotizacion | null } | null>(
    null,
  );
  const [aBorrar, setABorrar] = useState<Cotizacion | null>(null);
  const [convirtiendo, setConvirtiendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const esAdmin = tieneAccesoAdministrativo(usuario?.rol);
  const puedeCrear = puedeAccion(usuario, "cotizaciones.crear");
  const puedeEditar = puedeAccion(usuario, "cotizaciones.editar");
  const puedeEliminar = puedeAccion(usuario, "cotizaciones.eliminar");
  const puedeConvertir = puedeAccion(usuario, "cotizaciones.convertir");

  /** Puede editar una cotización concreta: tiene permiso de rol Y es el creador (o admin). */
  const puedeEditarCot = (cot: Cotizacion) =>
    puedeEditar &&
    (esAdmin ||
      !cot.vendedorCedula ||
      cot.vendedorCedula === usuario?.cedula);

  useEffect(() => {
    const u = getUsuario();
    if (!puedeVerModulo(u, "cotizaciones")) {
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
      const [ps, cots] = await Promise.all([cargaPuntos, listarCotizaciones()]);
      setPuntos(ps);
      setCotizaciones(cots);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudieron cargar las cotizaciones",
      );
    } finally {
      setCargando(false);
    }
  }, [usuario, esAdmin]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function confirmarBorrar() {
    if (!aBorrar) return;
    try {
      await eliminarCotizacion(aBorrar.id);
      const etiqueta = `COT-${String(aBorrar.numero ?? 0).padStart(5, "0")}`;
      setCotizaciones((prev) => prev.filter((c) => c.id !== aBorrar.id));
      setABorrar(null);
      setAviso(`Cotización ${etiqueta} eliminada correctamente.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar la cotización");
    }
  }

  async function convertir(cot: Cotizacion) {
    if (convirtiendo) return;
    setConvirtiendo(cot.id);
    setError(null);
    try {
      const { cotizacion } = await convertirCotizacion(cot.id);
      setCotizaciones((prev) =>
        prev.map((c) => (c.id === cot.id ? cotizacion : c)),
      );
      setAviso(
        `Cotización #${cot.numero} convertida en el pedido ${cotizacion.pedidoComanda ?? ""}.`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo convertir la cotización",
      );
    } finally {
      setConvirtiendo(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mb-4 flex flex-shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">
            Cotizaciones
          </h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Crea cotizaciones con precios editables, genera el PDF y conviértelas
            en pedido cuando el cliente autorice.
          </p>
        </div>
        {puedeCrear && (
          <button
            onClick={() => setEditor({ inicial: null })}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            Nueva cotización
          </button>
        )}
      </div>

      {aviso && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="font-bold">
            ✕
          </button>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
        </div>
      ) : cotizaciones.length === 0 ? (
        <div className="rounded-2xl border border-brand-brown/10 bg-white py-16 text-center text-sm text-brand-brown/60 shadow-sm">
          Aún no hay cotizaciones. Crea la primera con “Nueva cotización”.
        </div>
      ) : (
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto rounded-2xl border border-brand-brown/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-brand-brown/10 bg-brand-cream-soft/50 text-left text-[11px] font-bold uppercase tracking-wide text-brand-brown/60">
                <th className="px-4 py-3">N°</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Punto</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cotizaciones.map((cot) => {
                const confirmada = cot.estado === "confirmada";
                return (
                  <tr
                    key={cot.id}
                    className="border-b border-brand-brown/5 last:border-0 hover:bg-brand-cream-soft/30"
                  >
                    <td className="px-4 py-3 font-semibold text-brand-wine">
                      COT-{String(cot.numero ?? 0).padStart(5, "0")}
                    </td>
                    <td className="px-4 py-3 text-brand-brown/70">
                      {cot.fecha
                        ? new Date(cot.fecha).toLocaleDateString("es-CO")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-brand-black">
                        {cot.cliente?.nombre || cot.cliente?.nit_cedula || "—"}
                      </div>
                      <div className="text-xs text-brand-brown/50">
                        {cot.cliente?.nit_cedula}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-brand-brown/70">
                      {cot.punto?.nombre || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-brand-black">
                      {cop(cot.total ?? totalCotizacion(cot.carrito ?? []))}
                    </td>
                    <td className="px-4 py-3">
                      {confirmada ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          ✓ Pedido {cot.pedidoComanda ?? ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          Borrador
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          onClick={() => generarPdfCotizacion(cot)}
                          title="Ver / imprimir la cotización (PDF)"
                          className="rounded-lg border border-brand-brown/15 px-2.5 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
                        >
                          Ver PDF
                        </button>
                        {!confirmada && puedeEditarCot(cot) && (
                          <button
                            onClick={() => setEditor({ inicial: cot })}
                            title="Editar la cotización"
                            className="rounded-lg border border-brand-brown/15 px-2.5 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
                          >
                            Editar
                          </button>
                        )}
                        {!confirmada && puedeConvertir && (
                          <button
                            onClick={() => convertir(cot)}
                            disabled={convirtiendo === cot.id}
                            title="Convertir en pedido (con los precios de la cotización)"
                            className="rounded-lg bg-brand-wine px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-50"
                          >
                            {convirtiendo === cot.id ? "Convirtiendo…" : "Confirmar"}
                          </button>
                        )}
                        {puedeEliminar && (
                          <button
                            onClick={() => setABorrar(cot)}
                            title="Borrar la cotización"
                            className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Borrar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editor && (
        <EditorCotizacion
          inicial={editor.inicial}
          puntos={puntos}
          usuario={usuario}
          onCerrar={() => setEditor(null)}
          onGuardado={(cot) => {
            const esNueva = !cotizaciones.some((c) => c.id === cot.id);
            setCotizaciones((prev) => {
              const existe = prev.some((c) => c.id === cot.id);
              return existe
                ? prev.map((c) => (c.id === cot.id ? cot : c))
                : [cot, ...prev];
            });
            setEditor(null);
            const etiqueta = `COT-${String(cot.numero ?? 0).padStart(5, "0")}`;
            setAviso(
              esNueva
                ? `Cotización ${etiqueta} creada correctamente. Se abrió el PDF para imprimir.`
                : `Cotización ${etiqueta} actualizada correctamente.`,
            );
            // Al crear una cotización nueva se genera el PDF automáticamente.
            if (esNueva) generarPdfCotizacion(cot);
          }}
        />
      )}

      {aBorrar && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-brand-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="font-serif text-lg font-bold text-brand-wine">
              Borrar cotización
            </h2>
            <p className="mt-2 text-sm text-brand-brown/70">
              ¿Seguro que deseas borrar la cotización{" "}
              <b>COT-{String(aBorrar.numero ?? 0).padStart(5, "0")}</b>? Esta
              acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setABorrar(null)}
                className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-medium text-brand-brown/70 transition hover:bg-brand-cream-soft"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarBorrar}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- */
/*  Editor / creador de cotización                                 */
/* -------------------------------------------------------------- */

function EditorCotizacion({
  inicial,
  puntos,
  usuario,
  onCerrar,
  onGuardado,
}: {
  inicial: Cotizacion | null;
  puntos: PuntoVenta[];
  usuario: Usuario | null;
  onCerrar: () => void;
  onGuardado: (c: Cotizacion) => void;
}) {
  const [punto, setPunto] = useState<PuntoVenta | null>(
    inicial?.punto ?? (puntos.length === 1 ? puntos[0] : null),
  );
  const [cliente, setCliente] = useState<Cliente | null>(inicial?.cliente ?? null);
  const [items, setItems] = useState<ItemCarrito[]>(inicial?.carrito ?? []);
  const [observacion, setObservacion] = useState(inicial?.observacion ?? "");
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  // Texto en edición de las cantidades (permite escribir decimales como "1.").
  const [cantTxt, setCantTxt] = useState<Record<string, string>>({});

  // Buscador de clientes.
  const [busCli, setBusCli] = useState("");
  const [busCliDeb, setBusCliDeb] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargandoCli, setCargandoCli] = useState(false);
  const [crearCli, setCrearCli] = useState(false);
  // Sugerencias ocultadas con la "X" (solo visual, en memoria; no toca la BD).
  const [cliOcultos, setCliOcultos] = useState<Set<string>>(() => new Set());

  // Buscador de productos.
  const [busProd, setBusProd] = useState("");
  const [busProdDeb, setBusProdDeb] = useState("");
  const [productos, setProductos] = useState<ProductoPrecio[]>([]);
  const [cargandoProd, setCargandoProd] = useState(false);
  const [prodOcultos, setProdOcultos] = useState<Set<string>>(() => new Set());

  // Lista de precios (2ª hoja del PDF): productos seleccionados con su precio.
  const [listaPrecios, setListaPrecios] = useState<ProductoPrecio[]>(
    inicial?.listaPrecios ?? [],
  );

  const total = useMemo(() => totalCotizacion(items), [items]);
  // Total de kilos (suma de cantidades de los productos que se venden por kilo).
  const totalKilos = useMemo(
    () =>
      items
        .filter((i) => esKilo(i.producto.um))
        .reduce((s, i) => s + (Number(i.cantidad) || 0), 0),
    [items],
  );

  useEffect(() => {
    const t = setTimeout(() => setBusCliDeb(busCli), 1200);
    return () => clearTimeout(t);
  }, [busCli]);

  useEffect(() => {
    let cancel = false;
    setCargandoCli(true);
    listarClientes(busCliDeb, 20, 0)
      .then((r) => {
        if (!cancel) setClientes(r.items);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setCargandoCli(false);
      });
    return () => {
      cancel = true;
    };
  }, [busCliDeb]);

  useEffect(() => {
    const t = setTimeout(() => setBusProdDeb(busProd), 300);
    return () => clearTimeout(t);
  }, [busProd]);

  useEffect(() => {
    if (!punto) return;
    let cancel = false;
    setCargandoProd(true);
    listarProductos(punto.lista_precio ?? undefined, busProdDeb)
      .then((r) => {
        if (!cancel) setProductos(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setCargandoProd(false);
      });
    return () => {
      cancel = true;
    };
  }, [punto, busProdDeb]);

  function agregarProducto(p: ProductoPrecio) {
    // Cada clic agrega una LÍNEA nueva (aunque el producto se repita), para que
    // cada una lleve su propia cantidad. No se consolida por producto.
    setItems((prev) => {
      const nuevo: ItemCarrito = {
        id: crypto.randomUUID(),
        producto: { ...p, precio: Number(p.precio) || 0 },
        cantidad: 1,
        alVacio: false,
        porcionado: false,
        corte: "",
        gramos: 0,
        unidades: 0,
        notas: "",
      };
      return [...prev, nuevo];
    });
  }

  // Lista de precios (2ª hoja): agregar / quitar / editar precio.
  function agregarAListaPrecios(pr: ProductoPrecio) {
    setListaPrecios((prev) =>
      prev.some((x) => x.id === pr.id)
        ? prev
        : [...prev, { ...pr, precio: Number(pr.precio) || 0 }],
    );
  }
  function quitarDeListaPrecios(id: string) {
    setListaPrecios((prev) => prev.filter((x) => x.id !== id));
  }
  function cambiarPrecioLista(id: string, valor: string) {
    const n = Number(valor.replace(/[^\d]/g, ""));
    setListaPrecios((prev) =>
      prev.map((x) => (x.id === id ? { ...x, precio: Number.isFinite(n) ? n : 0 } : x)),
    );
  }

  function cambiarCantidad(id: string, valor: string) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const kilo = esKilo(i.producto.um);
        // Limpia: por kilo admite decimales; por unidad solo dígitos.
        let v = valor.replace(",", ".");
        v = kilo ? v.replace(/[^\d.]/g, "") : v.replace(/[^\d]/g, "");
        if (kilo) {
          const parts = v.split(".");
          if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
        }
        setCantTxt((t) => ({ ...t, [id]: v }));
        const n = parseFloat(v);
        const cantidad = Number.isFinite(n) && n > 0 ? (kilo ? n : Math.floor(n)) : 0;
        return { ...i, cantidad };
      }),
    );
  }

  // Botones − / +: paso 0.5 por kilo, 1 por unidad. No baja del paso mínimo.
  function ajustarCantidad(id: string, delta: number) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const kilo = esKilo(i.producto.um);
        const step = kilo ? 0.5 : 1;
        let n = (Number(i.cantidad) || 0) + delta * step;
        if (n < step) n = step;
        n = kilo ? Math.round(n * 100) / 100 : Math.round(n);
        return { ...i, cantidad: n };
      }),
    );
    setCantTxt((t) => {
      const next = { ...t };
      delete next[id];
      return next;
    });
  }

  function cambiarPrecio(id: string, valor: string) {
    const n = Number(valor.replace(/[^\d]/g, ""));
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, producto: { ...i.producto, precio: Number.isFinite(n) ? n : 0 } }
          : i,
      ),
    );
  }

  function quitar(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function cambiarNota(id: string, valor: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, notas: valor } : i)),
    );
  }

  async function guardar() {
    if (!punto) {
      setErrorForm("Selecciona el punto de venta.");
      return;
    }
    if (!cliente) {
      setErrorForm("Selecciona el cliente.");
      return;
    }
    if (items.length === 0) {
      setErrorForm("Agrega al menos un producto a la cotización.");
      return;
    }
    if (items.some((i) => i.cantidad <= 0)) {
      setErrorForm("Todas las cantidades deben ser mayores a 0.");
      return;
    }
    setGuardando(true);
    setErrorForm(null);
    const cot: Cotizacion = {
      id: inicial?.id ?? crypto.randomUUID(),
      numero: inicial?.numero ?? 0,
      fecha: inicial?.fecha ?? new Date().toISOString(),
      estado: inicial?.estado ?? "borrador",
      punto,
      cliente,
      carrito: items,
      total,
      listaPrecios: listaPrecios.length ? listaPrecios : undefined,
      observacion: observacion.trim() || undefined,
      vendedorNombre: inicial?.vendedorNombre ?? usuario?.nombre ?? "",
      vendedorCedula: inicial?.vendedorCedula ?? usuario?.cedula ?? "",
      pedidoId: inicial?.pedidoId,
      pedidoComanda: inicial?.pedidoComanda,
    };
    try {
      const guardada = await guardarCotizacion(cot);
      onGuardado(guardada);
    } catch (e) {
      setErrorForm(
        e instanceof Error ? e.message : "No se pudo guardar la cotización",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/50 p-4">
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Encabezado */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-brand-brown/10 px-5 py-4">
          <h2 className="font-serif text-xl font-bold text-brand-wine">
            {inicial ? `Editar cotización COT-${String(inicial.numero ?? 0).padStart(5, "0")}` : "Nueva cotización"}
          </h2>
          <div className="flex items-center gap-3">
            <select
              value={punto?.id ?? ""}
              onChange={(e) =>
                setPunto(puntos.find((p) => p.id === e.target.value) ?? null)
              }
              className="rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-sm font-semibold text-brand-black outline-none focus:border-brand-wine"
            >
              <option value="">Punto de venta…</option>
              {puntos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <button
              onClick={onCerrar}
              aria-label="Cerrar"
              className="rounded-lg p-1.5 text-brand-brown/50 transition hover:bg-brand-cream-soft hover:text-brand-wine"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 p-5 lg:grid-cols-[1fr_1.3fr]">
          {/* Columna izquierda: cliente + productos */}
          <div className="min-h-0 space-y-4 overflow-y-auto">
            {/* Cliente */}
            <section className="rounded-xl border border-brand-brown/10 bg-brand-cream-soft/30 p-3">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-wine">
                Cliente
              </h3>
              {cliente ? (
                <div className="flex items-start justify-between gap-2 rounded-lg border border-brand-amber/40 bg-brand-amber/5 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-brand-black">
                      {cliente.nombre || cliente.nit_cedula}
                    </p>
                    <p className="text-xs text-brand-brown/60">
                      {cliente.nit_cedula}
                      {cliente.direccion ? ` · ${cliente.direccion}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setCliente(null)}
                    className="shrink-0 text-xs font-semibold text-brand-wine hover:underline"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => setCliente(CONSUMIDOR_FINAL)}
                    className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-wine/30 bg-brand-wine/5 px-3 py-2 text-sm font-semibold text-brand-wine transition hover:bg-brand-wine/10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0v.75H4.5v-.75Z" />
                    </svg>
                    Cotizar a Consumidor final
                  </button>
                  <div className="mb-1 text-center text-[10px] uppercase tracking-wide text-brand-brown/40">
                    o busca un cliente
                  </div>
                  <div className="relative">
                    <input
                      value={busCli}
                      onChange={(e) => setBusCli(e.target.value)}
                      placeholder="Buscar por nombre, NIT/cédula o teléfono"
                      className="w-full rounded-lg border border-brand-brown/15 bg-white px-3 py-2 pr-9 text-sm outline-none focus:border-brand-amber"
                    />
                    {busCli && (
                      <button
                        type="button"
                        onClick={() => setBusCli("")}
                        title="Limpiar búsqueda"
                        aria-label="Limpiar búsqueda"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-brand-brown/40 transition hover:bg-brand-cream-soft hover:text-brand-wine"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    {cargandoCli ? (
                      <p className="py-3 text-center text-xs text-brand-brown/50">
                        Buscando…
                      </p>
                    ) : clientes.length === 0 ? (
                      <div className="py-3 text-center">
                        <p className="text-xs text-brand-brown/50">
                          Sin resultados.
                        </p>
                        <button
                          onClick={() => setCrearCli(true)}
                          className="mt-2 rounded-lg bg-brand-amber px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Crear cliente
                        </button>
                      </div>
                    ) : (
                      clientes.filter((c) => !cliOcultos.has(c.id)).map((c) => (
                        <div
                          key={c.id}
                          className="flex items-stretch overflow-hidden rounded-lg border border-brand-brown/10 bg-white transition hover:border-brand-amber/40 hover:bg-brand-cream-soft/40"
                        >
                          <button
                            onClick={() => setCliente(c)}
                            className="block flex-1 px-3 py-2 text-left text-sm"
                          >
                            <span className="font-medium text-brand-black">
                              {c.nombre || c.nit_cedula}
                            </span>
                            <span className="ml-1 text-xs text-brand-brown/50">
                              · {c.nit_cedula}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCliOcultos((prev) => new Set(prev).add(c.id))}
                            title="Quitar esta sugerencia de la lista (solo temporal)"
                            aria-label="Quitar sugerencia"
                            className="flex shrink-0 items-center px-2 text-brand-brown/30 transition hover:bg-brand-cream-soft hover:text-brand-wine"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Productos */}
            <section className="rounded-xl border border-brand-brown/10 bg-brand-cream-soft/30 p-3">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-wine">
                Agregar productos
              </h3>
              {!punto ? (
                <p className="py-3 text-center text-xs text-brand-brown/50">
                  Selecciona primero el punto de venta.
                </p>
              ) : (
                <>
                  <div className="relative">
                    <input
                      value={busProd}
                      onChange={(e) => setBusProd(e.target.value)}
                      placeholder="Buscar producto por nombre o referencia"
                      className="w-full rounded-lg border border-brand-brown/15 bg-white px-3 py-2 pr-9 text-sm outline-none focus:border-brand-amber"
                    />
                    {busProd && (
                      <button
                        type="button"
                        onClick={() => setBusProd("")}
                        title="Limpiar búsqueda"
                        aria-label="Limpiar búsqueda"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-brand-brown/40 transition hover:bg-brand-cream-soft hover:text-brand-wine"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                    {cargandoProd ? (
                      <p className="py-3 text-center text-xs text-brand-brown/50">
                        Cargando…
                      </p>
                    ) : productos.length === 0 ? (
                      <p className="py-3 text-center text-xs text-brand-brown/50">
                        Sin productos.
                      </p>
                    ) : (
                      productos.slice(0, 40).filter((p) => !prodOcultos.has(p.id)).map((p) => (
                        <div
                          key={p.id}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-brand-brown/10 bg-white px-3 py-2 text-left text-sm transition hover:border-brand-amber/40 hover:bg-brand-cream-soft/40"
                        >
                          <button
                            onClick={() => agregarProducto(p)}
                            title="Agregar a la cotización"
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-brand-black">
                                {(p.producto || "").toUpperCase()}
                              </span>
                              <span className="text-xs text-brand-brown/50">
                                Ref {p.referencia} · {p.um || "U"}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold text-brand-wine">
                              {cop(Number(p.precio) || 0)}
                            </span>
                          </button>
                          <button
                            onClick={() => agregarAListaPrecios(p)}
                            title="Agregar a la lista de precios (2ª hoja del PDF)"
                            className="shrink-0 rounded-md border border-brand-wine/30 bg-brand-wine/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-wine transition hover:bg-brand-wine/10"
                          >
                            + Lista
                          </button>
                          <button
                            type="button"
                            onClick={() => setProdOcultos((prev) => new Set(prev).add(p.id))}
                            title="Quitar esta sugerencia de la lista (solo temporal)"
                            aria-label="Quitar sugerencia"
                            className="flex shrink-0 items-center rounded-md px-1.5 text-brand-brown/30 transition hover:bg-brand-cream-soft hover:text-brand-wine"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </section>

            {/* Lista de precios (2ª hoja del PDF) */}
            <section className="rounded-xl border border-brand-brown/10 bg-brand-cream-soft/30 p-3">
              <h3 className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-brand-wine">
                <span>Lista de precios · 2ª hoja</span>
                {listaPrecios.length > 0 && (
                  <span className="rounded-full bg-brand-wine/10 px-2 py-0.5 text-[10px] font-bold text-brand-wine">
                    {listaPrecios.length}
                  </span>
                )}
              </h3>
              <p className="mb-2 text-[11px] text-brand-brown/55">
                Productos que saldrán como lista de precios en una segunda hoja del
                PDF. Agrégalos con “+ Lista” desde el buscador de arriba.
              </p>
              {listaPrecios.length === 0 ? (
                <p className="py-3 text-center text-xs text-brand-brown/50">
                  Sin productos en la lista de precios.
                </p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {listaPrecios.map((pr) => (
                    <div
                      key={pr.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-brand-brown/10 bg-white px-2.5 py-1.5 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-brand-black">
                          {(pr.producto || "").toUpperCase()}
                        </span>
                        <span className="text-[10px] text-brand-brown/50">
                          Ref {pr.referencia} · {pr.um || "U"}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-[10px] text-brand-brown/40">$</span>
                        <input
                          inputMode="numeric"
                          value={String(Number(pr.precio) || 0)}
                          onChange={(e) => cambiarPrecioLista(pr.id, e.target.value)}
                          title="Precio en la lista"
                          className="w-20 rounded-md border border-brand-brown/20 px-1.5 py-0.5 text-right tabular-nums outline-none focus:border-brand-wine"
                        />
                        <button
                          onClick={() => quitarDeListaPrecios(pr.id)}
                          title="Quitar de la lista"
                          className="rounded-md p-1 text-brand-brown/40 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Columna derecha: carrito con precios editables */}
          <div className="flex min-h-0 flex-col gap-3">
            <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-brand-brown/10 bg-white p-3">
              <h3 className="mb-2 shrink-0 text-[11px] font-bold uppercase tracking-wide text-brand-wine">
                Productos de la cotización
                {items.length > 0 && (
                  <span className="ml-2 rounded-full bg-brand-wine/10 px-2 py-0.5 text-[10px] font-bold text-brand-wine">
                    {items.length} {items.length === 1 ? "ítem" : "ítems"}
                    {totalKilos > 0 &&
                      ` · ${Number(totalKilos.toFixed(2))} kg`}
                  </span>
                )}
              </h3>
              {items.length === 0 ? (
                <p className="py-8 text-center text-sm text-brand-brown/50">
                  Agrega productos desde el panel izquierdo. Puedes editar el
                  precio de cada uno.
                </p>
              ) : (
                <>
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-white">
                        <tr className="border-b border-brand-brown/10 text-left text-[10px] font-bold uppercase tracking-wide text-brand-brown/50">
                          <th className="py-2 pr-2">Ref.</th>
                          <th className="py-2 pr-2">Descripción</th>
                          <th className="py-2 pr-2 text-center">Cant./Kilos</th>
                          <th className="py-2 pr-2 text-right">Precio</th>
                          <th className="py-2 pr-2 text-right">Subtotal</th>
                          <th className="py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((i) => (
                          <tr
                            key={i.id}
                            className="border-b border-brand-brown/5 last:border-0"
                          >
                            <td className="py-2 pr-2 font-semibold text-brand-wine">
                              {i.producto.referencia}
                            </td>
                            <td className="py-2 pr-2 text-brand-black">
                              <span className="block max-w-[14rem] truncate">
                                {(i.producto.producto || "").toUpperCase()}
                              </span>
                              <span className="text-[10px] text-brand-brown/50">
                                {esKilo(i.producto.um) ? "por kilo" : "por unidad"}
                              </span>
                              <input
                                value={i.notas}
                                onChange={(e) => cambiarNota(i.id, e.target.value)}
                                placeholder="Nota del producto (opcional)"
                                className="mt-1 w-full max-w-[16rem] rounded-md border border-brand-brown/15 bg-white px-1.5 py-0.5 text-[11px] text-brand-brown/80 outline-none focus:border-brand-amber"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => ajustarCantidad(i.id, -1)}
                                  title="Disminuir"
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-brand-brown/20 text-brand-brown transition hover:bg-brand-cream-soft"
                                >
                                  −
                                </button>
                                <input
                                  inputMode="decimal"
                                  value={cantTxt[i.id] ?? String(i.cantidad)}
                                  onChange={(e) => cambiarCantidad(i.id, e.target.value)}
                                  onBlur={() =>
                                    setCantTxt((t) => {
                                      const next = { ...t };
                                      delete next[i.id];
                                      return next;
                                    })
                                  }
                                  title={esKilo(i.producto.um) ? "Kilos (admite decimales: 1.5, 1.2)" : "Unidades (enteras)"}
                                  className="w-14 rounded-md border border-brand-brown/20 px-1.5 py-1 text-center tabular-nums outline-none focus:border-brand-wine"
                                />
                                <button
                                  type="button"
                                  onClick={() => ajustarCantidad(i.id, 1)}
                                  title="Aumentar"
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-brand-brown/20 text-brand-brown transition hover:bg-brand-cream-soft"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2 pr-2 text-right">
                              <input
                                inputMode="numeric"
                                value={i.producto.precio}
                                onChange={(e) => cambiarPrecio(i.id, e.target.value)}
                                title="Precio editable"
                                className="w-24 rounded-md border border-brand-amber/40 bg-brand-amber/5 px-1.5 py-1 text-right font-semibold tabular-nums text-brand-wine outline-none focus:border-brand-wine"
                              />
                            </td>
                            <td className="py-2 pr-2 text-right font-semibold tabular-nums text-brand-black">
                              {cop(subtotalItem(i))}
                            </td>
                            <td className="py-2 text-right">
                              <button
                                onClick={() => quitar(i.id)}
                                title="Quitar"
                                className="rounded p-1 text-brand-brown/40 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex shrink-0 items-center justify-between border-t-2 border-brand-brown/15 pt-2 text-sm font-bold text-brand-black">
                    <span>Total cotización</span>
                    <span className="tabular-nums text-brand-wine">{cop(total)}</span>
                  </div>
                </>
              )}
            </section>

            <section className="shrink-0 rounded-xl border border-brand-brown/10 bg-white p-3">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-wine">
                Observaciones
              </h3>
              <textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value.slice(0, 500))}
                rows={2}
                placeholder="Notas para el cliente (opcional)"
                className="w-full rounded-lg border border-brand-brown/15 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber"
              />
            </section>

            <div className="shrink-0 rounded-xl border border-brand-brown/10 bg-brand-cream-soft/40 px-3 py-2 text-[11px] leading-relaxed text-brand-brown/70">
              Nota: el total es una <b>cotización</b> y puede variar según precios
              de mercado, el peso real facturado (kilos) e impuestos de los
              productos.
            </div>

            {errorForm && (
              <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorForm}
              </div>
            )}

            <div className="flex shrink-0 justify-end gap-2">
              <button
                onClick={onCerrar}
                disabled={guardando}
                className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-medium text-brand-brown/70 transition hover:bg-brand-cream-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                className="rounded-xl bg-brand-amber px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90 disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar cotización"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {crearCli && (
        <CrearClienteModal
          nitInicial={busCli.trim()}
          onCerrar={() => setCrearCli(false)}
          onCreado={(c) => {
            setCrearCli(false);
            setCliente(c);
          }}
        />
      )}
    </div>
  );
}
