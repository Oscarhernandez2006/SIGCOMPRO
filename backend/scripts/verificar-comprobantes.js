const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true });
const { interpretarComprobante } = require('../src/pedidos/comprobantes-ocr');
const ocr = require('../src/pedidos/comprobantes-ocr');
const { PedidosService } = require('../src/pedidos/pedidos.service');

test('Nequi: referencia alfanumérica en la línea siguiente', () => {
  assert.deepEqual(interpretarComprobante('Nequi\nEnviaste\n$ 50.000\nReferencia\nM123456789'),
    { estado: 'positivo', referencia: 'M123456789', entidad: 'Nequi' });
});

test('Bancolombia: número de aprobación con tilde y separadores', () => {
  assert.deepEqual(interpretarComprobante('Bancolombia\nTransferencia exitosa\nNo. aprobación: 123456'),
    { estado: 'positivo', referencia: '123456', entidad: 'Bancolombia' });
});

test('lectura dudosa no inventa referencia con importes ni teléfonos', () => {
  assert.deepEqual(interpretarComprobante('Foto de prueba\nValor $ 50.000\nTeléfono 3001234567'),
    { estado: 'dudoso', referencia: null, entidad: null });
  assert.equal(interpretarComprobante('Referencia: no legible').referencia, null);
});

test('número de registro y comprobante de otras entidades', () => {
  assert.equal(interpretarComprobante('Pago exitoso\nNúmero de registro: 88776655').referencia, '88776655');
  assert.equal(interpretarComprobante('Daviplata\nComprobante de pago\nTransacción: 00445566').referencia, '00445566');
});

test('una transferencia fallida o pendiente deja aviso amarillo', () => {
  for (const mensaje of ['Transferencia fallida', 'Transferencia pendiente', 'No se pudo completar la transferencia', 'Transacción rechazada']) {
    assert.equal(interpretarComprobante(`Bancolombia\n${mensaje}\nReferencia 123456`).estado, 'dudoso');
  }
});

function servicio(query) {
  const instancia = Object.create(PedidosService.prototype);
  instancia.pool = { query };
  instancia.lecturasComprobantes = 0;
  return instancia;
}

test('transferencia y mixto requieren imagen, referencia y confirmación', async () => {
  for (const pago of ['Transferencia', ' Mixto ']) {
    for (const fila of [undefined, { tiene: false, referencia: '123456', confirmado: true },
      { tiene: true, referencia: ' ', confirmado: true }, { tiene: true, referencia: '123456', confirmado: false }]) {
      const instancia = servicio(async (sql, params) => {
        assert.ok(sql.includes('FROM comprobantes_pago'));
        assert.deepEqual(params, ['pedido-prueba']);
        return { rows: fila ? [fila] : [] };
      });
      await assert.rejects(() => instancia.validarComprobantePago('pedido-prueba', pago), /Adjunta y confirma/);
    }
  }
});

test('efectivo, tarjeta y crédito no requieren comprobante', async () => {
  const instancia = servicio(async () => { throw new Error('No debe consultar comprobantes'); });
  for (const pago of ['Efectivo', 'Tarjeta', 'Crédito', 'QR', undefined]) await instancia.validarComprobantePago('pedido-prueba', pago);
});

test('el resultado OCR nunca condiciona la validación del pago', async () => {
  for (const estado of ['positivo', 'dudoso', 'no_disponible']) {
    const instancia = servicio(async () => ({ rows: [{ tiene: true, referencia: 'MANUAL-1234', confirmado: true, ocr: { estado } }] }));
    await instancia.validarComprobantePago('pedido-prueba', 'Transferencia');
    await instancia.validarComprobantePago('pedido-prueba', 'Mixto');
  }
});

test('confirmar guarda referencia manual sin consultar ni esperar al OCR', async () => {
  const instancia = servicio(async (sql, params) => {
    assert.ok(sql.includes('jsonb_array_length'));
    assert.ok(!sql.includes('ocr'));
    assert.deepEqual(params, ['pedido-prueba', 'Persona prueba', 'MANUAL-1234']);
    return { rows: [{ referencia: params[2] }] };
  });
  assert.deepEqual(await instancia.confirmarComprobante('pedido-prueba', 'Persona prueba', ' MANUAL-1234 '), { id: 'pedido-prueba', referencia: 'MANUAL-1234' });
  await assert.rejects(() => instancia.confirmarComprobante('pedido-prueba', null, ' '), /referencia válido/);
  await assert.rejects(() => instancia.confirmarComprobante('pedido-prueba', null, '1'.repeat(81)), /referencia válido/);
  const sinImagen = servicio(async () => ({ rows: [] }));
  await assert.rejects(() => sinImagen.confirmarComprobante('pedido-prueba', null, '123456'), /Adjunta una imagen/);
});

test('confirmar transferencia valida el comprobante antes de actualizar metadata', async () => {
  let actualizaciones = 0;
  const instancia = servicio(async (sql) => {
    if (sql.includes("data->>'pago'")) return { rows: [{ pago: 'Transferencia' }] };
    if (sql.includes('FROM comprobantes_pago')) return { rows: [] };
    actualizaciones++;
    return { rows: [] };
  });
  await assert.rejects(() => instancia.actualizarMeta('pedido-prueba', { pagoConfirmado: '2026-11-17T12:00:00Z' }), /Adjunta y confirma/);
  assert.equal(actualizaciones, 0);
});

test('límite de OCR no encola ni bloquea confirmaciones manuales', async () => {
  const instancia = servicio(async () => { throw new Error('No debe consultar ni iniciar más OCR'); });
  instancia.lecturasComprobantes = 2;
  assert.equal((await instancia.analizarComprobante('pedido-prueba')).ocr.estado, 'no_disponible');
  assert.equal(instancia.lecturasComprobantes, 2);
});

test('fallo OCR devuelve aviso y libera el cupo de lectura', async (contexto) => {
  contexto.mock.method(ocr, 'leerComprobante', async () => { throw new Error('OCR no disponible'); });
  const instancia = servicio(async (sql, params) => {
    if (sql.startsWith('SELECT')) return { rows: [{ imagen: 'imagen-prueba', revision: 'revision-prueba' }] };
    assert.equal(JSON.parse(params[1]).estado, 'no_disponible');
    return { rows: [{ referencia: 'MANUAL-1234' }] };
  });
  const resultado = await instancia.analizarComprobante('pedido-prueba');
  assert.equal(resultado.ocr.estado, 'no_disponible');
  assert.equal(resultado.referencia, 'MANUAL-1234');
  assert.equal(instancia.lecturasComprobantes, 0);
});

test('OCR tardío no devuelve sugerencia si la imagen cambió o fue eliminada', async (contexto) => {
  contexto.mock.method(ocr, 'leerComprobante', async () => ({ estado: 'positivo', referencia: 'AUTOMATICA-1234', entidad: 'Nequi' }));
  const instancia = servicio(async (sql, params) => {
    if (sql.startsWith('SELECT')) return { rows: [{ imagen: 'imagen-prueba', revision: 'revision-original' }] };
    assert.ok(sql.includes('md5('));
    assert.ok(sql.includes("CASE WHEN confirmado = false THEN COALESCE(NULLIF(referencia, ''), $3) ELSE referencia END"));
    assert.equal(params[3], 'revision-original');
    return { rows: [] };
  });
  const resultado = await instancia.analizarComprobante('pedido-prueba');
  assert.equal(resultado.referencia, null);
  assert.equal(resultado.ocr.referencia, null);
});

test('un usuario operativo solo puede consultar o analizar capturas de sus puntos', async () => {
  const instancia = servicio(async (sql, params) => {
    assert.ok(sql.includes('usuario_punto_venta'));
    assert.deepEqual(params, ['pedido-prueba', 'usuario-prueba']);
    return { rowCount: 0 };
  });
  const usuario = { sub: 'usuario-prueba', rol: 'facturador' };
  await assert.rejects(() => instancia.obtenerComprobante('pedido-prueba', usuario), /No tiene acceso/);
  await assert.rejects(() => instancia.analizarComprobante('pedido-prueba', usuario), /No tiene acceso/);
});