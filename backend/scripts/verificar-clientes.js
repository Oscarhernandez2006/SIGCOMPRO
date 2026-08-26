/**
 * Verificación post-reconciliación: compara la tabla `clientes` actual contra
 * la de respaldo. Uso:
 *   node scripts/verificar-clientes.js clientes_respaldo_20260824210454
 */
'use strict';
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {}
const { Pool } = require('pg');

const respaldo = process.argv[2];
if (!respaldo) {
  console.error('Falta el nombre de la tabla de respaldo.');
  process.exit(1);
}

const GEO =
  'lat IS NOT NULL AND lng IS NOT NULL AND lat BETWEEN -90 AND 90 ' +
  'AND lng BETWEEN -180 AND 180 AND NOT (lat = 0 AND lng = 0)';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

(async () => {
  const c = await pool.connect();
  const uno = async (sql) => (await c.query(sql)).rows[0].n;
  try {
    const b = `"${respaldo}"`;
    console.log('clientes AHORA:            ', await uno('SELECT COUNT(*)::int n FROM clientes'));
    console.log('respaldo (antes):          ', await uno(`SELECT COUNT(*)::int n FROM ${b}`));
    console.log('geolocalizados AHORA:      ', await uno(`SELECT COUNT(*)::int n FROM clientes WHERE ${GEO}`));
    console.log('geolocalizados respaldo:   ', await uno(`SELECT COUNT(*)::int n FROM ${b} WHERE ${GEO}`));
    console.log(
      'coincidentes con PUNTO_VENTA cambiado:',
      await uno(
        `SELECT COUNT(*)::int n FROM clientes c JOIN ${b} bk ON bk.nit_cedula = c.nit_cedula WHERE bk.punto_venta IS DISTINCT FROM c.punto_venta`,
      ),
    );
    console.log(
      'coincidentes con LAT/LNG cambiado:    ',
      await uno(
        `SELECT COUNT(*)::int n FROM clientes c JOIN ${b} bk ON bk.nit_cedula = c.nit_cedula WHERE bk.lat IS DISTINCT FROM c.lat OR bk.lng IS DISTINCT FROM c.lng`,
      ),
    );
    console.log(
      'geolocalizados del respaldo que YA NO existen (perdidos):',
      await uno(
        `SELECT COUNT(*)::int n FROM ${b} bk WHERE ${GEO.replace(/lat/g, 'bk.lat').replace(/lng/g, 'bk.lng')} AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.nit_cedula = bk.nit_cedula)`,
      ),
    );
  } finally {
    c.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
