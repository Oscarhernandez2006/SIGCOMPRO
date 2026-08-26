/**
 * Reconciliación segura de la tabla `clientes` de SIGCOMPRO contra un Excel.
 *
 * Comparando por NIT/cédula:
 *   1. RESPALDA la tabla `clientes` completa antes de tocar nada
 *      (crea `clientes_respaldo_<fecha>` = copia exacta de los datos).
 *   2. AÑADE los clientes del Excel que no existen en la BD.
 *   3. SOBREESCRIBE solo texto (nombre, dirección, referencia, barrio, ciudad,
 *      teléfono) de los que ya existen. NUNCA toca `lat`, `lng` ni
 *      `punto_venta` → conserva la ubicación verificada y el PDV asignado en
 *      SIGCOMPRO (p. ej. los 526 ya posicionados).
 *   4. ELIMINA los clientes que están en la BD pero NO en el Excel, EXCEPTO
 *      los que tienen ubicación válida (protegidos).
 *
 * Integridad: `pedidos`/`cotizaciones` guardan una COPIA del cliente por NIT
 * dentro de su JSON (no hay llave foránea a `clientes`), así que borrar un
 * cliente no rompe pedidos existentes.
 *
 * Uso (desde SIGCOMPRO/backend, con el .env de la BD real):
 *   node scripts/reconciliar-clientes.js "C:\\ruta\\archivo.xlsm"            # SIMULACIÓN
 *   node scripts/reconciliar-clientes.js "C:\\ruta\\archivo.xlsm" --aplicar  # APLICAR
 *
 * Opciones:
 *   --aplicar        Ejecuta los cambios (por defecto es SOLO simulación).
 *   --no-proteger    Permite borrar también clientes con ubicación (NO recomendado).
 *   --hoja "Nombre"  Fuerza el nombre de la hoja (por defecto "Clientes").
 */

'use strict';

const path = require('path');
const XLSX = require('xlsx');
const { Pool } = require('pg');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* sin dotenv: se usan las variables de entorno del sistema */
}

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith('--'));
const aplicar = args.includes('--aplicar');
const proteger = !args.includes('--no-proteger');
const hojaForzada = (() => {
  const i = args.indexOf('--hoja');
  return i >= 0 ? args[i + 1] : null;
})();

if (!archivo) {
  console.error('Falta la ruta del Excel.');
  process.exit(1);
}

const limpiar = (v) => {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};
const comparable = (v) =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
const normEnc = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
const ubicado = (r) =>
  r.lat !== null &&
  r.lng !== null &&
  Number(r.lat) >= -90 &&
  Number(r.lat) <= 90 &&
  Number(r.lng) >= -180 &&
  Number(r.lng) <= 180 &&
  !(Number(r.lat) === 0 && Number(r.lng) === 0);

function parsearExcel(ruta) {
  const libro = XLSX.readFile(ruta, {
    dense: true,
    bookVBA: false,
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellText: false,
    cellStyles: false,
    cellDates: false,
  });
  const hoja =
    (hojaForzada && libro.Sheets[hojaForzada]) ||
    libro.Sheets['Clientes'] ||
    libro.Sheets[libro.SheetNames[0]];
  if (!hoja) throw new Error('El archivo no tiene ninguna hoja válida.');

  const filas = XLSX.utils.sheet_to_json(hoja, {
    header: 1,
    blankrows: false,
    defval: null,
  });
  if (filas.length < 2) throw new Error('El archivo no contiene datos.');

  const encabezados = filas[0].map(normEnc);
  const idxDe = (...alias) => encabezados.findIndex((h) => alias.includes(h));
  const col = {
    nit: idxDe('nit_cedula', 'nit', 'cedula', 'nit/cedula'),
    nombre: idxDe('nombre', 'nombres'),
    direccion: idxDe('direccion'),
    referencia: idxDe('referencia'),
    barrio: idxDe('barrio'),
    ciudad: idxDe('ciudad'),
    telefono: idxDe('telefono', 'celular'),
    puntoVenta: idxDe('punto_venta', 'punto de venta', 'puntoventa', 'punto'),
  };
  if (col.nit < 0) {
    throw new Error('No se encontró la columna Nit_Cedula en el archivo.');
  }
  const valorCol = (fila, i) => (i >= 0 ? limpiar(fila[i]) : null);

  const porNit = new Map();
  let descartadas = 0;
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i];
    const nit = valorCol(fila, col.nit);
    if (!nit) {
      descartadas++;
      continue;
    }
    porNit.set(nit, {
      nit,
      nombre: valorCol(fila, col.nombre),
      direccion: valorCol(fila, col.direccion),
      referencia: valorCol(fila, col.referencia),
      barrio: valorCol(fila, col.barrio),
      ciudad: valorCol(fila, col.ciudad),
      telefono: valorCol(fila, col.telefono),
      puntoVenta: valorCol(fila, col.puntoVenta),
    });
  }
  return { porNit, descartadas };
}

async function main() {
  console.log('Archivo:', archivo);
  console.log('Modo:', aplicar ? 'APLICAR (se harán cambios)' : 'SIMULACIÓN');
  console.log('Proteger ubicados de borrado:', proteger ? 'sí' : 'NO');
  console.log('----------------------------------------------------');

  const { porNit, descartadas } = parsearExcel(archivo);

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  try {
    const existentesRes = await client.query(
      `SELECT nit_cedula, nombre, direccion, referencia, barrio, ciudad,
              telefono, lat, lng
         FROM clientes`,
    );
    const existentes = new Map(
      existentesRes.rows.map((r) => [r.nit_cedula, r]),
    );

    const nuevos = [];
    const cambiados = [];
    let sinCambios = 0;
    for (const reg of porNit.values()) {
      const actual = existentes.get(reg.nit);
      if (!actual) {
        nuevos.push(reg);
        continue;
      }
      const difiere =
        comparable(actual.nombre) !== comparable(reg.nombre) ||
        comparable(actual.direccion) !== comparable(reg.direccion) ||
        comparable(actual.referencia) !== comparable(reg.referencia) ||
        comparable(actual.barrio) !== comparable(reg.barrio) ||
        comparable(actual.ciudad) !== comparable(reg.ciudad) ||
        comparable(actual.telefono) !== comparable(reg.telefono);
      if (difiere) cambiados.push(reg);
      else sinCambios++;
    }

    const aEliminar = [];
    const protegidos = [];
    for (const [nit, actual] of existentes) {
      if (porNit.has(nit)) continue;
      if (proteger && ubicado(actual)) protegidos.push(nit);
      else aEliminar.push(nit);
    }

    console.log('Filas únicas en el Excel:', porNit.size);
    console.log('Filas sin NIT (ignoradas):', descartadas);
    console.log('Clientes actuales en la BD:', existentes.size);
    console.log('----------------------------------------------------');
    console.log('A CREAR (nuevos):        ', nuevos.length);
    console.log('A ACTUALIZAR (texto):    ', cambiados.length);
    console.log('SIN CAMBIOS:             ', sinCambios);
    console.log('A ELIMINAR (no en Excel):', aEliminar.length);
    console.log('PROTEGIDOS (ubicados):   ', protegidos.length);
    console.log('----------------------------------------------------');
    if (aEliminar.length) {
      console.log(
        'Ejemplos a eliminar:',
        aEliminar.slice(0, 20).join(', '),
        aEliminar.length > 20 ? `… (+${aEliminar.length - 20})` : '',
      );
    }
    if (protegidos.length) {
      console.log(
        'Ejemplos protegidos:',
        protegidos.slice(0, 20).join(', '),
        protegidos.length > 20 ? `… (+${protegidos.length - 20})` : '',
      );
    }

    if (!aplicar) {
      console.log('\nSIMULACIÓN: no se hizo ningún cambio.');
      console.log('Para aplicar de verdad, corre con  --aplicar');
      return;
    }

    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const respaldo = `clientes_respaldo_${ts}`;

    console.log(`\nCreando respaldo: ${respaldo} …`);
    await client.query(`CREATE TABLE "${respaldo}" AS TABLE clientes`);
    console.log('Respaldo creado.');

    const LOTE = 500;
    await client.query('BEGIN');

    let creados = 0;
    for (let i = 0; i < nuevos.length; i += LOTE) {
      const grupo = nuevos.slice(i, i + LOTE);
      const valores = [];
      const tuplas = grupo.map((r, j) => {
        const b = j * 8;
        valores.push(
          r.nit,
          r.nombre,
          r.direccion,
          r.referencia,
          r.barrio,
          r.ciudad,
          r.telefono,
          r.puntoVenta,
        );
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8})`;
      });
      const res = await client.query(
        `INSERT INTO clientes
           (nit_cedula, nombre, direccion, referencia, barrio, ciudad, telefono, punto_venta)
         VALUES ${tuplas.join(', ')}`,
        valores,
      );
      creados += res.rowCount || 0;
    }

    let actualizados = 0;
    for (let i = 0; i < cambiados.length; i += LOTE) {
      const grupo = cambiados.slice(i, i + LOTE);
      const valores = [];
      const tuplas = grupo.map((r, j) => {
        const b = j * 7;
        valores.push(
          r.nit,
          r.nombre,
          r.direccion,
          r.referencia,
          r.barrio,
          r.ciudad,
          r.telefono,
        );
        const c = j === 0 ? '::text' : '';
        return `($${b + 1}${c}, $${b + 2}${c}, $${b + 3}${c}, $${b + 4}${c}, $${b + 5}${c}, $${b + 6}${c}, $${b + 7}${c})`;
      });
      const res = await client.query(
        `UPDATE clientes c SET
           nombre = v.nombre, direccion = v.direccion, referencia = v.referencia,
           barrio = v.barrio, ciudad = v.ciudad, telefono = v.telefono
         FROM (VALUES ${tuplas.join(', ')})
           AS v(nit, nombre, direccion, referencia, barrio, ciudad, telefono)
         WHERE c.nit_cedula = v.nit`,
        valores,
      );
      actualizados += res.rowCount || 0;
    }

    let eliminados = 0;
    for (let i = 0; i < aEliminar.length; i += LOTE) {
      const grupo = aEliminar.slice(i, i + LOTE);
      const res = await client.query(
        `DELETE FROM clientes WHERE nit_cedula = ANY($1::text[])`,
        [grupo],
      );
      eliminados += res.rowCount || 0;
    }

    await client.query('COMMIT');

    console.log('\n===================  APLICADO  ===================');
    console.log('Creados:     ', creados);
    console.log('Actualizados:', actualizados);
    console.log('Eliminados:  ', eliminados);
    console.log('Protegidos:  ', protegidos.length);
    console.log('Respaldo en tabla:', respaldo);
    console.log(
      `\nSi algo salió mal, los datos anteriores están intactos en "${respaldo}".`,
    );
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('\nERROR:', e && e.message ? e.message : e);
    console.error('No se aplicaron los cambios (rollback).');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
