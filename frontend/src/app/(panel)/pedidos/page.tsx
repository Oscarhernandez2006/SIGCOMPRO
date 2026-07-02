"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listarClientes, type Cliente } from "@/lib/clientes";
import { misPuntosVenta, type PuntoVenta } from "@/lib/puntos-venta";
import { listarProductos, listarListasPrecio, type ProductoPrecio } from "@/lib/productos";
import { getUsuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ModalSinPermiso, useSinPermiso } from "@/components/SinPermisoModal";
import { cargarEstadoPedidos, guardarPedidoApi, descargarExcelDespacho } from "@/lib/pedidos";
import CrearClienteModal from "@/components/CrearClienteModal";
import QRCode from "qrcode";

const PASOS = ["Cliente", "Productos", "Entrega y pago", "Confirmar"] as const;

export default function PedidosPage() {
  const [wizardAbierto, setWizardAbierto] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [detalle, setDetalle] = useState<Pedido | null>(null);
  const [editando, setEditando] = useState<Pedido | null>(null);
  const [clonando, setClonando] = useState<Pedido | null>(null);

  // Usuario actual y permisos granulares.
  const [usuario, setUsuario] = useState<ReturnType<typeof getUsuario>>(null);
  useEffect(() => setUsuario(getUsuario()), []);
  const sinPermiso = useSinPermiso();
  const permite = useMemo(
    () => ({
      crear: puedeAccion(usuario, "pedidos.crear"),
      editar: puedeAccion(usuario, "pedidos.editar"),
      anular: puedeAccion(usuario, "pedidos.anular"),
      imprimir: puedeAccion(usuario, "pedidos.imprimir"),
      clonar: puedeAccion(usuario, "pedidos.clonar"),
    }),
    [usuario],
  );

  // Cargar pedidos desde la base de datos.
  useEffect(() => {
    cargarEstadoPedidos()
      .then((e) => setPedidos(e.pedidos))
      .catch(() => { /* ignore */ });
  }, []);

  const guardarPedido = (p: Pedido) => {
    setPedidos((prev) => {
      const existe = prev.some((x) => x.id === p.id);
      return existe ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev];
    });
    // Persistimos en la base de datos.
    guardarPedidoApi(p).catch(() => { /* ignore */ });
  };

  const abrirNuevo = () => { setEditando(null); setClonando(null); setWizardAbierto(true); };
  const abrirEdicion = (p: Pedido) => { setEditando(p); setClonando(null); setWizardAbierto(true); };
  const abrirClon = (p: Pedido) => { setEditando(null); setClonando(p); setWizardAbierto(true); };

  // Anula un pedido (marca anulado + estado) y lo persiste.
  const anularPedido = (p: Pedido) => {
    if (!confirm(`¿Anular el pedido ${p.comanda}? Esta acción no se puede deshacer.`)) return;
    guardarPedido({ ...p, anulado: true, estado: "Anulado" });
  };

  // Reimprime/descarga el Excel de despacho del pedido.
  const reimprimirExcel = (p: Pedido) => {
    descargarExcelDespacho(p.id).catch(() => alert("No se pudo generar el Excel de despacho."));
  };

  return (
    <div>
      {/* Encabezado */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">
            Pedidos
          </h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Gestiona los pedidos de Carnes Santacruz.
          </p>
        </div>
        <button
          onClick={permite.crear ? abrirNuevo : sinPermiso.mostrar}
          className={`inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90 ${
            permite.crear ? "" : "opacity-50"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
          Nuevo pedido
        </button>
      </div>

      {/* Lista de pedidos */}
      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-brown/20 bg-white px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7 text-brand-amber">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.137a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
          </div>
          <p className="mt-4 font-medium text-brand-black">Aún no hay pedidos</p>
          <p className="mt-1 max-w-sm text-sm text-brand-brown/60">
            Empieza creando tu primer pedido con el botón “Nuevo pedido”.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-brown/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-brand-cream-soft/60 text-left text-xs uppercase tracking-wide text-brand-brown/50">
              <tr>
                <th className="px-4 py-3">Comanda</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Punto</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className={`border-t border-brand-brown/5 hover:bg-brand-cream-soft/30 ${p.anulado ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-semibold text-brand-wine">{p.comanda}</td>
                  <td className="px-4 py-3">{p.cliente.nombre || p.cliente.nit_cedula}</td>
                  <td className="px-4 py-3 text-brand-brown/70">{p.punto.nombre}</td>
                  <td className="px-4 py-3 font-medium">{formatoCOP(p.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.anulado ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
                      {p.anulado ? "Anulado" : p.estado || "En proceso"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-brown/60">{new Date(p.fecha).toLocaleString("es-CO")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => setDetalle(p)} className="rounded-lg border border-brand-brown/15 px-3 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-brand-cream-soft">Ver</button>
                      {!p.anulado && (
                        <>
                          <button onClick={permite.imprimir ? () => imprimirComanda(p) : sinPermiso.mostrar} className={`rounded-lg border border-brand-brown/15 px-3 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-brand-cream-soft ${permite.imprimir ? "" : "opacity-50"}`}>Reimprimir</button>
                          <button onClick={permite.imprimir ? () => reimprimirExcel(p) : sinPermiso.mostrar} className={`rounded-lg border border-brand-brown/15 px-3 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-brand-cream-soft ${permite.imprimir ? "" : "opacity-50"}`}>Excel</button>
                          <button onClick={permite.editar ? () => abrirEdicion(p) : sinPermiso.mostrar} className={`rounded-lg border border-brand-brown/15 px-3 py-1.5 text-xs font-semibold text-brand-wine transition hover:bg-brand-cream-soft ${permite.editar ? "" : "opacity-50"}`}>Editar</button>
                          <button onClick={permite.anular ? () => anularPedido(p) : sinPermiso.mostrar} className={`rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 ${permite.anular ? "" : "opacity-50"}`}>Anular</button>
                        </>
                      )}
                      {p.anulado && (
                        <button onClick={permite.clonar ? () => abrirClon(p) : sinPermiso.mostrar} className={`rounded-lg border border-brand-amber/40 px-3 py-1.5 text-xs font-semibold text-brand-amber transition hover:bg-brand-amber/10 ${permite.clonar ? "" : "opacity-50"}`}>Clonar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {wizardAbierto && (
        <WizardPedido
          onCerrar={() => { setWizardAbierto(false); setEditando(null); setClonando(null); }}
          onCrear={guardarPedido}
          pedidos={pedidos}
          inicial={editando}
          clon={clonando}
        />
      )}
      {detalle && <DetallePedido pedido={detalle} onCerrar={() => setDetalle(null)} />}
      <ModalSinPermiso abierto={sinPermiso.abierto} onCerrar={sinPermiso.cerrar} />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Wizard de creación de pedido                                     */
/* ---------------------------------------------------------------- */

function WizardPedido({ onCerrar, onCrear, pedidos, inicial, clon }: { onCerrar: () => void; onCrear: (p: Pedido) => void; pedidos: Pedido[]; inicial?: Pedido | null; clon?: Pedido | null }) {
  // Fuente para precargar el formulario: edición o clonación.
  const base = inicial ?? clon ?? null;
  const [paso, setPaso] = useState(0);
  const [cliente, setCliente] = useState<Cliente | null>(base?.cliente ?? null);
  const [carrito, setCarrito] = useState<ItemCarrito[]>(() => {
    const src = base?.carrito ?? [];
    // Al clonar, copiamos los ítems para no mutar el pedido original.
    return clon ? structuredClone(src) : src;
  });
  const [entrega, setEntrega] = useState<"domicilio" | "recoge" | null>(base?.entrega ?? null);
  const [pago, setPago] = useState<string | null>(base?.pago ?? null);
  const [valorDomicilio, setValorDomicilio] = useState<number>(base?.valorDomicilio ?? 0);
  // Fecha de entrega: programado=false => hoy; programado=true => fecha elegida.
  const [programado, setProgramado] = useState<boolean>(base?.entregaProgramada ?? false);
  const [fechaProgramada, setFechaProgramada] = useState<string>(base?.fechaProgramada ?? "");
  const [pedidoCreado, setPedidoCreado] = useState<Pedido | null>(null);
  const [editandoItem, setEditandoItem] = useState<ItemCarrito | null>(null);

  // Punto de venta del pedido
  const [puntos, setPuntos] = useState<PuntoVenta[]>([]);
  const [punto, setPunto] = useState<PuntoVenta | null>(base?.punto ?? null);
  const [cargandoPuntos, setCargandoPuntos] = useState(true);
  const [errorPuntos, setErrorPuntos] = useState<string | null>(null);

  useEffect(() => {
    misPuntosVenta()
      .then((ps) => {
        setPuntos(ps);
        if (ps.length === 1) setPunto(ps[0]); // un solo punto: directo
      })
      .catch((e) =>
        setErrorPuntos(
          e instanceof Error ? e.message : "No se pudieron cargar los puntos de venta",
        ),
      )
      .finally(() => setCargandoPuntos(false));
  }, []);

  // Mientras no haya punto elegido (y haya varios), se muestra el selector.
  const eligiendoPunto = !punto;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-3 border-b border-brand-brown/10 px-6 py-4">
          <h2 className="font-serif text-xl font-bold text-brand-wine">
            {inicial ? `Editar pedido ${inicial.comanda}` : clon ? `Clonar pedido ${clon.comanda}` : "Nuevo pedido"}
          </h2>
          <div className="flex items-center gap-3">
            {punto && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-wine/10 px-3 py-1 text-xs font-semibold text-brand-wine">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />
                </svg>
                {punto.nombre}
              </span>
            )}
            <button
              onClick={onCerrar}
              className="rounded-lg p-1.5 text-brand-brown/50 transition hover:bg-brand-cream-soft hover:text-brand-brown"
              aria-label="Cerrar"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {pedidoCreado ? (
          <>
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 text-green-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="mt-4 font-serif text-2xl font-bold text-brand-wine">{inicial ? "Pedido actualizado" : clon ? "Pedido clonado" : "Pedido creado"}</h3>
              <p className="mt-1 text-sm text-brand-brown/60">
                Comanda <b>{pedidoCreado.comanda}</b> · Total {formatoCOP(pedidoCreado.total)}
              </p>
              <p className="mt-4 max-w-sm text-sm text-brand-brown/60">
                El pedido quedó guardado. Imprime la comanda ahora o vuelve a imprimirla cuando quieras desde la lista.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => imprimirComanda(pedidoCreado)}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-wine/90"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171L17.66 18M18 10.5h.008v.008H18V10.5Z" />
                  </svg>
                  Imprimir comanda
                </button>
                <button
                  onClick={() => descargarExcelDespacho(pedidoCreado.id)}
                  className="inline-flex items-center gap-2 rounded-xl border border-brand-brown/15 px-6 py-3 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Descargar Excel
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end border-t border-brand-brown/10 px-6 py-4">
              <button
                onClick={onCerrar}
                className="rounded-xl border border-brand-brown/15 px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft"
              >
                Cerrar
              </button>
            </div>
          </>
        ) : eligiendoPunto ? (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <PasoPunto
                puntos={puntos}
                cargando={cargandoPuntos}
                error={errorPuntos}
                onSeleccionar={setPunto}
              />
            </div>
            <div className="flex items-center justify-end border-t border-brand-brown/10 px-6 py-4">
              <button
                onClick={onCerrar}
                className="rounded-xl border border-brand-brown/15 px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <Stepper paso={paso} />

            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {paso === 0 && (
                  <PasoCliente
                    seleccionado={cliente}
                    onSeleccionar={(c) => {
                      setCliente(c);
                      setPaso(1);
                    }}
                  />
                )}
                {paso === 1 && (
                  <PasoProductos
                    punto={punto}
                    carrito={carrito}
                    onCambiar={setCarrito}
                    cliente={cliente}
                    pedidos={pedidos}
                  />
                )}
                {paso === 2 && (
                  <div className="space-y-6">
                    <PasoEntrega cliente={cliente} valor={entrega} onCambiar={setEntrega} domicilio={valorDomicilio} onDomicilio={setValorDomicilio} />
                    <PasoPago valor={pago} onCambiar={setPago} />
                    <PasoFechaEntrega
                      programado={programado}
                      onCambiar={setProgramado}
                      fecha={fechaProgramada}
                      onFecha={setFechaProgramada}
                    />
                  </div>
                )}
                {paso === 3 && (
                  <PasoConfirmar
                    punto={punto}
                    cliente={cliente}
                    carrito={carrito}
                    entrega={entrega}
                    pago={pago}
                    valorDomicilio={valorDomicilio}
                  />
                )}
              </div>
              <ResumenPedido
                punto={punto}
                cliente={cliente}
                carrito={carrito}
                onQuitar={(id) => setCarrito(carrito.filter((i) => i.id !== id))}
                onEditar={(item) => setEditandoItem(item)}
              />
            </div>

            <div className="flex items-center justify-between border-t border-brand-brown/10 px-6 py-4">
              <button
                onClick={() => (paso === 0 ? onCerrar() : setPaso((p) => p - 1))}
                className="rounded-xl border border-brand-brown/15 px-4 py-2.5 text-sm font-medium text-brand-brown transition hover:bg-brand-cream-soft"
              >
                {paso === 0 ? "Cancelar" : "Atrás"}
              </button>
              {paso < PASOS.length - 1 ? (
                <button
                  onClick={() => setPaso((p) => Math.min(PASOS.length - 1, p + 1))}
                  disabled={
                    (paso === 0 && !cliente) ||
                    (paso === 1 && carrito.length === 0) ||
                    (paso === 2 && (!entrega || !pago))
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continuar
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={async () => {
                    if (!punto || !cliente) return;
                    if (programado && !fechaProgramada) {
                      alert("Selecciona la fecha de entrega programada.");
                      return;
                    }
                    const ahora = new Date();
                    const dom = entrega === "domicilio" ? valorDomicilio : 0;
                    const total = carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0) + dom;
                    // En edición conservamos comanda/consecutivo/fecha; en alta generamos nuevo
                    const consecutivo = inicial
                      ? inicial.consecutivo
                      : pedidos
                          .filter((p) => p.punto.id === punto.id)
                          .reduce((m, p) => Math.max(m, p.consecutivo || 0), 0) + 1;
                    // Formato: {número del punto}CS{consecutivo de 8 dígitos}. Ej: 1CS00000001
                    // Solo tomamos los dígitos del código del punto (ej. "2" de "2" o "2CSXXXXX").
                    const numeroPunto = ((punto.codigo ?? "").match(/\d+/)?.[0] ?? "").trim();
                    const prefijo = `${numeroPunto}CS`;
                    const pedido: Pedido = {
                      id: inicial?.id ?? crypto.randomUUID(),
                      consecutivo,
                      comanda: inicial?.comanda ?? `${prefijo}${String(consecutivo).padStart(8, "0")}`,
                      fecha: inicial?.fecha ?? ahora.toISOString(),
                      punto,
                      cliente,
                      carrito,
                      entrega,
                      pago,
                      total,
                      valorDomicilio: dom,
                      entregaProgramada: programado,
                      fechaProgramada: programado ? fechaProgramada : undefined,
                      vendedorNombre: inicial?.vendedorNombre ?? getUsuario()?.nombre ?? "",
                      vendedorCedula: inicial?.vendedorCedula ?? getUsuario()?.cedula ?? "",
                      estado: inicial?.estado ?? "En proceso",
                    };
                    onCrear(pedido);
                    setPedidoCreado(pedido);
                    // Persistimos y generamos el Excel de despacho automáticamente.
                    try {
                      await guardarPedidoApi(pedido);
                      await descargarExcelDespacho(pedido.id);
                    } catch {
                      /* el pedido ya quedó guardado; el Excel se puede bajar luego */
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-wine/90"
                >
                  {inicial ? "Guardar cambios" : clon ? "Clonar pedido" : "Confirmar pedido"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {editandoItem && (
        <ConfigProducto
          producto={editandoItem.producto}
          inicial={editandoItem}
          onCerrar={() => setEditandoItem(null)}
          onAgregar={(item) => {
            setCarrito((prev) => prev.map((i) => (i.id === item.id ? item : i)));
            setEditandoItem(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Paso previo: seleccionar punto de venta (solo si hay varios)     */
/* ---------------------------------------------------------------- */

function PasoPunto({
  puntos,
  cargando,
  error,
  onSeleccionar,
}: {
  puntos: PuntoVenta[];
  cargando: boolean;
  error: string | null;
  onSeleccionar: (p: PuntoVenta) => void;
}) {
  const [descripciones, setDescripciones] = useState<Record<string, string>>({});

  useEffect(() => {
    listarListasPrecio()
      .then((ls) => {
        const m: Record<string, string> = {};
        for (const l of ls) if (l.desc_lista) m[l.lista_precio] = l.desc_lista;
        setDescripciones(m);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-brand-black">
        ¿En qué punto de venta tomas el pedido?
      </p>
      <p className="mb-4 text-xs text-brand-brown/60">
        Determina la lista de precios que se aplicará al pedido.
      </p>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {cargando ? (
        <p className="py-10 text-center text-sm text-brand-brown/50">
          Cargando puntos de venta…
        </p>
      ) : puntos.length === 0 ? (
        <p className="py-10 text-center text-sm text-brand-brown/50">
          No tienes puntos de venta asignados.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {puntos.map((p) => (
            <button
              key={p.id}
              onClick={() => onSeleccionar(p)}
              className="flex items-center gap-3 rounded-xl border border-brand-brown/10 bg-white px-4 py-3 text-left transition hover:border-brand-amber/50 hover:bg-brand-cream-soft/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-wine/10 text-brand-wine">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-brand-black">
                  {p.nombre}
                </span>
                <span className="block truncate text-xs text-brand-brown/60">
                  {p.lista_precio
                    ? descripciones[p.lista_precio] ?? `Lista ${p.lista_precio}`
                    : "Sin lista asignada"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stepper({ paso }: { paso: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-brand-brown/10 bg-brand-cream-soft/40 px-6 py-3">
      {PASOS.map((label, i) => {
        const activo = i === paso;
        const hecho = i < paso;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                hecho
                  ? "bg-brand-amber text-white"
                  : activo
                    ? "bg-brand-wine text-white"
                    : "bg-brand-brown/10 text-brand-brown/50"
              }`}
            >
              {hecho ? "✓" : i + 1}
            </span>
            <span
              className={`text-xs font-medium ${
                activo ? "text-brand-wine" : "text-brand-brown/50"
              }`}
            >
              {label}
            </span>
            {i < PASOS.length - 1 && (
              <span className="mx-1 hidden h-px flex-1 bg-brand-brown/15 sm:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Paso 1: seleccionar cliente                                      */
/* ---------------------------------------------------------------- */

function PasoCliente({
  seleccionado,
  onSeleccionar,
}: {
  seleccionado: Cliente | null;
  onSeleccionar: (c: Cliente) => void;
}) {
  const [input, setInput] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [items, setItems] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(input), 350);
    return () => clearTimeout(t);
  }, [input]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await listarClientes(busqueda, 30, 0);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los clientes");
    } finally {
      setCargando(false);
    }
  }, [busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div>
      <p className="mb-3 text-sm font-medium text-brand-black">
        ¿Para quién es el pedido?
      </p>

      {/* Buscador */}
      <div className="relative mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
        </svg>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Buscar por nombre, NIT/cédula, teléfono o barrio"
          className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-amber"
        />
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Resultados */}
      <div className="space-y-2">
        {cargando ? (
          <p className="py-10 text-center text-sm text-brand-brown/50">
            Cargando clientes…
          </p>
        ) : items.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-brand-brown/50">No se encontraron clientes.</p>
            <button
              onClick={() => setCreando(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-amber px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
              Crear cliente{input.trim() ? ` “${input.trim()}”` : ""}
            </button>
          </div>
        ) : (
          items.map((c) => {
            const activo = seleccionado?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSeleccionar(c)}
                className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  activo
                    ? "border-brand-amber bg-brand-amber/5 ring-1 ring-brand-amber"
                    : "border-brand-brown/10 bg-white hover:border-brand-amber/40 hover:bg-brand-cream-soft/40"
                }`}
              >
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-cream-soft text-sm font-bold text-brand-wine">
                  {(c.nombre || c.nit_cedula).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold text-brand-black">
                      {c.nombre || "Sin nombre"}
                    </span>
                    {!c.activo && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                        Inactivo
                      </span>
                    )}
                  </span>

                  <span className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-brand-brown/70 sm:grid-cols-2">
                    <DatoCliente icono="id" valor={c.nit_cedula} />
                    {c.telefono && <DatoCliente icono="tel" valor={c.telefono} />}
                    {c.direccion && <DatoCliente icono="dir" valor={c.direccion} ancho />}
                    {c.referencia && <DatoCliente icono="ref" valor={c.referencia} ancho />}
                    {(c.barrio || c.ciudad) && (
                      <DatoCliente
                        icono="loc"
                        valor={[c.barrio, c.ciudad].filter(Boolean).join(", ")}
                        ancho
                      />
                    )}
                  </span>
                </span>
                {activo && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-0.5 h-5 w-5 shrink-0 text-brand-amber">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>

      {creando && (
        <CrearClienteModal
          nitInicial={input.trim()}
          onCerrar={() => setCreando(false)}
          onCreado={(c) => {
            setCreando(false);
            onSeleccionar(c);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Paso 2: ver productos según la lista de precios del punto         */
/* ---------------------------------------------------------------- */

interface ItemCarrito {
  id: string;
  producto: ProductoPrecio;
  cantidad: number;
  alVacio: boolean;
  porcionado: boolean;
  corte: string;
  gramos: number;
  unidades: number;
  notas: string;
}

function PasoProductos({
  punto,
  carrito,
  onCambiar,
  cliente,
  pedidos,
}: {
  punto: PuntoVenta;
  carrito: ItemCarrito[];
  onCambiar: (items: ItemCarrito[]) => void;
  cliente: Cliente | null;
  pedidos: Pedido[];
}) {
  const [input, setInput] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [items, setItems] = useState<ProductoPrecio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ProductoPrecio | null>(null);

  // Historial de productos pedidos antes por este cliente (más recientes primero)
  const historial = useMemo(() => {
    if (!cliente) return [] as ProductoPrecio[];
    const vistos = new Set<string>();
    const out: ProductoPrecio[] = [];
    for (const p of pedidos) {
      if (p.anulado) continue;
      if (p.cliente?.id !== cliente.id) continue;
      for (const it of p.carrito) {
        const key = it.producto.id;
        if (vistos.has(key)) continue;
        vistos.add(key);
        out.push(it.producto);
      }
    }
    return out;
  }, [cliente, pedidos]);

  // Precios actuales para los productos del historial (si están en el catálogo cargado)
  const preciosActuales = useMemo(() => {
    const m = new Map<string, ProductoPrecio>();
    for (const p of items) m.set(p.id, p);
    return m;
  }, [items]);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (!punto.lista_precio) {
      setError("Este punto de venta no tiene lista de precios asignada.");
      setCargando(false);
      return;
    }
    setCargando(true);
    listarProductos(punto.lista_precio, busqueda)
      .then(setItems)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudieron cargar los productos"),
      )
      .finally(() => setCargando(false));
  }, [punto.lista_precio, busqueda]);

  function quitar(id: string) {
    onCambiar(carrito.filter((i) => i.id !== id));
  }

  const enCarrito = (id: string) => carrito.some((i) => i.producto.id === id);

  return (
    <div className="flex gap-3">
      {/* Historial del cliente (columna lateral) */}
      {historial.length > 0 && (
        <div className="hidden w-52 shrink-0 flex-col rounded-xl border border-brand-wine/15 bg-brand-wine/5 p-2.5 sm:flex">
          <div className="mb-2 flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0 text-brand-wine">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <p className="text-xs font-semibold leading-tight text-brand-wine">
              Pedidos anteriores
            </p>
            <span className="ml-auto rounded-full bg-brand-wine/10 px-2 py-0.5 text-[10px] font-semibold text-brand-wine">
              {historial.length}
            </span>
          </div>
          <div className="flex max-h-[56vh] flex-col gap-2 overflow-y-auto pr-1">
            {historial.map((h) => {
              const p = preciosActuales.get(h.id) ?? h;
              return (
                <button
                  key={h.id}
                  onClick={() => setConfig(p)}
                  className={`flex flex-col rounded-lg border p-2 text-left transition ${
                    enCarrito(p.id)
                      ? "border-brand-amber bg-brand-amber/10"
                      : "border-brand-wine/15 bg-white hover:border-brand-amber/60 hover:shadow-sm"
                  }`}
                >
                  <span className="line-clamp-2 text-xs font-medium text-brand-black">
                    {p.producto || "Sin nombre"}
                  </span>
                  <span className="mt-0.5 text-[10px] text-brand-brown/50">
                    {p.referencia} · {p.um || "U"}
                  </span>
                  <span className="mt-1 text-xs font-bold text-brand-wine">
                    {formatoCOP(p.precio)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Catálogo */}
      <div className="min-w-0 flex-1">
        <div className="relative mb-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-brown/40">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
          </svg>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Buscar carne, corte o referencia…"
            className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-amber"
          />
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            {error}
          </div>
        )}

        <div className="grid max-h-[56vh] grid-cols-2 gap-2 overflow-y-auto pr-1 lg:grid-cols-3">
          {cargando ? (
            <p className="col-span-full py-10 text-center text-sm text-brand-brown/50">
              Cargando productos…
            </p>
          ) : items.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-brand-brown/50">
              No se encontraron productos.
            </p>
          ) : (
            items.map((p) => (
              <button
                key={p.id}
                onClick={() => setConfig(p)}
                className={`flex flex-col rounded-xl border p-3 text-left transition ${
                  enCarrito(p.id)
                    ? "border-brand-amber bg-brand-amber/5"
                    : "border-brand-brown/10 bg-white hover:border-brand-amber/50 hover:shadow-sm"
                }`}
              >
                <span className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-brand-black">
                  {p.producto || "Sin nombre"}
                </span>
                <span className="mt-1 text-[11px] text-brand-brown/50">
                  {p.referencia} · {p.um || "U"}
                </span>
                <span className="mt-2 text-sm font-bold text-brand-wine">
                  {formatoCOP(p.precio)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {config && (
        <ConfigProducto
          producto={config}
          onCerrar={() => setConfig(null)}
          onAgregar={(item) => {
            onCambiar([...carrito, item]);
            setConfig(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Panel de resumen siempre visible ---------- */

function ResumenPedido({
  punto,
  cliente,
  carrito,
  onQuitar,
  onEditar,
}: {
  punto: PuntoVenta;
  cliente: Cliente | null;
  carrito: ItemCarrito[];
  onQuitar: (id: string) => void;
  onEditar?: (item: ItemCarrito) => void;
}) {
  const total = carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0);
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-brand-brown/10 bg-brand-cream-soft/30 lg:flex">
      <div className="border-b border-brand-brown/10 px-4 py-3">
        <p className="font-serif text-sm font-bold text-brand-wine">Detalle del pedido</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {/* Punto */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">Punto de venta</p>
          <p className="font-medium text-brand-black">{punto.nombre}</p>
        </div>
        {/* Cliente */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">Cliente</p>
          {cliente ? (
            <div className="rounded-xl border border-brand-brown/10 bg-white px-3 py-2">
              <p className="font-medium text-brand-black">{cliente.nombre || "Sin nombre"}</p>
              <p className="text-xs text-brand-brown/60">{cliente.nit_cedula}</p>
              {(cliente.direccion || cliente.barrio) && (
                <p className="mt-0.5 text-xs text-brand-brown/60">
                  {[cliente.direccion, cliente.barrio].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs italic text-brand-brown/40">Sin seleccionar</p>
          )}
        </div>
        {/* Productos */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">
            Productos ({carrito.length})
          </p>
          {carrito.length === 0 ? (
            <p className="text-xs italic text-brand-brown/40">Aún sin productos</p>
          ) : (
            <div className="space-y-1.5">
              {carrito.map((i) => (
                <div
                  key={i.id}
                  onClick={() => onEditar?.(i)}
                  role={onEditar ? "button" : undefined}
                  title={onEditar ? "Editar producto" : undefined}
                  className={`rounded-lg border border-brand-brown/10 bg-white px-2.5 py-2 ${
                    onEditar ? "cursor-pointer transition hover:border-brand-amber/50 hover:bg-brand-cream-soft/40" : ""
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-brand-black">
                      {i.producto.producto || i.producto.referencia}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-brand-wine">
                      {formatoCOP(i.producto.precio * i.cantidad)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuitar(i.id);
                      }}
                      className="shrink-0 text-brand-brown/30 hover:text-red-600"
                      aria-label="Quitar"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-brand-brown/60">
                    <span>{cantidadLabel(i.cantidad, i.producto.um)} | {formatoCOP(i.producto.precio)}</span>
                    {i.alVacio && <Tag>Vacío</Tag>}
                    {i.porcionado && <Tag>Porciones {i.unidades} | Gramos {i.gramos} grs.</Tag>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-brand-brown/10 px-4 py-3">
        <span className="text-sm text-brand-brown/70">Total</span>
        <span className="text-lg font-bold text-brand-wine">{formatoCOP(total)}</span>
      </div>
    </aside>
  );
}

/* ---------- Sub-panel: configurar producto ---------- */

function ConfigProducto({
  producto,
  onCerrar,
  onAgregar,
  inicial,
}: {
  producto: ProductoPrecio;
  onCerrar: () => void;
  onAgregar: (item: ItemCarrito) => void;
  inicial?: ItemCarrito;
}) {
  const [cantidad, setCantidad] = useState(inicial ? String(inicial.cantidad) : "1");
  const [alVacio, setAlVacio] = useState(inicial?.alVacio ?? false);
  const [porcionado, setPorcionado] = useState(inicial?.porcionado ?? false);
  const [corte, setCorte] = useState(inicial?.corte ?? "");
  const [gramos, setGramos] = useState(inicial?.gramos ? String(inicial.gramos) : "");
  const [unidades, setUnidades] = useState(inicial?.unidades ? String(inicial.unidades) : "");
  const [notas, setNotas] = useState(inicial?.notas ?? "");

  const esKilo = (producto.um || "").trim().toUpperCase() === "KG";
  const paso = esKilo ? 0.5 : 1;
  const minimo = esKilo ? 0.5 : 1;
  const cant = parseFloat(cantidad.replace(",", ".")) || 0;
  const g = parseFloat(gramos) || 0;
  const u = parseFloat(unidades) || 0;
  const pesoG = cant * 1000;
  const cortesG = g * u;
  const exceso = cortesG - pesoG;
  const fueraRango = porcionado && cortesG > 0 && exceso > 100;
  const subtotal = producto.precio * cant;
  const pct = pesoG > 0 ? Math.min(100, (cortesG / pesoG) * 100) : 0;

  function confirmar() {
    if (cant <= 0) return;
    if (!esKilo && !Number.isInteger(cant)) return;
    if (porcionado && (g <= 0 || u <= 0 || fueraRango)) return;
    onAgregar({
      id: inicial?.id ?? crypto.randomUUID(),
      producto,
      cantidad: cant,
      alVacio,
      porcionado,
      corte: corte.trim(),
      gramos: g,
      unidades: u,
      notas: notas.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/40 p-4">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-brand-brown/10 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate font-serif text-lg font-bold text-brand-wine">
              {producto.producto || "Producto"}
            </h3>
            <p className="text-xs text-brand-brown/50">
              Ref {producto.referencia} · {formatoCOP(producto.precio)} / {producto.um || "U"}
            </p>
          </div>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-brand-brown/50 hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Cantidad */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-brand-brown/70">
              Cantidad / peso ({producto.um || "U"})
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCantidad(String(Math.max(minimo, +(cant - paso).toFixed(2))))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-brown/15 text-lg text-brand-brown hover:bg-brand-cream-soft"
              >−</button>
              <input
                type="text"
                inputMode={esKilo ? "decimal" : "numeric"}
                value={cantidad}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  const re = esKilo ? /^\d*\.?\d*$/ : /^\d*$/;
                  if (re.test(v)) setCantidad(v);
                }}
                className="h-10 w-24 rounded-xl border border-brand-brown/15 text-center text-base font-semibold outline-none focus:border-brand-amber"
              />
              <button
                onClick={() => setCantidad(String(+(cant + paso).toFixed(2)))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-brown/15 text-lg text-brand-brown hover:bg-brand-cream-soft"
              >+</button>
              <span className="ml-auto text-lg font-bold text-brand-wine">{formatoCOP(subtotal)}</span>
            </div>
          </div>

          {/* Empaque al vacío */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-brand-black">Empaque al vacío</span>
            <button
              onClick={() => setAlVacio((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition ${alVacio ? "bg-brand-wine" : "bg-brand-brown/20"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${alVacio ? "left-5" : "left-0.5"}`} />
            </button>
          </div>

          {/* Porcionado */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-brand-black">Porcionado</span>
            <button
              onClick={() => setPorcionado((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition ${porcionado ? "bg-brand-wine" : "bg-brand-brown/20"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${porcionado ? "left-5" : "left-0.5"}`} />
            </button>
          </div>

          {porcionado && (
            <div className="rounded-xl bg-brand-cream-soft/50 p-3">
              <input
                value={corte}
                onChange={(e) => setCorte(e.target.value)}
                placeholder="Tipo de corte (cómo lo necesita)"
                className="mb-2 w-full rounded-lg border border-brand-brown/15 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number" min="0" value={gramos}
                  onChange={(e) => setGramos(e.target.value)}
                  placeholder="Gramos c/u"
                  className="rounded-lg border border-brand-brown/15 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber"
                />
                <input
                  type="number" min="0" value={unidades}
                  onChange={(e) => setUnidades(e.target.value)}
                  placeholder="N° porciones"
                  className="rounded-lg border border-brand-brown/15 bg-white px-3 py-2 text-sm outline-none focus:border-brand-amber"
                />
              </div>
              {/* Barra de ajuste */}
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-brand-brown/10">
                  <div
                    className={`h-full transition-all ${fueraRango ? "bg-red-500" : "bg-brand-amber"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className={`mt-1.5 text-xs ${fueraRango ? "text-red-600" : "text-brand-brown/60"}`}>
                  {(cortesG / 1000).toFixed(2)} kg de {cantidad} kg
                  {fueraRango && " · supera por más de 100 g"}
                </p>
              </div>
            </div>
          )}

          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Notas del producto (opcional)"
            className="w-full resize-none rounded-xl border border-brand-brown/15 px-3 py-2.5 text-sm outline-none focus:border-brand-amber"
          />
        </div>

        <div className="flex gap-2 border-t border-brand-brown/10 px-5 py-4">
          <button onClick={onCerrar} className="flex-1 rounded-xl border border-brand-brown/15 py-2.5 text-sm font-medium text-brand-brown hover:bg-brand-cream-soft">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={cant <= 0 || (porcionado && (g <= 0 || u <= 0 || fueraRango))}
            className="flex-1 rounded-xl bg-brand-amber py-2.5 text-sm font-semibold text-white hover:bg-brand-amber/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {inicial ? "Guardar cambios" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-brand-cream-soft px-2 py-0.5 font-medium text-brand-wine">
      {children}
    </span>
  );
}

function formatoCOP(v: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v);
}

function cantidadLabel(cant: number, um: string | null): string {
  const u = (um || "").trim().toUpperCase();
  const n = Number.isInteger(cant) ? cant : cant.toFixed(2);
  if (u === "KG") return `${n} ${cant === 1 ? "kilo" : "kilos"}`;
  return `${n} ${cant === 1 ? "unidad" : "unidades"}`;
}

/* ---------------------------------------------------------------- */
/* Paso 3: tipo de entrega                                          */
/* ---------------------------------------------------------------- */

function PasoEntrega({
  cliente,
  valor,
  onCambiar,
  domicilio,
  onDomicilio,
}: {
  cliente: Cliente | null;
  valor: "domicilio" | "recoge" | null;
  onCambiar: (v: "domicilio" | "recoge") => void;
  domicilio: number;
  onDomicilio: (n: number) => void;
}) {
  const ops = [
    {
      id: "domicilio" as const,
      titulo: "Domicilio",
      desc: cliente?.direccion ? `Se lleva a ${cliente.direccion}` : "Envío a la dirección del cliente",
      icon: "M2.25 12 11.2 3.05c.4-.4 1.1-.4 1.5 0L21.75 12M4.5 9.75V21h15V9.75",
    },
    {
      id: "recoge" as const,
      titulo: "Recoge en punto de venta",
      desc: "El cliente pasa por el pedido",
      icon: "M13.5 21v-7.5h-3V21M3 9.75 12 3l9 6.75M5.25 8.25V21h13.5V8.25",
    },
  ];
  return (
    <div>
      <p className="mb-4 text-sm font-medium text-brand-black">¿Cómo se entrega el pedido?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ops.map((o) => (
          <button
            key={o.id}
            onClick={() => onCambiar(o.id)}
            className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
              valor === o.id
                ? "border-brand-amber bg-brand-amber/5 ring-1 ring-brand-amber"
                : "border-brand-brown/10 bg-white hover:border-brand-amber/50"
            }`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-wine/10 text-brand-wine">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
                <path strokeLinecap="round" strokeLinejoin="round" d={o.icon} />
              </svg>
            </span>
            <span>
              <span className="block font-semibold text-brand-black">{o.titulo}</span>
              <span className="block text-xs text-brand-brown/60">{o.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {valor === "domicilio" && (
        <div className="mt-4 rounded-2xl border border-brand-amber/40 bg-brand-amber/5 p-4">
          <label className="mb-1.5 block text-sm font-semibold text-brand-wine">Valor del domicilio</label>
          <p className="mb-2 text-xs text-brand-brown/60">Costo adicional del envío. Se suma al total del pedido.</p>
          <div className="flex items-center gap-2">
            <span className="text-brand-brown/60">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={domicilio ? String(domicilio) : ""}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                onDomicilio(v ? parseInt(v, 10) : 0);
              }}
              placeholder="0"
              className="h-10 w-40 rounded-xl border border-brand-brown/15 px-3 text-base font-semibold outline-none focus:border-brand-amber"
            />
            <span className="ml-2 text-sm font-bold text-brand-wine">{formatoCOP(domicilio)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
/* ---------------------------------------------------------------- */

export const METODOS = ["Efectivo", "QR", "Tarjeta", "Transferencia", "Crédito", "Mixto"];

function PasoPago({
  valor,
  onCambiar,
}: {
  valor: string | null;
  onCambiar: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-4 text-sm font-medium text-brand-black">Método de pago</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {METODOS.map((m) => (
          <button
            key={m}
            onClick={() => onCambiar(m)}
            className={`rounded-2xl border p-4 text-left font-semibold transition ${
              valor === m
                ? "border-brand-amber bg-brand-amber/5 text-brand-wine ring-1 ring-brand-amber"
                : "border-brand-brown/10 bg-white text-brand-black hover:border-brand-amber/50"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Fecha de entrega: hoy o programado para mañana                  */
/* ---------------------------------------------------------------- */

function PasoFechaEntrega({
  programado,
  onCambiar,
  fecha,
  onFecha,
}: {
  programado: boolean;
  onCambiar: (v: boolean) => void;
  fecha: string;
  onFecha: (v: string) => void;
}) {
  // Fecha mínima seleccionable: mañana (no se puede programar para hoy ni atrás).
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const minFecha = manana.toLocaleDateString("en-CA");

  const ops = [
    { id: false, titulo: "Hoy", desc: "Entrega el mismo día (ventana de 2 horas)" },
    { id: true, titulo: "Programar fecha", desc: "Elige el día de entrega (ventana 8:00 a 9:00 a. m.)" },
  ];
  return (
    <div>
      <p className="mb-4 text-sm font-medium text-brand-black">Fecha de entrega</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ops.map((o) => (
          <button
            key={String(o.id)}
            onClick={() => onCambiar(o.id)}
            className={`rounded-2xl border p-4 text-left transition ${
              programado === o.id
                ? "border-brand-amber bg-brand-amber/5 ring-1 ring-brand-amber"
                : "border-brand-brown/10 bg-white hover:border-brand-amber/50"
            }`}
          >
            <span className="block font-semibold text-brand-black">{o.titulo}</span>
            <span className="block text-xs text-brand-brown/60">{o.desc}</span>
          </button>
        ))}
      </div>
      {programado && (
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-brand-brown/70">
            Día de entrega
          </label>
          <input
            type="date"
            value={fecha}
            min={minFecha}
            onChange={(e) => onFecha(e.target.value)}
            className="w-full rounded-xl border border-brand-brown/15 bg-white px-4 py-2.5 text-sm text-brand-black outline-none transition focus:border-brand-amber focus:ring-1 focus:ring-brand-amber sm:w-auto"
          />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Paso 5: confirmar (resumen total)                               */
/* ---------------------------------------------------------------- */

function PasoConfirmar({
  punto,
  cliente,
  carrito,
  entrega,
  pago,
  valorDomicilio,
}: {
  punto: PuntoVenta;
  cliente: Cliente | null;
  carrito: ItemCarrito[];
  entrega: "domicilio" | "recoge" | null;
  pago: string | null;
  valorDomicilio: number;
}) {
  const dom = entrega === "domicilio" ? valorDomicilio : 0;
  const total = carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0) + dom;
  return (
    <div className="space-y-4 text-sm">
      <p className="font-medium text-brand-black">Revisa el pedido antes de confirmar</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Bloque titulo="Punto de venta">{punto.nombre}</Bloque>
        <Bloque titulo="Entrega">
          {entrega === "domicilio" ? "Domicilio" : "Recoge en punto"}
        </Bloque>
        <Bloque titulo="Pago">{pago || "—"}</Bloque>
      </div>

      <Bloque titulo="Cliente">
        <p className="font-medium text-brand-black">{cliente?.nombre || "—"}</p>
        <p className="text-xs text-brand-brown/60">{cliente?.nit_cedula}</p>
        {cliente?.direccion && <p className="text-xs text-brand-brown/60">{cliente.direccion}</p>}
        {(cliente?.barrio || cliente?.ciudad) && (
          <p className="text-xs text-brand-brown/60">
            {[cliente.barrio, cliente.ciudad].filter(Boolean).join(", ")}
          </p>
        )}
        {cliente?.telefono && <p className="text-xs text-brand-brown/60">Tel: {cliente.telefono}</p>}
      </Bloque>

      <div className="rounded-xl border border-brand-brown/10 bg-white">
        <div className="border-b border-brand-brown/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand-brown/50">
          Productos
        </div>
        <div className="divide-y divide-brand-brown/5">
          {carrito.map((i) => (
            <div key={i.id} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-brand-black">{i.producto.producto || i.producto.referencia}</span>
                <span className="font-semibold text-brand-wine">{formatoCOP(i.producto.precio * i.cantidad)}</span>
              </div>
              <p className="text-xs text-brand-brown/60">
                {cantidadLabel(i.cantidad, i.producto.um)} · {formatoCOP(i.producto.precio)}
                {i.alVacio && " · Al vacío"}
                {i.porcionado && ` · Porciones ${i.unidades} | Gramos ${i.gramos} grs.`}
                {i.corte && ` · ${i.corte}`}
              </p>
              {i.notas && <p className="text-xs italic text-brand-brown/50">“{i.notas}”</p>}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-brand-brown/10 px-4 py-3">
          <span className="font-medium text-brand-brown/70">Total</span>
          <span className="text-lg font-bold text-brand-wine">{formatoCOP(total)}</span>
        </div>
      </div>
      {dom > 0 && (
        <div className="flex justify-between rounded-xl bg-brand-cream-soft/60 px-4 py-2 text-sm text-brand-brown/70">
          <span>Incluye domicilio</span><span className="font-semibold">{formatoCOP(dom)}</span>
        </div>
      )}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-brand-brown/10 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">{titulo}</p>
      <div className="mt-0.5 text-brand-black">{children}</div>
    </div>
  );
}

interface DatosComanda {
  punto: PuntoVenta;
  cliente: Cliente;
  carrito: ItemCarrito[];
  entrega: "domicilio" | "recoge" | null;
  pago: string | null;
  valorDomicilio?: number;
}

export interface Pedido extends DatosComanda {
  id: string;
  comanda: string;
  consecutivo: number;
  fecha: string;
  total: number;
  vendedorNombre?: string;
  vendedorCedula?: string;
  estado?: "En proceso" | "En producción" | "Alistado" | "Facturado" | "Despachado" | "Anulado";
  anulado?: boolean;
  /** ¿Retenido por cartera? Si es falso/indefinido, el pago está liberado. */
  retenido?: boolean;
  /** ¿Pedido programado para otra fecha? Si es falso/indefinido, es para hoy. */
  entregaProgramada?: boolean;
  /** Fecha programada de entrega (YYYY-MM-DD) cuando entregaProgramada es true. */
  fechaProgramada?: string;
}

function DetallePedido({ pedido, onCerrar }: { pedido: Pedido; onCerrar: () => void }) {
  const dest = pedido.entrega === "domicilio" ? "Domicilio" : pedido.entrega === "recoge" ? "Recoge en punto" : "—";
  const c = pedido.cliente;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/40 p-4">
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-brand-wine">Pedido {pedido.comanda}</h3>
            <p className="text-xs text-brand-brown/50">{new Date(pedido.fecha).toLocaleString("es-CO")} · {pedido.punto.nombre}{pedido.anulado ? " · ANULADO" : ""}</p>
          </div>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-brand-brown/50 hover:bg-brand-cream-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm">
          {/* NIT/Cédula destacado */}
          <div className="rounded-xl border border-brand-wine/15 bg-brand-wine/5 px-4 py-3 text-center">
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-brown/50">NIT / Cédula</p>
            <p className="text-2xl font-bold text-brand-wine">{c.nit_cedula}</p>
          </div>
          {/* Datos del pedido */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">Pedido</p>
            <div className="grid grid-cols-2 gap-2">
              <Bloque titulo="Comanda">{pedido.comanda}</Bloque>
              <Bloque titulo="Estado">{pedido.anulado ? "Anulado" : pedido.estado || "En proceso"}</Bloque>
              <Bloque titulo="Punto de venta">{pedido.punto.nombre}</Bloque>
              <Bloque titulo="Consecutivo">{pedido.consecutivo}</Bloque>
              <Bloque titulo="Entrega">{dest}</Bloque>
              <Bloque titulo="Método de pago">{pedido.pago || "—"}</Bloque>
              {pedido.entrega === "domicilio" && (pedido.valorDomicilio ?? 0) > 0 && (
                <Bloque titulo="Valor domicilio">{formatoCOP(pedido.valorDomicilio ?? 0)}</Bloque>
              )}
              <Bloque titulo="Vendedor">{pedido.vendedorNombre || "—"}</Bloque>
              <Bloque titulo="Cédula vendedor">{pedido.vendedorCedula || "—"}</Bloque>
            </div>
          </div>
          {/* Datos del cliente */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">Cliente</p>
            <div className="grid grid-cols-2 gap-2">
              <Bloque titulo="Nombre">{c.nombre || "—"}</Bloque>
              <Bloque titulo="Teléfono">{c.telefono || "—"}</Bloque>
              <Bloque titulo="Ciudad">{c.ciudad || "—"}</Bloque>
              <Bloque titulo="Barrio">{c.barrio || "—"}</Bloque>
              <Bloque titulo="Dirección">{c.direccion || "—"}</Bloque>
              {c.referencia && <Bloque titulo="Referencia">{c.referencia}</Bloque>}
            </div>
          </div>
          {/* Productos */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-brown/40">Productos</p>
            <div className="rounded-xl border border-brand-brown/10">
              {pedido.carrito.map((i) => (
                <div key={i.id} className="flex justify-between border-b border-brand-brown/5 px-3 py-2 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium text-brand-black">{i.producto.producto} <span className="text-xs text-brand-brown/40">Ref {i.producto.referencia}</span></p>
                    <p className="text-xs text-brand-brown/60">Cantidad: {cantidadLabel(i.cantidad, i.producto.um)} · {formatoCOP(i.producto.precio)} c/u</p>
                    <p className="text-xs text-brand-brown/60">Empaque al vacío: {i.alVacio ? "Sí" : "No"}</p>
                    {i.porcionado && <p className="text-xs text-brand-brown/60">Porcionado: {i.unidades} und x {i.gramos} g{i.corte ? ` · ${i.corte}` : ""}</p>}
                    {i.notas && <p className="text-xs italic text-brand-brown/60">Nota: {i.notas}</p>}
                  </div>
                  <span className="whitespace-nowrap font-medium">{formatoCOP(i.producto.precio * i.cantidad)}</span>
                </div>
              ))}
            </div>
          </div>
          {pedido.entrega === "domicilio" && (pedido.valorDomicilio ?? 0) > 0 && (
            <div className="flex justify-between text-sm text-brand-brown/70"><span>Domicilio</span><span>{formatoCOP(pedido.valorDomicilio ?? 0)}</span></div>
          )}
          <div className="flex justify-between text-base font-bold text-brand-wine"><span>Total</span><span>{formatoCOP(pedido.total)}</span></div>
        </div>
        <div className="flex justify-end gap-2 border-t border-brand-brown/10 px-5 py-4">
          {!pedido.anulado && (
            <button onClick={() => imprimirComanda(pedido)} className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft">Reimprimir</button>
          )}
          <button onClick={onCerrar} className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

export async function imprimirComanda({ punto, cliente, carrito, entrega, pago, comanda, fecha: fechaIso, valorDomicilio, vendedorNombre, vendedorCedula, id }: Pedido) {
  const subtotal = carrito.reduce((s, i) => s + i.producto.precio * i.cantidad, 0);
  const dom = entrega === "domicilio" ? (valorDomicilio ?? 0) : 0;
  const total = subtotal + dom;
  const f = new Date(fechaIso);
  const fecha = f.toLocaleDateString("es-CO");
  const hora = f.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });
  const filas = carrito
    .map((i) => {
      const notas: string[] = [`Empaque al vacío: ${i.alVacio ? "SÍ" : "NO"}`];
      if (i.porcionado) notas.push(`relajado ${i.unidades} und a ${i.gramos} grm`);
      if (i.corte) notas.push(i.corte);
      if (i.notas) notas.push(i.notas);
      return `<div class="prod">
        <div class="pi">Ítem: ${i.producto.referencia}</div>
        <div class="pn">${(i.producto.producto || "").toUpperCase()}</div>
        <div class="pl">Cantidad/Peso: <b>${cantidadLabel(i.cantidad, i.producto.um)}</b></div>
        <div class="pl">Valor: <b>${formatoCOP(i.producto.precio * i.cantidad)}</b></div>
        <div class="pn-nota">Nota: ${notas.join(" | ")}</div>
      </div>`;
    })
    .join("");
  const dest = entrega === "domicilio" ? "Domicilio" : entrega === "recoge" ? "Recoge en punto" : "—";
  const ciudad = [cliente.barrio, cliente.ciudad].filter(Boolean).join(", ");
  const logo = `${window.location.origin}/LOGOCARNESSANTACRUZ.png`;
  // QR para trazabilidad/despacho: codifica el id y la comanda del pedido
  let qr = "";
  try {
    qr = await QRCode.toDataURL(`PED:${id}|${comanda}`, { margin: 1, width: 200 });
  } catch { /* sin qr si falla */ }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comanda ${comanda}</title>
  <style>
    *{font-family:Arial,sans-serif;color:#000;font-weight:bold;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{background:#fff}
    body{width:80mm;margin:0 auto;padding:8px;font-size:13px;line-height:1.35}
    .top{display:flex;justify-content:space-between;align-items:flex-start;font-size:12px;font-weight:bold}
    .logo{text-align:center;margin:6px 0}
    .logo img{max-width:60mm;max-height:30mm;object-fit:contain}
    .logo .b{display:inline-block;background:#000;color:#fff;border-radius:6px;padding:6px 14px;font-weight:bold;letter-spacing:1px}
    h1{font-size:19px;text-align:center;margin:8px 0 2px}
    .nit{text-align:left;font-size:22px;font-weight:bold;margin:6px 0 2px}
    .emp{text-align:center;font-size:13px;color:#000;margin-bottom:8px}
    .row{margin:2px 0}
    .label{font-weight:bold}
    .com{font-size:16px;font-weight:bold;margin:8px 0}
    hr{border:none;border-top:2px solid #000;margin:8px 0}
    .sec{font-weight:bold;font-size:14px;margin:6px 0 4px}
    .prod{margin-bottom:8px;font-size:12px;border-bottom:2px solid #000;padding-bottom:8px}
    .prod:last-child{border-bottom:none}
    .pn{font-weight:bold}
    .pn-nota{color:#000}
    .tot{font-size:17px;font-weight:bold;margin:8px 0}
    .qr{text-align:left;margin-top:10px}
    .qr img{width:35mm;height:35mm;image-rendering:pixelated}
    .qr small{display:block;font-size:11px;color:#000;margin-top:2px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
    <div class="top"><span>${fecha}</span><span>${hora}</span></div>
    <div class="logo"><img src="${logo}" alt="Carnes Santacruz" onerror="this.style.display='none'"></div>
    <h1>Detalle del pedido</h1>
    <div class="emp">Carnes Santacruz</div>
    <hr>
    <div class="nit"><span class="label">NIT o Cédula:</span> ${cliente.nit_cedula}</div>
    <div class="row"><span class="label">Cliente:</span> ${cliente.nombre || "—"}</div>
    ${cliente.direccion ? `<div class="row"><span class="label">Dirección:</span> ${cliente.direccion}</div>` : ""}
    ${cliente.telefono ? `<div class="row"><span class="label">Teléfono:</span> ${cliente.telefono}</div>` : ""}
    ${ciudad ? `<div class="row"><span class="label">Ciudad:</span> ${ciudad}</div>` : ""}
    <div class="com">COMANDA: ${comanda}</div>
    <div class="row"><span class="label">Medio de pago:</span> ${pago || "—"}</div>
    <div class="row"><span class="label">Punto de venta:</span> ${punto.nombre}</div>
    <div class="row"><span class="label">Vendedor:</span> ${vendedorNombre || "—"}${vendedorCedula ? ` (${vendedorCedula})` : ""}</div>
    <div class="row"><span class="label">Entrega:</span> ${dest}</div>
    <div class="row"><span class="label">Fecha entrega:</span> ${fecha}</div>
    <hr>
    <div class="sec">PRODUCTOS</div>
    ${filas}
    <hr>
    ${dom > 0 ? `<div class="row"><span class="label">Subtotal:</span> ${formatoCOP(subtotal)}</div><div class="row"><span class="label">Domicilio:</span> ${formatoCOP(dom)}</div>` : ""}
    <div class="tot">Total: ${formatoCOP(total)}</div>
    ${qr ? `<div class="qr"><img src="${qr}" alt="QR pedido"></div>` : ""}
  </body></html>`;
  const w = window.open("", "_blank", "width=400,height=600");
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

const ICONOS: Record<string, string> = {
  id: "M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0ZM10.5 16.5a3 3 0 0 0-6 0v.75h6v-.75Z",
  tel: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z",
  dir: "M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z",
  ref: "M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z",
  loc: "M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z",
};

function DatoCliente({
  icono,
  valor,
  ancho,
}: {
  icono: keyof typeof ICONOS;
  valor: string;
  ancho?: boolean;
}) {
  return (
    <span className={`flex items-start gap-1.5 ${ancho ? "sm:col-span-2" : ""}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-brown/40">
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONOS[icono]} />
      </svg>
      <span className="break-words">{valor}</span>
    </span>
  );
}