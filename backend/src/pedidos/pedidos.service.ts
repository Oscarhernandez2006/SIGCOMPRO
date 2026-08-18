import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import * as https from 'https';
import { promises as dnsPromises } from 'dns';
import { Resolver as DnsResolver } from 'dns/promises';
import { Pool, PoolClient } from 'pg';
import { ConfigService } from '@nestjs/config';
import { PG_POOL } from '../database/database.module';
import { UbicacionesService } from '../ubicaciones/ubicaciones.service';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';

/** Evento de trazabilidad del pedido (creación / cambio de estado / anulación). */
export interface TrazaEvento {  tipo: 'creacion' | 'estado' | 'anulacion' | 'cancelacion' | 'edicion';
  estadoAnterior?: string | null;
  estadoNuevo?: string | null;
  /** Motivo de la anulación/cancelación (solo en esos eventos). */
  motivo?: string | null;
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
  /** Día (YYYY-MM-DD, Bogotá) para el que es válido numeroDia (congela el turno). */
  numeroDiaFecha?: string;
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

/** Escenario de ruteo de Drivin (GET external/v2/scenarios). */
interface DrivinScenario {
  token: string;
  deploy_date?: string;
  description?: string | null;
  status?: string;
  schema_name?: string;
  schema_code?: string;
  created_at?: string;
}

/** Vehículo (domiciliario) de Drivin (GET external/v2/vehicles). */
interface DrivinVehicle {  id?: number;
  code?: string;
  is_active?: boolean;
  vehicle_type?: string | null;
  driver?: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    dni?: string | null;
  } | null;
  /** CSV de flotas, ej. "Domiciliarios PDV La 93,Domiciliarios PDV Olaya". */
  fleets?: string | null;
}

/** Domiciliario (vehículo) simplificado para el frontend. */
export interface DomiciliarioDrivin {
  code: string;
  nombre: string;
  tipo?: string | null;
}

export interface EstadoPedidos {
  pedidos: PedidoData[];
  meta: Record<string, DespachoMeta>;
  impresos: string[];
  /**
   * Instante del servidor de esta respuesta. El cliente lo reenvía como `desde`
   * en el siguiente poll para recibir SOLO lo que cambió (polling incremental).
   */
  ahora: string;
}

@Injectable()
export class PedidosService implements OnModuleInit {
  private readonly logger = new Logger(PedidosService.name);
  /** Caché en memoria de scenarios de Drivin por fecha (TTL corto). */
  private cacheScenarios = new Map<
    string,
    { ts: number; datos: DrivinScenario[] }
  >();
  /** Caché en memoria de vehículos (domiciliarios) de Drivin (TTL corto). */
  private cacheVehiculos: { ts: number; datos: DrivinVehicle[] } | null = null;
  /** Tiempo de vida de la caché de Drivin (ms). Reducido a 2 minutos para consultas más rápidas. */
  private readonly DRIVIN_TTL = 2 * 60 * 1000;
  /** IP resuelta de external.driv.in (cache), para saltar el DNS intermitente. */
  private drivinIp: { ip: string; ts: number } | null = null;
  /** Caché del mapa de asignaciones (comanda -> vehículo) de Drivin. */
  private cacheAsignaciones: {
    ts: number;
    datos: Record<string, { code: string; nombre: string } | null>;
  } | null = null;
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
    // Índice para el polling incremental (WHERE actualizado_en > desde).
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_pedidos_actualizado ON pedidos (actualizado_en)`,
    );
    // Índices por punto: las consultas de creación (MAX(consecutivo) y la
    // renumeración del turno del día) filtran por punto_id. Sin estos, cada
    // creación hacía un SEQ SCAN de toda la tabla bajo el lock del punto, y con
    // el tiempo confirmar un pedido tardaba tanto que se caía por timeout.
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_pedidos_punto ON pedidos (punto_id)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_pedidos_punto_consecutivo ON pedidos (punto_id, consecutivo)`,
    );
    // Contador del "número del día" (turno) por punto y día (YYYY-MM-DD Bogotá).
    // Reinicia solo cada día (clave por día) y se incrementa de forma atómica
    // (O(1), sin escanear pedidos), evitando el timeout al crear pedidos.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS contador_numero_dia (
        punto_id text NOT NULL,
        dia text NOT NULL,
        ultimo int NOT NULL DEFAULT 0,
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (punto_id, dia)
      )
    `);
    // Comprobantes de pago (imagen en base64) por pedido. Se guardan aparte de
    // la metadata para no inflar la carga masiva de pedidos (en la metadata solo
    // queda una bandera liviana: comprobante = { tiene, confirmado }).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS comprobantes_pago (
        pedido_id text PRIMARY KEY,
        imagen text NOT NULL,
        mime text,
        confirmado boolean NOT NULL DEFAULT false,
        subido_por text,
        confirmado_por text,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Múltiples imágenes por comprobante (array jsonb de { imagen, mime }). La
    // columna `imagen` (única) queda como legado; se migra a `imagenes` al leer/
    // subir. `imagen` se hace opcional para no exigirla en filas nuevas.
    await this.pool.query(
      `ALTER TABLE comprobantes_pago ADD COLUMN IF NOT EXISTS imagenes jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await this.pool.query(
      `ALTER TABLE comprobantes_pago ALTER COLUMN imagen DROP NOT NULL`,
    );
  }

  /** Devuelve todos los pedidos junto con su metadata e impresos. */
  async estado(
    desde?: string,
    rango?: string,
    fecha?: string,
  ): Promise<EstadoPedidos> {
    // Conjunto de trabajo. Por DEFECTO (cuadre de caja, históricos, dashboard)
    // = activos (cualquier fecha) + finalizados de los últimos N días. Pedidos y
    // Despacho piden rango='hoy' (mucho más liviano) y cargan días ANTERIORES
    // solo cuando el usuario aplica ese filtro (rango='fecha'&fecha=YYYY-MM-DD).
    const dias =
      Number(this.config.get<string>('PEDIDOS_DIAS_RECIENTES', '3')) || 3;
    // Polling INCREMENTAL: si el cliente envía `desde` (el `ahora` que recibió
    // en su última respuesta), solo se devuelven los pedidos del conjunto de
    // trabajo que CAMBIARON desde ese instante (actualizado_en > desde). Así
    // cada poll pasa de varios MB a unos KB. Sin `desde` = primera carga total.
    const desdeValido =
      desde && !Number.isNaN(Date.parse(desde)) ? desde : null;
    const ahora = new Date().toISOString();

    // Día de ENTREGA efectivo (zona Bogotá): la fecha programada si el pedido se
    // dejó para otro día; si no, el día de creación.
    const diaEfectivo = `
      CASE
        WHEN (data->>'entregaProgramada') = 'true'
             AND COALESCE(data->>'fechaProgramada', '') <> ''
        THEN (data->>'fechaProgramada')::date
        ELSE (fecha AT TIME ZONE 'America/Bogota')::date
      END`;
    const hoy = `(now() AT TIME ZONE 'America/Bogota')::date`;
    // "Activo" = aún en proceso (NO terminal). Excluye TODOS los estados
    // finales, incluidos los posteriores al despacho que trae Drivin
    // (entregado / en tránsito / cancelado). Si no se excluyeran, el conjunto de
    // "activos" crecería sin límite (cada pedido entregado quedaría "activo"
    // para siempre) e inflaría la consulta por defecto hasta saturarla.
    const activo = `(anulado = false AND lower(coalesce(estado, '')) NOT IN ('despachado', 'anulado', 'entregado', 'cancelado', 'en tránsito', 'en transito'))`;

    const params: unknown[] = [];
    let scope: string;
    if (rango === 'hoy') {
      // HOY: día de entrega = hoy (cualquier estado) + TODO lo que sigue activo
      // (arrastrados de días anteriores y programados a futuro, que el flujo de
      // despacho necesita). Excluye los FINALIZADOS de días anteriores (el
      // bulto que Pedidos/Despacho nunca muestran en la vista de hoy).
      scope = `((${diaEfectivo}) = ${hoy} OR ${activo})`;
    } else if (rango === 'posteriores') {
      // POSTERIORES: programados para un día futuro.
      scope = `((${diaEfectivo}) > ${hoy})`;
    } else if (rango === 'fecha' && fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      // Un día CONCRETO (para ver días anteriores bajo demanda).
      params.push(fecha);
      scope = `((${diaEfectivo}) = $${params.length}::date)`;
    } else {
      // Comportamiento previo (reciente): activos + últimos N días.
      scope = `(${activo} OR fecha >= (now() - make_interval(days => ${dias})))`;
    }
    params.push(desdeValido);
    const idxDesde = params.length;

    const res = await this.pool.query<{
      id: string;
      impreso: boolean;
      data: PedidoData;
      meta: DespachoMeta;
    }>(
      // Se OMITE data->'trazabilidad' (el historial completo, que crece con cada
      // cambio de estado y llega a ser ~60% del blob): no se usa en el listado y
      // este endpoint se refresca por polling cada pocos segundos. La
      // trazabilidad se consulta aparte y bajo demanda (ver trazabilidad()).
      `SELECT id, impreso, (data - 'trazabilidad') AS data, meta
       FROM pedidos
       WHERE ${scope}
         AND ($${idxDesde}::timestamptz IS NULL OR actualizado_en > $${idxDesde}::timestamptz)
       ORDER BY fecha DESC NULLS LAST, creado_en DESC`,
      params,
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
    // El número de turno (numeroDia) se asigna atómicamente al CREAR el pedido y
    // queda GUARDADO en el blob; NO se recalcula al leer, para que un MISMO
    // pedido conserve SIEMPRE su número hasta su realización. (Antes se
    // recalculaba en la carga completa y podía cambiar, p. ej. 87 -> 88, según
    // los arrastrados u otros pedidos del día.)
    return { pedidos, meta, impresos, ahora };
  }

  /**
   * Trazabilidad (historial) de un pedido puntual. Se consulta BAJO DEMANDA al
   * abrir el modal, porque el listado (estado()) omite este arreglo para no
   * inflar el payload que se refresca por polling cada pocos segundos.
   */
  async trazabilidad(id: string): Promise<{ trazabilidad: TrazaEvento[] }> {
    const res = await this.pool.query<{ trazabilidad: TrazaEvento[] | null }>(
      `SELECT COALESCE(data->'trazabilidad', '[]'::jsonb) AS trazabilidad
         FROM pedidos WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (res.rowCount === 0) throw new NotFoundException('Pedido no encontrado');
    return { trazabilidad: res.rows[0].trazabilidad ?? [] };
  }

  /**
   * Últimos pedidos NO anulados de un cliente (por su id), de CUALQUIER fecha,
   * para la función "espejo" (clonar un pedido anterior). Se omite la
   * trazabilidad (no se usa aquí) y se limita para no traer todo el historial.
   */
  async porCliente(
    clienteId: string,
    limit?: number,
  ): Promise<{ pedidos: PedidoData[] }> {
    const id = String(clienteId ?? '').trim();
    if (!id) return { pedidos: [] };
    const n = Math.min(Math.max(Number(limit) || 15, 1), 50);
    const res = await this.pool.query<{ data: PedidoData }>(
      `SELECT (data - 'trazabilidad') AS data
         FROM pedidos
        WHERE anulado = false
          AND data->'cliente'->>'id' = $1
        ORDER BY fecha DESC NULLS LAST, creado_en DESC
        LIMIT $2`,
      [id, n],
    );
    return { pedidos: res.rows.map((r) => r.data) };
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

  /** Día de entrega (YYYY-MM-DD, Bogotá): el programado o el de creación. */
  private diaEntregaDe(p: PedidoData): string {
    return p.entregaProgramada && p.fechaProgramada
      ? String(p.fechaProgramada)
      : this.diaBogota(p.fecha ? String(p.fecha) : null);
  }

  /**
   * Siguiente "número del día" (turno) del punto para un día dado, usando un
   * CONTADOR dedicado por (punto, día). Es O(1): NO escanea pedidos. El contador
   * reinicia solo cada día (clave por día); la PRIMERA vez que se usa un
   * (punto, día) se siembra con el máximo ya existente ese día (para no chocar
   * con números previos) y luego solo incrementa. Así los posteriores toman el
   * número del día que les corresponde y el turno reinicia cada jornada.
   */
  private async siguienteNumeroDia(
    client: PoolClient,
    puntoId: string,
    dia: string,
  ): Promise<number> {
    // Camino rápido: si ya existe el contador del día, solo incrementa.
    const upd = await client.query<{ ultimo: number }>(
      `UPDATE contador_numero_dia
          SET ultimo = ultimo + 1, actualizado_en = now()
        WHERE punto_id = $1 AND dia = $2
        RETURNING ultimo`,
      [puntoId, dia],
    );
    if (upd.rowCount) return Number(upd.rows[0].ultimo) || 1;

    // Primera vez en este (punto, día): siembra con el máximo ya usado ese día.
    const seed = await this.maxNumeroDelDia(client, puntoId, dia);
    const ins = await client.query<{ ultimo: number }>(
      `INSERT INTO contador_numero_dia (punto_id, dia, ultimo)
       VALUES ($1, $2, $3)
       ON CONFLICT (punto_id, dia)
         DO UPDATE SET ultimo = contador_numero_dia.ultimo + 1, actualizado_en = now()
       RETURNING ultimo`,
      [puntoId, dia, seed + 1],
    );
    return Number(ins.rows[0]?.ultimo) || 1;
  }

  /**
   * Máximo `numeroDia` ya usado en un día `d` para el punto (para SEMBRAR el
   * contador la primera vez). Cuenta los pedidos con numeroDiaFecha = d y, por
   * compatibilidad, los antiguos sin numeroDiaFecha cuyo día de entrega es d.
   */
  private async maxNumeroDelDia(
    client: PoolClient,
    puntoId: string,
    d: string,
  ): Promise<number> {
    const diaEntregaSql = `
      CASE
        WHEN (data->>'entregaProgramada') = 'true'
             AND COALESCE(data->>'fechaProgramada', '') <> ''
        THEN (data->>'fechaProgramada')
        ELSE to_char((fecha AT TIME ZONE 'America/Bogota'), 'YYYY-MM-DD')
      END`;
    const r = await client.query<{ mx: number }>(
      `SELECT COALESCE(MAX((data->>'numeroDia')::int), 0) AS mx
         FROM pedidos
        WHERE punto_id = $1
          AND ( (data->>'numeroDiaFecha') = $2
                OR ( COALESCE(data->>'numeroDiaFecha','') = ''
                     AND (${diaEntregaSql}) = $2 ) )`,
      [puntoId, d],
    );
    return Number(r.rows[0]?.mx) || 0;
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
        meta: DespachoMeta;
      }>(
        `SELECT consecutivo, data, meta FROM pedidos WHERE id = $1 FOR UPDATE`,
        [id],
      );

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
        // Día al que pertenece el número guardado vs día de entrega ACTUAL.
        const diaAnterior = prevData!.numeroDiaFecha
          ? String(prevData!.numeroDiaFecha)
          : this.diaEntregaDe(prevData!);
        const diaNuevoEdit = this.diaEntregaDe(finalPedido);
        if (puntoId && diaNuevoEdit !== diaAnterior) {
          // Cambió el día de entrega (p. ej. pasó a POSTERIOR o cambió la fecha
          // programada): REASIGNA el número del día para el nuevo día en vez de
          // conservar el del día anterior (así el posterior toma el turno que le
          // corresponde en su día de despacho).
          await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
            `pedido_consecutivo:${puntoId}`,
          ]);
          finalPedido.numeroDia = await this.siguienteNumeroDia(
            client,
            puntoId,
            diaNuevoEdit,
          );
          finalPedido.numeroDiaFecha = diaNuevoEdit;
        } else {
          // Mismo día de entrega: conserva el número del día y su día.
          finalPedido.numeroDia = prevData!.numeroDia ?? finalPedido.numeroDia;
          finalPedido.numeroDiaFecha =
            prevData!.numeroDiaFecha ?? finalPedido.numeroDiaFecha;
        }
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

        // Número del día (turno) por punto: contador atómico por (punto, día).
        // Reinicia cada día y el posterior toma el número del día de su entrega.
        const diaNuevo = this.diaEntregaDe(finalPedido);
        finalPedido.numeroDia = await this.siguienteNumeroDia(
          client,
          puntoId,
          diaNuevo,
        );
        finalPedido.numeroDiaFecha = diaNuevo;
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

      // Integridad de flujo: no se puede marcar un pedido como "Facturado" o
      // "Despachado" sin número y valor de factura. La factura vive en la
      // metadata de despacho (columna meta), guardada antes de facturar.
      const normEstado = (s: unknown) => String(s ?? '').trim().toLowerCase();
      const nuevoEstadoNorm = normEstado(estado);
      const entraAFacturadoODespachado =
        (nuevoEstadoNorm === 'facturado' || nuevoEstadoNorm === 'despachado') &&
        nuevoEstadoNorm !== normEstado(estadoAnterior);
      if (!anulado && entraAFacturadoODespachado) {
        const metaActual: DespachoMeta = prev.rowCount
          ? (prev.rows[0].meta ?? {})
          : {};
        const numFactura = String(metaActual.facturaNumero ?? '').trim();
        const valFactura = Number(metaActual.facturaValor);
        if (!numFactura || !Number.isFinite(valFactura) || valFactura <= 0) {
          throw new BadRequestException(
            'No se puede facturar o despachar sin número y valor de factura.',
          );
        }
      }

      // Contenido comparable del pedido para detectar EDICIONES (campos que el
      // usuario puede cambiar). Orden fijo para no depender del orden de llaves.
      const contenidoComparable = (d: PedidoData | null): string =>
        JSON.stringify({
          pago: d?.pago ?? null,
          total: (d as { total?: unknown } | null)?.total ?? null,
          observacion:
            (d as { observacion?: unknown } | null)?.observacion ?? null,
          entrega: (d as { entrega?: unknown } | null)?.entrega ?? null,
          entregaProgramada: d?.entregaProgramada ?? null,
          fechaProgramada: d?.fechaProgramada ?? null,
          horaDespacho:
            (d as { horaDespacho?: unknown } | null)?.horaDespacho ?? null,
          cliente: d?.cliente ?? null,
          carrito: d?.carrito ?? null,
        });

      let tipoEvento: TrazaEvento['tipo'] | null = null;
      if (!prev.rowCount) {
        tipoEvento = 'creacion';
      } else if (anulado && !anuladoAnterior) {
        tipoEvento =
          nuevoEstadoNorm === 'cancelado' ? 'cancelacion' : 'anulacion';
      } else if (estado !== estadoAnterior) {
        tipoEvento = 'estado';
      } else if (
        !anulado &&
        contenidoComparable(prevData) !== contenidoComparable(finalPedido)
      ) {
        tipoEvento = 'edicion';
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
          motivo:
            tipoEvento === 'anulacion' || tipoEvento === 'cancelacion'
              ? finalPedido.motivo != null
                ? String(finalPedido.motivo)
                : null
              : null,
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

      // SINCRONIZACIÓN AUTOMÁTICA CON DRIVIN: Si se cancela el pedido,
      // notificar a Drivin para que actualice el estado allá también.
      // Se ejecuta de forma asíncrona (no-bloqueante) después de guardar.
      if (
        anulado &&
        !anuladoAnterior &&
        nuevoEstadoNorm === 'cancelado' &&
        finalPedido.comanda &&
        puntoId
      ) {
        const puntoNombre = finalPedido.punto?.nombre
          ? String(finalPedido.punto.nombre)
          : '';
        // Ejecutar en background, sin esperar respuesta
        this.cancelarEnDrivin(id, finalPedido.comanda, puntoId, puntoNombre).catch(
          (e) => {
            this.logger.error(
              `Error no controlado en cancelación async: ${String(e)}`,
            );
          },
        );
      }

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

  /** Devuelve el comprobante de pago (una o varias imágenes) de un pedido. */
  async obtenerComprobante(id: string): Promise<{
    imagenes: { imagen: string; mime: string | null }[];
    confirmado: boolean;
    subidoPor: string | null;
    confirmadoPor: string | null;
  } | null> {
    const res = await this.pool.query<{
      imagen: string | null;
      mime: string | null;
      imagenes: { imagen: string; mime: string | null }[] | null;
      confirmado: boolean;
      subido_por: string | null;
      confirmado_por: string | null;
    }>(
      `SELECT imagen, mime, imagenes, confirmado, subido_por, confirmado_por
         FROM comprobantes_pago WHERE pedido_id = $1`,
      [id],
    );
    const row = res.rows[0];
    if (!row) return null;
    // Preferimos el array `imagenes`; si está vacío pero hay `imagen` (legado),
    // devolvemos esa única imagen.
    let imagenes = Array.isArray(row.imagenes) ? row.imagenes : [];
    if (imagenes.length === 0 && row.imagen) {
      imagenes = [{ imagen: row.imagen, mime: row.mime }];
    }
    if (imagenes.length === 0) return null;
    return {
      imagenes,
      confirmado: row.confirmado,
      subidoPor: row.subido_por,
      confirmadoPor: row.confirmado_por,
    };
  }

  /**
   * AGREGA una imagen al comprobante de pago de un pedido (sin reemplazar las
   * anteriores). Al agregar una nueva, el comprobante queda SIN confirmar.
   */
  async guardarComprobante(
    id: string,
    imagen: string,
    mime: string | null,
    subidoPor?: string | null,
  ): Promise<{ id: string }> {
    if (!imagen || typeof imagen !== 'string') {
      throw new Error('Imagen de comprobante inválida');
    }
    await this.pool.query(
      `INSERT INTO comprobantes_pago (pedido_id, imagenes, confirmado, subido_por, actualizado_en)
       VALUES ($1, jsonb_build_array(jsonb_build_object('imagen', $2::text, 'mime', $3::text)), false, $4, now())
       ON CONFLICT (pedido_id) DO UPDATE SET
         imagenes = (
           CASE
             WHEN jsonb_array_length(COALESCE(comprobantes_pago.imagenes, '[]'::jsonb)) = 0
                  AND comprobantes_pago.imagen IS NOT NULL
             THEN jsonb_build_array(jsonb_build_object('imagen', comprobantes_pago.imagen, 'mime', comprobantes_pago.mime))
             ELSE COALESCE(comprobantes_pago.imagenes, '[]'::jsonb)
           END
         ) || jsonb_build_array(jsonb_build_object('imagen', $2::text, 'mime', $3::text)),
         confirmado = false,
         confirmado_por = NULL,
         subido_por = COALESCE(comprobantes_pago.subido_por, EXCLUDED.subido_por),
         actualizado_en = now()`,
      [id, imagen, mime ?? null, subidoPor ?? null],
    );
    await this.actualizarMeta(id, {
      comprobante: { tiene: true, confirmado: false },
    });
    return { id };
  }

  /** Confirma el comprobante de pago de un pedido (queda solo de lectura). */
  async confirmarComprobante(
    id: string,
    confirmadoPor?: string | null,
  ): Promise<{ id: string }> {
    await this.pool.query(
      `UPDATE comprobantes_pago
         SET confirmado = true, confirmado_por = $2, actualizado_en = now()
       WHERE pedido_id = $1`,
      [id, confirmadoPor ?? null],
    );
    await this.actualizarMeta(id, {
      comprobante: { tiene: true, confirmado: true },
    });
    return { id };
  }

  /**
   * Elimina el comprobante de pago de un pedido. Si se indica `indice`, borra
   * SOLO esa imagen (y si quedan más, el comprobante permanece). Sin `indice`,
   * borra todas las imágenes del pedido.
   */
  async eliminarComprobante(
    id: string,
    indice?: number,
  ): Promise<{ id: string }> {
    if (typeof indice === 'number' && Number.isInteger(indice) && indice >= 0) {
      // Migra el legado a `imagenes` y quita el elemento en la posición dada.
      const res = await this.pool.query<{ n: number }>(
        `UPDATE comprobantes_pago SET
           imagenes = (
             CASE
               WHEN jsonb_array_length(COALESCE(imagenes, '[]'::jsonb)) = 0 AND imagen IS NOT NULL
               THEN jsonb_build_array(jsonb_build_object('imagen', imagen, 'mime', mime))
               ELSE COALESCE(imagenes, '[]'::jsonb)
             END
           ) - $2::int,
           imagen = NULL,
           actualizado_en = now()
         WHERE pedido_id = $1
         RETURNING jsonb_array_length(imagenes) AS n`,
        [id, indice],
      );
      const quedan = res.rows[0]?.n ?? 0;
      if (quedan <= 0) {
        await this.pool.query(
          `DELETE FROM comprobantes_pago WHERE pedido_id = $1`,
          [id],
        );
        await this.actualizarMeta(id, { comprobante: null });
      } else {
        await this.actualizarMeta(id, {
          comprobante: { tiene: true, confirmado: false },
        });
      }
      return { id };
    }
    await this.pool.query(
      `DELETE FROM comprobantes_pago WHERE pedido_id = $1`,
      [id],
    );
    await this.actualizarMeta(id, { comprobante: null });
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
    const esReplica =
      typeof replica === 'number' && replica >= 1 && replica <= 5;
    const sufijoReplica = esReplica ? `-${replica}` : '';
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
    // Para una RÉPLICA se usa la fecha/hora del DÍA ACTUAL (no la del pedido
    // original), porque la réplica se despacha el día en que se sube a Drivin.
    const creado =
      esReplica || !pedido.fecha ? new Date() : new Date(String(pedido.fecha));
    const programado = !esReplica && pedido.entregaProgramada === true;
    // ¿El cliente RECOGE en el punto de venta? (no lleva domicilio)
    const esRecogePdv =
      String(pedido.entrega ?? '')
        .trim()
        .toLowerCase() === 'recoge';
    const fechaISO = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
    const horaHM = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);

    // Hora de despacho elegida en el pedido (HH:MM). Si viene, es la HORA FIN de
    // la ventana (compromiso máximo). El inicio se calcula restando 2 horas, así
    // "8" -> ventana 06:00–08:00. Para réplicas se ignora (usan la hora actual).
    const horaDespacho = String(
      (pedido as { horaDespacho?: string }).horaDespacho ?? '',
    ).trim();
    const tieneHora = !esReplica && /^\d{1,2}:\d{2}$/.test(horaDespacho);
    const normalizarHora = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10) || 0);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const restarDosHoras = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10) || 0);
      let total = h * 60 + m - 120;
      if (total < 0) total = 0;
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(
        total % 60,
      ).padStart(2, '0')}`;
    };

    let fechaEntrega: string;
    let inicioVentana: string;
    let finVentana: string;
    let prioridad: string;
    if (esRecogePdv) {
      // RECOGE en PDV: prioridad 4 y promesa DESDE la creación del pedido HASTA
      // las 7:00 PM (para un pedido programado, ese día a las 7:00 PM).
      finVentana = '19:00';
      if (programado) {
        const elegida = (pedido.fechaProgramada ?? '').trim();
        const manana = new Date(creado.getTime() + 24 * 60 * 60 * 1000);
        fechaEntrega = /^\d{4}-\d{2}-\d{2}$/.test(elegida)
          ? elegida
          : fechaISO(manana);
        inicioVentana = '08:00';
      } else {
        fechaEntrega = fechaISO(creado);
        inicioVentana = horaHM(creado);
      }
      // La ventana no puede iniciar después de la hora fin (7:00 PM).
      if (inicioVentana > finVentana) inicioVentana = finVentana;
      prioridad = '4.00';
    } else if (programado) {
      // Pedido con FECHA POSTERIOR (programado): entra a Drivin con prioridad 1
      // y ventana horaria FIJA de 8:00 AM a 10:00 AM en la fecha elegida.
      const elegida = (pedido.fechaProgramada ?? '').trim();
      // Se usa la fecha elegida tal cual (YYYY-MM-DD); si no hay, se cae a mañana.
      const manana = new Date(creado.getTime() + 24 * 60 * 60 * 1000);
      fechaEntrega = /^\d{4}-\d{2}-\d{2}$/.test(elegida)
        ? elegida
        : fechaISO(manana);
      inicioVentana = '08:00';
      finVentana = '10:00';
      prioridad = '1.00';
    } else {
      // Pedido para hoy: si hay hora de despacho, la ventana es (hora - 2h) a
      // hora (ej. "8" -> 06:00–08:00). Si no, ventana = creación a +2h.
      // Prioridad 2, o 3 si el pedido es GRANDE (>20 kg).
      fechaEntrega = fechaISO(creado);
      if (tieneHora) {
        inicioVentana = restarDosHoras(horaDespacho);
        finVentana = normalizarHora(horaDespacho);
      } else {
        inicioVentana = horaHM(creado);
        finVentana = horaHM(new Date(creado.getTime() + 2 * 60 * 60 * 1000));
      }
      prioridad = kilos > 20 ? '3.00' : '2.00';
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
    // Referencia (Drivin/Excel): SIEMPRE "nombre / referencia". Si el cliente
    // no tiene referencia, se conserva el separador -> "nombre / ".
    const refCliente = String(cliente.referencia ?? '').trim();
    const referencia = `${nombre} / ${refCliente}`;
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
      puntoNombre: String(punto.nombre ?? ''),
      puntoCodigo: String(punto.codigo ?? ''),
      direccion: String(cliente.direccion ?? ''),
      barrio: String(cliente.barrio ?? ''),
      ciudad: String(cliente.ciudad ?? ''),
      // Coordenadas del cliente (para que Drivin geocodifique la dirección).
      lat: typeof cliente.lat === 'number' ? cliente.lat : null,
      lng: typeof cliente.lng === 'number' ? cliente.lng : null,
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
   * Determina el schema_code de Drivin según el punto de venta. Se decide por el
   * NÚMERO del punto (prefijo del código, ej. "5CSXXXXX" -> 5), que es fiable
   * aunque el nombre use números romanos ("Alameda I" / "Alameda II"):
   *  - Punto 1  (La 93)       -> 01
   *  - Punto 2  (La 70)       -> 03
   *  - Punto 3  (La 43)       -> 02
   *  - Punto 4  (Alameda I)   -> 04
   *  - Punto 5  (Alameda II)  -> 05
   *  - Punto 6  (Olaya)       -> 06
   *  - Punto 7  (San Felipe)  -> 07
   *  - Cualquier otro punto   -> DRIVIN_SCHEMA_CODE del .env (por defecto 01).
   */
  private schemaDrivinPara(puntoCodigo: string, nombrePunto: string): string {
    const num = String(puntoCodigo ?? '').match(/^\d+/)?.[0] ?? '';
    const porNumero: Record<string, string> = {
      '1': '01', // La 93
      '2': '03', // La 70
      '3': '02', // La 43
      '4': '04', // Alameda I
      '5': '05', // Alameda II
      '6': '06', // Olaya
      '7': '07', // San Felipe
    };
    if (porNumero[num]) return porNumero[num];
    // Respaldo por nombre (por si el código no viniera): admite romanos.
    const nombre = (nombrePunto ?? '').toLowerCase();
    if (/alameda\s+ii\b/.test(nombre)) return '05';
    if (/alameda\s+i\b/.test(nombre) || nombre.includes('alameda')) return '04';
    if (nombre.includes('olaya')) return '06';
    if (nombre.includes('felipe')) return '07';
    if (/\b93\b/.test(nombre)) return '01';
    if (/\b70\b/.test(nombre)) return '03';
    if (/\b43\b/.test(nombre)) return '02';
    return this.config.get<string>('DRIVIN_SCHEMA_CODE', '01');
  }

  /**
   * Localidad del punto para casar con las flotas de Drivin (fleets), cuyo
   * formato es "Domiciliarios PDV <localidad>". Se decide por el NÚMERO del
   * punto (prefijo del código), con respaldo por nombre.
   */
  private localidadDrivin(puntoCodigo: string, nombrePunto: string): string {
    const num = String(puntoCodigo ?? '').match(/^\d+/)?.[0] ?? '';
    const porNumero: Record<string, string> = {
      '1': 'La 93',
      '2': 'La 70',
      '3': 'La 43',
      '4': 'Alameda I',
      '5': 'Alameda II',
      '6': 'Olaya',
      '7': 'San Felipe',
    };
    if (porNumero[num]) return porNumero[num];
    const nombre = (nombrePunto ?? '').toLowerCase();
    if (/alameda\s+ii\b/.test(nombre)) return 'Alameda II';
    if (/alameda\s+i\b/.test(nombre) || nombre.includes('alameda'))
      return 'Alameda I';
    if (nombre.includes('olaya')) return 'Olaya';
    if (nombre.includes('felipe')) return 'San Felipe';
    if (/\b93\b/.test(nombre)) return 'La 93';
    if (/\b70\b/.test(nombre)) return 'La 70';
    if (/\b43\b/.test(nombre)) return 'La 43';
    return '';
  }

  /**
   * GET autenticado a la API externa de Drivin. La API es intermitente (a veces
   * falla el primer intento), así que se REINTENTA hasta 3 veces con un pequeño
   * backoff antes de rendirse.
   */
  private async drivinGet<T>(path: string, version: 'v2' | 'v3' = 'v2'): Promise<T> {
    const apiKey = this.config.get<string>('DRIVIN_API_KEY');
    if (!apiKey) {
      throw new Error('Falta DRIVIN_API_KEY en el backend (.env).');
    }
    const INTENTOS = 3;
    let ultimoError: unknown;
    for (let intento = 1; intento <= INTENTOS; intento++) {
      try {
        const { status, text } = await this.drivinRequest('GET', path, apiKey, undefined, version);
        if (status < 200 || status >= 300) {
          throw new Error(`Drivin ${path} respondió ${status}: ${text}`);
        }
        return (text ? JSON.parse(text) : null) as T;
      } catch (e) {
        ultimoError = e;
        // Si falló por DNS, invalidamos la IP cacheada para re-resolver.
        this.drivinIp = null;
        if (intento < INTENTOS) {
          // Reducido de 400ms a 200ms para acelerar reintentos
          await new Promise((r) => setTimeout(r, 200 * intento));
        }
      }
    }
    throw ultimoError instanceof Error
      ? ultimoError
      : new Error(`Drivin ${path}: fallo tras ${INTENTOS} intentos`);
  }

  /**
   * Resuelve la IP de external.driv.in. Primero con el resolver del sistema y,
   * si falla (algunos DNS bloquean driv.in de forma intermitente), con un DNS
   * PÚBLICO (8.8.8.8 / 1.1.1.1). Se cachea 10 min.
   */
  private async resolveDrivinIp(): Promise<string> {
    const host = 'external.driv.in';
    if (this.drivinIp && Date.now() - this.drivinIp.ts < 10 * 60 * 1000) {
      return this.drivinIp.ip;
    }
    try {
      const res = await dnsPromises.lookup(host, { family: 4 });
      this.drivinIp = { ip: res.address, ts: Date.now() };
      return res.address;
    } catch {
      const resolver = new DnsResolver();
      resolver.setServers(['8.8.8.8', '1.1.1.1']);
      const ips = await resolver.resolve4(host);
      if (!ips.length) throw new Error('Sin IP para external.driv.in');
      this.drivinIp = { ip: ips[0], ts: Date.now() };
      return ips[0];
    }
  }

  /**
   * Petición HTTPS a la API de Drivin conectando por IP (para saltar el DNS del
   * sistema cuando bloquea driv.in), manteniendo el certificado con SNI.
   */
  private async drivinRequest(
    method: string,
    path: string,
    apiKey: string,
    body?: string,
    version: 'v2' | 'v3' = 'v2',
  ): Promise<{ status: number; text: string }> {
    const host = 'external.driv.in';
    const ip = await this.resolveDrivinIp();
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: ip,
          servername: host, // SNI + validación de certificado para external.driv.in
          port: 443,
          path: `/api/external/${version}${path}`,
          method,
          headers: {
            'X-API-Key': apiKey,
            Host: host,
            ...(body
              ? {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(body),
                }
              : {}),
          },
          timeout: 10000, // Reducido de 15s a 10s para consultas más rápidas
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (data += c));
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, text: data }),
          );
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Drivin: timeout')));
      if (body) req.write(body);
      req.end();
    });
  }

  /** Scenarios de Drivin para una fecha (YYYY-MM-DD), con caché por fecha. */
  private async drivinScenarios(date: string): Promise<DrivinScenario[]> {
    const cached = this.cacheScenarios.get(date);
    if (cached && Date.now() - cached.ts < this.DRIVIN_TTL) {
      return cached.datos;
    }
    const r = await this.drivinGet<{ response?: DrivinScenario[] }>(
      `/scenarios?date=${encodeURIComponent(date)}`,
    );
    const datos = Array.isArray(r?.response) ? r.response : [];
    this.cacheScenarios.set(date, { ts: Date.now(), datos });
    return datos;
  }

  /** Vehículos (domiciliarios) de Drivin, con caché. */
  private async drivinVehicles(): Promise<DrivinVehicle[]> {
    if (
      this.cacheVehiculos &&
      Date.now() - this.cacheVehiculos.ts < this.DRIVIN_TTL
    ) {
      return this.cacheVehiculos.datos;
    }
    const r = await this.drivinGet<{ response?: DrivinVehicle[] }>(`/vehicles`);
    const datos = Array.isArray(r?.response) ? r.response : [];
    this.cacheVehiculos = { ts: Date.now(), datos };
    return datos;
  }

  /**
   * Token del scenario de Drivin de un punto (por schema_code) para un DÍA
   * dado (YYYY-MM-DD). Los escenarios se consultan por el día en curso.
   * Devuelve null si no hay coincidencia.
   */
  private async tokenScenarioPunto(
    schemaCode: string,
    fecha: string,
  ): Promise<string | null> {
    try {
      const scen = await this.drivinScenarios(fecha);
      // Preferimos el que además calce con el deploy_date; si no, el primero
      // que tenga el schema_code del punto.
      const exacto = scen.find(
        (s) => s.schema_code === schemaCode && s.deploy_date === fecha,
      );
      const porSchema = exacto ?? scen.find((s) => s.schema_code === schemaCode);
      return porSchema?.token ?? null;
    } catch (e) {
      this.logger.warn(
        `No se pudo obtener el scenario de Drivin: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return null;
    }
  }

  /**
   * Domiciliarios (vehículos) de Drivin asignados a un punto de venta. Se casa
   * por la flota "Domiciliarios PDV <localidad>" (coincidencia exacta de
   * segmento para no confundir "Alameda I" con "Alameda II"). Solo activos.
   */
  async domiciliariosDrivinPunto(
    puntoCodigo: string,
    puntoNombre: string,
  ): Promise<DomiciliarioDrivin[]> {
    const localidad = this.localidadDrivin(puntoCodigo, puntoNombre);
    const flota = localidad ? `Domiciliarios PDV ${localidad}` : '';
    const vehiculos = await this.drivinVehicles();
    const out: DomiciliarioDrivin[] = [];
    for (const v of vehiculos) {
      if (v.is_active === false) continue;
      if (!v.code) continue;
      const flotas = String(v.fleets ?? '')
        .split(',')
        .map((s) => s.trim());
      if (flota && !flotas.includes(flota)) continue;
      const nombre = `${v.driver?.first_name ?? ''} ${
        v.driver?.last_name ?? ''
      }`.trim();
      out.push({
        code: v.code,
        nombre: nombre || v.code,
        tipo: v.vehicle_type ?? null,
      });
    }
    // Orden alfabético por nombre para el selector.
    out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return out;
  }

  /**
   * Mapa de asignaciones de Drivin: comanda (código de orden) -> vehículo
   * (domiciliario) que Drivin le asignó, o `null` si la orden está en Drivin
   * pero SIN domiciliario (desasignada). Si la comanda NO aparece en el mapa,
   * es que no está en ningún escenario de Drivin. Recorre los escenarios del día
   * y lee `GET /orders?token=` de cada uno. Se cachea 15s.
   */
  async asignacionesDrivin(): Promise<
    Record<string, { code: string; nombre: string } | null>
  > {
    if (this.cacheAsignaciones && Date.now() - this.cacheAsignaciones.ts < 5000) {
      return this.cacheAsignaciones.datos;
    }
    const out: Record<string, { code: string; nombre: string } | null> = {};
    try {
      const hoy = this.diaBogota();
      const scenarios = await this.drivinScenarios(hoy);
      const vehiculos = await this.drivinVehicles();
      const nombrePorCode = new Map<string, string>();
      for (const v of vehiculos) {
        if (!v.code) continue;
        const nombre = `${v.driver?.first_name ?? ''} ${
          v.driver?.last_name ?? ''
        }`.trim();
        nombrePorCode.set(v.code, nombre || v.code);
      }
      const tokens = scenarios.filter((s) => s.token).map((s) => s.token as string);
      // Consulta los escenarios EN PARALELO (antes era secuencial y tardaba).
      const grupos = await Promise.all(
        tokens.map(async (t) => {
          try {
            const r = await this.drivinGet<{
              response?: Array<{
                orders?: Array<{ code?: string; vehicle_code?: string | null }>;
              }>;
            }>(`/orders?token=${encodeURIComponent(t)}`);
            return Array.isArray(r?.response) ? r.response : [];
          } catch {
            return []; // si un escenario falla, seguimos con los demás
          }
        }),
      );
      for (const arr of grupos) {
        for (const g of arr) {
          for (const o of g.orders ?? []) {
            if (!o.code) continue;
            out[o.code] = o.vehicle_code
              ? {
                  code: o.vehicle_code,
                  nombre: nombrePorCode.get(o.vehicle_code) ?? o.vehicle_code,
                }
              : null;
          }
        }
      }
      this.cacheAsignaciones = { ts: Date.now(), datos: out };
    } catch (e) {
      this.logger.warn(
        `No se pudieron leer las asignaciones de Drivin: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    return out;
  }

  /**
   * Sincroniza desasignaciones de Drivin: si un pedido que tiene domiciliario
   * asignado fue desasignado en Drivin (vehicle_code = null), lo devuelve a
   * estado "En proceso" y limpia el domiciliario de la metadata.
   * Útil para mantener SIGCOMPRO sincronizado con cambios en Drivin.
   */
  async sincronizarDesasignacionesDrivin(): Promise<number> {
    let desasignados = 0;
    try {
      const asignaciones = await this.asignacionesDrivin();
      
      // Busca pedidos EN PROCESO O FACTURADOS que tengan domiciliario asignado
      const res = await this.pool.query<{
        id: string;
        comanda: string;
        estado: string | null;
        meta: Record<string, unknown>;
      }>(
        `SELECT id, comanda, estado, meta FROM pedidos
         WHERE anulado = false
         AND LOWER(COALESCE(estado, '')) IN ('en proceso', 'en producción', 'alistado', 'facturado')
         AND meta->>'domiciliario' IS NOT NULL`,
      );

      for (const ped of res.rows) {
        const comanda = String(ped.comanda || '').trim();
        const asign = asignaciones[comanda];
        
        // Si la comanda no está en Drivin o está desasignada (null)
        if (asign === null || (asign === undefined && Object.keys(asignaciones).length > 0)) {
          // Devuelve a "En proceso" para que pueda ser reasignado
          await this.actualizarMeta(ped.id, { domiciliario: null });
          await this.pool.query(
            `UPDATE pedidos SET estado = $1, actualizado_en = now() WHERE id = $2`,
            ['En proceso', ped.id],
          );
          desasignados++;
          this.logger.log(
            `Pedido desasignado en Drivin: ${comanda} (${ped.id}) → "En proceso"`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(
        `Error al sincronizar desasignaciones de Drivin: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    return desasignados;
  }

  /** Caché por comanda del estado de entrega (POD v3). TTL corto. */
  private cachePods = new Map<
    string,
    { ts: number; status: string | null; entregadoEn: string | null; comment: string | null }
  >();

  /**
   * Estado de ENTREGA por pedido (POD) vía v3 `GET /pods?order_code=`. El campo
   * `customer_status` vale: `approved` (ENTREGADO), `rejected`, `in-transit`,
   * `pending`. Devuelve, por comanda, `{ status, entregadoEn }` (entregadoEn =
   * hora de llegada del POD). Consulta solo las comandas pedidas (el endpoint es
   * por pedido), en lotes y con caché de 20s por comanda para no saturar.
   */
  async estadoEntregaDrivin(
    comandas: string[],
  ): Promise<
    Record<string, { status: string | null; entregadoEn: string | null; comment: string | null }>
  > {
    const out: Record<
      string,
      { status: string | null; entregadoEn: string | null; comment: string | null }
    > = {};
    const ahora = Date.now();
    const pendientes: string[] = [];
    for (const c of comandas) {
      if (!c) continue;
      const cached = this.cachePods.get(c);
      // Los estados FINALES (approved/rejected) cambian poco: se cachean 5 min;
      // los no finales (in-transit/pending/sin POD) se refrescan cada 20s.
      const ttl =
        cached && (cached.status === 'approved' || cached.status === 'rejected')
          ? 5 * 60 * 1000
          : 20000;
      if (cached && ahora - cached.ts < ttl) {
        out[c] = {
          status: cached.status,
          entregadoEn: cached.entregadoEn,
          comment: cached.comment,
        };
      } else {
        pendientes.push(c);
      }
    }
    const LOTE = 8; // concurrencia máxima
    for (let i = 0; i < pendientes.length; i += LOTE) {
      const lote = pendientes.slice(i, i + LOTE);
      await Promise.all(
        lote.map(async (c) => {
          try {
            const r = await this.drivinGet<{
              data?: Array<{
                attributes?: {
                  customer_status?: string;
                  pod_arrival?: string | null;
                  created_at?: string | null;
                  comment?: string | null;
                  reason?: string | null;
                };
              }>;
            }>(`/pods?order_code=${encodeURIComponent(c)}`, 'v3');
            // Un mismo order_code puede traer VARIOS PODs (entregas anteriores del
            // mismo código recurrente). Se toma el MÁS RECIENTE (por created_at):
            // data[0] es el más viejo y daría un estado equivocado.
            const arr = Array.isArray(r?.data) ? r.data : [];
            let mejor: {
              customer_status?: string;
              pod_arrival?: string | null;
              created_at?: string | null;
              comment?: string | null;
              reason?: string | null;
            } | null = null;
            for (const d of arr) {
              const a = d?.attributes;
              if (!a) continue;
              if (!mejor) {
                mejor = a;
                continue;
              }
              const ta = new Date(a.created_at ?? a.pod_arrival ?? 0).getTime();
              const tb = new Date(mejor.created_at ?? mejor.pod_arrival ?? 0).getTime();
              if (ta >= tb) mejor = a;
            }
            const status = mejor?.customer_status ?? null;
            const entregadoEn = mejor?.pod_arrival ?? mejor?.created_at ?? null;
            const comment = mejor?.comment ?? mejor?.reason ?? null;
            this.cachePods.set(c, { ts: Date.now(), status, entregadoEn, comment });
            out[c] = { status, entregadoEn, comment };
          } catch {
            out[c] = { status: null, entregadoEn: null, comment: null };
          }
        }),
      );
    }
    return out;
  }

  /**
   * Envía un pedido directamente a Drivin (endpoint external/v2/orders), con el
   * MISMO mapeo de campos que el Excel de cargue. Reemplaza el flujo de Excel.
   * `vehiculo` = code del vehículo de Drivin a preasignar (opcional).
   */
  async enviarADrivin(
    id: string,
    replica?: number,
    vehiculo?: string,
  ): Promise<{ status: number; comanda: string; respuesta: unknown }> {
    const apiKey = this.config.get<string>('DRIVIN_API_KEY');
    if (!apiKey) {
      throw new Error(
        'Falta DRIVIN_API_KEY en el backend (.env) para enviar a Drivin.',
      );
    }

    const d = await this.construirDespacho(id, replica);

    // El schema de Drivin depende del punto de venta:
    //  - La 93 -> 01 | Alameda I -> 04 | Alameda II -> 05
    //  - Otros -> DRIVIN_SCHEMA_CODE del .env (por defecto 01)
    const schema = this.schemaDrivinPara(d.puntoCodigo, d.puntoNombre);
    // La orden se sube al GESTOR DE ÓRDENES del schema (solo `schema_code`, sin
    // `token` ni `autoassign`). El planeador de Drivin la asigna a un vehículo y
    // SIGCOMPRO baja esa asignación después (ver asignacionesDrivin()).
    const path = `/orders?schema_code=${encodeURIComponent(schema)}`;
    // Vehículo a preasignar, si se indicó (normalmente no: Drivin asigna).
    const vehicleCode = String(vehiculo ?? '').trim() || null;

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
          // Coordenadas del cliente (campos `lat`/`lng` según la doc de Drivin)
          // para que la dirección quede geocodificada y sea planificable.
          ...(d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : {}),
          name: d.nombre,
          client_name: d.nombre,
          client_code: d.nit,
          address_type: d.tipo,
          contact_name: d.nombre,
          contact_phone: d.telefono,
          service_time: 10,
          time_windows: [{ start: d.inicioVentana, end: d.finVentana }],
          orders: [
            {
              code: d.comanda,
              alt_code: null,
              description: null,
              category: 'Delivery',
              // Si se eligió vehículo: se preasigna y se FUERZA la asignación
              // (necesario cuando el esquema está optimizado). Si no, se omite
              // para que Drivin optimice/asigne solo.
              ...(vehicleCode
                ? { vehicle_code: vehicleCode, force_vehicle_assignation: true }
                : {}),
              // Prioridad del pedido (recoge en PDV = 4). El Excel la lleva en la
              // columna "Prioridad"; aquí se envía también por la API.
              priority: Math.round(Number(d.prioridad)) || null,
              units_1: Number(d.kilos.toFixed(2)),
              units_2: null,
              units_3: null,
              position: 1,
              delivery_date: d.fechaEntrega,
              // Fecha de despacho en Drivin: el campo es "deploy_date". Debe
              // cambiar junto con la fecha de entrega; sin él Drivin solo
              // actualiza los compromisos (mín/máx) y deja la fecha anterior.
              deploy_date: d.fechaEntrega,
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

    const { status, text } = await this.drivinRequest(
      'POST',
      path,
      apiKey,
      JSON.stringify(body),
    );
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    // Traza de la operación (para diagnosticar en Drivin).
    this.logger.log(
      `Drivin orden ${d.comanda} (Gestor): status=${status} schema_code=${schema} ` +
        `vehicle_code=${vehicleCode ?? '-'} resp=${(text ?? '').slice(0, 500)}`,
    );
    if (status < 200 || status >= 300) {
      const detalle =
        typeof data === 'string' ? data : JSON.stringify(data ?? {});
      throw new Error(`Drivin respondió ${status}: ${detalle}`);
    }
    return { status, comanda: d.comanda, respuesta: data };
  }

  /**
   * Sincroniza cancelaciones desde Drivin: consulta las órdenes que fueron
   * canceladas o rechazadas en Drivin (status = rejected/cancelled) y marca
   * los pedidos correspondientes en SIGCOMPRO como cancelados.
   * 
   * Se ejecuta bajo demanda o por un job programado. Recorre todos los escenarios
   * del día y detecta órdenes con estado final.
   */
  async sincronizarCancelacionesDrivin(): Promise<number> {
    let actualizados = 0;
    try {
      const hoy = this.diaBogota();
      const scenarios = await this.drivinScenarios(hoy);
      
      // Procesar todos los escenarios del día en paralelo
      const grupos = await Promise.all(
        scenarios
          .filter((s) => s.token)
          .map(async (s) => {
            try {
              const r = await this.drivinGet<{
                response?: Array<{
                  orders?: Array<{
                    code?: string;
                    status?: string;
                  }>;
                }>;
              }>(`/orders?token=${encodeURIComponent(s.token as string)}`);
              return Array.isArray(r?.response) ? r.response : [];
            } catch {
              return [];
            }
          }),
      );

      // Procesar órdenes canceladas/rechazadas en Drivin
      // Separar por tipo para manejar diferente:
      // - rejected: cliente no atendió → estado "Rechazado" (permite réplica)
      // - cancelled: cancelación → estado "Cancelado" (anulado)
      const comandasRechazadas: Set<string> = new Set();
      const comandasCanceladas: Set<string> = new Set();
      for (const arr of grupos) {
        for (const g of arr) {
          for (const o of g.orders ?? []) {
            const code = String(o.code ?? '').trim();
            const status = String(o.status ?? '').toLowerCase();
            if (code) {
              if (status === 'rejected') {
                comandasRechazadas.add(code);
              } else if (status === 'cancelled') {
                comandasCanceladas.add(code);
              }
            }
          }
        }
      }

      // Actualizar comandas rechazadas a estado "Rechazado"
      if (comandasRechazadas.size > 0) {
        const resRechazados = await this.pool.query<{
          id: string;
          comanda: string;
          estado: string | null;
        }>(
          `SELECT id, data->>'comanda' as comanda, estado
           FROM pedidos
           WHERE (data->>'comanda') = ANY($1)
             AND anulado = false
             AND LOWER(COALESCE(estado, '')) NOT IN ('rechazado', 'cancelado', 'anulado')`,
          [[...comandasRechazadas]],
        );

        for (const ped of resRechazados.rows) {
          try {
            const actualizado = await this.guardar(
              {
                id: ped.id,
                estado: 'Rechazado',
                motivo: 'Cliente no atendía (rechazado por Drivin)',
              },
              undefined,
            );
            if (actualizado) {
              actualizados++;
              this.logger.log(
                `Pedido ${ped.id} (${ped.comanda}) marcado como Rechazado en Drivin`,
              );
            }
          } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            this.logger.warn(
              `No se pudo marcar como rechazado el pedido ${ped.id}: ${error}`,
            );
          }
        }
      }

      // Actualizar comandas canceladas a estado "Cancelado"
      if (comandasCanceladas.size > 0) {
        const resCancelados = await this.pool.query<{
          id: string;
          comanda: string;
          estado: string | null;
        }>(
          `SELECT id, data->>'comanda' as comanda, estado
           FROM pedidos
           WHERE (data->>'comanda') = ANY($1)
             AND anulado = false
             AND LOWER(COALESCE(estado, '')) NOT IN ('cancelado', 'anulado')`,
          [[...comandasCanceladas]],
        );

        for (const ped of resCancelados.rows) {
          try {
            const actualizado = await this.guardar(
              {
                id: ped.id,
                anulado: true,
                estado: 'Cancelado',
                motivo: 'Cancelado por Drivin',
              },
              undefined,
            );
            if (actualizado) {
              actualizados++;
              this.logger.log(
                `Pedido ${ped.id} (${ped.comanda}) sincronizado: cancelado por Drivin`,
              );
            }
          } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            this.logger.warn(
              `No se pudo sincronizar cancelación del pedido ${ped.id}: ${error}`,
            );
          }
        }
      }

      if (comandasRechazadas.size === 0 && comandasCanceladas.size === 0) {
        return 0;
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `Error al sincronizar cancelaciones desde Drivin: ${error}`,
      );
    }
    return actualizados;
  }

  /**
   * Cancela una orden en Drivin. Se ejecuta de forma asíncrona (no-bloqueante)
   * cuando se marca un pedido como "Cancelado" en SIGCOMPRO.
   * 
   * Marca la orden como cancelada en Drivin (status = 'cancelled') manteniendo
   * el registro para auditoría y trazabilidad. También limpia la metadata del
   * pedido (domiciliario, etc).
   */
  private async cancelarEnDrivin(
    pedidoId: string,
    comanda: string,
    puntoCodigo: string,
    puntoNombre: string,
  ): Promise<void> {
    // Ejecutar de forma asíncrona para no bloquear la respuesta
    (async () => {
      try {
        const apiKey = this.config.get<string>('DRIVIN_API_KEY');
        if (!apiKey) {
          this.logger.warn('No se pudo cancelar en Drivin: falta DRIVIN_API_KEY');
          return;
        }

        const comandaLimpia = String(comanda ?? '').trim();
        if (!comandaLimpia) {
          this.logger.warn(
            `Pedido ${pedidoId}: sin comanda, no se cancela en Drivin`,
          );
          return;
        }

        // Schema de Drivin para el punto
        const schema = this.schemaDrivinPara(puntoCodigo, puntoNombre);
        const hoy = this.diaBogota();

        // Obtener el token del escenario
        const token = await this.tokenScenarioPunto(schema, hoy);
        if (!token) {
          this.logger.warn(
            `Pedido ${pedidoId} (${comandaLimpia}): sin escenario en Drivin`,
          );
          return;
        }

        // Marcar la orden como cancelada en Drivin
        try {
          const body = JSON.stringify({ status: 'cancelled' });
          const path = `/orders/${encodeURIComponent(comandaLimpia)}?token=${encodeURIComponent(
            token,
          )}`;
          const { status } = await this.drivinRequest(
            'PUT',
            path,
            apiKey,
            body,
            'v2',
          );
          if (status === 200 || status === 204) {
            this.logger.log(
              `✓ Drivin orden ${comandaLimpia} marcada como cancelada (status: 200)`,
            );
          } else {
            this.logger.warn(
              `Drivin orden ${comandaLimpia}: respuesta inesperada (status: ${status})`,
            );
          }
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          this.logger.warn(
            `No se pudo cancelar ${comandaLimpia} en Drivin: ${error}`,
          );
        }

        // Limpiar metadatos del pedido en SIGCOMPRO (domiciliario, estado de Drivin, etc)
        try {
          await this.actualizarMeta(pedidoId, {
            domiciliario: null,
            drivinEnviado: false,
            drivinStatus: 'cancelled',
          });
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          this.logger.warn(
            `No se pudo limpiar metadata del pedido ${pedidoId}: ${error}`,
          );
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        this.logger.error(
          `Error al cancelar orden en Drivin (pedido ${pedidoId}): ${error}`,
        );
      }
    })().catch((e) => {
      this.logger.error(
        `Error no capturado en cancelación async de Drivin: ${String(e)}`,
      );
    });
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
