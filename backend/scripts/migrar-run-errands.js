// Migración única de datos de Run Errands: SIGROUTE (Postgres "rutas", Prisma)
// -> SIGCOMPRO (Postgres "DBSIGCOM-PRO", tablas run_errands_*).
//
// - Puntos de venta, domiciliarios y pedidos se copian tal cual (con sus IDs
//   viejos remapeados a los nuevos UUID).
// - Clientes se RENUMERAN con el código correcto (Run123 + secuencia, en el
//   mismo orden de creación que ya traían) y se re-sincronizan con Drivin
//   bajo ese código nuevo (confirmado con Carlos Barbas, WhatsApp 1/oct/2026).
//
// Uso: node scripts/migrar-run-errands.js
require('dotenv').config();
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const path = require('path');
const fs = require('fs');
const https = require('https');
const dns = require('dns');

const sigrouteEnvPath = path.resolve(__dirname, '../../../SIGROUTE/backend/.env');
const sigrouteEnv = require('dotenv').parse(fs.readFileSync(sigrouteEnvPath));

const origen = new Pool({ connectionString: sigrouteEnv.DATABASE_URL_PLAN });
const destino = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function asegurarTablas() {
  await destino.query(`
    CREATE TABLE IF NOT EXISTS run_errands_puntos_venta (
      id text PRIMARY KEY, indicador integer NOT NULL UNIQUE, nombre text NOT NULL,
      activo boolean NOT NULL DEFAULT true, creado_en timestamptz NOT NULL DEFAULT now()
    )`);
  await destino.query(`
    CREATE TABLE IF NOT EXISTS run_errands_domiciliarios (
      id text PRIMARY KEY, nombre text NOT NULL, telefono text NULL, cedula text NULL, email text NULL,
      punto_venta_id text NULL REFERENCES run_errands_puntos_venta(id),
      activo boolean NOT NULL DEFAULT true, creado_en timestamptz NOT NULL DEFAULT now()
    )`);
  await destino.query(`
    CREATE TABLE IF NOT EXISTS run_errands_clientes (
      id text PRIMARY KEY, codigo text NOT NULL UNIQUE, nombre text NOT NULL, direccion text NULL,
      referencia text NULL, barrio text NULL, ciudad text NULL, region text NULL, telefono text NULL,
      email text NULL, observaciones text NULL, activo boolean NOT NULL DEFAULT true,
      creado_en timestamptz NOT NULL DEFAULT now()
    )`);
  await destino.query(`
    CREATE TABLE IF NOT EXISTS run_errands_pedidos (
      id text PRIMARY KEY, numero_pedido text NOT NULL UNIQUE,
      cliente_id text NOT NULL REFERENCES run_errands_clientes(id),
      punto_venta_id text NULL REFERENCES run_errands_puntos_venta(id),
      domiciliario_id text NULL REFERENCES run_errands_domiciliarios(id),
      kilos numeric(10,2) NOT NULL DEFAULT 1, estado text NOT NULL DEFAULT 'REVISADO',
      observaciones text NULL, fecha timestamptz NOT NULL DEFAULT now(), usuario text NULL,
      creado_en timestamptz NOT NULL DEFAULT now(), drivin_estado_envio text NOT NULL DEFAULT 'PENDIENTE',
      drivin_mensaje_envio text NULL, drivin_estado_entrega text NULL, drivin_motivo_entrega text NULL,
      drivin_sync_at timestamptz NULL, drivin_schema_name text NULL
    )`);
  console.log('[migración] tablas run_errands_* verificadas.');
}

async function migrarPuntosVenta() {
  const existentes = await destino.query('SELECT id, indicador FROM run_errands_puntos_venta');
  if (existentes.rowCount > 0) {
    console.log(`[migración] puntos_venta ya tiene ${existentes.rowCount} filas, no se vuelve a migrar (re-uso de IDs existentes).`);
    const { rows } = await origen.query('SELECT * FROM errands_puntos_venta ORDER BY indicador ASC');
    const porIndicador = new Map(existentes.rows.map((r) => [r.indicador, r.id]));
    const idMap = new Map();
    for (const p of rows) idMap.set(p.id, porIndicador.get(p.indicador));
    return idMap;
  }
  const { rows } = await origen.query('SELECT * FROM errands_puntos_venta ORDER BY indicador ASC');
  const idMap = new Map();
  for (const p of rows) {
    const id = randomUUID();
    idMap.set(p.id, id);
    await destino.query(
      `INSERT INTO run_errands_puntos_venta (id, indicador, nombre, activo, creado_en)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (indicador) DO NOTHING`,
      [id, p.indicador, p.nombre, p.activo, p.created_at],
    );
  }
  console.log(`[migración] ${rows.length} puntos de venta migrados.`);
  return idMap;
}

async function migrarDomiciliarios(pdvIdMap) {
  const existentes = await destino.query('SELECT COUNT(*) AS n FROM run_errands_domiciliarios');
  if (Number(existentes.rows[0].n) > 0) {
    console.log('[migración] domiciliarios ya tiene filas, no se vuelve a migrar.');
    return new Map();
  }
  const { rows } = await origen.query('SELECT * FROM errands_domiciliarios ORDER BY id ASC');
  const idMap = new Map();
  for (const d of rows) {
    const id = randomUUID();
    idMap.set(d.id, id);
    await destino.query(
      `INSERT INTO run_errands_domiciliarios (id, nombre, telefono, cedula, email, punto_venta_id, activo, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, d.nombre, d.telefono, d.cedula, d.email, d.punto_venta_id ? pdvIdMap.get(d.punto_venta_id) ?? null : null, d.activo, d.created_at],
    );
  }
  console.log(`[migración] ${rows.length} domiciliarios migrados.`);
  return idMap;
}

async function migrarClientes() {
  const existentes = await destino.query('SELECT id, codigo FROM run_errands_clientes');
  if (existentes.rowCount > 0) {
    console.log(`[migración] clientes ya tiene ${existentes.rowCount} filas, no se vuelve a migrar (re-uso de IDs existentes por orden de código).`);
    const { rows } = await origen.query('SELECT * FROM errands_clientes ORDER BY created_at ASC, codigo ASC');
    const nuevos = existentes.rows.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const idMap = new Map();
    rows.forEach((c, i) => {
      const destinoRow = nuevos[i];
      if (destinoRow) idMap.set(c.id, { newId: destinoRow.id, nuevoCodigo: destinoRow.codigo, viejoCodigo: c.codigo });
    });
    return idMap;
  }
  // Mismo orden en que ya estaban creados (ERR00001, ERR00002... ya reflejan
  // ese orden) para que la nueva secuencia Run123+N respete el orden real.
  const { rows } = await origen.query('SELECT * FROM errands_clientes ORDER BY created_at ASC, codigo ASC');
  const idMap = new Map(); // old int id -> { newId, nuevoCodigo }
  let seq = 0;
  for (const c of rows) {
    seq += 1;
    const nuevoCodigo = `Run123${String(seq).padStart(2, '0')}`;
    const id = randomUUID();
    idMap.set(c.id, { newId: id, nuevoCodigo, viejoCodigo: c.codigo });
    await destino.query(
      `INSERT INTO run_errands_clientes (id, codigo, nombre, direccion, referencia, barrio, ciudad, region, telefono, email, observaciones, activo, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, nuevoCodigo, c.nombre, c.direccion, c.referencia, c.barrio, c.ciudad, c.region, c.telefono, c.email, c.observaciones, c.activo, c.created_at],
    );
  }
  console.log(`[migración] ${rows.length} clientes migrados con código Run123 nuevo.`);
  return idMap;
}

async function migrarPedidos(clienteIdMap, pdvIdMap, domIdMap) {
  const { rows } = await origen.query('SELECT * FROM errands_pedidos ORDER BY fecha ASC');
  let migrados = 0;
  let omitidos = 0;
  for (const p of rows) {
    const cliente = clienteIdMap.get(p.cliente_id);
    if (!cliente) { omitidos++; continue; } // huérfano (no debería pasar)
    await destino.query(
      `INSERT INTO run_errands_pedidos (
        id, numero_pedido, cliente_id, punto_venta_id, domiciliario_id, kilos, estado, observaciones,
        fecha, usuario, creado_en, drivin_estado_envio, drivin_mensaje_envio, drivin_estado_entrega,
        drivin_motivo_entrega, drivin_sync_at, drivin_schema_name
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (numero_pedido) DO NOTHING`,
      [
        randomUUID(), p.numero_pedido, cliente.newId,
        p.punto_venta_id ? pdvIdMap.get(p.punto_venta_id) ?? null : null,
        p.domiciliario_id ? domIdMap.get(p.domiciliario_id) ?? null : null,
        p.kilos, p.estado, p.observaciones, p.fecha, p.usuario, p.created_at,
        p.drivin_estado_envio, p.drivin_mensaje_envio, p.drivin_estado_entrega,
        p.drivin_motivo_entrega, p.drivin_sync_at, p.drivin_schema_name,
      ],
    );
    migrados++;
  }
  console.log(`[migración] ${migrados} pedidos migrados (${omitidos} omitidos por cliente huérfano).`);
}

// ── Re-sincroniza cada cliente migrado con Drivin bajo su código NUEVO ────
// Mismo mecanismo de conexión (IP + SNI manual) que ya usa el backend para
// esquivar bloqueos intermitentes de DNS a external.driv.in.
let drivinIp = null;
async function resolverIpDrivin() {
  const host = 'external.driv.in';
  if (drivinIp && Date.now() - drivinIp.ts < 10 * 60 * 1000) return drivinIp.ip;
  const res = await dns.promises.lookup(host, { family: 4 });
  drivinIp = { ip: res.address, ts: Date.now() };
  return res.address;
}
function drivinRequest(method, path, apiKey, body) {
  return resolverIpDrivin().then(
    (ip) =>
      new Promise((resolve, reject) => {
        const req = https.request(
          {
            host: ip, servername: 'external.driv.in', port: 443, path: `/api/external/v2${path}`, method,
            headers: {
              'X-API-Key': apiKey, Host: 'external.driv.in',
              ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
            },
            timeout: 15000,
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, text: data }));
          },
        );
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
        if (body) req.write(body);
        req.end();
      }),
  );
}

async function resincronizarClientesDrivin(clienteIdMap) {
  // OJO: Run Errands usa una organización de Drivin DISTINTA de la de
  // despacho/distribución de Carnes (confirmado en SIGROUTE: DRIVIN_ERRANDS_API_KEY
  // separada de DRIVIN_API_KEY, no se pueden unificar). Si DRIVIN_ERRANDS_API_KEY
  // no está configurada en SIGCOMPRO todavía, este script cae de respaldo a
  // DRIVIN_API_KEY -- verificar en el panel de Drivin que las direcciones
  // realmente llegaron a la organización "CO - Santacruz Domicilios", no a la
  // de distribución de Carnes.
  const apiKey = process.env.DRIVIN_ERRANDS_API_KEY || process.env.DRIVIN_API_KEY;
  if (!apiKey) {
    console.warn('[migración] DRIVIN_ERRANDS_API_KEY/DRIVIN_API_KEY no configurada -- se omite el re-sync de clientes con Drivin.');
    return;
  }
  let ok = 0;
  let fallidos = 0;
  for (const [, info] of clienteIdMap) {
    const r = await destino.query('SELECT * FROM run_errands_clientes WHERE id = $1', [info.newId]);
    const c = r.rows[0];
    const nombreDrivin = `Run Errands - ${c.nombre}`;
    const body = JSON.stringify({
      addresses: [{
        code: c.codigo, address1: c.direccion || c.nombre, address2: c.barrio || undefined,
        city: c.ciudad || 'Barranquilla', state: c.region || 'Atlántico', country: 'Colombia',
        name: nombreDrivin, client: nombreDrivin, client_code: c.codigo,
        phone: c.telefono || undefined, email: c.email || undefined, update_all: true,
      }],
    });
    try {
      const { status } = await drivinRequest('POST', '/addresses', apiKey, body);
      if (status >= 200 && status < 300) ok++;
      else { fallidos++; console.warn(`[migración] Drivin ${status} para ${info.viejoCodigo} -> ${info.nuevoCodigo}`); }
    } catch (e) {
      fallidos++;
      console.warn(`[migración] error de red Drivin para ${info.viejoCodigo} -> ${info.nuevoCodigo}: ${e.message}`);
    }
    // Pequeña pausa para no saturar la API de Drivin.
    await new Promise((res) => setTimeout(res, 150));
  }
  console.log(`[migración] Re-sync Drivin: ${ok} ok, ${fallidos} fallidos (reintentables corriendo el script de nuevo o desde la UI).`);
}

async function main() {
  await asegurarTablas();
  const pdvIdMap = await migrarPuntosVenta();
  const domIdMap = await migrarDomiciliarios(pdvIdMap);
  const clienteIdMap = await migrarClientes();
  await migrarPedidos(clienteIdMap, pdvIdMap, domIdMap);
  await resincronizarClientesDrivin(clienteIdMap);
  await origen.end();
  await destino.end();
  console.log('[migración] completa.');
}

main().catch((e) => {
  console.error('[migración] error fatal:', e);
  process.exit(1);
});
