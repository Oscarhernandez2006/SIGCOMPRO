/**
 * Prueba de velocidad del backend contra la BD de producción.
 *
 * Mide, sin modificar datos:
 *   - Latencia de red pura a la BD (SELECT 1, promedio de varias corridas).
 *   - Tiempo de la consulta REAL del endpoint que se hace polling
 *     (GET /api/pedidos → estado()): activos + finalizados de los últimos N días.
 *   - Peso (MB) del payload que viaja por la red en esa consulta.
 *   - Consultas representativas de clientes y listas de precios.
 *   - Tamaño de las tablas más grandes.
 *
 * Uso:  node perf-test.js
 */
const fs = require('fs');
const { Client } = require('pg');

function readEnv() {
  const txt = fs.readFileSync(__dirname + '/.env', 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const ms = (t) => `${Date.now() - t} ms`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function timeQuery(client, sql, params) {
  const t = Date.now();
  const res = await client.query(sql, params);
  return { res, ms: Date.now() - t };
}

(async () => {
  const env = readEnv();
  const dias = Number(env.PEDIDOS_DIAS_RECIENTES || 3) || 3;
  const client = new Client({
    host: env.DB_HOST,
    port: +env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL === 'true',
  });

  console.log(`\n=== PRUEBA DE VELOCIDAD · BD ${env.DB_NAME} @ ${env.DB_HOST}:${env.DB_PORT} ===\n`);

  let t = Date.now();
  await client.connect();
  console.log(`Conexión inicial:            ${ms(t)}`);

  // Latencia de red pura: SELECT 1 varias veces.
  const lat = [];
  for (let i = 0; i < 8; i++) {
    const t0 = Date.now();
    await client.query('SELECT 1');
    lat.push(Date.now() - t0);
  }
  lat.sort((a, b) => a - b);
  const prom = Math.round(lat.reduce((s, n) => s + n, 0) / lat.length);
  console.log(`Latencia red (SELECT 1):     min ${lat[0]} ms · prom ${prom} ms · max ${lat[lat.length - 1]} ms`);

  // Conteos.
  const cnt = await timeQuery(client, 'SELECT count(*)::int AS n FROM pedidos');
  console.log(`\nTotal de pedidos:            ${cnt.res.rows[0].n} filas  (${cnt.ms} ms)`);

  // Consulta REAL del endpoint con polling (estado()).
  const q = await timeQuery(
    client,
    `SELECT id, impreso, data, meta
       FROM pedidos
      WHERE (anulado = false
             AND lower(coalesce(estado, '')) NOT IN ('despachado', 'anulado'))
         OR fecha >= (now() - make_interval(days => $1))
      ORDER BY fecha DESC NULLS LAST, creado_en DESC`,
    [dias],
  );
  const bytesReal = Buffer.byteLength(JSON.stringify(q.res.rows));
  console.log(
    `GET /api/pedidos (real, ${dias} días): ${q.res.rowCount} filas · ${mb(bytesReal)}  (${q.ms} ms)  ← el que se hace polling`,
  );

  // Peor caso: cargar TODO el histórico (para comparar).
  const all = await timeQuery(client, 'SELECT data, meta FROM pedidos');
  const bytesAll = Buffer.byteLength(JSON.stringify(all.res.rows));
  console.log(`Histórico completo (peor caso): ${all.res.rowCount} filas · ${mb(bytesAll)}  (${all.ms} ms)`);

  // Clientes: primera página (como la UI).
  const cli = await timeQuery(
    client,
    `SELECT id, nit_cedula, nombre, direccion, barrio, ciudad, telefono
       FROM clientes ORDER BY nombre ASC NULLS LAST LIMIT 50 OFFSET 0`,
  );
  console.log(`\nClientes (página 50):        ${cli.res.rowCount} filas  (${cli.ms} ms)`);

  // Listas de precios (catálogo).
  const lst = await timeQuery(
    client,
    `SELECT lista_precio, desc_lista, count(*)::int AS n
       FROM productos_precios GROUP BY lista_precio, desc_lista
       ORDER BY desc_lista NULLS LAST, lista_precio`,
  );
  console.log(`Listas de precios:           ${lst.res.rowCount} listas  (${lst.ms} ms)`);

  // Tamaño de tablas.
  const sizes = await client.query(
    `SELECT relname, n_live_tup,
            pg_size_pretty(pg_total_relation_size(relid)) AS size
       FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC LIMIT 12`,
  );
  console.log('\n--- Tamaño de tablas ---');
  for (const r of sizes.rows) {
    console.log(`  ${r.relname.padEnd(22)} ${String(r.n_live_tup).padStart(7)} filas   ${r.size}`);
  }

  // Índices existentes en pedidos (para ver si la consulta puede usarlos).
  const idx = await client.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'pedidos' ORDER BY indexname`,
  );
  console.log('\n--- Índices en "pedidos" ---');
  for (const r of idx.rows) console.log(`  ${r.indexname}`);

  // Plan de ejecución de la consulta real (¿usa índice o hace Seq Scan?).
  const plan = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT id, impreso, data, meta
       FROM pedidos
      WHERE (anulado = false
             AND lower(coalesce(estado, '')) NOT IN ('despachado', 'anulado'))
         OR fecha >= (now() - make_interval(days => $1))
      ORDER BY fecha DESC NULLS LAST, creado_en DESC`,
    [dias],
  );
  console.log('\n--- Plan de la consulta de pedidos (EXPLAIN ANALYZE) ---');
  for (const r of plan.rows) console.log(`  ${r['QUERY PLAN']}`);

  await client.end();
  console.log('\n=== FIN ===\n');
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
