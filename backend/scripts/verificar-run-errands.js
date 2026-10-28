const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const childProcess = require('node:child_process');
const sharp = require('sharp');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true });
const { RunErrandsService } = require('../src/run-errands/run-errands.service');
const { TiendaEmpleadosService } = require('../src/tienda-empleados/tienda-empleados.service');

function servicio(query) {
  return new RunErrandsService({ query }, { get: () => undefined });
}

test('API: HTML del proxy se convierte en un error HTTP legible', async () => {
  const codigo = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/api.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const modulo = { exports: {} };
  let respuesta = new Response('<!DOCTYPE html><h1>Gateway timeout</h1>', { status: 504 });
  vm.runInNewContext(codigo, {
    exports: modulo.exports, module: modulo, process, Headers,
    require: () => ({ getToken: () => null, limpiarSesion: () => undefined }),
    fetch: async () => respuesta,
  });
  await assert.rejects(() => modulo.exports.apiFetch('/run-errands/pedidos'),
    (error) => error.name === 'ApiError' && error.status === 504 && !error.message.includes('<'));
  respuesta = new Response(JSON.stringify({ pedidos: [] }), { status: 200 });
  assert.equal((await modulo.exports.apiFetch('/run-errands/pedidos')).pedidos.length, 0);
});

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
    actualizaciones.push(...JSON.parse(params[0]));
    return { rows: [] };
  });
  servicioActual.drivinRequest = async () => ({ status: 200, text: JSON.stringify({ data: [
    { attributes: { code: 'RUN-1', status: 'approved' } },
    { attributes: { code: 'RUN-2', status: 'pending' } },
    { attributes: { code: 'RUN-3', status: 'rejected', reason: 'Prueba' } },
  ] }) });
  assert.deepEqual(await servicioActual.syncDrivin('2026-10-01', '2026-10-27'), { actualizados: 3 });
  assert.deepEqual(actualizaciones.map((cambio) => cambio.estado), ['ENTREGADO', 'EN_PROCESO', 'CANCELADO']);
  servicioActual.drivinRequest = async () => ({ status: 200, text: JSON.stringify({ response: [{ orders: [
    { code: 'RUN-1', status: 'approved' }, { code: 'RUN-1', status: 'pending' },
    { code: 'RUN-2', status: 'pending' }, { code: 'RUN-3', status: 'rejected', reason: 'Prueba' },
  ] }] }) });
  assert.deepEqual(await servicioActual.syncDrivin('2026-10-01', '2026-10-27'), { actualizados: 3 });
  assert.deepEqual(actualizaciones.slice(3).map((cambio) => cambio.estado), ['ENTREGADO', 'EN_PROCESO', 'CANCELADO']);
  servicioActual.drivinRequest = async () => ({ status: 503, text: '{}' });
  await assert.rejects(() => servicioActual.syncDrivin('2026-10-01', '2026-10-27'), /HTTP 503/);
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

test('Drivin: consulta por dia y guarda en un solo lote', async () => {
  const requests = [];
  const escrituras = [];
  const servicioActual = servicio(async (sql, params) => {
    if (sql.includes('SELECT id, numero_pedido')) return { rows: [
      { id: '1', numero_pedido: 'RUN-1', dia: '2026-10-26' },
      { id: '2', numero_pedido: 'RUN-2', dia: '2026-10-27' },
    ] };
    escrituras.push({ sql, params });
    return { rows: [] };
  });
  servicioActual.drivinRequest = async (_method, ruta) => {
    requests.push(ruta);
    return { status: 200, text: JSON.stringify({ response: [{ orders: [
      { code: 'RUN-1', status: 'approved' }, { code: 'RUN-2', status: 'pending' },
    ] }] }) };
  };
  assert.equal((await servicioActual.syncDrivin('2026-10-01', '2026-10-27')).actualizados, 2);
  assert.equal(requests.length, 2);
  for (const ruta of requests) {
    const parametros = new URL(ruta, 'https://example.test').searchParams;
    assert.equal(parametros.get('start_date'), parametros.get('end_date'));
  }
  assert.equal(escrituras.length, 1);
  assert.match(escrituras[0].sql, /jsonb_to_recordset/);
  await assert.rejects(() => servicioActual.syncDrivin('2026-02-31', '2026-10-27'), /periodo válido/);
});

test('Dashboard: separa cierres Drivin de estados locales y filtra por punto', async () => {
  const consultas = [];
  const rows = [
    { id: '1', numero_pedido: 'RUN-1', estado: 'ENTREGADO', kilos: 2, fecha: '2026-10-26T14:00:00Z', dia: '2026-10-26', cliente_nombre: 'Cliente A', pdv_nombre: '93', domiciliario_id: 'dom1', domiciliario_nombre: 'Mensajero A', drivin_estado_entrega: 'approved', drivin_estado_envio: 'ENVIADO' },
    { id: '2', numero_pedido: 'RUN-2', estado: 'ENTREGADO', kilos: 3, fecha: '2026-10-27T14:00:00Z', dia: '2026-10-27', cliente_nombre: 'Cliente B', pdv_nombre: '93', domiciliario_id: null, drivin_estado_entrega: null, drivin_estado_envio: 'ERROR' },
    { id: '3', numero_pedido: 'RUN-3', estado: 'CANCELADO', kilos: 1, fecha: '2026-10-27T14:00:00Z', dia: '2026-10-27', cliente_nombre: 'Cliente A', pdv_nombre: '93', domiciliario_id: 'dom1', domiciliario_nombre: 'Mensajero A', drivin_estado_entrega: 'rejected', drivin_estado_envio: 'ENVIADO' },
  ];
  const data = await servicio(async (sql, params) => {
    consultas.push({ sql, params });
    return { rows: sql.includes('COUNT(*)') ? [{ n: 5 }] : rows };
  }).dashboard('2026-10-26', '2026-10-27', 'punto-93');
  assert.equal(data.totalPedidos, 3);
  assert.equal(data.entregadosDrivin, 1);
  assert.equal(data.pendientesDrivin, 1);
  assert.equal(data.rechazadosDrivin, 1);
  assert.equal(data.tasaEntrega, 50);
  assert.equal(data.erroresEnvio, 1);
  assert.equal(data.sinDomiciliario, 1);
  assert.equal(data.totalKilos, 6);
  assert.equal(data.porDia.length, 2);
  assert.equal(data.porDomiciliario.reduce((suma, dom) => suma + dom.value, 0), 3);
  assert.deepEqual(consultas[0].params, ['2026-10-26', '2026-10-27', 'punto-93']);
});