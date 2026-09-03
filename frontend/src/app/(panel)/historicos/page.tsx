"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DetallePedido,
  formatoCOP,
  imprimirComanda,
  ReplicasEstado,
  type Pedido,
} from "@/app/(panel)/pedidos/page";
import { cargarEstadoPedidos, buscarPedidos, type DespachoMeta } from "@/lib/pedidos";
import { yaDespachado, colorEstado } from "@/lib/despacho";
import { misPuntosVenta } from "@/lib/puntos-venta";
import { getUsuario, tieneAccesoAdministrativo } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";

const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

export default function HistoricosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [meta, setMeta] = useState<Record<string, DespachoMeta>>({});
  const [cargando, setCargando] = useState(true);
  const [detalle, setDetalle] = useState<Pedido | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [tipo, setTipo] = useState<"todos" | "despachado" | "anulado">("todos");
  const [filtroPunto, setFiltroPunto] = useState("");

  // Resultados traídos del backend bajo demanda: búsqueda en TODO el historial
  // y carga de un día concreto (ambos fuera de la ventana de días recientes que
  // trae el listado por defecto). Se fusionan con `pedidos` para el filtrado.
  const [busqPedidos, setBusqPedidos] = useState<Pedido[]>([]);
  const [busqMeta, setBusqMeta] = useState<Record<string, DespachoMeta>>({});
  const [buscando, setBuscando] = useState(false);
  const [diaPedidos, setDiaPedidos] = useState<Pedido[]>([]);
  const [diaMeta, setDiaMeta] = useState<Record<string, DespachoMeta>>({});

  // Puntos del usuario (para acceso operativo); los admin ven todos.
  const [filtroIds, setFiltroIds] = useState<Set<string> | null>(null);
  const [filtroListo, setFiltroListo] = useState(false);

  const [usuario] = useState(() => getUsuario());
  const permiteImprimir = puedeAccion(usuario, "pedidos.imprimir");

  useEffect(() => {
    const u = getUsuario();
    if (tieneAccesoAdministrativo(u?.rol)) {
      setFiltroIds(null);
      setFiltroListo(true);
      return;
    }
    misPuntosVenta()
      .then((ps) => setFiltroIds(new Set(ps.map((p) => p.id))))
      .catch(() => setFiltroIds(new Set()))
      .finally(() => setFiltroListo(true));
  }, []);

  useEffect(() => {
    cargarEstadoPedidos()
      .then((e) => {
        setPedidos(e.pedidos);
        setMeta(e.meta ?? {});
      })
      .catch(() => setPedidos([]))
      .finally(() => setCargando(false));
  }, []);

  // Búsqueda en TODO el historial (comanda, consecutivo, nombre o NIT), con
  // debounce. Sin esto la búsqueda solo miraría los pedidos de los últimos días
  // que trae el listado por defecto y las comandas antiguas no aparecerían.
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setBusqPedidos([]);
      setBusqMeta({});
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const t = setTimeout(() => {
      buscarPedidos(q)
        .then((e) => {
          setBusqPedidos(e.pedidos);
          setBusqMeta(e.meta ?? {});
        })
        .catch(() => {
          setBusqPedidos([]);
          setBusqMeta({});
        })
        .finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Carga bajo demanda de un día concreto (fuera de la ventana de días
  // recientes), para que el filtro de fecha muestre históricos antiguos.
  useEffect(() => {
    if (!fechaFiltro) {
      setDiaPedidos([]);
      setDiaMeta({});
      return;
    }
    let vigente = true;
    cargarEstadoPedidos({ rango: "fecha", fecha: fechaFiltro })
      .then((e) => {
        if (!vigente) return;
        setDiaPedidos(e.pedidos);
        setDiaMeta(e.meta ?? {});
      })
      .catch(() => {
        if (!vigente) return;
        setDiaPedidos([]);
        setDiaMeta({});
      });
    return () => {
      vigente = false;
    };
  }, [fechaFiltro]);

  // Conjunto de trabajo: pedidos recientes + resultados de búsqueda + día
  // cargado, sin duplicados (por id).
  const pool = useMemo(() => {
    if (busqPedidos.length === 0 && diaPedidos.length === 0) return pedidos;
    const map = new Map<string, Pedido>();
    for (const p of pedidos) map.set(p.id, p);
    for (const p of diaPedidos) map.set(p.id, p);
    for (const p of busqPedidos) map.set(p.id, p);
    return Array.from(map.values());
  }, [pedidos, busqPedidos, diaPedidos]);

  const metaTotal = useMemo(
    () => ({ ...meta, ...diaMeta, ...busqMeta }),
    [meta, diaMeta, busqMeta],
  );

  // Clones por comanda de origen: comanda del pedido -> comandas de sus clones.
  // Permite mostrar la relación de clonación también en Históricos.
  const clonesPorComanda = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const p of pool) {
      if (!p.clonadoDe) continue;
      const arr = mapa.get(p.clonadoDe);
      if (arr) arr.push(p.comanda);
      else mapa.set(p.clonadoDe, [p.comanda]);
    }
    return mapa;
  }, [pool]);

  const historicos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pool
      .filter((p) => {
        // Solo despachados (incluye en tránsito/entregado) o anulados.
        const esAnulado = p.anulado || norm(p.estado) === "anulado";
        const esDespachado = !esAnulado && yaDespachado(p.estado);
        if (!esAnulado && !esDespachado) return false;
        // Filtro por punto (acceso operativo).
        if (filtroIds && !(p.punto?.id && filtroIds.has(p.punto.id))) return false;
        // Filtro por tipo.
        if (tipo === "despachado" && !esDespachado) return false;
        if (tipo === "anulado" && !esAnulado) return false;
        // Filtro por punto de venta (PDV).
        if (filtroPunto && p.punto?.id !== filtroPunto) return false;
        // Filtro por día.
        if (fechaFiltro) {
          const d = new Date(p.fecha);
          const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (dia !== fechaFiltro) return false;
        }
        // Búsqueda.
        if (q) {
          const consec = String(p.consecutivo ?? "");
          const comanda = norm(p.comanda);
          const nombre = norm(p.cliente?.nombre);
          const nit = norm(p.cliente?.nit_cedula);
          if (
            !consec.includes(q) &&
            !comanda.includes(q) &&
            !nombre.includes(q) &&
            !nit.includes(q)
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [pool, busqueda, fechaFiltro, tipo, filtroPunto, filtroIds]);

  // Puntos de venta presentes en los históricos visibles (para el filtro PDV).
  const puntosDisponibles = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pedidos) {
      const esAnulado = p.anulado || norm(p.estado) === "anulado";
      const esDespachado = !esAnulado && yaDespachado(p.estado);
      if (!esAnulado && !esDespachado) continue;
      if (filtroIds && !(p.punto?.id && filtroIds.has(p.punto.id))) continue;
      if (p.punto?.id) map.set(p.punto.id, p.punto.nombre ?? p.punto.id);
    }
    return Array.from(map, ([id, nombre]) => ({ id, nombre })).sort((a, b) =>
      a.nombre.localeCompare(b.nombre),
    );
  }, [pedidos, filtroIds]);

  const totalDespachados = useMemo(
    () =>
      pedidos.filter(
        (p) =>
          !p.anulado &&
          yaDespachado(p.estado) &&
          (!filtroIds || (p.punto?.id && filtroIds.has(p.punto.id))),
      ).length,
    [pedidos, filtroIds],
  );
  const totalAnulados = useMemo(
    () =>
      pedidos.filter(
        (p) =>
          (p.anulado || norm(p.estado) === "anulado") &&
          (!filtroIds || (p.punto?.id && filtroIds.has(p.punto.id))),
      ).length,
    [pedidos, filtroIds],
  );

  const moverDia = (delta: number) => {
    const base = fechaFiltro ? new Date(`${fechaFiltro}T00:00:00`) : new Date();
    base.setDate(base.getDate() + delta);
    setFechaFiltro(
      `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`,
    );
  };
  const hoyISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-brand-wine">Históricos</h1>
        <p className="mt-1 text-sm text-brand-brown/70">
          Pedidos ya despachados o anulados. Se retiran de Despacho para dar
          prioridad a los que están en proceso.
        </p>
        {puntosDisponibles.length > 0 && (
          <label className="mt-2 inline-flex items-center gap-2">
            <span className="text-xs font-semibold text-brand-brown/60">Punto:</span>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-wine">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />
              </svg>
              <select
                value={filtroPunto}
                onChange={(e) => setFiltroPunto(e.target.value)}
                title="Filtrar por punto de venta"
                className="cursor-pointer appearance-none rounded-full border border-brand-wine/20 bg-brand-wine/5 py-1.5 pl-8 pr-8 text-xs font-semibold text-brand-wine outline-none transition hover:bg-brand-wine/10 focus:border-brand-wine/40"
              >
                <option value="">Todos los PDV</option>
                {puntosDisponibles.map((pv) => (
                  <option key={pv.id} value={pv.id}>{pv.nombre}</option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-brand-wine/70">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </label>
        )}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por consecutivo, comanda, nombre o NIT/cédula"
            className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-9 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              title="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-brand-brown/40 transition hover:bg-brand-cream-soft hover:text-brand-wine"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-brand-brown/15 bg-white p-1">
          {([
            ["todos", `Todos (${totalDespachados + totalAnulados})`],
            ["despachado", `Despachados (${totalDespachados})`],
            ["anulado", `Anulados (${totalAnulados})`],
          ] as const).map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => setTipo(valor)}
              title={`Mostrar ${etiqueta}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tipo === valor
                  ? "bg-brand-wine text-white"
                  : "text-brand-brown hover:bg-brand-cream-soft"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => moverDia(-1)} title="Día anterior" className="flex h-10 w-9 items-center justify-center rounded-xl border border-brand-brown/15 bg-white text-brand-brown transition hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <input
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber"
          />
          <button onClick={() => moverDia(1)} title="Día siguiente" className="flex h-10 w-9 items-center justify-center rounded-xl border border-brand-brown/15 bg-white text-brand-brown transition hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <button onClick={() => setFechaFiltro(hoyISO())} title="Ir a la fecha de hoy" className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft">
          Hoy
        </button>
        {(fechaFiltro || busqueda || tipo !== "todos" || filtroPunto) && (
          <button
            onClick={() => { setFechaFiltro(""); setBusqueda(""); setTipo("todos"); setFiltroPunto(""); }}
            title="Limpiar todos los filtros"
            className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm font-semibold text-brand-wine transition hover:bg-brand-cream-soft"
          >
            Limpiar
          </button>
        )}
        <span className="ml-auto text-xs font-medium text-brand-brown/60">
          {historicos.length} {historicos.length === 1 ? "pedido" : "pedidos"}
        </span>
      </div>

      {/* Tabla */}
      {cargando || !filtroListo ? (
        <p className="text-sm text-brand-brown/60">Cargando…</p>
      ) : buscando && historicos.length === 0 ? (
        <p className="text-sm text-brand-brown/60">Buscando en el historial…</p>
      ) : historicos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-brown/20 bg-white px-6 py-16 text-center">
          <p className="font-medium text-brand-black">Sin resultados</p>
          <p className="mt-1 max-w-sm text-sm text-brand-brown/60">
            No hay pedidos despachados o anulados que coincidan con el filtro.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
          <div className="max-h-[calc(100vh-300px)] overflow-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 z-10 bg-brand-cream-soft text-left text-xs uppercase tracking-wide text-brand-brown/50 shadow-sm">
                <tr>
                  <th className="px-4 py-3">Comanda / Factura</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Punto</th>
                  <th className="px-4 py-3">Valor Pedido / Valor Facturado</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {historicos.map((p) => {
                  const anulado = p.anulado || norm(p.estado) === "anulado";
                  const m = metaTotal[p.id];
                  return (
                    <tr key={p.id} className="border-t border-brand-brown/5 hover:bg-brand-cream-soft/30">
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-brand-wine">{p.comanda}</div>
                        {m?.facturaNumero?.trim() && (
                          <div className="text-[11px] font-semibold text-green-600">Fact. {m.facturaNumero}</div>
                        )}
                        {p.clonadoDe && (
                          <div className="mt-0.5 text-[11px] font-medium text-brand-amber">
                            Clonado de #{p.clonadoDe}
                          </div>
                        )}
                        {clonesPorComanda.get(p.comanda) && (
                          <div className="mt-0.5 text-[11px] font-medium text-brand-wine">
                            Ya clonado en #{clonesPorComanda.get(p.comanda)!.join(", #")}
                          </div>
                        )}
                        <ReplicasEstado meta={m} />
                      </td>
                      <td className="px-4 py-3">{p.cliente.nombre || p.cliente.nit_cedula}</td>
                      <td className="px-4 py-3 text-brand-brown/70">{p.punto.nombre}</td>
                      <td className="px-4 py-3 align-top font-medium">
                        <div>{formatoCOP(p.total)}</div>
                        {typeof m?.facturaValor === "number" && m.facturaValor > 0 && (
                          <div className="text-[11px] font-semibold text-green-600">{formatoCOP(m.facturaValor)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colorEstado(p.estado)}`}>
                          {p.estado || (anulado ? "Anulado" : "Despachado")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-brand-brown/60">{new Date(p.fecha).toLocaleString("es-CO")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => setDetalle(p)} aria-label="Ver detalle" title="Ver el detalle del pedido" className="rounded-lg border border-brand-brown/15 p-1.5 text-brand-brown transition hover:bg-brand-cream-soft">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </svg>
                          </button>
                          {permiteImprimir && (
                            <>
                              <button onClick={() => imprimirComanda(p)} aria-label="Reimprimir comanda" title="Reimprimir la comanda" className="rounded-lg border border-brand-brown/15 p-1.5 text-brand-brown transition hover:bg-brand-cream-soft">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detalle && <DetallePedido pedido={detalle} meta={metaTotal[detalle.id]} clones={clonesPorComanda.get(detalle.comanda)} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}
