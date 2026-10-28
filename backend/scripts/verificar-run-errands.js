const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const childProcess = require('node:child_process');
const sharp = require('sharp');

require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true });
const { RunErrandsService } = require('../src/run-errands/run-errands.service');
const { TiendaEmpleadosService } = require('../src/tienda-empleados/tienda-empleados.service');

function servicio(query) {
  return new RunErrandsService({ query }, { get: () => undefined });
}

test('clientes: la busqueda parametrizada incluye direccion', async () => {
  const llamadas = [];
  await servicio(async (sql, params) => { llamadas.push({ sql, params }); return { rows: [] }; })
    .listarClientes('Calle 93', false);
  assert.match(llamadas[0].sql, /direccion ILIKE \$1/);
  assert.match(llamadas[0].sql, /activo = true/);
  assert.deepEqual(llamadas[0].params, ['%Calle 93%']);
});

test('domiciliarios globales: incluidos por punto y separados de Sin PDV', async () => {
  const llamadas = [];
  const servicioActual = servicio(async (sql, params) => { llamadas.push({ sql, params }); return { rows: [] }; });
  await servicioActual.listarDomiciliarios(false, 'punto-93');
  assert.match(llamadas[0].sql, /d\.punto_venta_id = \$1 OR d\.todos_los_puntos = true/);
  assert.match(llamadas[0].sql, /d\.activo = true/);
  assert.deepEqual(llamadas[0].params, ['punto-93']);
  await servicioActual.listarDomiciliarios(false, 'SIN');
  assert.match(llamadas[1].sql, /punto_venta_id IS NULL AND d.todos_los_puntos = false/);
  await servicioActual.crearDomiciliario({ nombre: 'Domiciliario de prueba', puntoVentaId: 'punto-93', todosLosPuntos: true });
  assert.equal(llamadas[2].params[5], null);
  assert.equal(llamadas[2].params[6], true);
});

test('Drivin: diferencia cierre aprobado, rechazo y pendiente', async () => {
  const actualizaciones = [];
  const servicioActual = servicio(async (sql, params) => {
    if (sql.includes('SELECT id, numero_pedido')) return { rows: [
      { id: '1', numero_pedido: 'RUN-1' }, { id: '2', numero_pedido: 'RUN-2' },
      { id: '3', numero_pedido: 'RUN-3' },
    ] };
    actualizaciones.push(params);
    return { rows: [] };
  });
  servicioActual.drivinRequest = async () => ({ status: 200, text: JSON.stringify({ data: [
    { attributes: { code: 'RUN-1', status: 'approved' } },
    { attributes: { code: 'RUN-2', status: 'pending' } },
    { attributes: { code: 'RUN-3', status: 'rejected', reason: 'Prueba' } },
  ] }) });
  assert.deepEqual(await servicioActual.syncDrivin('2026-10-01', '2026-10-27'), { actualizados: 3 });
  assert.deepEqual(actualizaciones.map((params) => params[3]), ['ENTREGADO', 'EN_PROCESO', 'CANCELADO']);
  servicioActual.drivinRequest = async () => ({ status: 200, text: JSON.stringify({ response: [{ orders: [
    { code: 'RUN-1', status: 'approved' }, { code: 'RUN-1', status: 'pending' },
    { code: 'RUN-2', status: 'pending' }, { code: 'RUN-3', status: 'rejected', reason: 'Prueba' },
  ] }] }) });
  assert.deepEqual(await servicioActual.syncDrivin('2026-10-01', '2026-10-27'), { actualizados: 3 });
  assert.deepEqual(actualizaciones.slice(3).map((params) => params[3]), ['ENTREGADO', 'EN_PROCESO', 'CANCELADO']);
  servicioActual.drivinRequest = async () => ({ status: 503, text: '{}' });
  await assert.rejects(() => servicioActual.syncDrivin('2026-10-01', '2026-10-27'), /No se pudo sincronizar/);
  assert.equal(actualizaciones.length, 6);
});

test('OCR: filtros reales, reintentos limitados y numero exacto', async (context) => {
  const foto = 'data:image/png;base64,' + (await sharp({
    create: { width: 640, height: 400, channels: 3, background: '#b0b0b0' },
  }).png().toBuffer()).toString('base64');
  const intentos = [];
  let respuestas = [];
  context.mock.method(childProcess, 'execFile', (comando, args, opciones, callback) => {
    assert.equal(comando, 'tesseract');
    assert.ok(opciones.timeout > 0 && opciones.timeout <= 10000);
    assert.equal(opciones.killSignal, 'SIGKILL');
    intentos.push(args);
    const texto = respuestas.shift() ?? 'No se reconoce';
    return { stdin: {
      on() {},
      end(buffer) {
        assert.ok(Buffer.isBuffer(buffer));
        sharp(buffer).metadata().then((metadata) => {
          assert.ok(metadata.width <= 2200 && metadata.height <= 2200);
          callback(null, texto);
        }).catch((error) => callback(error));
      },
    } };
  });
  const tienda = new TiendaEmpleadosService({ query: async () => { throw new Error('No debe acceder a BD'); } });
  respuestas = ['Texto borroso', 'CEDULA 1.234.567'];
  const recuperada = await tienda.verificarCedulaFoto(foto, '1234567');
  assert.equal(recuperada.ok, true, `${recuperada.mensaje}; intentos=${intentos.length}`);
  assert.equal(intentos.length, 2);
  intentos.length = 0;
  respuestas = ['912345678', '123\n4567', '99999999'];
  assert.equal((await tienda.verificarCedulaFoto(foto, '1234567')).ok, false);
  assert.equal(intentos.length, 3);
  intentos.length = 0;
  respuestas = ['CEDULA 1234567'];
  assert.equal((await tienda.verificarCedulaFoto(foto, '1234567')).ok, true);
  assert.equal(intentos.length, 1);
});