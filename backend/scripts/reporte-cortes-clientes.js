/**
 * Reporte de ventas: cortes y formas que más piden los clientes, con toda su
 * info relacionada, número de pedidos y frecuencia de compra.
 *
 * Lee directo de la base de datos de producción (pedidos.data->'carrito') y
 * genera un Excel (.xlsx) con varias hojas:
 *   1. Resumen            - KPIs generales del rango consultado.
 *   2. Por corte           - ranking de tipos de corte más pedidos.
 *   3. Por forma            - ranking por forma de presentación (UM + al vacío).
 *   4. Productos            - ranking general de productos más pedidos.
 *   5. Clientes             - info completa + n° pedidos, frecuencia, favoritos.
 *   6. Cliente x corte      - qué corte pide más cada cliente.
 *   7. Detalle              - una fila por cada línea de producto vendida.
 *
 * Uso:
 *   node scripts/reporte-cortes-clientes.js [--desde=YYYY-MM-DD] [--hasta=YYYY-MM-DD]
 *
 * Sin --desde/--hasta usa TODO el historial disponible. El archivo se guarda
 * en scripts/reportes/reporte-cortes-clientes-<fecha>.xlsx
 */
'use strict';
const path = require('path');
const fs = require('fs');

// Carga manual del .env (evita depender de node_modules/dotenv si no está instalado).
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

const { Pool } = require('pg');
const XLSX = require('xlsx');

function argv(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : undefined;
}
const desde = argv('desde');
const hasta = argv('hasta');
if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new Error('--desde debe ser YYYY-MM-DD');
if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) throw new Error('--hasta debe ser YYYY-MM-DD');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const money = (n) => Math.round(Number(n) || 0);
const num = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};
const fmtFecha = (d) => (d ? d.toISOString().slice(0, 10) : '');

/** Devuelve la clave con mayor valor acumulado de un Map (o '—' si está vacío). */
function masFrecuente(mapa) {
  let mejor = null;
  let mejorVal = -Infinity;
  for (const [k, v] of mapa) {
    if (v > mejorVal) {
      mejor = k;
      mejorVal = v;
    }
  }
  return mejor ?? '—';
}

/** Convierte un array de objetos a una hoja con anchos de columna razonables. */
function hojaDesde(filas, anchoMin = 10) {
  const ws = XLSX.utils.json_to_sheet(filas);
  if (filas.length > 0) {
    const claves = Object.keys(filas[0]);
    ws['!cols'] = claves.map((k) => {
      const maxDato = filas.reduce((m, f) => Math.max(m, String(f[k] ?? '').length), 0);
      return { wch: Math.min(45, Math.max(anchoMin, k.length + 2, maxDato + 2)) };
    });
  }
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

(async () => {
  const cond = ['p.anulado = false', "(it->'producto'->>'referencia') IS NOT NULL"];
  const val = [];
  let i = 1;
  if (desde) {
    cond.push(`p.fecha >= $${i++}::date`);
    val.push(desde);
  }
  if (hasta) {
    cond.push(`p.fecha < ($${i++}::date + interval '1 day')`);
    val.push(hasta);
  }
  const where = cond.join(' AND ');

  console.log('Conectando a la base de datos de producción...');
  const client = await pool.connect();
  let filas;
  try {
    console.log('Consultando pedidos y líneas de producto (puede tardar unos segundos)...');
    const res = await client.query(
      `SELECT
         p.id AS pedido_id,
         p.data->>'comanda' AS comanda,
         p.fecha,
         p.estado,
         p.data->>'pago' AS pago,
         p.data->>'entrega' AS entrega,
         COALESCE(NULLIF(p.data->'cliente'->>'nit_cedula',''), '—') AS cliente_nit,
         COALESCE(NULLIF(p.data->'cliente'->>'nombre',''), 'Sin nombre') AS cliente_nombre,
         COALESCE(p.data->'cliente'->>'telefono','') AS cliente_telefono,
         COALESCE(p.data->'cliente'->>'direccion','') AS cliente_direccion,
         COALESCE(p.data->'cliente'->>'barrio','') AS cliente_barrio,
         COALESCE(p.data->'cliente'->>'ciudad','') AS cliente_ciudad,
         COALESCE(p.data->'cliente'->>'correo','') AS cliente_correo,
         COALESCE((p.data->'cliente'->>'horeca')::boolean, false) AS cliente_horeca,
         COALESCE(p.data->'punto'->>'nombre','') AS punto,
         NULLIF(it->'producto'->>'referencia','') AS referencia,
         COALESCE(it->'producto'->>'producto','Sin nombre') AS producto,
         it->'producto'->>'um' AS um,
         COALESCE(it->'producto'->>'categoria','') AS categoria,
         COALESCE((it->>'cantidad')::numeric, 0) AS cantidad,
         COALESCE((it->'producto'->>'precio')::numeric, 0) AS precio,
         COALESCE((it->>'porcionado')::boolean, false) AS porcionado,
         NULLIF(it->>'corte','') AS corte,
         COALESCE((it->>'gramos')::numeric, 0) AS gramos,
         COALESCE((it->>'unidades')::numeric, 0) AS unidades,
         COALESCE((it->>'alVacio')::boolean, false) AS al_vacio
       FROM pedidos p,
            jsonb_array_elements(COALESCE(p.data->'carrito', '[]'::jsonb)) AS it
       WHERE ${where}
       ORDER BY p.fecha ASC`,
      val,
    );
    filas = res.rows;
    // Los nombres de producto vienen con relleno de espacios desde Siesa.
    for (const f of filas) f.producto = String(f.producto || '').trim();
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`${filas.length} líneas de producto encontradas.`);
  if (filas.length === 0) {
    console.log('No hay datos para el rango indicado. No se generó ningún archivo.');
    return;
  }

  // ── Agregaciones ──────────────────────────────────────────────────────────
  const porCorte = new Map();
  const porForma = new Map();
  const porProducto = new Map();
  const porCliente = new Map();
  const porClienteCorte = new Map();
  const pedidosGlobal = new Set();
  let fechaMin = null;
  let fechaMax = null;
  let montoTotalGlobal = 0;

  for (const f of filas) {
    const cantidad = Number(f.cantidad) || 0;
    const precio = Number(f.precio) || 0;
    const monto = cantidad * precio;
    const esKg = String(f.um || '').trim().toUpperCase() === 'KG';
    const kg = esKg ? cantidad : 0;
    const fecha = f.fecha ? new Date(f.fecha) : null;
    const formaKey = `${(f.um || 'N/D').trim().toUpperCase()}${f.al_vacio ? ' · Al vacío' : ''}`;

    pedidosGlobal.add(f.pedido_id);
    montoTotalGlobal += monto;
    if (fecha) {
      if (!fechaMin || fecha < fechaMin) fechaMin = fecha;
      if (!fechaMax || fecha > fechaMax) fechaMax = fecha;
    }

    if (f.porcionado && f.corte) {
      const key = f.corte.trim();
      if (!porCorte.has(key)) porCorte.set(key, { corte: key, pedidos: new Set(), clientes: new Set(), cantidad: 0, kg: 0, monto: 0 });
      const g = porCorte.get(key);
      g.pedidos.add(f.pedido_id);
      g.clientes.add(f.cliente_nit);
      g.cantidad += cantidad;
      g.kg += kg;
      g.monto += monto;

      const cckey = `${f.cliente_nit}\u0001${key}`;
      if (!porClienteCorte.has(cckey)) {
        porClienteCorte.set(cckey, { nit: f.cliente_nit, nombre: f.cliente_nombre, corte: key, pedidos: new Set(), cantidad: 0, kg: 0, monto: 0 });
      }
      const gc = porClienteCorte.get(cckey);
      gc.pedidos.add(f.pedido_id);
      gc.cantidad += cantidad;
      gc.kg += kg;
      gc.monto += monto;
    }

    if (!porForma.has(formaKey)) porForma.set(formaKey, { forma: formaKey, pedidos: new Set(), clientes: new Set(), cantidad: 0, kg: 0, monto: 0 });
    {
      const g = porForma.get(formaKey);
      g.pedidos.add(f.pedido_id);
      g.clientes.add(f.cliente_nit);
      g.cantidad += cantidad;
      g.kg += kg;
      g.monto += monto;
    }

    const prodKey = f.referencia || f.producto;
    if (!porProducto.has(prodKey)) {
      porProducto.set(prodKey, { referencia: f.referencia || '—', producto: f.producto, categoria: f.categoria || '', pedidos: new Set(), clientes: new Set(), cantidad: 0, kg: 0, monto: 0 });
    }
    {
      const g = porProducto.get(prodKey);
      g.pedidos.add(f.pedido_id);
      g.clientes.add(f.cliente_nit);
      g.cantidad += cantidad;
      g.kg += kg;
      g.monto += monto;
    }

    if (!porCliente.has(f.cliente_nit)) {
      porCliente.set(f.cliente_nit, {
        nit: f.cliente_nit,
        nombre: f.cliente_nombre,
        telefono: f.cliente_telefono,
        direccion: f.cliente_direccion,
        barrio: f.cliente_barrio,
        ciudad: f.cliente_ciudad,
        correo: f.cliente_correo,
        horeca: f.cliente_horeca,
        pedidos: new Set(),
        primeraFecha: fecha,
        ultimaFecha: fecha,
        monto: 0,
        cantidad: 0,
        cortes: new Map(),
        formas: new Map(),
        productos: new Map(),
        puntos: new Map(),
      });
    }
    {
      const c = porCliente.get(f.cliente_nit);
      c.pedidos.add(f.pedido_id);
      c.monto += monto;
      c.cantidad += cantidad;
      if (fecha) {
        if (!c.primeraFecha || fecha < c.primeraFecha) c.primeraFecha = fecha;
        if (!c.ultimaFecha || fecha > c.ultimaFecha) c.ultimaFecha = fecha;
      }
      if (f.porcionado && f.corte) c.cortes.set(f.corte.trim(), (c.cortes.get(f.corte.trim()) || 0) + cantidad);
      c.formas.set(formaKey, (c.formas.get(formaKey) || 0) + cantidad);
      c.productos.set(f.producto, (c.productos.get(f.producto) || 0) + cantidad);
      if (f.punto) c.puntos.set(f.punto, (c.puntos.get(f.punto) || 0) + 1);
    }
  }

  // ── Hoja 1: Resumen ──────────────────────────────────────────────────────
  const resumen = [
    { Métrica: 'Rango de fechas consultado', Valor: `${fmtFecha(fechaMin)} a ${fmtFecha(fechaMax)}` },
    { Métrica: 'Total de pedidos', Valor: pedidosGlobal.size },
    { Métrica: 'Total de clientes distintos', Valor: porCliente.size },
    { Métrica: 'Total de líneas de producto vendidas', Valor: filas.length },
    { Métrica: 'Monto total vendido (COP)', Valor: money(montoTotalGlobal) },
    { Métrica: 'Ticket promedio por pedido (COP)', Valor: pedidosGlobal.size ? money(montoTotalGlobal / pedidosGlobal.size) : 0 },
    { Métrica: 'Tipos de corte distintos pedidos', Valor: porCorte.size },
    { Métrica: 'Formas de presentación distintas', Valor: porForma.size },
    { Métrica: 'Productos distintos vendidos', Valor: porProducto.size },
    { Métrica: 'Corte más pedido', Valor: [...porCorte.values()].sort((a, b) => b.cantidad - a.cantidad)[0]?.corte ?? '—' },
    { Métrica: 'Forma más pedida', Valor: [...porForma.values()].sort((a, b) => b.cantidad - a.cantidad)[0]?.forma ?? '—' },
  ];

  // ── Hoja 2: Por corte ────────────────────────────────────────────────────
  const filasCorte = [...porCorte.values()]
    .sort((a, b) => b.cantidad - a.cantidad)
    .map((g, idx) => ({
      '#': idx + 1,
      'Tipo de corte': g.corte,
      'N° pedidos': g.pedidos.size,
      'N° clientes distintos': g.clientes.size,
      'Cantidad total': num(g.cantidad),
      'Kg totales': num(g.kg),
      'Monto total (COP)': money(g.monto),
      '% del monto total': montoTotalGlobal > 0 ? num((g.monto / montoTotalGlobal) * 100, 1) : 0,
      'Ticket promedio (COP)': g.pedidos.size ? money(g.monto / g.pedidos.size) : 0,
    }));

  // ── Hoja 3: Por forma ────────────────────────────────────────────────────
  const filasForma = [...porForma.values()]
    .sort((a, b) => b.cantidad - a.cantidad)
    .map((g, idx) => ({
      '#': idx + 1,
      'Forma (UM / presentación)': g.forma,
      'N° pedidos': g.pedidos.size,
      'N° clientes distintos': g.clientes.size,
      'Cantidad total': num(g.cantidad),
      'Kg totales': num(g.kg),
      'Monto total (COP)': money(g.monto),
      '% del monto total': montoTotalGlobal > 0 ? num((g.monto / montoTotalGlobal) * 100, 1) : 0,
    }));

  // ── Hoja 4: Productos ────────────────────────────────────────────────────
  const filasProducto = [...porProducto.values()]
    .sort((a, b) => b.monto - a.monto)
    .map((g, idx) => ({
      '#': idx + 1,
      Referencia: g.referencia,
      Producto: g.producto,
      Categoría: g.categoria,
      'N° pedidos': g.pedidos.size,
      'N° clientes distintos': g.clientes.size,
      'Cantidad total': num(g.cantidad),
      'Kg totales': num(g.kg),
      'Monto total (COP)': money(g.monto),
    }));

  // ── Hoja 5: Clientes ─────────────────────────────────────────────────────
  const filasCliente = [...porCliente.values()]
    .sort((a, b) => b.monto - a.monto)
    .map((c) => {
      const nPed = c.pedidos.size;
      const dias = c.primeraFecha && c.ultimaFecha ? (c.ultimaFecha - c.primeraFecha) / 86400000 : 0;
      return {
        'NIT/Cédula': c.nit,
        Cliente: c.nombre,
        Teléfono: c.telefono,
        Dirección: c.direccion,
        Barrio: c.barrio,
        Ciudad: c.ciudad,
        Correo: c.correo,
        HORECA: c.horeca ? 'Sí' : 'No',
        'Punto de venta más frecuente': masFrecuente(c.puntos),
        'N° pedidos': nPed,
        'Primera compra': fmtFecha(c.primeraFecha),
        'Última compra': fmtFecha(c.ultimaFecha),
        'Frecuencia (días entre pedidos)': nPed > 1 ? num(dias / (nPed - 1), 1) : '',
        'Monto total comprado (COP)': money(c.monto),
        'Ticket promedio (COP)': nPed ? money(c.monto / nPed) : 0,
        'Corte favorito': masFrecuente(c.cortes),
        'Forma favorita': masFrecuente(c.formas),
        'Producto favorito': masFrecuente(c.productos),
      };
    });

  // ── Hoja 6: Cliente x corte ──────────────────────────────────────────────
  const filasClienteCorte = [...porClienteCorte.values()]
    .sort((a, b) => (a.nombre === b.nombre ? b.cantidad - a.cantidad : a.nombre.localeCompare(b.nombre, 'es')))
    .map((g) => ({
      'NIT/Cédula': g.nit,
      Cliente: g.nombre,
      'Tipo de corte': g.corte,
      'N° pedidos': g.pedidos.size,
      'Cantidad total': num(g.cantidad),
      'Kg totales': num(g.kg),
      'Monto total (COP)': money(g.monto),
    }));

  // ── Hoja 7: Detalle (una fila por línea de producto) ────────────────────
  const filasDetalle = filas.map((f) => {
    const cantidad = Number(f.cantidad) || 0;
    const precio = Number(f.precio) || 0;
    return {
      Comanda: f.comanda,
      Fecha: fmtFecha(f.fecha ? new Date(f.fecha) : null),
      Estado: f.estado,
      Punto: f.punto,
      'Cliente NIT': f.cliente_nit,
      Cliente: f.cliente_nombre,
      Teléfono: f.cliente_telefono,
      Dirección: f.cliente_direccion,
      Barrio: f.cliente_barrio,
      Ciudad: f.cliente_ciudad,
      HORECA: f.cliente_horeca ? 'Sí' : 'No',
      Referencia: f.referencia || '—',
      Producto: f.producto,
      Categoría: f.categoria,
      UM: f.um || '',
      Cantidad: num(cantidad),
      'Precio unit. (COP)': money(precio),
      'Monto línea (COP)': money(cantidad * precio),
      Porcionado: f.porcionado ? 'Sí' : 'No',
      'Tipo de corte': f.corte || '',
      'Gramos por unidad': f.porcionado ? num(f.gramos) : '',
      Unidades: f.porcionado ? num(f.unidades) : '',
      'Al vacío': f.al_vacio ? 'Sí' : 'No',
      'Forma de pago': f.pago || '',
      Entrega: f.entrega || '',
    };
  });

  // ── Construir el libro ───────────────────────────────────────────────────
  console.log('Construyendo el archivo Excel...');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaDesde(resumen, 20), 'Resumen');
  XLSX.utils.book_append_sheet(wb, hojaDesde(filasCorte), 'Por corte');
  XLSX.utils.book_append_sheet(wb, hojaDesde(filasForma), 'Por forma');
  XLSX.utils.book_append_sheet(wb, hojaDesde(filasProducto), 'Productos');
  XLSX.utils.book_append_sheet(wb, hojaDesde(filasCliente), 'Clientes');
  XLSX.utils.book_append_sheet(wb, hojaDesde(filasClienteCorte), 'Cliente x corte');
  XLSX.utils.book_append_sheet(wb, hojaDesde(filasDetalle), 'Detalle');

  const dir = path.join(__dirname, 'reportes');
  fs.mkdirSync(dir, { recursive: true });
  const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const archivo = path.join(dir, `reporte-cortes-clientes-${sello}.xlsx`);
  XLSX.writeFile(wb, archivo, { compression: true });

  console.log(`\n✔ Reporte generado: ${archivo}`);
  console.log(`  ${pedidosGlobal.size} pedidos · ${porCliente.size} clientes · ${filas.length} líneas de producto`);
})().catch((e) => {
  console.error('Error generando el reporte:', e);
  process.exit(1);
});
