/**
 * Métricas del Dashboard calculadas en el servidor. Es un PORT fiel de la
 * lógica de `frontend/src/app/admin/dashboard/page.tsx` + `lib/despacho.ts` +
 * `lib/peso.ts`, para que la app móvil (y en el futuro el web) reciban el
 * resultado ya agregado en vez de descargar todos los pedidos del periodo.
 *
 * Todas las fechas "locales" se calculan en America/Bogota (UTC-5, sin DST)
 * porque el servidor corre en UTC.
 */

import { pesoCarritoKg, pesoItemKg } from '../common/peso';

type Item = {
  id?: string;
  cantidad?: number | string | null;
  porcionado?: boolean;
  unidades?: number | string | null;
  gramos?: number | string | null;
  pesoVariable?: number | string | null;
  producto?: {
    um?: string | null;
    producto?: string | null;
    referencia?: string | null;
    precio?: number | string | null;
  } | null;
};

export type PedidoResumen = {
  id: string;
  comanda?: string | null;
  fecha?: string;
  total?: number | string | null;
  estado?: string | null;
  anulado?: boolean;
  motivo?: string | null;
  pago?: string | null;
  entrega?: string | null;
  valorDomicilio?: number | string | null;
  vendedorNombre?: string | null;
  vendedorCedula?: string | null;
  entregaProgramada?: boolean | null;
  fechaProgramada?: string | null;
  horaDespacho?: string | null;
  punto?: { id?: string | null; nombre?: string | null } | null;
  cliente?: { nit_cedula?: string | null; nombre?: string | null; horeca?: boolean | null } | null;
  carrito?: Item[] | null;
};

export type MetaResumen = {
  facturaValor?: number | string | null;
  facturaNumero?: string | null;
  facturadoPor?: string | null;
  despachadoPor?: string | null;
  entregado?: boolean | null;
  replicas?: Array<{ numero: number; domiciliario?: string | null; estado?: string | null }> | null;
  pagoConfirmado?: string | null;
  despachoFin?: string | null;
  inicio?: string | null;
  fin?: string | null;
  porcionador?: string | null;
  domiciliario?: string | null;
  segmentado?: boolean;
  segmentos?: Array<{
    itemId?: string;
    porcionador?: string | null;
    um?: string | null;
    cantidad?: number | string | null;
    inicio?: string | null;
    fin?: string | null;
  }>;
};

export type MetaMap = Record<string, MetaResumen | undefined>;

/* ------------------------------------------------------------------ */
/* Fechas en Bogotá                                                    */
/* ------------------------------------------------------------------ */

const DAY = 86400000;
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;

/** Instante (ms UTC) de una fecha/hora de pared en Bogotá. */
export function msLocal(y: number, m: number, d: number, h = 0, mi = 0): number {
  return Date.UTC(y, m - 1, d, h, mi, 0, 0) + OFFSET_BOGOTA_MS;
}

/** Instante de "YYYY-MM-DD" a las 00:00 de Bogotá (NaN si es inválida). */
export function msDeDia(dia: string, h = 0, mi = 0): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia ?? '');
  if (!m) return NaN;
  return msLocal(Number(m[1]), Number(m[2]), Number(m[3]), h, mi);
}

/** "YYYY-MM-DD" de Bogotá para un instante. */
export function diaDeMs(ms: number): string {
  const d = new Date(ms - OFFSET_BOGOTA_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" (Bogotá) de un ISO cualquiera; "" si no es fecha válida. */
export function diaLocal(iso?: string | null): string {
  const t = new Date(iso ?? '').getTime();
  return Number.isFinite(t) ? diaDeMs(t) : '';
}

/** Instante de las 00:00 de hoy en Bogotá. */
export function hoy0(ahora = Date.now()): number {
  return msDeDia(diaDeMs(ahora));
}

export function sumarDias(dia: string, n: number): string {
  return diaDeMs(msDeDia(dia) + n * DAY);
}

/* ------------------------------------------------------------------ */
/* Peso (reutiliza common/peso.ts)                                     */
/* ------------------------------------------------------------------ */

export function pesoPedidoKg(p: PedidoResumen): number {
  return pesoCarritoKg(p.carrito);
}

function pesoPorcionadoKg(p: PedidoResumen): number {
  return (p.carrito ?? []).reduce((s, i) => {
    if (!i.porcionado) return s;
    return s + ((Number(i.unidades) || 0) * (Number(i.gramos) || 0)) / 1000;
  }, 0);
}

/* ------------------------------------------------------------------ */
/* Tiempos de despacho (lib/despacho.ts)                               */
/* ------------------------------------------------------------------ */

const LIMITE_DESPACHO_MS = 2 * 60 * 60 * 1000;
const LIMITE_TRANSFERENCIA_MS = 60 * 60 * 1000;
const ALERTA_DESPACHO_MS = 60 * 60 * 1000;
const LIMITE_ALISTADO_PEQUENO_MS = 40 * 60 * 1000;
const KILOS_PEDIDO_PEQUENO = 10;
const HORA_LIMITE_RECOGE = 18;

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
const esTransferencia = (p: PedidoResumen) => norm(p.pago) === 'transferencia';
const esRecoge = (p: PedidoResumen) => norm(p.entrega) === 'recoge';
const esProgramado = (p: PedidoResumen) => Boolean(p.entregaProgramada && p.fechaProgramada);

export function yaDespachado(estado?: string | null): boolean {
  const e = norm(estado);
  return (
    e === 'despachado' ||
    e === 'en tránsito' ||
    e === 'entregado' ||
    e === 'rechazado' ||
    e === 'devolución' ||
    e === 'devolucion'
  );
}

export function tsPedido(p: PedidoResumen): number {
  const t = new Date(p.fecha ?? '').getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Día base (YYYY-MM-DD Bogotá): el programado o el de creación. */
function diaEntregaISO(p: PedidoResumen): string {
  return esProgramado(p) ? String(p.fechaProgramada) : diaLocal(p.fecha);
}

export function objetivoDespacho(p: PedidoResumen, pagoConfirmado?: string | null): number {
  if (esRecoge(p)) return msDeDia(diaEntregaISO(p), HORA_LIMITE_RECOGE, 0);
  if (esTransferencia(p)) {
    if (pagoConfirmado) return new Date(pagoConfirmado).getTime() + LIMITE_TRANSFERENCIA_MS;
    return Infinity;
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec((p.horaDespacho ?? '').trim());
  const programado = esProgramado(p);
  if (m || programado) {
    const dia = programado ? String(p.fechaProgramada) : diaLocal(p.fecha);
    return m ? msDeDia(dia, Number(m[1]), Number(m[2])) : msDeDia(dia, 8, 0);
  }
  return tsPedido(p) + LIMITE_DESPACHO_MS;
}

function deadlinePreparacion(p: PedidoResumen, pagoConfirmado?: string | null): number {
  const programado = esProgramado(p);
  if (!programado && pesoPedidoKg(p) <= KILOS_PEDIDO_PEQUENO) {
    return tsPedido(p) + LIMITE_ALISTADO_PEQUENO_MS;
  }
  if (!programado && esRecoge(p)) return tsPedido(p) + LIMITE_DESPACHO_MS;
  const obj = objetivoDespacho(p, pagoConfirmado);
  if (!Number.isFinite(obj)) return obj;
  return esTransferencia(p) ? obj : obj - ALERTA_DESPACHO_MS;
}

/* ------------------------------------------------------------------ */
/* Movimientos (misma clasificación que la vista Despacho)             */
/* ------------------------------------------------------------------ */

export const MOV_DEFS = [
  { key: 'pendientes', label: 'Pendientes', sub: 'Sin finalizar', color: '#d98c2b' },
  { key: 'atrasados', label: 'Atrasados', sub: 'No finalizados', color: '#c0392b' },
  { key: 'retenidos', label: 'Retenidos', sub: 'Cartera', color: '#caa54a' },
  { key: 'posteriores', label: 'Posteriores', sub: 'Programados', color: '#6366f1' },
  { key: 'produccion', label: 'En producción', sub: 'En preparación', color: '#2b6cb0' },
  { key: 'alistados', label: 'Alistados', sub: 'Listos para facturar', color: '#8e44ad' },
  { key: 'facturados', label: 'Facturados', sub: 'Con factura', color: '#16a085' },
  { key: 'despachados', label: 'Despachados', sub: 'En ruta o entregados', color: '#2e7d63' },
  { key: 'cancelados', label: 'Cancelados', sub: 'Anulados', color: '#c0392b' },
] as const;

function esDeHoy(p: PedidoResumen, hoy: string): boolean {
  const dia = diaEntregaISO(p);
  if (dia === hoy) return true;
  if (dia < hoy) return !p.anulado && !yaDespachado(p.estado) && norm(p.estado) !== 'anulado';
  return false;
}

export function esPosteriorFuturo(p: PedidoResumen, hoy: string): boolean {
  return esProgramado(p) && String(p.fechaProgramada) > hoy;
}

export function calcularMovimientos(
  pedidos: PedidoResumen[],
  metaMap: MetaMap,
  enHoy: boolean,
  desde: number | null,
  hasta: number | null,
  ahora = Date.now(),
): Record<string, number> {
  const hoy = diaDeMs(ahora);
  const base = pedidos.filter((p) => {
    if (enHoy) return esDeHoy(p, hoy);
    const t = msDeDia(diaEntregaISO(p));
    if (desde != null && t < desde) return false;
    if (hasta != null && t > hasta) return false;
    return true;
  });
  const esAtrasado = (p: PedidoResumen) => {
    if (p.anulado) return false;
    if (yaDespachado(p.estado) || norm(p.estado) === 'anulado') return false;
    return objetivoDespacho(p, metaMap[p.id ?? '']?.pagoConfirmado) - ahora <= 0;
  };
  const atrasadosSet = new Set(base.filter(esAtrasado).map((p) => p.id));
  const cuenta = (pred: (p: PedidoResumen) => boolean) =>
    base.filter((p) => pred(p) && !atrasadosSet.has(p.id)).length;
  const cards: Record<string, number> = {
    pendientes: cuenta((p) => !p.anulado && norm(p.estado) === 'en proceso'),
    atrasados: atrasadosSet.size,
    retenidos: cuenta((p) => norm(p.estado) === 'liberación'),
    posteriores: pedidos.filter((p) => esPosteriorFuturo(p, hoy)).length,
    produccion: cuenta((p) => norm(p.estado) === 'en producción'),
    alistados: cuenta((p) => norm(p.estado) === 'alistado'),
    facturados: cuenta((p) => norm(p.estado) === 'facturado'),
    despachados: cuenta((p) => yaDespachado(p.estado)),
    cancelados: cuenta((p) => p.anulado || norm(p.estado) === 'anulado'),
  };
  cards.total = MOV_DEFS.reduce((s, d) => s + (cards[d.key] ?? 0), 0);
  return cards;
}

/* ------------------------------------------------------------------ */
/* Métricas                                                            */
/* ------------------------------------------------------------------ */

export const PALETA = ['#7b1e3b', '#d98c2b', '#2e7d63', '#2b6cb0', '#8e44ad', '#c0392b', '#16a085', '#e67e22'];
const COLOR_ESTADO: Record<string, string> = {
  'En proceso': '#d98c2b',
  'En producción': '#2b6cb0',
  Alistado: '#8e44ad',
  Facturado: '#16a085',
  Despachado: '#2e7d63',
  'En tránsito': '#2b6cb0',
  Entregado: '#2e7d63',
  Anulado: '#c0392b',
  Cancelado: '#e67e22',
};

export interface FilaTop {
  nombre: string;
  unidades: number;
  total: number;
  kilos?: number;
  kilosPorcionados?: number;
  facturado?: number;
  prepMs?: number;
  prepCount?: number;
}

export function serieVentasDiarias(
  lista: PedidoResumen[],
  ahora = Date.now(),
): { dia: string; valor: number }[] {
  const porDia = new Map<string, number>();
  let primerDia = '';
  for (const p of lista) {
    const dia = diaLocal(p.fecha);
    if (!dia) continue;
    if (!primerDia || dia < primerDia) primerDia = dia;
    if (p.anulado !== true) porDia.set(dia, (porDia.get(dia) ?? 0) + (Number(p.total) || 0));
  }
  if (!primerDia) return [];
  const hoy = diaDeMs(ahora);
  const out: { dia: string; valor: number }[] = [];
  for (let d = primerDia; d <= hoy; d = sumarDias(d, 1)) out.push({ dia: d, valor: porDia.get(d) ?? 0 });
  return out;
}

export function metricas(lista: PedidoResumen[], metaMap: MetaMap = {}, rangoDias: string[] | null = null) {
  const validos = lista.filter((p) => p.anulado !== true);
  const total = (p: PedidoResumen) => Number(p.total) || 0;
  const meta = (p: PedidoResumen) => metaMap[p.id ?? ''];
  const ventas = validos.reduce((s, p) => s + total(p), 0);
  const facturado = validos.reduce((s, p) => s + (Number(meta(p)?.facturaValor) || 0), 0);
  const numPedidos = validos.length;
  const ticket = numPedidos ? ventas / numPedidos : 0;

  let despachados = 0;
  let valorDespachado = 0;
  let entregaConDato = 0;
  let entregaATiempo = 0;
  let alistadosCount = 0;
  let alistadosATiempo = 0;
  for (const p of validos) {
    const dm = meta(p);
    const pc = dm?.pagoConfirmado;
    if (p.estado === 'Despachado' || dm?.despachoFin) {
      despachados += 1;
      valorDespachado += total(p);
    }
    if (dm?.despachoFin) {
      entregaConDato += 1;
      if (new Date(dm.despachoFin).getTime() <= objetivoDespacho(p, pc)) entregaATiempo += 1;
    }
    if (dm?.fin) {
      alistadosCount += 1;
      if (new Date(dm.fin).getTime() <= deadlinePreparacion(p, pc)) alistadosATiempo += 1;
    }
  }
  const pctEntrega = entregaConDato ? (entregaATiempo / entregaConDato) * 100 : 0;
  const pctAlistado = alistadosCount ? (alistadosATiempo / alistadosCount) * 100 : 0;
  const pctDespachados = numPedidos ? (despachados / numPedidos) * 100 : 0;

  const anulados = lista.filter((p) => p.estado === 'Anulado').length;
  const cancelados = lista.filter((p) => p.estado === 'Cancelado').length;
  const pctBaja = lista.length ? ((anulados + cancelados) / lista.length) * 100 : 0;

  let unidades = 0;
  const domicilios = validos.filter((p) => p.entrega === 'domicilio');
  const valorDomicilios = domicilios.reduce((s, p) => s + (Number(p.valorDomicilio) || 0), 0);
  const recoge = validos.filter((p) => p.entrega === 'recoge').length;

  const clientesSet = new Set<string>();
  const porDiaMap = new Map<string, number>();
  const estadoMap = new Map<string, number>();
  const pagoMap = new Map<string, number>();
  const prodMap = new Map<string, FilaTop>();
  const cliMap = new Map<string, FilaTop>();
  const vendMap = new Map<string, FilaTop>();
  const porcMap = new Map<string, FilaTop>();
  const domiMap = new Map<string, FilaTop>();

  for (const p of validos) {
    const dia = diaLocal(p.fecha);
    if (dia) porDiaMap.set(dia, (porDiaMap.get(dia) ?? 0) + total(p));

    const est = p.estado || 'En proceso';
    estadoMap.set(est, (estadoMap.get(est) ?? 0) + 1);

    const pago = p.pago || 'Sin definir';
    pagoMap.set(pago, (pagoMap.get(pago) ?? 0) + 1);

    const cli = p.cliente;
    const cliKey = cli?.nit_cedula || cli?.nombre || '—';
    clientesSet.add(cliKey);
    const ce = cliMap.get(cliKey) ?? {
      nombre: cli?.nombre || cli?.nit_cedula || 'Sin cliente',
      unidades: 0,
      total: 0,
      kilos: 0,
    };
    ce.unidades += 1;
    ce.total += total(p);
    ce.kilos = (ce.kilos ?? 0) + pesoPedidoKg(p);
    cliMap.set(cliKey, ce);

    const vendKey = p.vendedorCedula || p.vendedorNombre || '—';
    const ve = vendMap.get(vendKey) ?? {
      nombre: p.vendedorNombre || p.vendedorCedula || 'Sin vendedora',
      unidades: 0,
      total: 0,
      facturado: 0,
    };
    ve.unidades += 1;
    ve.total += total(p);
    ve.facturado = (ve.facturado ?? 0) + (Number(meta(p)?.facturaValor) || 0);
    vendMap.set(vendKey, ve);

    const dm = meta(p);
    if (dm?.segmentado && dm.segmentos && dm.segmentos.length > 0) {
      for (const seg of dm.segmentos) {
        const nombre = (seg.porcionador ?? '').trim();
        if (!nombre) continue;
        const item = p.carrito?.find((i) => i.id === seg.itemId);
        const segKg = String(seg.um ?? '').trim().toUpperCase() === 'KG' ? Number(seg.cantidad) || 0 : 0;
        const segPorcionadoKg = item?.porcionado
          ? ((Number(item.unidades) || 0) * (Number(item.gramos) || 0)) / 1000
          : 0;
        const e = porcMap.get(nombre) ?? {
          nombre, unidades: 0, total: 0, kilos: 0, kilosPorcionados: 0, prepMs: 0, prepCount: 0,
        };
        e.unidades += 1;
        e.total += total(p);
        e.kilos = (e.kilos ?? 0) + segKg;
        e.kilosPorcionados = (e.kilosPorcionados ?? 0) + segPorcionadoKg;
        if (seg.inicio && seg.fin) {
          const ms = new Date(seg.fin).getTime() - new Date(seg.inicio).getTime();
          if (Number.isFinite(ms) && ms > 0) {
            e.prepMs = (e.prepMs ?? 0) + ms;
            e.prepCount = (e.prepCount ?? 0) + 1;
          }
        }
        porcMap.set(nombre, e);
      }
    } else {
      const porc = (dm?.porcionador || '').trim();
      if (porc) {
        const e = porcMap.get(porc) ?? {
          nombre: porc, unidades: 0, total: 0, kilos: 0, kilosPorcionados: 0, prepMs: 0, prepCount: 0,
        };
        e.unidades += 1;
        e.total += total(p);
        e.kilos = (e.kilos ?? 0) + pesoPedidoKg(p);
        e.kilosPorcionados = (e.kilosPorcionados ?? 0) + pesoPorcionadoKg(p);
        if (dm?.inicio && dm?.fin) {
          const ms = new Date(dm.fin).getTime() - new Date(dm.inicio).getTime();
          if (Number.isFinite(ms) && ms > 0) {
            e.prepMs = (e.prepMs ?? 0) + ms;
            e.prepCount = (e.prepCount ?? 0) + 1;
          }
        }
        porcMap.set(porc, e);
      }
    }
    const domi = (dm?.domiciliario || '').trim();
    if (domi) {
      const e = domiMap.get(domi) ?? { nombre: domi, unidades: 0, total: 0, kilos: 0 };
      e.unidades += 1;
      e.total += total(p);
      e.kilos = (e.kilos ?? 0) + pesoPedidoKg(p);
      domiMap.set(domi, e);
    }

    for (const it of p.carrito ?? []) {
      const cant = Number(it.cantidad) || 0;
      unidades += cant;
      const prod = it.producto;
      const nombre = prod?.producto || prod?.referencia || 'Producto';
      const precio = Number(prod?.precio) || 0;
      const pe = prodMap.get(nombre) ?? { nombre, unidades: 0, total: 0, kilos: 0 };
      pe.unidades += cant;
      pe.kilos = (pe.kilos ?? 0) + pesoItemKg(it);
      pe.total += precio * cant;
      prodMap.set(nombre, pe);
    }
  }

  let ventasPorDia: { dia: string; valor: number }[];
  if (rangoDias && rangoDias.length) {
    ventasPorDia = rangoDias.map((dia) => ({ dia, valor: porDiaMap.get(dia) ?? 0 }));
  } else {
    const dias = [...porDiaMap.keys()].sort();
    if (dias.length <= 1) {
      ventasPorDia = dias.map((dia) => ({ dia, valor: porDiaMap.get(dia) ?? 0 }));
    } else {
      ventasPorDia = [];
      for (let d = dias[0]; d <= dias[dias.length - 1]; d = sumarDias(d, 1)) {
        ventasPorDia.push({ dia: d, valor: porDiaMap.get(d) ?? 0 });
      }
    }
  }
  let primerDiaActividad = '';
  for (const p of lista) {
    const d = diaLocal(p.fecha);
    if (d && (!primerDiaActividad || d < primerDiaActividad)) primerDiaActividad = d;
  }
  if (primerDiaActividad) ventasPorDia = ventasPorDia.filter((d) => d.dia >= primerDiaActividad);

  const porEstado = [...estadoMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: COLOR_ESTADO[label] ?? PALETA[i % PALETA.length] }));
  const porPago = [...pagoMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: PALETA[i % PALETA.length] }));

  const porTotal = (a: FilaTop, b: FilaTop) => b.total - a.total;
  const topProductos = [...prodMap.values()].sort(porTotal).slice(0, 10);
  const topClientes = [...cliMap.values()].sort(porTotal).slice(0, 5);
  const topVendedoras = [...vendMap.values()].sort(porTotal).slice(0, 5);
  const topPorcionadores = [...porcMap.values()].sort(porTotal).slice(0, 5);
  const topDomiciliarios = [...domiMap.values()].sort(porTotal).slice(0, 5);

  const motivoMap = new Map<string, { motivo: string; tipo: string; count: number }>();
  for (const p of lista) {
    if (p.estado !== 'Anulado' && p.estado !== 'Cancelado') continue;
    const motivo = p.motivo || 'Sin motivo';
    const key = `${p.estado}|${motivo}`;
    const e = motivoMap.get(key) ?? { motivo, tipo: p.estado, count: 0 };
    e.count += 1;
    motivoMap.set(key, e);
  }
  const motivos = [...motivoMap.values()].sort((a, b) => b.count - a.count);

  const hogar = validos.filter((p) => !p.cliente?.horeca);
  const horeca = validos.filter((p) => p.cliente?.horeca);
  const hogarValor = hogar.reduce((s, p) => s + total(p), 0);
  const horecaValor = horeca.reduce((s, p) => s + total(p), 0);
  const hogarKg = hogar.reduce((s, p) => s + pesoPedidoKg(p), 0);
  const horecaKg = horeca.reduce((s, p) => s + pesoPedidoKg(p), 0);

  return {
    ventas,
    facturado,
    numPedidos,
    ticket,
    despachados,
    valorDespachado,
    pctDespachados,
    entregaConDato,
    entregaATiempo,
    pctEntrega,
    alistadosCount,
    alistadosATiempo,
    pctAlistado,
    anulados,
    cancelados,
    pctBaja,
    unidades,
    domicilios: domicilios.length,
    valorDomicilios,
    recoge,
    clientes: clientesSet.size,
    ventasPorDia,
    porEstado,
    porPago,
    topProductos,
    topClientes,
    topVendedoras,
    topPorcionadores,
    topDomiciliarios,
    motivos,
    hogarVsHoreca: {
      hogar: { pedidos: hogar.length, valor: hogarValor, kilos: hogarKg },
      horeca: { pedidos: horeca.length, valor: horecaValor, kilos: horecaKg },
      total: { pedidos: validos.length, valor: ventas, kilos: hogarKg + horecaKg },
    },
  };
}

export type Metricas = ReturnType<typeof metricas>;

export function delta(actual: number, previo: number): { pct: number; positivo: boolean } | null {
  if (!previo) {
    if (!actual) return null;
    return { pct: 100, positivo: true };
  }
  const pct = ((actual - previo) / previo) * 100;
  return { pct, positivo: pct >= 0 };
}

/* ------------------------------------------------------------------ */
/* Orquestación: periodo, ventanas y resultado completo                */
/* ------------------------------------------------------------------ */

export interface OpcionesDashboard {
  /** 1 = hoy, 7, 30, 0 = todo. Se ignora si hay rango. */
  periodo: number;
  rangoDesde?: string;
  rangoHasta?: string;
  /** id del punto o undefined = todos. */
  puntoId?: string;
  /** ids de puntos visibles (undefined = todos, para administradores). */
  puntosVisibles?: Set<string>;
}

/** Qué pedirle a resumenLigero() según el periodo/rango (igual que el web). */
export function opcionesCarga(o: OpcionesDashboard, ahora = Date.now()): { rango: string; fecha?: string; hasta?: string } {
  if (o.rangoDesde || o.rangoHasta) {
    const r: { rango: string; fecha?: string; hasta?: string } = { rango: 'rango' };
    if (o.rangoDesde) r.fecha = o.rangoDesde;
    if (o.rangoHasta) r.hasta = o.rangoHasta;
    return r;
  }
  if (o.periodo === 0) return { rango: 'todo' };
  if (o.periodo === 1) return { rango: 'hoy' };
  return { rango: 'rango', fecha: sumarDias(diaDeMs(ahora), -(o.periodo * 2 - 1)) };
}

export function calcularDashboard(
  pedidos: PedidoResumen[],
  metaMap: MetaMap,
  o: OpcionesDashboard,
  ahora = Date.now(),
) {
  const usaRango = Boolean(o.rangoDesde || o.rangoHasta);
  const periodo = usaRango ? 0 : o.periodo;

  let base = o.puntosVisibles
    ? pedidos.filter((p) => o.puntosVisibles!.has(String(p.punto?.id ?? '')))
    : pedidos;
  if (o.puntoId) base = base.filter((p) => String(p.punto?.id ?? '') === o.puntoId);

  let desde: number | null = null;
  let prevDesde: number | null = null;
  if (usaRango) {
    desde = o.rangoDesde ? msDeDia(o.rangoDesde) : null;
  } else if (periodo !== 0) {
    desde = hoy0(ahora) - (periodo - 1) * DAY;
    prevDesde = desde - periodo * DAY;
  }
  const hastaMs = usaRango && o.rangoHasta ? msDeDia(o.rangoHasta) + DAY - 1 : null;

  const enPeriodo = base.filter((p) => {
    const t = tsPedido(p);
    if (desde != null && t < desde) return false;
    if (hastaMs != null && t > hastaMs) return false;
    return true;
  });
  const enPrevio =
    desde == null || prevDesde == null
      ? []
      : base.filter((p) => {
          const t = tsPedido(p);
          return t >= prevDesde! && t < desde!;
        });

  let rangoDias: string[] | null = null;
  if (usaRango) {
    if (o.rangoDesde && o.rangoHasta) {
      rangoDias = [];
      for (let d = o.rangoDesde; d <= o.rangoHasta; d = sumarDias(d, 1)) rangoDias.push(d);
    }
  } else if (periodo !== 0) {
    const inicio = sumarDias(diaDeMs(ahora), -(periodo - 1));
    rangoDias = [];
    for (let i = 0; i < periodo; i++) rangoDias.push(sumarDias(inicio, i));
  }

  const m = metricas(enPeriodo, metaMap, rangoDias);
  const mPrev = metricas(enPrevio, metaMap);
  const comparar = !usaRango && periodo !== 0;
  const deltas = comparar
    ? {
        ventas: delta(m.ventas, mPrev.ventas),
        facturado: delta(m.facturado, mPrev.facturado),
        numPedidos: delta(m.numPedidos, mPrev.numPedidos),
        ticket: delta(m.ticket, mPrev.ticket),
      }
    : null;

  return {
    ahora: new Date(ahora).toISOString(),
    periodo,
    usaRango,
    metricas: m,
    deltas,
    movimientos: calcularMovimientos(base, metaMap, periodo === 1 && !usaRango, desde, hastaMs, ahora),
    movimientosDefs: MOV_DEFS,
    ventasSerie: serieVentasDiarias(base, ahora),
  };
}
