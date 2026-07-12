import { Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { PG_POOL } from '../database/database.module';
import { UbicacionesService } from '../ubicaciones/ubicaciones.service';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';

/** Evento de trazabilidad del pedido (creación / cambio de estado / anulación). */
export interface TrazaEvento {
  tipo: 'creacion' | 'estado' | 'anulacion';
  estadoAnterior?: string | null;
  estadoNuevo?: string | null;
  /** Fecha/hora del evento (ISO, hora del servidor). */
  fecha: string;
  usuarioId?: string | null;
  usuarioNombre?: string | null;
  usuarioCedula?: string | null;
}

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
  /** Historial de cambios (creación, estados, anulación). */
  trazabilidad?: TrazaEvento[];
  /** Número del día (turno) por punto, asignado atómicamente por el backend. */
  numeroDia?: number;
  punto?: { id?: string; nombre?: string; codigo?: string | null } | null;
  cliente?: {
    id?: string;
    nit_cedula?: string;
    nombre?: string;
    direccion?: string;
    referencia?: string;
    barrio?: string;
    ciudad?: string;
    telefono?: string;
    correo?: string;
    lat?: number | null;
    lng?: number | null;
    horeca?: boolean;
    activo?: boolean;
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
    private readonly config: ConfigService,
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
    await this.refrescarClientes(pedidos);
    this.asignarNumerosDia(pedidos);
    return { pedidos, meta, impresos };
  }

  /** Fecha (YYYY-MM-DD) en zona horaria de Bogotá. Por defecto, hoy. */
  private diaBogota(fecha?: string | Date | null): string {
    const d = fecha ? new Date(fecha) : new Date();
    const base = isNaN(d.getTime()) ? new Date() : d;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(base);
  }

  /**
   * Asigna el "número del día" (turno) a cada pedido, POR PUNTO DE VENTA y con
   * reinicio diario RODANTE (fuente única de la numeración):
   *  - Los pedidos ACTIVOS (pendientes) pertenecen SIEMPRE al día de HOY: un
   *    pedido que quedó pendiente de días anteriores se arrastra a hoy y, al
   *    haberse creado antes, toma los primeros números (1, 2, 3…). Ej.: si
   *    quedaron por el #50 y ese quedó pendiente, al cambiar el día ese pedido
   *    pasa a ser el #1 y los nuevos siguen desde ahí.
   *  - Los pedidos FINALIZADOS (despachados/anulados) quedan anclados al día en
   *    que se finalizaron, para que los números del día NO se corran cuando uno
   *    se despacha.
   *  - La numeración es independiente por punto: puede existir el #1 en dos
   *    puntos distintos, pero NUNCA dos #1 el mismo día en el mismo punto.
   */
  private asignarNumerosDia(pedidos: PedidoData[]): void {
    const hoy = this.diaBogota();
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
    const estaActivo = (p: PedidoData) => {
      const e = norm(p.estado);
      return p.anulado !== true && e !== 'despachado' && e !== 'anulado';
    };
    const diaEntrega = (p: PedidoData) =>
      p.entregaProgramada && p.fechaProgramada
        ? String(p.fechaProgramada)
        : this.diaBogota(p.fecha ? String(p.fecha) : null);
    const diaFinalizacion = (p: PedidoData) => {
      const tz = Array.isArray(p.trazabilidad) ? p.trazabilidad : [];
      const ultimo = tz.length ? tz[tz.length - 1] : null;
      return ultimo?.fecha ? this.diaBogota(ultimo.fecha) : diaEntrega(p);
    };
    const diaEfectivo = (p: PedidoData) => {
      if (estaActivo(p)) {
        const dia = diaEntrega(p);
        return dia < hoy ? hoy : dia;
      }
      return diaFinalizacion(p);
    };
    const grupos = new Map<string, PedidoData[]>();
    for (const p of pedidos) {
      const clave = `${p.punto?.id ?? '?'}|${diaEfectivo(p)}`;
      const arr = grupos.get(clave);
      if (arr) arr.push(p);
      else grupos.set(clave, [p]);
    }
    for (const grupo of grupos.values()) {
      grupo.sort((a, b) => {
        const ta = a.fecha ? new Date(String(a.fecha)).getTime() : 0;
        const tb = b.fecha ? new Date(String(b.fecha)).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return String(a.id ?? '') < String(b.id ?? '') ? -1 : 1;
      });
      grupo.forEach((p, i) => {
        p.numeroDia = i + 1;
      });
    }
  }

  /**
   * Sobrescribe la información personal del cliente en cada pedido con los
   * datos actuales de la tabla `clientes` (buscando por NIT/cédula). Así, las
   * correcciones hechas en el módulo de Clientes se reflejan en televentas,
   * despacho y comanda sin tener que anular el pedido. El NIT es la llave y no
   * se modifica; solo se actualiza la información personal.
   */
  private async refrescarClientes(pedidos: PedidoData[]): Promise<void> {
    const nits = new Set<string>();
    for (const p of pedidos) {
      const nit = p.cliente?.nit_cedula
        ? String(p.cliente.nit_cedula).trim()
        : '';
      if (nit) nits.add(nit);
    }
    if (nits.size === 0) return;

    const res = await this.pool.query<{
      nit_cedula: string;
      nombre: string | null;
      direccion: string | null;
      referencia: string | null;
      barrio: string | null;
      ciudad: string | null;
      telefono: string | null;
      correo: string | null;
      lat: number | null;
      lng: number | null;
      horeca: boolean | null;
    }>(
      `SELECT nit_cedula, nombre, direccion, referencia, barrio, ciudad,
              telefono, correo, lat, lng, horeca
         FROM clientes
        WHERE nit_cedula = ANY($1)`,
      [[...nits]],
    );

    const porNit = new Map<string, (typeof res.rows)[number]>();
    for (const row of res.rows) {
      porNit.set(String(row.nit_cedula).trim(), row);
    }

    for (const p of pedidos) {
      const nit = p.cliente?.nit_cedula
        ? String(p.cliente.nit_cedula).trim()
        : '';
      if (!nit) continue;
      const actual = porNit.get(nit);
      if (!actual) continue;
      p.cliente = {
        ...p.cliente,
        nit_cedula: nit,
        nombre: actual.nombre ?? undefined,
        direccion: actual.direccion ?? undefined,
        referencia: actual.referencia ?? undefined,
        barrio: actual.barrio ?? undefined,
        ciudad: actual.ciudad ?? undefined,
        telefono: actual.telefono ?? undefined,
        correo: actual.correo ?? undefined,
        lat: actual.lat,
        lng: actual.lng,
        horeca: actual.horeca ?? undefined,
      };
    }
  }

  /**
   * Crea o actualiza un pedido (upsert por id).
   *
   * Para pedidos NUEVOS, el consecutivo y la comanda se asignan aquí, en el
   * servidor, de forma atómica por punto de venta: se toma un lock de asesoría
   * (`pg_advisory_xact_lock`) con la clave del punto dentro de una transacción,
   * de modo que dos ventas simultáneas del mismo punto se serializan y "la
   * primera en llegar" toma el consecutivo. Así se evitan consecutivos
   * duplicados. En ediciones se conserva el consecutivo/comanda/fecha original.
   *
   * Devuelve el pedido final ya con el consecutivo y la comanda definitivos.
   */
  async guardar(pedido: PedidoData, user?: JwtPayload): Promise<PedidoData> {
    const id = String(pedido.id ?? '').trim();
    if (!id) {
      throw new Error('El pedido no tiene id.');
    }
    const puntoId = pedido.punto?.id ? String(pedido.punto.id) : null;
    const finalPedido: PedidoData = { ...pedido };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Bloquea la fila si el pedido ya existe (edición) para serializar cambios.
      const prev = await client.query<{
        consecutivo: number | null;
        data: PedidoData;
      }>(`SELECT consecutivo, data FROM pedidos WHERE id = $1 FOR UPDATE`, [id]);

      const prevData: PedidoData | null = prev.rowCount
        ? (prev.rows[0].data ?? {})
        : null;

      if (prev.rowCount) {
        // Edición: conserva el consecutivo, la comanda y la fecha originales
        // para no romper la trazabilidad ni reasignar números.
        finalPedido.consecutivo =
          (typeof prevData!.consecutivo === 'number'
            ? prevData!.consecutivo
            : prev.rows[0].consecutivo) ?? finalPedido.consecutivo;
        finalPedido.comanda = prevData!.comanda ?? finalPedido.comanda;
        finalPedido.fecha = prevData!.fecha ?? finalPedido.fecha;
        // Conserva el número del día original (no se reasigna al editar).
        finalPedido.numeroDia = prevData!.numeroDia ?? finalPedido.numeroDia;
      } else if (puntoId) {
        // Nuevo pedido: asigna el consecutivo de forma atómica por punto.
        // El lock se libera automáticamente al terminar la transacción.
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `pedido_consecutivo:${puntoId}`,
        ]);
        const max = await client.query<{ siguiente: number }>(
          `SELECT COALESCE(MAX(consecutivo), 0) + 1 AS siguiente
             FROM pedidos WHERE punto_id = $1`,
          [puntoId],
        );
        const consecutivo = Number(max.rows[0].siguiente) || 1;
        // Formato: {número del punto}CS{consecutivo de 8 dígitos}. Ej: 1CS00000001
        const numeroPunto = (
          String(pedido.punto?.codigo ?? '').match(/\d+/)?.[0] ?? ''
        ).trim();
        finalPedido.consecutivo = consecutivo;
        finalPedido.comanda = `${numeroPunto}CS${String(consecutivo).padStart(8, '0')}`;

        // Número del día (turno) por punto, con reinicio diario RODANTE: se
        // calcula con la MISMA lógica que la lectura (asignarNumerosDia), que
        // arrastra los pendientes de días anteriores al día de hoy y reinicia
        // la numeración por punto. Bajo el mismo lock del punto -> dos pedidos
        // simultáneos del mismo punto nunca reciben el mismo número.
        const existentes = await client.query<{ data: PedidoData }>(
          `SELECT data FROM pedidos WHERE punto_id = $1`,
          [puntoId],
        );
        const listaPunto = existentes.rows.map((r) => r.data ?? {});
        listaPunto.push(finalPedido);
        this.asignarNumerosDia(listaPunto);
        finalPedido.numeroDia =
          listaPunto.find((p) => String(p.id ?? '') === id)?.numeroDia ?? 1;
      }

      const consecutivo =
        typeof finalPedido.consecutivo === 'number'
          ? finalPedido.consecutivo
          : null;
      const estado = finalPedido.estado ? String(finalPedido.estado) : null;
      const anulado = finalPedido.anulado === true;
      const fecha = finalPedido.fecha
        ? new Date(String(finalPedido.fecha))
        : null;

      // --- Trazabilidad: registra creación / cambio de estado / anulación ---
      const trazaPrevia: TrazaEvento[] = Array.isArray(prevData?.trazabilidad)
        ? (prevData!.trazabilidad as TrazaEvento[])
        : [];
      const estadoAnterior = prevData
        ? prevData.estado
          ? String(prevData.estado)
          : null
        : null;
      const anuladoAnterior = prevData ? prevData.anulado === true : false;

      let tipoEvento: TrazaEvento['tipo'] | null = null;
      if (!prev.rowCount) {
        tipoEvento = 'creacion';
      } else if (anulado && !anuladoAnterior) {
        tipoEvento = 'anulacion';
      } else if (estado !== estadoAnterior) {
        tipoEvento = 'estado';
      }

      if (tipoEvento) {
        let usuarioNombre: string | null = null;
        let usuarioCedula: string | null = user?.cedula ?? null;
        if (user?.sub) {
          try {
            const u = await client.query<{ nombre: string; cedula: string }>(
              `SELECT nombre, cedula FROM usuarios WHERE id = $1::bigint LIMIT 1`,
              [user.sub],
            );
            usuarioNombre = u.rows[0]?.nombre ?? null;
            usuarioCedula = u.rows[0]?.cedula ?? usuarioCedula;
          } catch {
            /* si falla la consulta, se registra sin nombre */
          }
        }
        const evento: TrazaEvento = {
          tipo: tipoEvento,
          estadoAnterior,
          estadoNuevo: estado,
          fecha: new Date().toISOString(),
          usuarioId: user?.sub ?? null,
          usuarioNombre,
          usuarioCedula,
        };
        finalPedido.trazabilidad = [...trazaPrevia, evento];
      } else {
        finalPedido.trazabilidad = trazaPrevia;
      }

      await client.query(
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
        [
          id,
          consecutivo,
          puntoId,
          estado,
          anulado,
          fecha,
          JSON.stringify(finalPedido),
        ],
      );

      await client.query('COMMIT');
      return finalPedido;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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
   * Calcula los campos de despacho de un pedido (el MISMO mapeo que usa el
   * Excel de ruteo). Lo comparten el Excel y el envío directo a Drivin.
   */
  private async construirDespacho(id: string, replica?: number) {
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
    // Réplica: el mismo pedido se manda por partes. El ERP lo entiende como el
    // mismo pedido; el sufijo "-N" indica que es una réplica del consecutivo.
    const sufijoReplica =
      typeof replica === 'number' && replica >= 1 && replica <= 5
        ? `-${replica}`
        : '';
    const comanda = `${String(pedido.comanda ?? '')}${sufijoReplica}`;

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
      // La ventana (promesa) se deja TAL CUAL la configura la app.
      fechaEntrega = fechaISO(creado);
      inicioVentana = horaHM(creado);
      finVentana = horaHM(new Date(creado.getTime() + 2 * 60 * 60 * 1000));
      prioridad = '2.00';
    }

    // Departamento (Región) a partir de la ciudad del cliente.
    let region = '';
    try {
      const depto = await this.ubicaciones.departamentoDeCiudad(cliente.ciudad);
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

    return {
      comanda,
      kilos,
      fechaEntrega,
      inicioVentana,
      finVentana,
      prioridad,
      region,
      nit,
      nombre,
      telefono,
      referencia,
      tipo,
      proveedor,
      codigoProveedor,
      direccion: String(cliente.direccion ?? ''),
      barrio: String(cliente.barrio ?? ''),
      ciudad: String(cliente.ciudad ?? ''),
    };
  }

  /**
   * Genera el archivo Excel de despacho para un pedido, con el formato exacto
   * que exige el software de ruteo (100 columnas). Devuelve el nombre y buffer.
   */
  async generarExcelDespacho(
    id: string,
    replica?: number,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const d = await this.construirDespacho(id, replica);

    // Fila completa: 100 columnas en el orden de CABECERA_DESPACHO.
    const fila: (string | number)[] = new Array(
      CABECERA_DESPACHO.length,
    ).fill('');
    fila[0] = d.fechaEntrega; // Fecha Maxima de Entrega
    fila[3] = d.comanda; // Código de despacho*
    fila[4] = d.kilos.toFixed(2); // Unidades_1* (siempre con 2 decimales, ej. 1.00)
    fila[7] = d.prioridad; // Prioridad
    fila[8] = d.nit; // Código de dirección*
    fila[9] = d.nombre; // Nombre dirección
    fila[10] = d.nombre; // Nombre cliente
    fila[11] = d.tipo; // Tipo (PDV {localidad})
    fila[12] = d.direccion; // Dirección 1*
    fila[13] = d.referencia; // Referencias
    fila[15] = d.barrio; // Comuna*
    fila[16] = d.ciudad; // Provincia
    fila[17] = d.region; // Región
    fila[18] = 'Colombia'; // País*
    fila[22] = 10; // Tiempo de servicio
    fila[23] = d.inicioVentana; // Inicio Ventana 1
    fila[24] = d.finVentana; // Fin Ventana 1
    fila[27] = d.telefono; // Telefono de Contacto
    fila[34] = d.proveedor; // Proveedor
    fila[37] = d.nit; // Código cliente
    fila[38] = d.nombre; // Nombre de contacto
    fila[70] = d.telefono; // Telefono contacto cerca del lugar
    fila[71] = d.telefono; // Telefono contacto entrega
    fila[88] = d.codigoProveedor; // Código proveedor

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

    const consecutivo = d.comanda || String(id);
    const filename = `${consecutivo}_${fechaGen}_${horaGen}.xlsx`;
    return { filename, buffer };
  }

  /**
   * Envía un pedido directamente a Drivin (endpoint external/v2/orders), con el
   * MISMO mapeo de campos que el Excel de cargue. Reemplaza el flujo de Excel.
   */
  async enviarADrivin(
    id: string,
    replica?: number,
  ): Promise<{ status: number; comanda: string; respuesta: unknown }> {
    const apiKey = this.config.get<string>('DRIVIN_API_KEY');
    if (!apiKey) {
      throw new Error(
        'Falta DRIVIN_API_KEY en el backend (.env) para enviar a Drivin.',
      );
    }
    const baseUrl = this.config.get<string>(
      'DRIVIN_ORDERS_URL',
      'https://external.driv.in/api/external/v2/orders',
    );
    const schema = this.config.get<string>('DRIVIN_SCHEMA_CODE', '01');
    const url = `${baseUrl}?schema_code=${encodeURIComponent(schema)}`;

    const d = await this.construirDespacho(id, replica);

    const body = {
      clients: [
        {
          code: d.nit,
          address: d.direccion,
          reference: d.referencia,
          city: d.barrio,
          county: d.ciudad,
          state: d.region,
          country: 'Colombia',
          name: d.nombre,
          client_name: d.nombre,
          client_code: d.nit,
          address_type: d.tipo,
          contact_phone: d.telefono,
          service_time: 10,
          time_windows: [{ start: d.inicioVentana, end: d.finVentana }],
          orders: [
            {
              code: d.comanda,
              alt_code: null,
              description: null,
              category: 'Delivery',
              units_1: Number(d.kilos.toFixed(2)),
              units_2: null,
              units_3: null,
              position: 1,
              delivery_date: d.fechaEntrega,
              custom_1: null,
              custom_2: null,
              custom_3: null,
              supplier_code: d.codigoProveedor || null,
              supplier_name: d.proveedor || null,
              items: [],
              billing_information: { folio: null },
            },
          ],
        },
      ],
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
    });
    const texto = await resp.text();
    let data: unknown;
    try {
      data = texto ? JSON.parse(texto) : null;
    } catch {
      data = texto;
    }
    if (!resp.ok) {
      const detalle =
        typeof data === 'string' ? data : JSON.stringify(data ?? {});
      throw new Error(`Drivin respondió ${resp.status}: ${detalle}`);
    }
    return { status: resp.status, comanda: d.comanda, respuesta: data };
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
