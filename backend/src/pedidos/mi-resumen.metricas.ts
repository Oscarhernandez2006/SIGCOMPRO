import {
  diaDeMs,
  diaLocal,
  esPosteriorFuturo,
  hoy0,
  msDeDia,
  objetivoDespacho,
  PALETA,
  pesoPedidoKg,
  tsPedido,
  yaDespachado,
  type MetaMap,
  type MetaResumen,
  type PedidoResumen,
} from './dashboard.metricas';

/**
 * Lógica de "Mi resumen" portada desde `frontend/app/(panel)/mi-resumen/page.tsx`
 * para servirla ya agregada a la app móvil. Misma semántica que el web.
 */

const DAY = 86_400_000;
const MAX_ULTIMOS = 300;

const COLOR_PAGO: Record<string, string> = {
  transferencia: '#7b1e3b',
  efectivo: '#d98c2b',
  tarjeta: '#2e7d63',
  qr: '#2b6cb0',
  credito: '#8e44ad',
  crédito: '#8e44ad',
  mixto: '#c0392b',
};

export interface OpcionesMiResumen {
  /** Nombre del usuario que consulta (vista personal). */
  nombreUsuario: string;
  rol: string;
  /** Admin o permiso `mi_resumen.ver_todos`. */
  puedeVerTodos: boolean;
  /** Televendedora elegida (solo si `puedeVerTodos`); vacío = vista global. */
  vendedoraSel?: string;
  /** Acota a estos puntos (quien tiene `ver_todos` sin ser admin). */
  puntosVisibles?: Set<string>;
  periodo: number; // 0 todo, 1 hoy, 7, 30
  rangoDesde?: string;
  rangoHasta?: string;
}

const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();
const num = (v: unknown) => Number(v) || 0;

function tsDespacho(p: PedidoResumen, meta: MetaMap): number {
  const iso = meta[p.id]?.despachoFin || p.fecha;
  const t = new Date(iso ?? '').getTime();
  return Number.isFinite(t) ? t : 0;
}

function porcionadoresDe(m?: MetaResumen | null): string[] {
  if (m?.segmentado && m.segmentos?.length) {
    return [...new Set(m.segmentos.map((s) => (s.porcionador ?? '').trim()).filter(Boolean))];
  }
  const unico = (m?.porcionador ?? '').trim();
  return unico ? [unico] : [];
}

function diaCorto(clave: string): string {
  const [y, m, d] = clave.split('-');
  return `${d}/${m}/${String(y).slice(2)}`;
}

function estadoReplica(r: { domiciliario?: string | null; estado?: string | null }): string {
  switch (norm(r.estado)) {
    case 'approved':
      return 'Entregado';
    case 'rejected':
      return 'Rechazado';
    case 'partial':
      return 'Parcial';
    case 'in-transit':
      return 'En tránsito';
    default:
      return (r.domiciliario ?? '').trim() ? 'Asignado' : 'En espera';
  }
}

export function calcularMiResumen(pedidos: PedidoResumen[], meta: MetaMap, o: OpcionesMiResumen, ahora = Date.now()) {
  const usaRango = Boolean(o.rangoDesde || o.rangoHasta);
  const periodo = usaRango ? 0 : o.periodo;
  const hoy = diaDeMs(ahora);

  const pedidosBase = o.puntosVisibles
    ? pedidos.filter((p) => o.puntosVisibles!.has(String(p.punto?.id ?? '')))
    : pedidos;

  const vendedorasMap = new Map<string, string>();
  for (const p of pedidosBase) {
    const v = (p.vendedorNombre ?? '').trim();
    if (v) vendedorasMap.set(norm(v), v);
  }
  const vendedoras = [...vendedorasMap.values()].sort((a, b) => a.localeCompare(b));

  const vendedoraSel = o.puedeVerTodos ? (o.vendedoraSel ?? '').trim() : '';
  const nombreMostrado = vendedoraSel || o.nombreUsuario;
  const nombre = norm(nombreMostrado);
  const esVistaGlobal = o.puedeVerTodos && !vendedoraSel;

  const desde = periodo === 0 ? null : hoy0(ahora) - (periodo - 1) * DAY;
  const min = usaRango && o.rangoDesde ? msDeDia(o.rangoDesde) : null;
  const max = usaRango && o.rangoHasta ? msDeDia(o.rangoHasta) + DAY - 1 : null;
  const enPeriodoTs = (t: number) => {
    if (usaRango) return (min == null || t >= min) && (max == null || t <= max);
    return desde == null || t >= desde;
  };
  const enPeriodo = pedidosBase.filter((p) => enPeriodoTs(tsPedido(p)));

  const misVentas = enPeriodo.filter((p) => norm(p.vendedorNombre) === nombre);
  const analizar = esVistaGlobal ? enPeriodo : misVentas;

  // Facturado alineado con caja: despachados por fecha de DESPACHO.
  const scopeCaja = esVistaGlobal ? pedidosBase : pedidosBase.filter((p) => norm(p.vendedorNombre) === nombre);
  const validosCaja = scopeCaja.filter((p) => !p.anulado && yaDespachado(p.estado) && enPeriodoTs(tsDespacho(p, meta)));
  const facturadoCaja = {
    pedidos: validosCaja.length,
    valor: validosCaja.reduce((s, p) => s + num(meta[p.id]?.facturaValor ?? p.total ?? 0), 0),
  };

  const validos = analizar.filter((p) => !p.anulado);
  const totalVentas = validos.reduce((s, p) => s + num(p.total), 0);
  const anulados = analizar.filter((p) => p.anulado || norm(p.estado) === 'anulado' || norm(p.estado) === 'cancelado').length;
  const porDiaMap = new Map<string, number>();
  for (const p of validos) {
    const k = diaLocal(p.fecha);
    porDiaMap.set(k, (porDiaMap.get(k) ?? 0) + num(p.total));
  }
  const ventas = {
    pedidos: validos.length,
    total: totalVentas,
    ticket: validos.length ? totalVentas / validos.length : 0,
    anulados,
    pctBaja: analizar.length ? (anulados / analizar.length) * 100 : 0,
    porDia: [...porDiaMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, valor]) => ({ dia: diaCorto(dia), valor })),
  };

  // Despacho: participación del usuario (o de todos, en vista global).
  const participa = (v?: string | null) => (esVistaGlobal ? norm(v) !== '' : norm(v) === nombre);
  const facture = enPeriodo.filter((p) => participa(meta[p.id]?.facturadoPor));
  const despache = enPeriodo.filter((p) => participa(meta[p.id]?.despachadoPor));
  const aliste = enPeriodo.filter((p) => {
    const nombres = porcionadoresDe(meta[p.id]);
    return esVistaGlobal ? nombres.length > 0 : nombres.some((n) => norm(n) === nombre);
  });
  const domicilios = enPeriodo.filter((p) => participa(meta[p.id]?.domiciliario));

  const valorFacturado = facture.reduce((s, p) => s + num(meta[p.id]?.facturaValor), 0);
  let conDato = 0;
  let aTiempo = 0;
  for (const p of despache) {
    const dm = meta[p.id];
    if (!dm?.despachoFin) continue;
    conDato += 1;
    if (new Date(dm.despachoFin).getTime() <= objetivoDespacho(p, dm.pagoConfirmado)) aTiempo += 1;
  }
  const despacho = {
    facturados: facture.length,
    valorFacturado,
    ticketFactura: facture.length ? valorFacturado / facture.length : 0,
    despachados: despache.length,
    alistados: aliste.length,
    domicilios: domicilios.length,
    entregados: domicilios.reduce((s, p) => s + (meta[p.id]?.entregado ? 1 : 0), 0),
    pctEntrega: conDato ? (aTiempo / conDato) * 100 : 0,
    entregasATiempo: aTiempo,
    entregasConDato: conDato,
  };

  // Hogar vs HORECA.
  const hogar = validos.filter((p) => !p.cliente?.horeca);
  const horeca = validos.filter((p) => p.cliente?.horeca);
  const seg = (l: PedidoResumen[]) => ({
    pedidos: l.length,
    valor: l.reduce((s, p) => s + num(p.total), 0),
    kilos: l.reduce((s, p) => s + pesoPedidoKg(p), 0),
  });
  const h = seg(hogar);
  const r = seg(horeca);
  const hogarVsHoreca = {
    hogar: h,
    horeca: r,
    total: { pedidos: validos.length, valor: h.valor + r.valor, kilos: h.kilos + r.kilos },
  };

  // Rankings (vista personal).
  const prodMap = new Map<string, { nombre: string; cantidad: number; valor: number }>();
  const cliMap = new Map<string, { nombre: string; pedidos: number; valor: number }>();
  const pagoMap = new Map<string, number>();
  let domicilio = 0;
  let recoge = 0;
  for (const p of validos) {
    for (const it of p.carrito ?? []) {
      const clave = it.producto?.producto ?? '—';
      const a = prodMap.get(clave) ?? { nombre: clave, cantidad: 0, valor: 0 };
      a.cantidad += num(it.cantidad);
      a.valor += num(it.producto?.precio) * num(it.cantidad);
      prodMap.set(clave, a);
    }
    const nit = p.cliente?.nit_cedula ?? '—';
    const c = cliMap.get(nit) ?? { nombre: p.cliente?.nombre ?? 'Cliente sin nombre', pedidos: 0, valor: 0 };
    c.pedidos += 1;
    c.valor += num(p.total);
    cliMap.set(nit, c);
    const pago = (p.pago ?? '—').trim();
    pagoMap.set(pago, (pagoMap.get(pago) ?? 0) + 1);
    if (p.entrega === 'domicilio') domicilio += 1;
    else if (p.entrega === 'recoge') recoge += 1;
  }
  const pct = (v: number) => (totalVentas ? (v / totalVentas) * 100 : 0);
  const ranking = [...prodMap.values()]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)
    .map((x) => ({ nombre: x.nombre, valor: x.valor, sub: `${Math.round(x.cantidad).toLocaleString('es-CO')} kg`, pct: pct(x.valor) }));
  const topClientes = [...cliMap.values()]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)
    .map((x) => ({ nombre: x.nombre, valor: x.valor, sub: `${x.pedidos.toLocaleString('es-CO')} ped`, pct: pct(x.valor) }));
  const pagos = [...pagoMap.entries()]
    .map(([pago, count]) => ({ pago, count }))
    .sort((a, b) => b.count - a.count)
    .map((x, i) => ({ label: x.pago || 'Sin especificar', value: x.count, color: COLOR_PAGO[norm(x.pago)] ?? PALETA[i % PALETA.length] }));
  const entrega = [
    { label: 'Domicilio', value: domicilio, color: '#d98c2b' },
    { label: 'Recoge en punto', value: recoge, color: '#7b1e3b' },
  ];

  const tieneVentas = validos.length > 0;
  const tieneDespacho = facture.length + despache.length + aliste.length + domicilios.length > 0;

  // Últimos pedidos del periodo (acotados para el móvil).
  const baseUltimos = tieneVentas ? analizar : [...facture, ...despache];
  const vistos = new Set<string>();
  const ultimosTodos = baseUltimos
    .filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)))
    .sort((a, b) => tsPedido(b) - tsPedido(a));
  const ultimos = ultimosTodos.slice(0, MAX_ULTIMOS).map((p) => {
    const m = meta[p.id];
    const fv = num(m?.facturaValor);
    return {
      id: p.id,
      comanda: p.comanda ?? '',
      facturaNumero: (m?.facturaNumero ?? '').trim() || null,
      cliente: p.cliente?.nombre || p.cliente?.nit_cedula || '—',
      estado: p.anulado ? p.estado || 'Anulado' : p.estado || 'En proceso',
      anulado: Boolean(p.anulado),
      posterior: !p.anulado && esPosteriorFuturo(p, hoy),
      facturaValor: fv > 0 ? fv : null,
      total: num(p.total),
      fecha: p.fecha ?? null,
      replicas: (m?.replicas ?? [])
        .slice()
        .sort((a, b) => a.numero - b.numero)
        .map((x) => ({ numero: x.numero, label: estadoReplica(x), domiciliario: (x.domiciliario ?? '').trim() || null })),
    };
  });

  const periodoLabel = usaRango
    ? `${o.rangoDesde || 'el inicio'} a ${o.rangoHasta || 'hoy'}`
    : periodo === 0
      ? 'todo el histórico'
      : periodo === 1
        ? 'hoy'
        : `los últimos ${periodo} días`;

  return {
    ahora: new Date(ahora).toISOString(),
    periodo,
    usaRango,
    periodoLabel,
    esVistaGlobal,
    puedeVerTodos: o.puedeVerTodos,
    esTelevendedor: norm(o.rol) === 'televendedor' && !o.puedeVerTodos,
    nombreMostrado,
    vendedoraSel,
    vendedoras,
    tieneVentas,
    tieneDespacho,
    ventas,
    facturadoCaja,
    despacho,
    hogarVsHoreca,
    ranking,
    topClientes,
    pagos,
    entrega,
    ultimos,
    totalUltimos: ultimosTodos.length,
  };
}
