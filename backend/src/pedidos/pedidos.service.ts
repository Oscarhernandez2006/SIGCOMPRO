import { Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { UbicacionesService } from '../ubicaciones/ubicaciones.service';

/** Estructura libre del pedido tal como la maneja el frontend. */
type PedidoData = Record<string, unknown> & {
  id?: string;
  consecutivo?: number;
  comanda?: string;
  fecha?: string;
  estado?: string;
  anulado?: boolean;
  pago?: string;
  entregaProgramada?: boolean;
  /** Fecha programada de entrega (YYYY-MM-DD) cuando entregaProgramada es true. */
  fechaProgramada?: string;
  punto?: { id?: string; nombre?: string; codigo?: string | null } | null;
  cliente?: {
    nit_cedula?: string;
    nombre?: string;
    direccion?: string;
    referencia?: string;
    barrio?: string;
    ciudad?: string;
    telefono?: string;
  } | null;
  carrito?: Array<{
    cantidad?: number;
    producto?: { um?: string };
  }>;
};

/** Metadata de despacho asociada a un pedido. */
type DespachoMeta = Record<string, unknown>;

export interface EstadoPedidos {
  pedidos: PedidoData[];
  meta: Record<string, DespachoMeta>;
  impresos: string[];
}

@Injectable()
export class PedidosService implements OnModuleInit {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly ubicaciones: UbicacionesService,
  ) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id text PRIMARY KEY,
        consecutivo int,
        punto_id text,
        estado text,
        anulado boolean NOT NULL DEFAULT false,
        fecha timestamptz,
        impreso boolean NOT NULL DEFAULT false,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        meta jsonb NOT NULL DEFAULT '{}'::jsonb,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  /** Devuelve todos los pedidos junto con su metadata e impresos. */
  async estado(): Promise<EstadoPedidos> {
    const res = await this.pool.query<{
      id: string;
      impreso: boolean;
      data: PedidoData;
      meta: DespachoMeta;
    }>(
      `SELECT id, impreso, data, meta
       FROM pedidos
       ORDER BY fecha DESC NULLS LAST, creado_en DESC`,
    );

    const pedidos: PedidoData[] = [];
    const meta: Record<string, DespachoMeta> = {};
    const impresos: string[] = [];
    for (const row of res.rows) {
      pedidos.push(row.data);
      if (row.meta && Object.keys(row.meta).length > 0) {
        meta[row.id] = row.meta;
      }
      if (row.impreso) impresos.push(row.id);
    }
    return { pedidos, meta, impresos };
  }

  /** Crea o actualiza un pedido completo (upsert por id). */
  async guardar(pedido: PedidoData): Promise<{ id: string }> {
    const id = String(pedido.id ?? '').trim();
    if (!id) {
      throw new Error('El pedido no tiene id.');
    }
    const consecutivo =
      typeof pedido.consecutivo === 'number' ? pedido.consecutivo : null;
    const puntoId = pedido.punto?.id ? String(pedido.punto.id) : null;
    const estado = pedido.estado ? String(pedido.estado) : null;
    const anulado = pedido.anulado === true;
    const fecha = pedido.fecha ? new Date(String(pedido.fecha)) : null;

    await this.pool.query(
      `INSERT INTO pedidos
         (id, consecutivo, punto_id, estado, anulado, fecha, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         consecutivo = EXCLUDED.consecutivo,
         punto_id = EXCLUDED.punto_id,
         estado = EXCLUDED.estado,
         anulado = EXCLUDED.anulado,
         fecha = EXCLUDED.fecha,
         data = EXCLUDED.data,
         actualizado_en = now()`,
      [id, consecutivo, puntoId, estado, anulado, fecha, JSON.stringify(pedido)],
    );
    return { id };
  }

  /** Mezcla cambios en la metadata de despacho de un pedido. */
  async actualizarMeta(
    id: string,
    cambios: DespachoMeta,
  ): Promise<{ id: string }> {
    await this.pool.query(
      `UPDATE pedidos
         SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb,
             actualizado_en = now()
       WHERE id = $1`,
      [id, JSON.stringify(cambios ?? {})],
    );
    return { id };
  }

  /** Marca (o desmarca) un pedido como impreso. */
  async marcarImpreso(id: string, impreso = true): Promise<{ id: string }> {
    await this.pool.query(
      `UPDATE pedidos SET impreso = $2, actualizado_en = now() WHERE id = $1`,
      [id, impreso],
    );
    return { id };
  }

  /** Borra todos los pedidos (reinicio para producción). */
  async vaciar(): Promise<{ eliminados: number }> {
    const res = await this.pool.query<{ n: number }>(
      `WITH borrados AS (DELETE FROM pedidos RETURNING 1)
       SELECT COUNT(*)::int AS n FROM borrados`,
    );
    return { eliminados: res.rows[0]?.n ?? 0 };
  }

  /**
   * Genera el archivo Excel de despacho para un pedido, con el formato exacto
   * que exige el software de ruteo (100 columnas). Devuelve el nombre y buffer.
   */
  async generarExcelDespacho(
    id: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const res = await this.pool.query<{ data: PedidoData }>(
      `SELECT data FROM pedidos WHERE id = $1 LIMIT 1`,
      [id],
    );
    const pedido = res.rows[0]?.data;
    if (!pedido) {
      throw new NotFoundException('Pedido no encontrado');
    }

    const cliente = pedido.cliente ?? {};
    const punto = pedido.punto ?? {};
    const comanda = String(pedido.comanda ?? '');

    // Localidad del punto: "PDV Carnes Santacruz La 70" -> "La 70".
    const localidad = String(punto.nombre ?? '')
      .replace(/pdv/gi, '')
      .replace(/carnes\s+santacruz/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const tipo = `PDV ${localidad}`.trim();
    const proveedor = `PDV ${localidad}`.trim();

    // Kilos consolidados: suma de ítems vendidos por KG.
    const kilos = (pedido.carrito ?? []).reduce((s, i) => {
      const esKilo = (i.producto?.um ?? '').trim().toUpperCase() === 'KG';
      return s + (esKilo ? Number(i.cantidad) || 0 : 0);
    }, 0);

    // Fechas y ventanas (zona horaria America/Bogota).
    const creado = pedido.fecha ? new Date(String(pedido.fecha)) : new Date();
    const programado = pedido.entregaProgramada === true;
    const fechaISO = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
    const horaHM = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);

    let fechaEntrega: string;
    let inicioVentana: string;
    let finVentana: string;
    let prioridad: string;
    if (programado) {
      // Pedido programado: usa la fecha elegida; ventana fija 8:00–9:00 y prioridad 1.0.
      const elegida = (pedido.fechaProgramada ?? '').trim();
      // Se usa la fecha elegida tal cual (YYYY-MM-DD); si no hay, se cae a mañana.
      const manana = new Date(creado.getTime() + 24 * 60 * 60 * 1000);
      fechaEntrega = /^\d{4}-\d{2}-\d{2}$/.test(elegida)
        ? elegida
        : fechaISO(manana);
      inicioVentana = '08:00';
      finVentana = '09:00';
      prioridad = '1.00';
    } else {
      // Pedido para hoy: ventana = hora de creación a +2h, prioridad 2.0.
      fechaEntrega = fechaISO(creado);
      inicioVentana = horaHM(creado);
      finVentana = horaHM(new Date(creado.getTime() + 2 * 60 * 60 * 1000));
      prioridad = '2.00';
    }

    // Departamento (Región) a partir de la ciudad del cliente.
    let region = '';
    try {
      const depto = await this.ubicaciones.departamentoDeCiudad(
        cliente.ciudad,
      );
      region = depto
        ? depto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        : '';
    } catch {
      region = '';
    }

    const nit = String(cliente.nit_cedula ?? '');
    const nombre = String(cliente.nombre ?? '');
    const telefono = String(cliente.telefono ?? '');
    const referencia = [nombre, cliente.referencia]
      .filter((x) => x && String(x).trim())
      .join(' / ');
    // Código proveedor: solo el número del punto (ej. 2 de "2" o "2CSXXXXX").
    const codDigitos = String(punto.codigo ?? '').match(/\d+/)?.[0];
    const codigoProveedor = codDigitos ? Number(codDigitos) : '';

    // Fila completa: 100 columnas en el orden de CABECERA_DESPACHO.
    const fila: (string | number)[] = new Array(
      CABECERA_DESPACHO.length,
    ).fill('');
    fila[0] = fechaEntrega; // Fecha Maxima de Entrega
    fila[3] = comanda; // Código de despacho*
    fila[4] = kilos.toFixed(2); // Unidades_1* (siempre con 2 decimales, ej. 1.00)
    fila[7] = prioridad; // Prioridad
    fila[8] = nit; // Código de dirección*
    fila[9] = nombre; // Nombre dirección
    fila[10] = nombre; // Nombre cliente
    fila[11] = tipo; // Tipo (PDV {localidad})
    fila[12] = String(cliente.direccion ?? ''); // Dirección 1*
    fila[13] = referencia; // Referencias
    fila[15] = String(cliente.barrio ?? ''); // Comuna*
    fila[16] = String(cliente.ciudad ?? ''); // Provincia
    fila[17] = region; // Región
    fila[18] = 'Colombia'; // País*
    fila[22] = 10; // Tiempo de servicio
    fila[23] = inicioVentana; // Inicio Ventana 1
    fila[24] = finVentana; // Fin Ventana 1
    fila[27] = telefono; // Telefono de Contacto
    fila[34] = proveedor; // Proveedor
    fila[37] = nit; // Código cliente
    fila[38] = nombre; // Nombre de contacto
    fila[70] = telefono; // Telefono contacto cerca del lugar
    fila[71] = telefono; // Telefono contacto entrega
    fila[88] = codigoProveedor; // Código proveedor

    const ws = XLSX.utils.aoa_to_sheet([CABECERA_DESPACHO, fila]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
    const buffer = XLSX.write(wb, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    // Nombre del archivo = consecutivo del pedido + fecha y hora de generación
    // (America/Bogota), para que la televendedora lo relacione al subir al ERP.
    const ahora = new Date();
    const fechaGen = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ahora); // YYYY-MM-DD
    const horaGen = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(ahora)
      .replace(/:/g, '-'); // HH-MM-SS

    const consecutivo = comanda || String(id);
    const filename = `${consecutivo}_${fechaGen}_${horaGen}.xlsx`;
    return { filename, buffer };
  }
}

/** Cabecera exacta (100 columnas) que exige el software de despacho/ruteo. */
const CABECERA_DESPACHO: string[] = [
  'Fecha Maxima de Entrega',
  'Nombre Plan',
  'Esquema',
  'Código de despacho*',
  'Unidades_1*',
  'Unidades_2',
  'Unidades_3',
  'Prioridad',
  'Código de dirección*',
  'Nombre dirección',
  'Nombre cliente',
  'Tipo',
  'Dirección 1*',
  'Referencias',
  'Descripción',
  'Comuna*',
  'Provincia',
  'Región',
  'País*',
  'Código Postal',
  'Latitud',
  'Longitud',
  'Tiempo de servicio',
  'Inicio Ventana 1',
  'Fin Ventana 1',
  'Características',
  'Asignación vehículo',
  'Telefono de Contacto',
  'Email de Contacto',
  'Unidades del artículo',
  'Código del artículo',
  'Descripción del artículo',
  'Exclusividad',
  'Posicion',
  'Proveedor',
  'Inicio ventana 2',
  'Fin ventana 2',
  'Código cliente',
  'Nombre de contacto',
  'Código Alternativo',
  'Mail aprobar ruta',
  'Mail iniciar ruta',
  'Mail en camino a direccion',
  'Mail entrega finalizada',
  'Código de ruta',
  'Número de viaje',
  'Tipo Unidad',
  'Texto 1',
  'Texto 2',
  'Texto 3',
  'Texto 4',
  'Texto 5',
  'Texto 6',
  'Texto 7',
  'Texto 8',
  'Texto 9',
  'Texto 10',
  'Texto 11',
  'Número 1',
  'Número 2',
  'Número 3',
  'Número 4',
  'Correo Conductor',
  'Costo Asignación',
  'Columna dummy',
  'Fecha Facturación',
  'Ruta Maestra',
  'Descripción Despacho',
  'Telefono contacto ruta aprobada',
  'Telefono contacto ruta iniciada',
  'Telefono contacto cerca del lugar',
  'Telefono contacto entrega',
  'Código zona de ventas',
  'Unidades requeridas por item',
  'Tag de Busqueda',
  'Fecha de proceso',
  'Folio',
  'Orden de compra',
  'Nombre 2do Contacto',
  'Teléfono 2do Contacto',
  'Email 2do Contacto',
  'Categoría',
  'url',
  'token',
  'url con token',
  'Unidades_4',
  'Tipo de orden',
  'Paquete de datos',
  'Código proveedor',
  'Texto 12',
  'Texto 13',
  'Texto 14',
  'Texto 15',
  'Texto 16',
  'Texto 17',
  'Texto 18',
  'Texto 19',
  'Texto 20',
  'Código Empleador',
  'Prioridad de Secuencia',
];
