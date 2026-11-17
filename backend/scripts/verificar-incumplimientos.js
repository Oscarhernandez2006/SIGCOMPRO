const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true });
const { IncumplimientosService } = require('../src/incumplimientos/incumplimientos.service');
const { PedidosService } = require('../src/pedidos/pedidos.service');

const autor = { sub: '1', cedula: '000001', rol: 'administrador app' };
const entrada = { pedidoId: 'pedido-1', usuarioId: '2', motivo: 'Pedido sin alistar', descripcion: 'No se gestionó durante el turno.', imagen: null };

function escenario({ duplicado = false, replicas = false } = {}) {
  const inicial = { id: 'pedido-1', consecutivo: 7, comanda: 'TEST-7', estado: 'En proceso', anulado: false,
    fecha: '2026-11-17T17:00:00Z', numeroDia: 7, numeroDiaFecha: '2026-11-17',
    punto: { id: '93', nombre: 'Punto de prueba' }, cliente: { nombre: 'Cliente de prueba' },
    carrito: [], total: 0, trazabilidad: [] };
  let pedido = structuredClone(inicial);
  let borrador = null;
  let registro = null;
  let pendiente = null;
  let transaccion = false;
  const eventos = [];
  const meta = { replicas: replicas ? [{ numero: 1 }] : [] };
  const respuesta = (rows = []) => ({ rows, rowCount: rows.length });
  async function query(sql, params = []) {
    if (sql === 'BEGIN') { transaccion = true; eventos.push('BEGIN'); return respuesta(); }
    if (sql === 'COMMIT') { pedido = borrador ?? pedido; registro = pendiente; transaccion = false; eventos.push('COMMIT'); return respuesta(); }
    if (sql === 'ROLLBACK') { borrador = null; pendiente = null; transaccion = false; eventos.push('ROLLBACK'); return respuesta(); }
    if (sql.includes('SELECT id, estado, anulado, fecha, data, meta FROM pedidos')) {
      return respuesta([{ id: pedido.id, estado: pedido.estado, anulado: pedido.anulado, fecha: new Date(pedido.fecha), data: structuredClone(pedido), meta }]);
    }
    if (sql.includes('SELECT consecutivo, data, meta FROM pedidos')) return respuesta([{ consecutivo: pedido.consecutivo, data: structuredClone(pedido), meta }]);
    if (sql.includes('FROM usuarios')) return respuesta([{ id: '2', nombre: 'Persona de prueba', cedula: '000002' }]);
    if (sql.includes('INSERT INTO pedidos')) { assert.equal(transaccion, true); borrador = JSON.parse(params[6]); eventos.push('pedido'); return respuesta(); }
    if (sql.includes('INSERT INTO incumplimientos_personal')) {
      eventos.push('incumplimiento');
      if (duplicado) throw Object.assign(new Error('Duplicado'), { code: '23505' });
      const fila = { id: 'inc-1', pedido_id: params[0], comanda: params[1], punto_id: params[2], punto_nombre: params[3],
        usuario_id: params[4], usuario_nombre: params[5], usuario_cedula: params[6], motivo: params[7], descripcion: params[8],
        estado_pedido: params[9], pedido: JSON.parse(params[10]), imagen: params[11], registrado_por_id: params[12], registrado_por_nombre: params[13], criterio: params[14], creado_en: new Date() };
      if (transaccion) pendiente = fila; else registro = fila;
      return respuesta([fila]);
    }
    if (sql.includes('DELETE FROM comprobantes_pago')) return respuesta();
    throw new Error(`Consulta no simulada: ${sql}`);
  }
  const conexion = { query, release() {} };
  const pool = { query, connect: async () => conexion };
  const pedidos = Object.create(PedidosService.prototype);
  pedidos.pool = pool;
  pedidos.cancelarEnDrivin = async () => { eventos.push('Drivin'); };
  const servicio = new IncumplimientosService(pool, pedidos);
  servicio.horaBogota = () => 21;
  return { servicio, eventos, pedido: () => pedido, registro: () => registro };
}

test('sin anulación: registra incumplimiento y conserva el pedido', async () => {
  const prueba = escenario();
  await prueba.servicio.crear(autor, { ...entrada, anularPedido: false, motivoAnulacion: 'Se debe ignorar' });
  assert.equal(prueba.pedido().estado, 'En proceso');
  assert.equal(prueba.pedido().anulado, false);
  assert.ok(prueba.registro());
  assert.deepEqual(prueba.eventos, ['incumplimiento']);
});

test('con anulación: confirma ambos cambios y conserva trazabilidad', async () => {
  const prueba = escenario();
  await prueba.servicio.crear(autor, { ...entrada, anularPedido: true, motivoAnulacion: 'Cierre del turno' });
  assert.equal(prueba.pedido().estado, 'Anulado');
  assert.equal(prueba.pedido().anulado, true);
  assert.equal(prueba.pedido().motivo, 'Cierre del turno');
  assert.equal(prueba.pedido().trazabilidad.at(-1).tipo, 'anulacion');
  assert.equal(prueba.registro().pedido.estado, 'En proceso');
  assert.equal(prueba.registro().pedido.anulacion.motivo, 'Cierre del turno');
  assert.ok(prueba.eventos.indexOf('incumplimiento') < prueba.eventos.indexOf('COMMIT'));
  assert.ok(prueba.eventos.indexOf('COMMIT') < prueba.eventos.indexOf('Drivin'));
});

test('registro duplicado: revierte la anulación sin cancelar en Drivin', async () => {
  const prueba = escenario({ duplicado: true });
  await assert.rejects(() => prueba.servicio.crear(autor, { ...entrada, anularPedido: true, motivoAnulacion: 'Cierre' }), /ya fue marcado/);
  assert.equal(prueba.pedido().anulado, false);
  assert.equal(prueba.registro(), null);
  assert.ok(prueba.eventos.includes('ROLLBACK'));
  assert.ok(!prueba.eventos.includes('Drivin'));
});

test('anulación sin motivo o con réplicas: no guarda registros parciales', async () => {
  const sinMotivo = escenario();
  await assert.rejects(() => sinMotivo.servicio.crear(autor, { ...entrada, anularPedido: true }), /motivo de anulación/);
  assert.equal(sinMotivo.eventos.length, 0);
  const conReplicas = escenario({ replicas: true });
  await assert.rejects(() => conReplicas.servicio.crear(autor, { ...entrada, anularPedido: true, motivoAnulacion: 'Cierre' }), /réplicas/);
  assert.equal(conReplicas.registro(), null);
  assert.equal(conReplicas.pedido().anulado, false);
});

test('resumen: valida las fechas y parametriza el periodo de Bogotá', async () => {
  const consultas = [];
  const servicio = new IncumplimientosService({ query: async (sql, params) => {
    consultas.push({ sql, params });
    return { rows: [{ total: 3, puntos: 1, personas: [{ usuarioId: '2', nombre: 'Prueba', total: 3 }], motivos: [{ motivo: 'Pedido sin alistar', total: 3 }] }] };
  } }, {});
  assert.equal((await servicio.resumen('2026-11-01', '2026-11-17')).total, 3);
  assert.deepEqual(consultas[0].params, ['2026-11-01', '2026-11-17']);
  assert.match(consultas[0].sql, /America\/Bogota/);
  await assert.rejects(() => servicio.resumen('2026-02-31', '2026-11-17'), /fechas válidas/);
  await assert.rejects(() => servicio.resumen('2026-11-17', '2026-11-01'), /fecha inicial/);
});