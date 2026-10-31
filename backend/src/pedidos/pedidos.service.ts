import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { ExtensionesService } from '../extensiones/extensiones.service';
import { pesoCarritoKg } from '../common/peso';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { tieneAccesoTotal } from '../users/permisos.catalog';

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
    pesoVariable?: number;
    producto?: { um?: string; producto?: string };
  }>;
};

/** Metadata de despacho asociada a un pedido. */
type DespachoMeta = Record<string, unknown>;

/** Réplica (parte del mismo pedido enviada como orden aparte "comanda-N" a Drivin). */
export interface ReplicaMeta {
  numero: number;
  domiciliario?: string;
  domiciliarioCodigo?: string;
  drivinEnviado?: boolean;
  /** Momento (ISO) en que la réplica se subió a Drivin. */
  drivinEnviadoEn?: string;
  /** Estado de entrega (POD) que reporta Drivin. */
  estado?: string;
}

/** Campos de una réplica que se pueden cambiar sin reescribir la lista entera. */
export type CambiosReplica = Partial<
  Pick<ReplicaMeta, 'domiciliario' | 'domiciliarioCodigo' | 'drivinEnviado' | 'drivinEnviadoEn' | 'estado'>
>;

const MAX_REPLICAS = 5;

/** Orden de un plan de Drivin, cruzada con su pedido de SIGCOMPRO. */
export interface OrdenPlan {
  codigo: string;
  cliente: string;
  codigoCliente: string;
  direccion: string;
  barrio: string;
  ciudad: string;
  prioridad: number | null;
  kilos: number;
  vehiculo: string | null;
  domiciliario: string | null;
  viaje: number | null;
  proveedor: string;
  fechaEntrega: string;
  pedidoId: string | null;
  /** Número de réplica si la orden es "comanda-N". */
  replica: number | null;
  estadoSigcompro: string | null;
}

/** Plan (escenario) de Drivin de un día para un esquema. */
export interface PlanDrivin {
  esquemaCodigo: string;
  esquemaNombre: string;
  descripcion: string;
  estado: string;
  fecha: string;
  creadoEn: string | null;
  /** Puntos de venta de SIGCOMPRO que suben a este esquema. */
  puntos: string[];
  ordenes: OrdenPlan[];
  /** Error al leer las órdenes de este plan (si falló). */
  error: string | null;
}

/** Esquema de Drivin (GET external/v2/schemas). */
interface DrivinSchema {
  code?: string;
  name?: string;
  fleet?: string | null;
}

/** Resultado de crear (o no) el plan de un esquema. */
export interface ResultadoPlan {
  esquemaCodigo: string;
  esquemaNombre: string;
  puntos: string[];
  estado: 'pendiente' | 'creado' | 'existente' | 'error';
  /** Paso en curso (para ver el avance en vivo). */
  paso?: 'pendiente' | 'creando' | 'optimizando' | 'aprobando' | 'listo';
  /** Último estado que reportó Drivin (ej. "Optimizing", "Optimized"). */
  estadoDrivin?: string | null;
  mensaje: string;
  /** Token del plan en Drivin (si SIGCOMPRO lo creó). */
  token?: string | null;
  /** ¿Se aprobó en Drivin? null = no aplica (no se creó ni se reintentó). */
  aprobado?: boolean | null;
  /** Detalle del error de aprobación, si falló. */
  errorAprobacion?: string | null;
  /** ¿Se optimizó en Drivin (después de aprobar)? null = no aplica. */
  optimizado?: boolean | null;
  /** Detalle del error de optimización, si falló. */
  errorOptimizacion?: string | null;
}

/** Una corrida de generación de planes (automática o manual). */
export interface GeneracionPlanes {
  id: string;
  fecha: string;
  origen: 'automatico' | 'manual';
  usuario: string | null;
  resultado: ResultadoPlan[];
  creadoEn: string;
  estado?: 'en_curso' | 'terminado' | 'error' | 'interrumpida';
  error?: string | null;
  terminadoEn?: string | null;
}

/** Configuración de Drivin de un punto de venta (pestaña Esquemas). */
export interface EsquemaPunto {
  puntoId: string;
  puntoNombre: string;
  puntoCodigo: string;
  activo: boolean;
  drivin: boolean;
  esquemaConfigurado: string | null;
  localidadConfigurada: string | null;
  esquemaEfectivo: string;
  localidadEfectiva: string;
  esquemaNombreDrivin: string | null;
  /** null = no se pudo consultar Drivin. */
  planHoy: boolean | null;
  estadoPlanHoy: string | null;
}

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
  /** Lectura de asignaciones de Drivin en curso (compartida entre peticiones simultáneas). */
  private lecturaAsignaciones: Promise<{
    mapa: Record<string, { code: string; nombre: string } | null>;
    completo: boolean;
    hayEscenarios: boolean;
  }> | null = null;
  /** Última lectura COMPLETA del mapa (la comparten las pantallas y la sincronización). */
  private ultimaLecturaCompleta: {
    ts: number;
    mapa: Record<string, { code: string; nombre: string } | null>;
    hayEscenarios: boolean;
  } | null = null;
  /** Última vez que la lista de escenarios se refrescó saltando la caché. */
  private ultimoRefrescoEscenarios = 0;
  /** Evita que dos corridas de la sincronización de desasignaciones se solapen. */
  private sincronizandoDesasignaciones = false;
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly ubicaciones: UbicacionesService,
    private readonly config: ConfigService,
    private readonly extensiones: ExtensionesService,
  ) {}

  async onModuleInit() {
    // Historial de generación de planes de Drivin (automática y manual).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS drivin_planes_generacion (
        id bigserial PRIMARY KEY,
        fecha date NOT NULL,
        origen text NOT NULL,
        usuario text,
        resultado jsonb NOT NULL DEFAULT '[]'::jsonb,
        creado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      ALTER TABLE drivin_planes_generacion
        ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'terminado',
        ADD COLUMN IF NOT EXISTS error text,
        ADD COLUMN IF NOT EXISTS terminado_en timestamptz
    `);
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
    // Índice funcional por NIT/cédula del cliente: acelera consultar los últimos
    // puntos de venta donde ha comprado un cliente (Step de cliente del wizard).
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_nit ON pedidos ((data->'cliente'->>'nit_cedula'))`,
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
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS comprobantes_entrega_club (
        pedido_id text PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
        imagen text NOT NULL,
        mime text,
        subido_por text,
        creado_en timestamptz NOT NULL DEFAULT now()
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

  /** Construye el WHERE (scope) + params según rango/fecha/hasta. Compartido por
   *  estado() (listado completo) y resumenLigero() (agregados de Dashboard/Mi
   *  resumen), para no duplicar esta lógica de fechas. */
  private construirScope(
    rango?: string,
    fecha?: string,
    hasta?: string,
    canal?: string,
  ): { scope: string; params: unknown[] } {
    const dias =
      Number(this.config.get<string>('PEDIDOS_DIAS_RECIENTES', '3')) || 3;
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
    const activo = `(anulado = false AND lower(coalesce(estado, '')) NOT IN ('despachado', 'anulado', 'entregado', 'cancelado', 'en tránsito', 'en transito', 'devolución', 'devolucion'))`;

    const params: unknown[] = [];
    let scope: string;
    const fechaValida = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (rango === 'hoy') {
      scope = `((${diaEfectivo}) = ${hoy} OR ${activo})`;
    } else if (rango === 'posteriores') {
      scope = `((${diaEfectivo}) > ${hoy})`;
    } else if (rango === 'todo') {
      scope = 'true';
    } else if (rango === 'cuadre' && fechaValida(fecha)) {
      params.push(fecha);
      scope = `((COALESCE(NULLIF(meta->>'despachoFin', '')::timestamptz, fecha) AT TIME ZONE 'America/Bogota')::date = $${params.length}::date)`;
    } else if (rango === 'fecha' && fechaValida(fecha)) {
      params.push(fecha);
      scope = `((${diaEfectivo}) = $${params.length}::date)`;
    } else if (rango === 'rango' && (fechaValida(fecha) || fechaValida(hasta))) {
      const lo = fechaValida(fecha) ? fecha : null;
      const hi = fechaValida(hasta) ? hasta : null;
      if (lo && hi) {
        params.push(lo, hi);
        scope = `((${diaEfectivo}) BETWEEN $${params.length - 1}::date AND $${params.length}::date)`;
      } else if (lo) {
        params.push(lo);
        scope = `((${diaEfectivo}) >= $${params.length}::date)`;
      } else {
        params.push(hi);
        scope = `((${diaEfectivo}) <= $${params.length}::date)`;
      }
    } else {
      scope = `(${activo} OR fecha >= (now() - make_interval(days => ${dias})))`;
    }
    const filtroCanal = canal === 'club' ? `data->>'canal' = 'club'` : `COALESCE(data->>'canal', '') <> 'club'`;
    return { scope: `(${scope}) AND (${filtroCanal})`, params };
  }

  async estadoClub(desde?: string, user?: JwtPayload, rango = 'todo', fecha?: string, hasta?: string) {
    await this.pool.query(`
      INSERT INTO pedidos (id, consecutivo, punto_id, estado, anulado, fecha, data, meta)
      SELECT 'club:' || c.id, c.numero_comanda::int, c.punto_id,
        CASE WHEN c.estado = 'facturado' THEN 'Facturado' WHEN c.estado = 'entregado' THEN 'Entregado' WHEN c.estado = 'anulado' THEN 'Anulado' ELSE 'En proceso' END, c.estado = 'anulado', c.creado_en,
        jsonb_build_object(
          'id', 'club:' || c.id, 'canal', 'club', 'creditoPedidoId', c.id,
          'comanda', '1CSE' || c.numero_comanda, 'consecutivo', c.numero_comanda,
          'numeroDia', c.numero_comanda, 'numeroDiaFecha', to_char(c.creado_en AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD'),
          'fecha', c.creado_en, 'total', c.total, 'estado', CASE WHEN c.estado = 'facturado' THEN 'Facturado' WHEN c.estado = 'entregado' THEN 'Entregado' WHEN c.estado = 'anulado' THEN 'Anulado' ELSE 'En proceso' END,
          'anulado', c.estado = 'anulado',
          'entrega', 'recoge', 'pago', 'Crédito', 'observacion', COALESCE(c.observacion, ''),
          'punto', jsonb_build_object('id', c.punto_id, 'nombre', c.punto_nombre, 'codigo', p.codigo, 'direccion', p.direccion, 'drivin', false),
          'cliente', jsonb_build_object('id', 'club-cliente:' || c.trabajador_cedula, 'nit_cedula', c.trabajador_cedula,
            'nombre', c.trabajador_nombre, 'direccion', COALESCE(p.direccion, ''), 'telefono', COALESCE(c.telefono, ''),
            'barrio', COALESCE(p.barrio, ''), 'ciudad', COALESCE(p.ciudad, ''), 'activo', true),
          'carrito', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', c.id || ':' || linea.numero, 'cantidad', COALESCE((linea.item->>'cantidad')::numeric, 1),
            'observacion', COALESCE(linea.item->>'observacion', ''),
            'producto', jsonb_build_object('referencia', COALESCE(linea.item->>'referencia', 'CLUB'),
              'producto', COALESCE(linea.item->>'producto', 'Compra club'), 'um', COALESCE(linea.item->>'um', 'UN'),
              'precio', COALESCE((linea.item->>'precio')::numeric, 0))))
            FROM jsonb_array_elements(CASE WHEN jsonb_array_length(COALESCE(c.tienda_items, '[]'::jsonb)) > 0 THEN c.tienda_items
              ELSE jsonb_build_array(jsonb_build_object('referencia', 'CLUB', 'producto', 'Compra club', 'um', 'UN', 'precio', c.total, 'cantidad', 1)) END)
              WITH ORDINALITY AS linea(item, numero)), '[]'::jsonb),
          'trazabilidad', jsonb_build_array(jsonb_build_object('tipo', 'creacion', 'estadoNuevo', 'En proceso', 'fecha', c.creado_en))),
        jsonb_build_object('domiciliario', 'Recoge en PDV', 'facturaNumero', COALESCE(c.factura_numero, ''), 'facturaValor', c.total)
      FROM credito_empleados_pedidos c JOIN puntos_venta p ON p.id::text = c.punto_id
      WHERE c.estado IN ('pendiente', 'facturado', 'entregado', 'anulado')
      ON CONFLICT (id) DO NOTHING
    `);
    return this.estado(desde, rango, fecha, hasta, 'club', user);
  }

  /** Devuelve todos los pedidos junto con su metadata e impresos. */
  async estado(
    desde?: string,
    rango?: string,
    fecha?: string,
    hasta?: string,
    canal?: string,
    user?: JwtPayload,
  ): Promise<EstadoPedidos> {
    // Conjunto de trabajo. Por DEFECTO (históricos, dashboard)
    // = activos (cualquier fecha) + finalizados de los últimos N días. Pedidos y
    // Despacho piden rango='hoy' (mucho más liviano) y cargan días ANTERIORES
    // solo cuando el usuario aplica ese filtro (rango='fecha'&fecha=YYYY-MM-DD).
    // Polling INCREMENTAL: si el cliente envía `desde` (el `ahora` que recibió
    // en su última respuesta), solo se devuelven los pedidos del conjunto de
    // trabajo que CAMBIARON desde ese instante (actualizado_en > desde). Así
    // cada poll pasa de varios MB a unos KB. Sin `desde` = primera carga total.
    const desdeValido =
      desde && !Number.isNaN(Date.parse(desde)) ? desde : null;
    const ahora = new Date().toISOString();

    const { scope, params } = this.construirScope(rango, fecha, hasta, canal);
    let alcanceUsuario = 'true';
    const supervisorGeneral = ['supervisor general', 'supervisor_general'].includes(String(user?.rol ?? '').trim().toLowerCase());
    if (canal === 'club' && user && !tieneAccesoTotal(user.rol) && !supervisorGeneral) {
      params.push(user.sub);
      alcanceUsuario = `punto_id IN (SELECT punto_venta_id::text FROM usuario_punto_venta WHERE usuario_id = $${params.length})`;
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
      WHERE ${scope} AND ${alcanceUsuario}
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
   * Versión LIGERA de estado(): para Dashboard y Mi resumen, que solo necesitan
   * un subconjunto de campos de cada pedido para calcular sus métricas (no
   * edición ni impresión). Proyecta esos campos en el propio SQL en vez de
   * traer el blob `data` completo (que incluye dirección/teléfono del cliente,
   * notas del carrito, trazabilidad, etc.) — con historiales grandes ("Todo"),
   * el payload completo puede pesar 100+ MB y tardar más de un minuto solo en
   * transferirse por la red; esta proyección lo reduce a una fracción.
   */
  async resumenLigero(
    rango?: string,
    fecha?: string,
    hasta?: string,
  ): Promise<{
    pedidos: PedidoData[];
    meta: Record<string, DespachoMeta>;
    ahora: string;
  }> {
    const ahora = new Date().toISOString();
    const { scope, params } = this.construirScope(rango, fecha, hasta);

    // El tiempo de esta consulta lo domina la TRANSFERENCIA del resultado (no
    // el SQL): con rangos grandes o red lenta supera los 30s globales del pool.
    const client = await this.pool.connect();
    let res: { rows: { id: string; data: PedidoData; meta: DespachoMeta }[] };
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '120s'`);
      res = await client.query<{
      id: string;
      data: PedidoData;
      meta: DespachoMeta;
    }>(
      `SELECT id,
              jsonb_build_object(
                'id', id,
                'comanda', data->>'comanda',
                'consecutivo', (data->>'consecutivo')::int,
                'fecha', data->>'fecha',
                'total', COALESCE((data->>'total')::numeric, 0),
                'estado', data->>'estado',
                'anulado', COALESCE((data->>'anulado')::boolean, false),
                'motivo', data->>'motivo',
                'pago', data->>'pago',
                'entrega', data->>'entrega',
                'valorDomicilio', (data->>'valorDomicilio')::numeric,
                'vendedorNombre', data->>'vendedorNombre',
                'vendedorCedula', data->>'vendedorCedula',
                'entregaProgramada', (data->>'entregaProgramada')::boolean,
                'fechaProgramada', data->>'fechaProgramada',
                'horaDespacho', data->>'horaDespacho',
                'punto', jsonb_build_object(
                  'id', data->'punto'->>'id',
                  'nombre', data->'punto'->>'nombre'
                ),
                'cliente', jsonb_build_object(
                  'nit_cedula', data->'cliente'->>'nit_cedula',
                  'nombre', data->'cliente'->>'nombre',
                  'horeca', COALESCE((data->'cliente'->>'horeca')::boolean, false)
                ),
                'carrito', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'id', item->>'id',
                    'cantidad', COALESCE((item->>'cantidad')::numeric, 0),
                    'porcionado', COALESCE((item->>'porcionado')::boolean, false),
                    'unidades', (item->>'unidades')::numeric,
                    'gramos', (item->>'gramos')::numeric,
                    'pesoVariable', (item->>'pesoVariable')::numeric,
                    'producto', jsonb_build_object(
                      'um', item->'producto'->>'um',
                      'producto', item->'producto'->>'producto',
                      'referencia', item->'producto'->>'referencia',
                      'precio', (item->'producto'->>'precio')::numeric
                    )
                  ))
                  FROM jsonb_array_elements(COALESCE(data->'carrito', '[]'::jsonb)) item
                ), '[]'::jsonb)
              ) AS data,
              meta
       FROM pedidos
       WHERE ${scope}
       ORDER BY fecha DESC NULLS LAST, creado_en DESC`,
      params,
    );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }

    const pedidos: PedidoData[] = [];
    const meta: Record<string, DespachoMeta> = {};
    for (const row of res.rows) {
      pedidos.push(row.data);
      if (row.meta && Object.keys(row.meta).length > 0) {
        meta[row.id] = row.meta;
      }
    }
    return { pedidos, meta, ahora };
  }

  /**
   * Búsqueda de pedidos en TODO el historial (sin la ventana de días recientes
   * de estado()). Se usa en Históricos para encontrar comandas/consecutivos o
   * clientes antiguos por texto libre. Coincide por comanda, consecutivo,
   * nombre o NIT/cédula del cliente. Limitada para no traer todo el historial.
   */
  async buscar(q?: string): Promise<EstadoPedidos> {
    const term = String(q ?? '').trim();
    const ahora = new Date().toISOString();
    if (term.length < 2) {
      return { pedidos: [], meta: {}, impresos: [], ahora };
    }
    const like = `%${term.toLowerCase()}%`;
    const res = await this.pool.query<{
      id: string;
      impreso: boolean;
      data: PedidoData;
      meta: DespachoMeta;
    }>(
      `SELECT id, impreso, (data - 'trazabilidad') AS data, meta
         FROM pedidos
        WHERE COALESCE(data->>'canal', '') <> 'club' AND (lower(coalesce(data->>'comanda', '')) LIKE $1
           OR lower(coalesce(consecutivo::text, '')) LIKE $1
           OR lower(coalesce(data->>'consecutivo', '')) LIKE $1
           OR lower(coalesce(data->'cliente'->>'nombre', '')) LIKE $1
           OR lower(coalesce(data->'cliente'->>'nit_cedula', '')) LIKE $1)
        ORDER BY fecha DESC NULLS LAST, creado_en DESC
        LIMIT 300`,
      [like],
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

  /**
   * Reporte de clientes que han comprado productos, agrupado por cliente +
   * producto. Filtrable por punto de venta, por código (referencia) específico
   * o general (todos los productos), y por rango de fechas.
   */
  async reporteProductosPorCliente(filtros: {
    codigo?: string;
    punto_id?: string;
    desde?: string;
    hasta?: string;
  }): Promise<{
    filas: Array<{
      nit: string;
      cliente: string;
      punto: string;
      codigo: string;
      producto: string;
      cantidad: number;
      n_pedidos: number;
      monto: number;
      ultima_compra: string | null;
    }>;
    resumen: { clientes: number; cantidad: number; monto: number; filas: number };
  }> {
    const cond: string[] = [
      'p.anulado = false',
      `(it->'producto'->>'referencia') IS NOT NULL`,
      `(it->'producto'->>'referencia') <> ''`,
    ];
    const val: unknown[] = [];
    let i = 1;

    const codigo = String(filtros.codigo ?? '').trim();
    if (codigo) {
      // Match tolerante: ignora espacios y ceros a la izquierda cuando el código
      // es numérico (evita perder registros por variaciones de formato).
      cond.push(
        `(btrim(it->'producto'->>'referencia') = $${i}
          OR (btrim(it->'producto'->>'referencia') ~ '^[0-9]+$'
              AND $${i} ~ '^[0-9]+$'
              AND (btrim(it->'producto'->>'referencia'))::numeric = ($${i})::numeric))`,
      );
      val.push(codigo);
      i++;
    }
    const puntoId = String(filtros.punto_id ?? '').trim();
    if (puntoId) {
      cond.push(`p.punto_id = $${i++}`);
      val.push(puntoId);
    }
    if (filtros.desde?.trim()) {
      cond.push(`p.fecha >= $${i++}::date`);
      val.push(filtros.desde.trim());
    }
    if (filtros.hasta?.trim()) {
      cond.push(`p.fecha < ($${i++}::date + interval '1 day')`);
      val.push(filtros.hasta.trim());
    }

    const where = cond.join(' AND ');
    const res = await this.pool.query<{
      nit: string;
      cliente: string;
      punto: string;
      codigo: string;
      producto: string;
      cantidad: string;
      n_pedidos: string;
      monto: string;
      ultima_compra: string | null;
    }>(
      `SELECT
         COALESCE(NULLIF(p.data->'cliente'->>'nit_cedula', ''), '—') AS nit,
         COALESCE(NULLIF(p.data->'cliente'->>'nombre', ''), 'Sin nombre') AS cliente,
         COALESCE(p.data->'punto'->>'nombre', '') AS punto,
         (it->'producto'->>'referencia') AS codigo,
         COALESCE(it->'producto'->>'producto', '') AS producto,
         SUM(COALESCE((it->>'cantidad')::numeric, 0)) AS cantidad,
         COUNT(DISTINCT p.id) AS n_pedidos,
         SUM(COALESCE((it->>'cantidad')::numeric, 0) * COALESCE((it->'producto'->>'precio')::numeric, 0)) AS monto,
         to_char(MAX(p.fecha) AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS ultima_compra
       FROM pedidos p,
            jsonb_array_elements(COALESCE(p.data->'carrito', '[]'::jsonb)) AS it
       WHERE ${where}
       GROUP BY nit, cliente, punto, codigo, producto
       ORDER BY cliente ASC, cantidad DESC
       LIMIT 50000`,
      val,
    );

    const filas = res.rows.map((r) => ({
      nit: r.nit,
      cliente: r.cliente,
      punto: r.punto,
      codigo: r.codigo,
      producto: r.producto,
      cantidad: Number(r.cantidad) || 0,
      n_pedidos: Number(r.n_pedidos) || 0,
      monto: Number(r.monto) || 0,
      ultima_compra: r.ultima_compra,
    }));

    const clientesSet = new Set(filas.map((f) => f.nit));
    const resumen = {
      clientes: clientesSet.size,
      cantidad: filas.reduce((s, f) => s + f.cantidad, 0),
      monto: filas.reduce((s, f) => s + f.monto, 0),
      filas: filas.length,
    };

    return { filas, resumen };
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
          AND COALESCE(data->>'canal', '') <> 'club'
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
      if (p.canal === 'club') continue;
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
      if (p.canal === 'club') continue;
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
  async guardar(
    pedido: PedidoData,
    user?: JwtPayload,
    opciones?: {
      clubOnly?: boolean;
      /** Se ejecuta dentro de la misma transacción, justo antes del COMMIT. */
      antesDeConfirmar?: (client: PoolClient, pedido: PedidoData, esNuevo: boolean) => Promise<void>;
    },
  ): Promise<PedidoData> {
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

      if (opciones?.clubOnly && (!prevData || prevData.canal !== 'club' || !id.startsWith('club:'))) {
        throw new ForbiddenException('Solo puedes gestionar compras existentes de Club Yo Soy Santacruz.');
      }

      if (prevData?.canal === 'club') {
        if (puntoId !== String(prevData.punto?.id)) throw new BadRequestException('No se puede cambiar el punto de una compra del club.');
        finalPedido.canal = 'club';
        finalPedido.creditoPedidoId = prevData.creditoPedidoId;
        finalPedido.cliente = prevData.cliente;
        finalPedido.carrito = prevData.carrito;
        finalPedido.total = prevData.total;
        finalPedido.entregaProgramada = prevData.entregaProgramada;
        finalPedido.fechaProgramada = prevData.fechaProgramada;
        finalPedido.entrega = 'recoge';
        finalPedido.pago = 'Crédito';
        if (user && !tieneAccesoTotal(user.rol)) {
          const asignado = await client.query(`SELECT 1 FROM usuario_punto_venta WHERE usuario_id = $1 AND punto_venta_id::text = $2`, [user.sub, String(prevData.punto?.id)]);
          if (!asignado.rowCount) throw new ForbiddenException('No tiene asignado el punto de este pedido del club.');
        }
        if (opciones?.clubOnly) {
          const anterior = String(prevData.estado ?? '').trim().toLowerCase();
          const siguiente = String(pedido.estado ?? '').trim().toLowerCase();
          const transiciones: Record<string, string[]> = {
            'en proceso': ['en proceso', 'en producción', 'alistado'],
            'en producción': ['en producción', 'alistado', 'en proceso'],
            alistado: ['alistado', 'facturado', 'en producción'],
            facturado: ['facturado', 'entregado'],
            entregado: ['entregado'],
          };
          if (!(transiciones[anterior] ?? []).includes(siguiente)) throw new ForbiddenException('La transición del proceso no está permitida para tu rol.');
        }
      } else if (id.startsWith('club:') || pedido.canal === 'club') {
        throw new BadRequestException('El pedido del club debe proceder de una compra registrada.');
      }

      if (prev.rowCount) {
        // Edición: conserva el consecutivo, la comanda y la fecha originales
        // para no romper la trazabilidad ni reasignar números.
        // También conserva los demás campos del pedido anterior que NO vinieron
        // en la edición (para evitar perder información al actualizar solo algunos campos).
        finalPedido.consecutivo =
          (typeof prevData!.consecutivo === 'number'
            ? prevData!.consecutivo
            : prev.rows[0].consecutivo) ?? finalPedido.consecutivo;
        finalPedido.comanda = prevData!.comanda ?? finalPedido.comanda;
        finalPedido.fecha = prevData!.fecha ?? finalPedido.fecha;
        // Preserva campos que no vinieron en la edición
        if (!pedido.cliente) finalPedido.cliente = prevData!.cliente;
        if (!pedido.carrito) finalPedido.carrito = prevData!.carrito;
        if (!pedido.punto) finalPedido.punto = prevData!.punto;
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
             FROM pedidos WHERE punto_id = $1 AND COALESCE(data->>'canal', '') <> 'club'`,
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
      // La devolución es final: una pantalla con datos viejos no puede revertirla.
      const esDevolucion = (s: unknown) =>
        ['devolución', 'devolucion'].includes(String(s ?? '').trim().toLowerCase());
      if (prevData && esDevolucion(prevData.estado)) {
        finalPedido.estado = prevData.estado;
        finalPedido.anulado = prevData.anulado;
      }
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
      const metaActual: DespachoMeta = prev.rowCount
        ? (prev.rows[0].meta ?? {})
        : {};
      const normEstado = (s: unknown) => String(s ?? '').trim().toLowerCase();
      const nuevoEstadoNorm = normEstado(estado);
      const entraAFacturadoODespachado =
        (nuevoEstadoNorm === 'facturado' || nuevoEstadoNorm === 'despachado' || (prevData?.canal === 'club' && nuevoEstadoNorm === 'entregado')) &&
        nuevoEstadoNorm !== normEstado(estadoAnterior);
      const replicasActuales = Array.isArray(
        (metaActual as { replicas?: unknown }).replicas,
      )
        ? ((metaActual as { replicas?: unknown[] }).replicas ?? [])
        : [];
      const estaAnulandoAhora =
        anulado &&
        !anuladoAnterior &&
        (nuevoEstadoNorm === 'cancelado' || nuevoEstadoNorm === 'anulado');
      if (estaAnulandoAhora && replicasActuales.length > 0) {
        throw new BadRequestException(
          'Este pedido tiene réplicas. Primero quítalas para poder anular o cancelar.',
        );
      }
      // Solo bloquear anulación si el pedido ya fue facturado o despachado al ERP.
      const yaFacturadoODespachado =
        ['facturado', 'despachado', 'en tránsito', 'en transito', 'entregado', 'devolución', 'devolucion'].includes(
          normEstado(estadoAnterior),
        );
      if (estaAnulandoAhora && yaFacturadoODespachado) {
        throw new BadRequestException(
          'No se puede anular o cancelar un pedido que ya fue facturado o despachado.',
        );
      }
      if (!anulado && entraAFacturadoODespachado) {
        const numFactura = String(metaActual.facturaNumero ?? '').trim();
        const valFactura = Number(metaActual.facturaValor);
        if (!numFactura || !Number.isFinite(valFactura) || valFactura <= 0) {
          throw new BadRequestException(
            'No se puede facturar o despachar sin número y valor de factura.',
          );
        }
        if (prevData?.canal === 'club' && !String(metaActual.porcionador || '').trim()) {
          throw new BadRequestException('Asigne el porcionador antes de facturar o entregar la compra del club.');
        }
      }
      if (prevData?.canal === 'club' && ['en tránsito', 'en transito'].includes(nuevoEstadoNorm)) {
        throw new BadRequestException('Las compras del club se recogen en el punto de venta.');
      }
      if (prevData?.canal === 'club' && nuevoEstadoNorm === 'entregado' && nuevoEstadoNorm !== normEstado(estadoAnterior)) {
        const evidencia = await client.query(`SELECT 1 FROM comprobantes_entrega_club WHERE pedido_id = $1 LIMIT 1`, [id]);
        if (!evidencia.rowCount) throw new BadRequestException('Adjunte la foto de la factura junto a la cedula antes de marcar la compra como entregada.');
      }
      const metaDestino: DespachoMeta = estaAnulandoAhora ? {} : metaActual;
      // Red de seguridad: `meta.fin`/`meta.despachoFin` normalmente los guarda
      // el frontend en una llamada APARTE (actualizarMeta). Si esa llamada
      // falla en silencio (red, carrera con esta misma petición, etc.) el
      // pedido avanza de estado pero se queda SIN el timestamp, y entonces el
      // cálculo de "a tiempo"/el pago en Liquidación lo trata como si nunca
      // hubiera terminado. Al llegar aquí a un estado que YA implica ese paso
      // hecho, se completa el dato si todavía falta, para no perderlo.
      if (!estaAnulandoAhora) {
        const despachadoOMas = [
          'despachado',
          'en tránsito',
          'en transito',
          'entregado',
        ].includes(nuevoEstadoNorm);
        const facturadoOMas =
          despachadoOMas || nuevoEstadoNorm === 'facturado';
        if (facturadoOMas && !metaDestino.fin) {
          metaDestino.fin = new Date().toISOString();
        }
        if (despachadoOMas && !metaDestino.despachoFin) {
          metaDestino.despachoFin = new Date().toISOString();
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
           (id, consecutivo, punto_id, estado, anulado, fecha, data, meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           consecutivo = EXCLUDED.consecutivo,
           punto_id = EXCLUDED.punto_id,
           estado = EXCLUDED.estado,
           anulado = EXCLUDED.anulado,
           fecha = EXCLUDED.fecha,
           data = EXCLUDED.data,
           meta = EXCLUDED.meta,
           actualizado_en = now()`,
        [
          id,
          consecutivo,
          puntoId,
          estado,
          anulado,
          fecha,
          JSON.stringify(finalPedido),
          JSON.stringify(metaDestino ?? {}),
        ],
      );

      if (estaAnulandoAhora) {
        await client.query(
          `DELETE FROM comprobantes_pago WHERE pedido_id = $1`,
          [id],
        );
      }

      // SINCRONIZACIÓN AUTOMÁTICA CON DRIVIN: Si se cancela el pedido,
      // notificar a Drivin para que actualice el estado allá también.
      // Se ejecuta de forma asíncrona (no-bloqueante) después de guardar.
      if (
        anulado &&
        !anuladoAnterior &&
        (nuevoEstadoNorm === 'cancelado' || nuevoEstadoNorm === 'anulado') &&
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

      // SINCRONIZACIÓN AUTOMÁTICA CON DRIVIN: si el pedido YA fue enviado a
      // Drivin (facturado) y esta edición cambia si es "Entrega programada"
      // (Posterior) o su fecha elegida, Drivin se queda con la fecha del
      // envío original porque no se vuelve a mandar (la bandera drivinEnviado
      // bloquea el reenvío). Se corrige SOLO la fecha de despacho allá.
      if (
        !estaAnulandoAhora &&
        metaActual.drivinEnviado === true &&
        finalPedido.comanda &&
        puntoId &&
        (prevData?.entregaProgramada !== finalPedido.entregaProgramada ||
          String(prevData?.fechaProgramada ?? '') !==
            String(finalPedido.fechaProgramada ?? ''))
      ) {
        this.actualizarFechaEnDrivin(id).catch((e) => {
          this.logger.error(
            `Error no controlado al corregir fecha en Drivin: ${String(e)}`,
          );
        });
      }

      if (prevData?.canal === 'club' && prevData.creditoPedidoId) {
        const terminado = ['despachado', 'entregado', 'en tránsito', 'en transito'].includes(nuevoEstadoNorm);
        const estadoCredito = anulado ? 'anulado' : terminado ? 'entregado' : nuevoEstadoNorm === 'facturado' ? 'facturado' : 'pendiente';
        await client.query(
          `UPDATE credito_empleados_pedidos SET estado = $2,
             cartera_estado = CASE WHEN $2 = 'anulado' THEN 'anulado' WHEN $2 IN ('facturado', 'entregado') THEN 'facturado' ELSE 'pendiente' END,
             factura_numero = COALESCE(NULLIF($3, ''), factura_numero), actualizado_en = now()
           WHERE id = $1`,
          [String(prevData.creditoPedidoId), estadoCredito, String(metaDestino.facturaNumero || '')],
        );
      }

      if (opciones?.antesDeConfirmar) {
        await opciones.antesDeConfirmar(client, finalPedido, !prev.rowCount);
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

  /**
   * Registra la devolución (total o parcial) de un pedido ya facturado: guarda
   * los productos devueltos, la factura de la devolución y el valor devuelto,
   * descuenta ese valor de `facturaValor` (lo que liquida el Cuadre de caja) y
   * deja el pedido en estado "Devolución". Todo en una sola transacción.
   */
  async registrarDevolucion(
    id: string,
    body: {
      facturaNumero?: unknown;
      valorDevuelto?: unknown;
      motivo?: unknown;
      productos?: unknown;
    },
    user?: JwtPayload,
  ): Promise<{ pedido: PedidoData; meta: DespachoMeta }> {
    const facturaNumero = String(body?.facturaNumero ?? '').trim();
    const valorDevuelto = Math.round(Number(body?.valorDevuelto));
    const motivo = String(body?.motivo ?? '').trim();
    if (!facturaNumero || facturaNumero.length > 60) {
      throw new BadRequestException('Ingresa el número de la factura de la devolución.');
    }
    if (!Number.isFinite(valorDevuelto) || valorDevuelto <= 0) {
      throw new BadRequestException('Ingresa el valor devuelto (mayor que 0).');
    }
    if (motivo.length > 300) {
      throw new BadRequestException('El motivo no puede superar 300 caracteres.');
    }
    const solicitados = Array.isArray(body?.productos) ? body.productos : [];
    if (solicitados.length === 0 || solicitados.length > 200) {
      throw new BadRequestException('Selecciona al menos un producto devuelto.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const prev = await client.query<{ data: PedidoData; meta: DespachoMeta }>(
        `SELECT data, meta FROM pedidos WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!prev.rowCount) throw new NotFoundException('Pedido no encontrado.');
      const data = prev.rows[0].data ?? {};
      const meta = prev.rows[0].meta ?? {};
      const estadoAnterior = String(data.estado ?? '');
      const estadoNorm = estadoAnterior.trim().toLowerCase();
      if (data.anulado === true) {
        throw new BadRequestException('No se puede registrar una devolución en un pedido anulado.');
      }
      if (estadoNorm === 'devolución' || estadoNorm === 'devolucion' || meta.devolucion) {
        throw new BadRequestException('Este pedido ya tiene una devolución registrada.');
      }
      const estadosValidos = ['facturado', 'despachado', 'en tránsito', 'en transito', 'entregado', 'rechazado'];
      if (!estadosValidos.includes(estadoNorm)) {
        throw new BadRequestException('Solo se registran devoluciones de pedidos facturados o despachados.');
      }
      const valorAnterior = Number(meta.facturaValor);
      if (!Number.isFinite(valorAnterior) || valorAnterior <= 0) {
        throw new BadRequestException('El pedido no tiene un valor facturado.');
      }
      if (valorDevuelto > valorAnterior) {
        throw new BadRequestException('El valor devuelto no puede superar el valor facturado.');
      }

      type Item = {
        id?: string;
        cantidad?: number;
        producto?: { referencia?: string; producto?: string; um?: string; precio?: number };
      };
      const carrito = (Array.isArray(data.carrito) ? data.carrito : []) as Item[];
      const usados = new Set<string>();
      const productos = solicitados.map((raw) => {
        const s = (raw ?? {}) as { itemId?: unknown; cantidad?: unknown };
        const itemId = String(s.itemId ?? '');
        const item = carrito.find((i) => String(i.id ?? '') === itemId);
        if (!item || usados.has(itemId)) {
          throw new BadRequestException('Uno de los productos devueltos no pertenece al pedido.');
        }
        usados.add(itemId);
        const original = Number(item.cantidad) || 0;
        const cantidad = Math.round(Number(s.cantidad) * 1000) / 1000;
        if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > original) {
          throw new BadRequestException(
            `Cantidad devuelta inválida para ${item.producto?.producto ?? 'un producto'}.`,
          );
        }
        const precio = Number(item.producto?.precio) || 0;
        return {
          itemId,
          referencia: String(item.producto?.referencia ?? ''),
          producto: String(item.producto?.producto ?? ''),
          um: String(item.producto?.um ?? ''),
          precio,
          cantidadOriginal: original,
          cantidadDevuelta: cantidad,
          cantidadFinal: Math.round((original - cantidad) * 1000) / 1000,
          valor: Math.round(precio * cantidad),
        };
      });

      let usuarioNombre: string | null = null;
      if (user?.sub) {
        const u = await client.query<{ nombre: string }>(
          `SELECT nombre FROM usuarios WHERE id = $1::bigint LIMIT 1`,
          [user.sub],
        );
        usuarioNombre = u.rows[0]?.nombre ?? null;
      }
      const fecha = new Date().toISOString();
      const valorNuevo = valorAnterior - valorDevuelto;
      const devolucion = {
        facturaNumero,
        valorAnterior,
        valorDevuelto,
        valorNuevo,
        motivo: motivo || null,
        productos,
        estadoAnterior,
        fecha,
        usuarioId: user?.sub ?? null,
        usuarioNombre,
      };
      const cambiosMeta = { devolucion, facturaValor: valorNuevo };
      const trazaPrevia = Array.isArray(data.trazabilidad) ? data.trazabilidad : [];
      const nuevoData: PedidoData = {
        ...data,
        estado: 'Devolución',
        trazabilidad: [
          ...trazaPrevia,
          {
            tipo: 'estado',
            estadoAnterior,
            estadoNuevo: 'Devolución',
            motivo: `Devolución factura ${facturaNumero}: $${valorDevuelto.toLocaleString('es-CO')}${motivo ? ` · ${motivo}` : ''}`,
            fecha,
            usuarioId: user?.sub ?? null,
            usuarioNombre,
            usuarioCedula: user?.cedula ?? null,
          },
        ],
      };
      await client.query(
        `UPDATE pedidos
            SET estado = 'Devolución',
                data = $2::jsonb,
                meta = COALESCE(meta, '{}'::jsonb) || $3::jsonb,
                actualizado_en = now()
          WHERE id = $1`,
        [id, JSON.stringify(nuevoData), JSON.stringify(cambiosMeta)],
      );
      if (data.canal === 'club' && data.creditoPedidoId) {
        await client.query(
          `UPDATE credito_empleados_pedidos SET estado = 'entregado', total = $2, cartera_estado = 'facturado', actualizado_en = now() WHERE id = $1`,
          [String(data.creditoPedidoId), valorNuevo],
        );
      }
      await client.query('COMMIT');
      const { trazabilidad: _traza, ...pedido } = nuevoData;
      return { pedido, meta: { ...meta, ...cambiosMeta } };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Cambia la lista de réplicas de un pedido de forma ATÓMICA: bloquea la fila
   * (FOR UPDATE), aplica `fn` sobre las réplicas ACTUALES de la base de datos y
   * guarda. Así varias pantallas de Despacho y el job de Drivin no se pisan
   * (antes cada uno reescribía la lista completa con datos viejos y un cambio
   * —p. ej. una desasignación— podía perderse). `fn` devuelve null si no hay
   * nada que cambiar.
   */
  private async modificarReplicas(
    id: string,
    fn: (actuales: ReplicaMeta[]) => ReplicaMeta[] | null,
  ): Promise<{ replicas: ReplicaMeta[]; cambio: boolean }> {
    const cliente = await this.pool.connect();
    let previo: { punto_id: string | null; meta: DespachoMeta } | undefined;
    let nuevas: ReplicaMeta[] | null = null;
    let actuales: ReplicaMeta[] = [];
    try {
      await cliente.query('BEGIN');
      const r = await cliente.query<{ punto_id: string | null; meta: DespachoMeta }>(
        `SELECT punto_id, meta FROM pedidos WHERE id = $1 FOR UPDATE`,
        [id],
      );
      previo = r.rows[0];
      if (!previo) throw new NotFoundException('Pedido no encontrado');
      const lista = (previo.meta ?? {}).replicas;
      actuales = Array.isArray(lista)
        ? (lista as ReplicaMeta[]).filter((x) => x && Number(x.numero) > 0)
        : [];
      nuevas = fn(actuales.map((x) => ({ ...x })));
      if (nuevas) {
        await cliente.query(
          `UPDATE pedidos
             SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('replicas', $2::jsonb),
                 actualizado_en = now()
           WHERE id = $1`,
          [id, JSON.stringify(nuevas)],
        );
      }
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      cliente.release();
    }
    if (nuevas && previo) {
      this.extensiones
        .registrarAsignaciones(id, previo.punto_id, previo.meta ?? {}, { replicas: nuevas })
        .catch((e) =>
          this.logger.warn(`No se pudo registrar el pedido ${id} en extensiones: ${String(e)}`),
        );
    }
    return { replicas: nuevas ?? actuales, cambio: !!nuevas };
  }

  /**
   * Cambia campos de UNA réplica. Con `siCodigo` solo aplica si su
   * domiciliarioCodigo actual es ese (evita deshacer una asignación más nueva).
   */
  async parcharReplica(
    id: string,
    numero: number,
    cambios: Record<string, unknown>,
    siCodigo?: string | null,
  ) {
    const limpio: CambiosReplica = {};
    for (const k of ['domiciliario', 'domiciliarioCodigo', 'estado', 'drivinEnviadoEn'] as const) {
      if (typeof cambios?.[k] === 'string') limpio[k] = String(cambios[k]).trim();
    }
    if (typeof cambios?.drivinEnviado === 'boolean') limpio.drivinEnviado = cambios.drivinEnviado;
    if (Object.keys(limpio).length === 0) {
      throw new BadRequestException('Sin cambios válidos para la réplica');
    }
    return this.modificarReplicas(id, (reps) => {
      const i = reps.findIndex((r) => Number(r.numero) === numero);
      if (i < 0) return null;
      const r = reps[i];
      if (typeof siCodigo === 'string' && String(r.domiciliarioCodigo ?? '') !== siCodigo) {
        return null;
      }
      const hayCambio = (Object.keys(limpio) as (keyof CambiosReplica)[]).some(
        (k) => (r[k] ?? (typeof limpio[k] === 'string' ? '' : undefined)) !== limpio[k],
      );
      if (!hayCambio) return null;
      reps[i] = { ...r, ...limpio };
      return reps;
    });
  }

  /** Agrega la réplica `numero` (debe ser la siguiente en secuencia, máx. 5). */
  async agregarReplica(
    id: string,
    numero: number,
    domiciliario: string,
    domiciliarioCodigo?: string,
  ) {
    if (!(numero >= 1 && numero <= MAX_REPLICAS)) {
      throw new BadRequestException(`Máximo ${MAX_REPLICAS} réplicas por pedido`);
    }
    let conflicto = false;
    const res = await this.modificarReplicas(id, (reps) => {
      if (reps.some((r) => Number(r.numero) === numero)) return null; // ya existe (doble clic)
      const max = reps.reduce((mx, r) => Math.max(mx, Number(r.numero) || 0), 0);
      if (numero !== max + 1) {
        conflicto = true;
        return null;
      }
      return [
        ...reps,
        {
          numero,
          domiciliario: String(domiciliario ?? '').trim(),
          domiciliarioCodigo: String(domiciliarioCodigo ?? '').trim(),
        },
      ];
    });
    if (conflicto) {
      throw new ConflictException(
        'Otra persona cambió las réplicas de este pedido. Cierra y vuelve a abrir la réplica.',
      );
    }
    return res;
  }

  /** Quita la réplica `numero`, solo si es la última (mantiene la secuencia). */
  async quitarReplica(id: string, numero: number) {
    let conflicto = false;
    const res = await this.modificarReplicas(id, (reps) => {
      if (!reps.some((r) => Number(r.numero) === numero)) return null;
      const max = reps.reduce((mx, r) => Math.max(mx, Number(r.numero) || 0), 0);
      if (numero !== max) {
        conflicto = true;
        return null;
      }
      return reps.filter((r) => Number(r.numero) !== numero);
    });
    if (conflicto) {
      throw new ConflictException('Solo se puede quitar la última réplica.');
    }
    return res;
  }

  /** Mezcla cambios en la metadata de despacho de un pedido. */
  async actualizarMeta(
    id: string,
    cambios: DespachoMeta,
    user?: JwtPayload,
    clubOnly = false,
  ): Promise<{ id: string }> {
    const clubPedido = id.startsWith('club:') || clubOnly;
    if (clubPedido) {
      const pedido = await this.pool.query<{ punto_id: string; data: PedidoData }>(`SELECT punto_id, data FROM pedidos WHERE id = $1`, [id]);
      if (!pedido.rows[0] || pedido.rows[0].data?.canal !== 'club') throw new ForbiddenException('La compra no pertenece al club.');
      const supervisorGeneralMeta = ['supervisor general', 'supervisor_general'].includes(String(user?.rol ?? '').trim().toLowerCase());
      if (user && !tieneAccesoTotal(user.rol) && !supervisorGeneralMeta) {
        const asignado = await this.pool.query(`SELECT 1 FROM usuario_punto_venta WHERE usuario_id = $1 AND punto_venta_id::text = $2 LIMIT 1`, [user.sub, pedido.rows[0].punto_id]);
        if (!asignado.rowCount) throw new ForbiddenException('No tiene asignado el punto de esta compra.');
      }
      if (clubOnly) {
        const permitidas = new Set(['porcionador', 'inicio', 'fin', 'segmentado', 'segmentos', 'facturaNumero', 'facturaValor', 'facturadoPor', 'despachoFin', 'entregado', 'entregadoEn', 'despachadoPor', 'evidenciaEntregaClub']);
        if (Object.keys(cambios ?? {}).some((key) => !permitidas.has(key))) throw new ForbiddenException('Ese dato no se puede modificar desde el panel del club.');
      }
    }
    const tocaAsignacion =
      typeof cambios?.domiciliario === 'string' || Array.isArray(cambios?.replicas);
    const previo = tocaAsignacion
      ? (
          await this.pool.query<{ punto_id: string | null; meta: DespachoMeta }>(
            `SELECT punto_id, meta FROM pedidos WHERE id = $1`,
            [id],
          )
        ).rows[0]
      : undefined;
    await this.pool.query(
      `UPDATE pedidos
         SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb,
             actualizado_en = now()
       WHERE id = $1`,
      [id, JSON.stringify(cambios ?? {})],
    );
    if (previo) {
      // No bloquea ni rompe el guardado de la metadata si falla.
      this.extensiones
        .registrarAsignaciones(id, previo.punto_id, previo.meta ?? {}, cambios)
        .catch((e) =>
          this.logger.warn(`No se pudo registrar el pedido ${id} en extensiones: ${String(e)}`),
        );
    }
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

  async obtenerEvidenciaEntregaClub(id: string, user?: JwtPayload) {
    await this.verificarAccesoEvidenciaClub(id, user);
    const { rows } = await this.pool.query<{ imagen: string; mime: string | null; subido_por: string | null; creado_en: string }>(
      `SELECT e.imagen, e.mime, e.subido_por, e.creado_en FROM comprobantes_entrega_club e JOIN pedidos p ON p.id = e.pedido_id WHERE e.pedido_id = $1 AND p.data->>'canal' = 'club' LIMIT 1`, [id],
    );
    return rows[0] ? { imagen: rows[0].imagen, mime: rows[0].mime, subidoPor: rows[0].subido_por, creadoEn: rows[0].creado_en } : null;
  }

  async guardarEvidenciaEntregaClub(id: string, imagen: string, mime: string | null, subidoPor: string | null, user?: JwtPayload) {
    await this.verificarAccesoEvidenciaClub(id, user);
    if (!imagen || typeof imagen !== 'string' || !imagen.startsWith('data:image/')) throw new BadRequestException('Adjunte una imagen valida de la factura y la cedula.');
    const { rowCount } = await this.pool.query(
      `WITH evidencia AS (
         INSERT INTO comprobantes_entrega_club (pedido_id, imagen, mime, subido_por)
         SELECT id, $2, $3, $4 FROM pedidos WHERE id = $1 AND data->>'canal' = 'club'
         ON CONFLICT (pedido_id) DO UPDATE SET imagen = EXCLUDED.imagen, mime = EXCLUDED.mime, subido_por = EXCLUDED.subido_por, creado_en = now()
         RETURNING pedido_id
       ) UPDATE pedidos p SET meta = COALESCE(p.meta, '{}'::jsonb) || '{"evidenciaEntregaClub":true}'::jsonb, actualizado_en = now()
         FROM evidencia e WHERE p.id = e.pedido_id`,
      [id, imagen, mime, subidoPor],
    );
    if (!rowCount) throw new NotFoundException('Compra del club no encontrada.');
    return { id };
  }

  private async verificarAccesoEvidenciaClub(id: string, user?: JwtPayload) {
    const res = await this.pool.query<{ punto_id: string; data: PedidoData }>(`SELECT punto_id, data FROM pedidos WHERE id = $1`, [id]);
    const row = res.rows[0];
    if (!row || row.data?.canal !== 'club') throw new NotFoundException('Compra del club no encontrada.');
    if (!user || tieneAccesoTotal(user.rol) || ['despacho', 'supervisor general', 'supervisor_general'].includes(String(user.rol ?? '').trim().toLowerCase())) {
      if (!user) throw new ForbiddenException('Usuario requerido.');
      if (tieneAccesoTotal(user.rol) || ['supervisor general', 'supervisor_general'].includes(String(user.rol ?? '').trim().toLowerCase())) return;
    }
    const { rowCount } = await this.pool.query(`SELECT 1 FROM usuario_punto_venta WHERE usuario_id = $1 AND punto_venta_id::text = $2 LIMIT 1`, [user.sub, row.punto_id]);
    if (!rowCount) throw new ForbiddenException('No tiene acceso a este punto de venta.');
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
    // Usa los datos ACTUALES del cliente (barrio, dirección...), para que un
    // reenvío tras corregir el cliente suba la información corregida.
    await this.refrescarClientes([pedido]);

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

    // Kilos consolidados: ítems por KG + ítems de unidad con medida en la descripción.
    const kilos = pesoCarritoKg(pedido.carrito);

    // Fechas y ventanas (zona horaria America/Bogota).
    // Para una RÉPLICA la fecha de entrega es HOY (la réplica se despacha el
    // día en que se sube a Drivin), pero la VENTANA HORARIA se hereda del
    // pedido original: se usa la misma horaDespacho para que el compromiso de
    // hora no cambie de una réplica a otra.
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
    // "8" -> ventana 06:00–08:00. Las réplicas HEREDAN esta hora del pedido
    // original para mantener el mismo compromiso horario que el pedido base.
    const horaDespacho = String(
      (pedido as { horaDespacho?: string }).horaDespacho ?? '',
    ).trim();
    const tieneHora = /^\d{1,2}:\d{2}$/.test(horaDespacho);
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
    // Suma horas a una hora "HH:MM" sin pasar de las 23:59.
    const sumarHoras = (hhmm: string, horas: number) => {
      const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10) || 0);
      let total = h * 60 + m + Math.round(horas * 60);
      if (total > 23 * 60 + 59) total = 23 * 60 + 59;
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
      // La ventana no puede tener duración cero: si el pedido se toma a las
      // 7:00 PM o más tarde, la promesa "hasta las 7 PM" ya venció, así que se
      // extiende el fin 1 hora desde el inicio (Drivin rechaza ventanas de
      // duración cero y la réplica/pedido no subía).
      if (inicioVentana >= finVentana) finVentana = sumarHoras(inicioVentana, 1);
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

    // Pedido ARRASTRADO: su fecha de entrega ya pasó (se tomó un día anterior,
    // o era Posterior con fecha vencida) y se sube a Drivin hoy, al facturar.
    // SOLO para Drivin se usan la fecha y hora de este momento (Despacho y
    // compromisos mín/máx); en SIGCOMPRO el pedido conserva su fecha de
    // creación y de despacho. Si tenía hora de despacho y aún no ha pasado, se
    // respeta esa ventana.
    const ahora = new Date();
    const hoy = fechaISO(ahora);
    if (!esReplica && fechaEntrega < hoy) {
      const horaActual = horaHM(ahora);
      fechaEntrega = hoy;
      if (esRecogePdv) {
        inicioVentana = horaActual;
        finVentana = '19:00';
      } else if (
        !programado &&
        tieneHora &&
        normalizarHora(horaDespacho) > horaActual
      ) {
        inicioVentana = restarDosHoras(horaDespacho);
        finVentana = normalizarHora(horaDespacho);
      } else {
        inicioVentana = horaActual;
        finVentana = sumarHoras(horaActual, 2);
      }
      if (inicioVentana >= finVentana) finVentana = sumarHoras(inicioVentana, 1);
      // Al final del día no hay margen para sumar: se abre la ventana hacia atrás.
      if (inicioVentana >= finVentana) inicioVentana = restarDosHoras(finVentana);
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
      puntoId: String(punto.id ?? ''),
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
   * Configuración de Drivin del punto (mapeo configurable desde la UI, guardado
   * en puntos_venta): si `drivin` es true, este punto SUBE al schema y BAJA por
   * la localidad indicados. Si la BD no tiene valores, cae al mapeo histórico
   * por número/nombre. Busca por id y, si no, por código del punto.
   */
  private async puntoDrivinCfg(
    puntoId: string | undefined,
    puntoCodigo: string,
    puntoNombre: string,
  ): Promise<{ drivin: boolean; schema: string; localidad: string }> {
    type CfgRow = {
      drivin: boolean;
      drivin_schema_code: string | null;
      drivin_localidad: string | null;
    };
    let row: CfgRow | null = null;
    try {
      if (puntoId) {
        const r = await this.pool.query<CfgRow>(
          `SELECT drivin, drivin_schema_code, drivin_localidad
             FROM puntos_venta WHERE id = $1::bigint LIMIT 1`,
          [puntoId],
        );
        if (r.rowCount) row = r.rows[0];
      }
      if (!row && puntoCodigo) {
        const r = await this.pool.query<CfgRow>(
          `SELECT drivin, drivin_schema_code, drivin_localidad
             FROM puntos_venta WHERE codigo = $1 LIMIT 1`,
          [puntoCodigo],
        );
        if (r.rowCount) row = r.rows[0];
      }
    } catch {
      /* si falla la consulta, se usa el mapeo por nombre/número */
    }
    return {
      drivin: row ? row.drivin === true : false,
      schema:
        (row?.drivin_schema_code && row.drivin_schema_code.trim()) ||
        this.schemaDrivinPara(puntoCodigo, puntoNombre),
      localidad:
        (row?.drivin_localidad && row.drivin_localidad.trim()) ||
        this.localidadDrivin(puntoCodigo, puntoNombre),
    };
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
              : method !== 'GET'
                ? // Acciones sin body (approve/optimize): igual que el curl de Drivin.
                  { 'Content-Type': 'application/json', 'Content-Length': 0 }
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
  private async drivinScenarios(date: string, fresco = false): Promise<DrivinScenario[]> {
    const cached = this.cacheScenarios.get(date);
    if (!fresco && cached && Date.now() - cached.ts < this.DRIVIN_TTL) {
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
    const cfg = await this.puntoDrivinCfg(undefined, puntoCodigo, puntoNombre);
    const localidad = cfg.localidad;
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
    const { mapa, completo } = await this.lecturaCompartidaAsignaciones();
    // Un mapa incompleto haría ver como "desasignadas" las órdenes del escenario
    // que falló; se devuelve el último completo para que nadie desasigne con
    // datos parciales.
    if (!completo) return this.cacheAsignaciones?.datos ?? {};
    return mapa;
  }

  /**
   * UNA sola lectura de Drivin cada 5s compartida por todas las pantallas de
   * Despacho y por la sincronización del servidor: si hay una en curso se
   * espera; si la última completa tiene menos de 5s se reutiliza.
   * La lista de escenarios se refresca saltando la caché como máximo una vez
   * por minuto (crear un plan la invalida de inmediato).
   */
  private async lecturaCompartidaAsignaciones(): Promise<{
    mapa: Record<string, { code: string; nombre: string } | null>;
    completo: boolean;
    hayEscenarios: boolean;
  }> {
    const u = this.ultimaLecturaCompleta;
    if (u && Date.now() - u.ts < 5000) {
      return { mapa: u.mapa, completo: true, hayEscenarios: u.hayEscenarios };
    }
    if (!this.lecturaAsignaciones) {
      const fresco = Date.now() - this.ultimoRefrescoEscenarios > 60_000;
      if (fresco) this.ultimoRefrescoEscenarios = Date.now();
      this.lecturaAsignaciones = this.leerAsignacionesDrivin(fresco)
        .then((r) => {
          if (r.completo) {
            this.ultimaLecturaCompleta = {
              ts: Date.now(),
              mapa: r.mapa,
              hayEscenarios: r.hayEscenarios,
            };
            this.cacheAsignaciones = { ts: Date.now(), datos: r.mapa };
          }
          return r;
        })
        .finally(() => {
          this.lecturaAsignaciones = null;
        });
    }
    return this.lecturaAsignaciones;
  }

  private async leerAsignacionesDrivin(fresco: boolean): Promise<{
    mapa: Record<string, { code: string; nombre: string } | null>;
    completo: boolean;
    hayEscenarios: boolean;
  }> {
    const out: Record<string, { code: string; nombre: string } | null> = {};
    let completo = true;
    let hayEscenarios = false;
    try {
      const hoy = this.diaBogota();
      const scenarios = await this.drivinScenarios(hoy, fresco);
      hayEscenarios = scenarios.length > 0;
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
      // Limita la concurrencia para no saturar Drivin cuando hay muchos
      // esquemas. Si falla cualquier escenario, el mapa no se usa para aplicar
      // cambios: la siguiente corrida vuelve a intentarlo con datos completos.
      const grupos: Array<
        Array<{
          orders?: Array<{ code?: string; vehicle_code?: string | null }>;
        }>
      > = Array.from({ length: tokens.length }, () => []);
      let siguienteToken = 0;
      const leerEscenario = async () => {
        while (siguienteToken < tokens.length) {
          const indice = siguienteToken++;
          const token = tokens[indice];
          try {
            const r = await this.drivinGet<{
              response?: Array<{
                orders?: Array<{ code?: string; vehicle_code?: string | null }>;
              }>;
            }>(`/orders?token=${encodeURIComponent(token)}`);
            grupos[indice] = Array.isArray(r?.response) ? r.response : [];
          } catch (e) {
            completo = false;
            this.logger.warn(
              `No se pudieron leer órdenes del escenario Drivin ${indice + 1}/${tokens.length}: ${
                e instanceof Error ? e.message : String(e)
              }`,
            );
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, tokens.length) }, () => leerEscenario()),
      );
      for (const arr of grupos) {
        for (const g of arr) {
          for (const o of g.orders ?? []) {
            if (!o.code) continue;
            // Si la orden sale en varios escenarios, manda el que tiene vehículo.
            if (o.vehicle_code) {
              out[o.code] = {
                code: o.vehicle_code,
                nombre: nombrePorCode.get(o.vehicle_code) ?? o.vehicle_code,
              };
            } else if (!(o.code in out)) {
              out[o.code] = null;
            }
          }
        }
      }
    } catch (e) {
      completo = false;
      this.logger.warn(
        `No se pudieron leer las asignaciones de Drivin: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    return { mapa: out, completo, hayEscenarios };
  }

  /**
   * Sincroniza cambios de domiciliario de Drivin en el servidor (no depende de
   * que alguien tenga Despacho abierto), con las mismas reglas que esa vista:
   *  - Pedido base: refleja el domiciliario asignado o lo libera si Drivin lo
   *    quitó; si está Despachado o En tránsito y queda sin vehículo vuelve a
   *    Facturado. Solo pedidos de HOY en Facturado/Despachado/En tránsito;
   *    los Entregados/Rechazados ya no se consultan.
   *  - Réplicas ("comanda-N"): se baja el domiciliario que Drivin asignó o se
   *    libera si lo quitó, AUNQUE el pedido ya esté En tránsito/Entregado.
   * Solo si el mapa de Drivin se leyó COMPLETO. Cada cambio de réplica es
   * atómico y condicionado (no pisa cambios hechos mientras tanto).
   */
  async sincronizarDesasignacionesDrivin(): Promise<number> {
    if (this.sincronizandoDesasignaciones) return 0;
    this.sincronizandoDesasignaciones = true;
    let sincronizados = 0;
    let lockClient: PoolClient | null = null;
    let bloqueoTomado = false;
    try {
      lockClient = await this.pool.connect();
      const lock = await lockClient.query<{ ok: boolean }>(
        `SELECT pg_try_advisory_lock(hashtext('drivin_sincronizar_asignaciones')) AS ok`,
      );
      if (!lock.rows[0]?.ok) return 0;
      bloqueoTomado = true;

      const { mapa, completo, hayEscenarios } = await this.lecturaCompartidaAsignaciones();
      if (!completo || (Object.keys(mapa).length === 0 && !hayEscenarios)) return 0;

      const hoy = this.diaBogota();
      const res = await this.pool.query<{
        id: string;
        punto_id: string | null;
        estado: string | null;
        data: PedidoData;
        meta: DespachoMeta;
        de_hoy: boolean;
      }>(
        `SELECT id, punto_id, estado, data, meta, de_hoy FROM (
           SELECT id, punto_id, estado, data, meta, actualizado_en,
             (
               (CASE
                  WHEN (data->>'entregaProgramada') = 'true'
                       AND COALESCE(data->>'fechaProgramada', '') <> ''
                  THEN (data->>'fechaProgramada')::date
                  ELSE (fecha AT TIME ZONE 'America/Bogota')::date
                END) = $1::date
               OR (NULLIF(meta->>'despachoFin', '')::timestamptz AT TIME ZONE 'America/Bogota')::date = $1::date
             ) AS de_hoy
           FROM pedidos
           WHERE anulado = false
         ) p
         WHERE (
             de_hoy
             AND LOWER(COALESCE(estado, '')) IN ('facturado', 'despachado', 'en tránsito', 'en transito')
           )
           OR (
             jsonb_typeof(meta->'replicas') = 'array'
             AND jsonb_array_length(meta->'replicas') > 0
             AND LOWER(COALESCE(estado, '')) IN
               ('facturado', 'despachado', 'en tránsito', 'en transito', 'entregado')
             AND (de_hoy OR actualizado_en >= now() - interval '2 days')
           )`,
        [hoy],
      );

      const drivinPorPunto = new Map<string, boolean>();
      for (const ped of res.rows) {
        try {
          const data = ped.data ?? {};
          const meta = (ped.meta ?? {}) as DespachoMeta & {
            domiciliario?: string | null;
            domiciliarioCodigo?: string | null;
            comprobante?: { tiene?: boolean; confirmado?: boolean } | null;
            replicas?: ReplicaMeta[];
          };
          const comanda = String(data.comanda ?? '').trim();
          if (!comanda) continue;

          const puntoId = String(ped.punto_id ?? data.punto?.id ?? '');
          if (!drivinPorPunto.has(puntoId)) {
            const cfg = await this.puntoDrivinCfg(
              puntoId || undefined,
              String(data.punto?.codigo ?? ''),
              String(data.punto?.nombre ?? ''),
            );
            drivinPorPunto.set(puntoId, cfg.drivin);
          }
          if (!drivinPorPunto.get(puntoId)) continue; // punto manual

          const est = String(ped.estado ?? '').trim().toLowerCase();

          // --- Pedido base (solo de hoy, Facturado/Despachado/En tránsito) ---
          let desasignar = false;
          let cambioBase = false;
          const enRuta = est === 'despachado' || est === 'en tránsito' || est === 'en transito';
          if (ped.de_hoy && (est === 'facturado' || enRuta)) {
            const enMapa = comanda in mapa;
            const asg = enMapa ? mapa[comanda] : undefined;
            const teniaDomi = !!(meta.domiciliario || meta.domiciliarioCodigo);
            if (asg) {
              const cambio = meta.domiciliarioCodigo !== asg.code || meta.domiciliario !== asg.nombre;
              if (cambio) {
                // Condicionado a que la asignación local siga siendo la que
                // leímos; no pisa un cambio manual/concurrente más reciente.
                const r = await this.pool.query(
                  `UPDATE pedidos
                     SET meta = COALESCE(meta, '{}'::jsonb)
                                || jsonb_build_object('domiciliario', $2, 'domiciliarioCodigo', $3),
                         actualizado_en = now()
                   WHERE id = $1
                     AND COALESCE(meta->>'domiciliario', '') = $4
                     AND COALESCE(meta->>'domiciliarioCodigo', '') = $5`,
                  [
                    ped.id,
                    asg.nombre,
                    asg.code,
                    String(meta.domiciliario ?? ''),
                    String(meta.domiciliarioCodigo ?? ''),
                  ],
                );
                cambioBase = Boolean(r.rowCount);
              }
              // También reintenta completar el estado si el guardado previo
              // falló después de sincronizar la metadata.
              const comprobantePendiente = !!meta.comprobante?.tiene && !meta.comprobante.confirmado;
              if (est === 'facturado' && !comprobantePendiente) {
                const guardado = await this.guardar(
                  { ...data, id: ped.id, estado: 'Despachado' },
                  undefined,
                );
                cambioBase ||= String(guardado.estado ?? '').trim().toLowerCase() === 'despachado';
              }
            } else {
              // Sin vehículo en Drivin: se libera si tenía domiciliario o si
              // sigue "en ruta" (Despachado/En tránsito) sin nadie asignado.
              desasignar = enMapa ? (teniaDomi || enRuta) : teniaDomi;
            }
            if (desasignar && teniaDomi) {
              // Condicionado a que siga el MISMO domiciliario que se vio.
              const r = await this.pool.query(
                `UPDATE pedidos
                   SET meta = COALESCE(meta, '{}'::jsonb)
                              || '{"domiciliario": "", "domiciliarioCodigo": ""}'::jsonb,
                       actualizado_en = now()
                 WHERE id = $1
                   AND COALESCE(meta->>'domiciliario', '') = $2
                   AND COALESCE(meta->>'domiciliarioCodigo', '') = $3`,
                [ped.id, String(meta.domiciliario ?? ''), String(meta.domiciliarioCodigo ?? '')],
              );
              if (!r.rowCount) desasignar = false;
            }
            if (desasignar && enRuta) {
              // Sin domiciliario no puede seguir Despachado/En tránsito: vuelve
              // a Facturado a esperar que Drivin reasigne.
              await this.guardar({ ...data, id: ped.id, estado: 'Facturado' }, undefined);
            }
          }

          // --- Réplicas ---
          let cambiosReplicas = 0;
          for (const r of Array.isArray(meta.replicas) ? meta.replicas : []) {
            const numero = Number(r.numero);
            if (!(numero > 0)) continue;
            const clave = `${comanda}-${numero}`;
            const a = clave in mapa ? mapa[clave] : undefined;
            const codigo = String(r.domiciliarioCodigo ?? '');
            const tenia = !!(r.domiciliario || r.domiciliarioCodigo);
            if (a) {
              if (codigo !== a.code) {
                const x = await this.parcharReplica(
                  ped.id,
                  numero,
                  { domiciliario: a.nombre, domiciliarioCodigo: a.code },
                  codigo,
                );
                if (x.cambio) cambiosReplicas++;
              }
              continue;
            }
            if (!tenia) continue;
            // null = la orden sigue en Drivin pero SIN domiciliario (desasignada).
            // Fuera del mapa (que solo trae los escenarios de HOY): se libera solo
            // si la réplica se subió hoy y no está ya entregada/rechazada.
            const subidaHoy = r.drivinEnviadoEn
              ? this.diaBogota(r.drivinEnviadoEn) === hoy
              : ped.de_hoy;
            const final = r.estado === 'approved' || r.estado === 'rejected';
            if (a === null || (subidaHoy && !final)) {
              const x = await this.parcharReplica(
                ped.id,
                numero,
                { domiciliario: '', domiciliarioCodigo: '' },
                codigo,
              );
              if (x.cambio) cambiosReplicas++;
            }
          }

          if (desasignar || cambioBase || cambiosReplicas > 0) {
            sincronizados++;
            this.logger.log(
              `Drivin sincronizado ${comanda} (${ped.id}):` +
                (cambioBase ? ' domiciliario actualizado' : '') +
                (desasignar ? ' domiciliario liberado' : '') +
                (desasignar && enRuta ? ' y vuelve a Facturado' : '') +
                (cambiosReplicas ? ` · ${cambiosReplicas} réplica(s) actualizada(s)` : ''),
            );
          }
        } catch (e) {
          this.logger.warn(
            `No se pudo sincronizar la desasignación del pedido ${ped.id}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(
        `Error al sincronizar desasignaciones de Drivin: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    } finally {
      if (lockClient) {
        if (bloqueoTomado) {
          await lockClient
            .query(`SELECT pg_advisory_unlock(hashtext('drivin_sincronizar_asignaciones'))`)
            .catch((e) =>
              this.logger.warn(
                `No se pudo liberar el bloqueo de sincronización Drivin: ${
                  e instanceof Error ? e.message : String(e)
                }`,
              ),
            );
        }
        lockClient.release();
      }
      this.sincronizandoDesasignaciones = false;
    }
    return sincronizados;
  }

  /* ------------------------------------------------------------------ */
  /* Planes y esquemas (consulta para el panel administrativo)          */
  /* ------------------------------------------------------------------ */

  /** Caché de planes por fecha (Drivin es lento con muchos escenarios). */
  private cachePlanes = new Map<string, { ts: number; datos: PlanDrivin[] }>();

  /**
   * Planes (escenarios) de Drivin de un día, con sus órdenes. Solo LECTURA.
   * Cada orden se cruza con SIGCOMPRO (pedido base o réplica "comanda-N") para
   * mostrar su estado aquí. Caché de 30 s por fecha (salvo `fresco`).
   */
  async planesDrivin(fecha: string, fresco = false): Promise<PlanDrivin[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('Fecha inválida (YYYY-MM-DD)');
    }
    const cache = this.cachePlanes.get(fecha);
    if (!fresco && cache && Date.now() - cache.ts < 30_000) return cache.datos;

    const [scenarios, vehiculos] = await Promise.all([
      this.drivinScenarios(fecha, true),
      this.drivinVehicles().catch(() => [] as DrivinVehicle[]),
    ]);
    const nombrePorCode = new Map<string, string>();
    for (const v of vehiculos) {
      if (!v.code) continue;
      const n = `${v.driver?.first_name ?? ''} ${v.driver?.last_name ?? ''}`.trim();
      nombrePorCode.set(v.code, n || v.code);
    }
    const puntos = await this.puntosPorEsquema();

    type GrupoDrivin = {
      code?: string;
      address_1?: string;
      area_level_2?: string;
      area_level_3?: string;
      orders?: Array<{
        code?: string;
        name?: string;
        delivery_date?: string;
        priority?: number | null;
        units_1?: number | null;
        vehicle_code?: string | null;
        trip_number?: number | null;
        supplier_name?: string | null;
      }>;
    };
    const planes: PlanDrivin[] = await Promise.all(
      scenarios
        .filter((s) => s.token)
        .map(async (s) => {
          let grupos: GrupoDrivin[] = [];
          let error: string | null = null;
          try {
            const r = await this.drivinGet<{ response?: GrupoDrivin[] }>(
              `/orders?token=${encodeURIComponent(s.token)}`,
            );
            grupos = Array.isArray(r?.response) ? r.response : [];
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
          }
          const ordenes: OrdenPlan[] = [];
          for (const g of grupos) {
            for (const o of g.orders ?? []) {
              if (!o.code) continue;
              const vc = o.vehicle_code ?? null;
              ordenes.push({
                codigo: o.code,
                cliente: o.name ?? '',
                codigoCliente: g.code ?? '',
                direccion: g.address_1 ?? '',
                barrio: g.area_level_3 ?? '',
                ciudad: g.area_level_2 ?? '',
                prioridad: o.priority ?? null,
                kilos: Number(o.units_1) || 0,
                vehiculo: vc,
                domiciliario: vc ? nombrePorCode.get(vc) ?? vc : null,
                viaje: o.trip_number ?? null,
                proveedor: o.supplier_name ?? '',
                fechaEntrega: o.delivery_date ?? '',
                pedidoId: null,
                replica: null,
                estadoSigcompro: null,
              });
            }
          }
          const code = String(s.schema_code ?? '');
          return {
            esquemaCodigo: code,
            esquemaNombre: s.schema_name ?? '',
            descripcion: s.description ?? '',
            estado: s.status ?? '',
            fecha: s.deploy_date ?? fecha,
            creadoEn: s.created_at ?? null,
            puntos: puntos.get(code) ?? [],
            ordenes,
            error,
          };
        }),
    );

    // Cruce con SIGCOMPRO: "1CS00005686" (base) o "1CS00005686-2" (réplica 2).
    const bases = new Set<string>();
    for (const p of planes) {
      for (const o of p.ordenes) bases.add(o.codigo.replace(/-\d+$/, ''));
    }
    if (bases.size) {
      const r = await this.pool.query<{ id: string; comanda: string; estado: string | null; anulado: boolean }>(
        `SELECT id, data->>'comanda' AS comanda, estado, anulado
           FROM pedidos WHERE data->>'comanda' = ANY($1::text[])`,
        [[...bases]],
      );
      const porComanda = new Map(r.rows.map((x) => [x.comanda, x]));
      for (const p of planes) {
        for (const o of p.ordenes) {
          const m = o.codigo.match(/^(.*)-(\d+)$/);
          const ped = porComanda.get(o.codigo) ?? (m ? porComanda.get(m[1]) : undefined);
          if (!ped) continue;
          o.pedidoId = ped.id;
          o.replica = !porComanda.has(o.codigo) && m ? Number(m[2]) : null;
          o.estadoSigcompro = ped.anulado ? 'Anulado' : ped.estado ?? null;
        }
      }
    }

    planes.sort((a, b) => a.esquemaCodigo.localeCompare(b.esquemaCodigo, 'es', { numeric: true }));
    this.cachePlanes.set(fecha, { ts: Date.now(), datos: planes });
    return planes;
  }

  /** Puntos de venta (nombres) que suben a cada esquema de Drivin. */
  private async puntosPorEsquema(): Promise<Map<string, string[]>> {
    const r = await this.pool.query<{ id: string; nombre: string; codigo: string | null; drivin: boolean }>(
      `SELECT id, nombre, codigo, drivin FROM puntos_venta WHERE activo IS NOT FALSE`,
    );
    const mapa = new Map<string, string[]>();
    for (const p of r.rows) {
      if (!p.drivin) continue;
      const cfg = await this.puntoDrivinCfg(String(p.id), p.codigo ?? '', p.nombre);
      const lista = mapa.get(cfg.schema) ?? [];
      lista.push(p.nombre);
      mapa.set(cfg.schema, lista);
    }
    return mapa;
  }

  /** Esquemas de Drivin (código, nombre, flota). Caché corta. */
  private cacheSchemas: { ts: number; datos: DrivinSchema[] } | null = null;
  private async drivinSchemas(fresco = false): Promise<DrivinSchema[]> {
    if (!fresco && this.cacheSchemas && Date.now() - this.cacheSchemas.ts < this.DRIVIN_TTL) {
      return this.cacheSchemas.datos;
    }
    const r = await this.drivinGet<{ response?: DrivinSchema[] }>(`/schemas`);
    const datos = Array.isArray(r?.response) ? r.response : [];
    this.cacheSchemas = { ts: Date.now(), datos };
    return datos;
  }

  /**
   * Crea en Drivin los planes (escenarios) de un día para TODOS los esquemas
   * activos (puntos con Drivin activo), con el mismo formato que los existentes:
   * "PDV La 93 Domicilios 19-10-26", su esquema y su flota de domiciliarios.
   * Cada plan creado se APRUEBA y luego se OPTIMIZA. Solo crea los que FALTAN,
   * así que se puede ejecutar varias veces sin duplicar. Un bloqueo en la BD
   * evita que dos procesos (cron + botón, o varias instancias) lo hagan a la vez.
   *
   * Devuelve en cuanto la corrida queda registrada (`id`) y sigue en segundo
   * plano (`terminado`), guardando el avance de cada paso en
   * `drivin_planes_generacion` para mostrarlo en vivo.
   */
  async iniciarGeneracionPlanes(
    fecha: string,
    origen: 'automatico' | 'manual',
    usuario?: JwtPayload,
  ): Promise<{ id: string; terminado: Promise<GeneracionPlanes> }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) {
      throw new BadRequestException('Fecha inválida (YYYY-MM-DD)');
    }
    const hoy = this.diaBogota();
    if (fecha < hoy) {
      throw new BadRequestException('No se pueden crear planes de días anteriores.');
    }
    const limite = this.diaBogota(new Date(Date.now() + 31 * 86_400_000));
    if (fecha > limite) {
      throw new BadRequestException('Solo se pueden crear planes hasta 30 días adelante.');
    }
    const apiKey = this.config.get<string>('DRIVIN_API_KEY');
    if (!apiKey) throw new BadRequestException('Falta DRIVIN_API_KEY en el backend.');

    let nombreUsuario: string | null = null;
    if (usuario?.sub) {
      const u = await this.pool.query<{ nombre: string }>(
        `SELECT nombre FROM usuarios WHERE id = $1::bigint LIMIT 1`,
        [usuario.sub],
      );
      nombreUsuario = u.rows[0]?.nombre ?? usuario.cedula ?? null;
    }

    const cliente = await this.pool.connect();
    let id = '';
    try {
      const lock = await cliente.query<{ ok: boolean }>(
        `SELECT pg_try_advisory_lock(hashtext('drivin_generar_planes')) AS ok`,
      );
      if (!lock.rows[0]?.ok) {
        throw new ConflictException(
          'Ya se están generando planes en este momento. Espera un momento y revisa de nuevo.',
        );
      }
      // Esquemas activos: los de los puntos con Drivin activo (sin repetir).
      const pts = await cliente.query<{ id: string; nombre: string; codigo: string | null }>(
        `SELECT id, nombre, codigo FROM puntos_venta
          WHERE drivin = true AND activo IS NOT FALSE ORDER BY nombre`,
      );
      const porEsquema = new Map<string, string[]>();
      for (const p of pts.rows) {
        const cfg = await this.puntoDrivinCfg(String(p.id), p.codigo ?? '', p.nombre);
        if (!cfg.schema) continue;
        porEsquema.set(cfg.schema, [...(porEsquema.get(cfg.schema) ?? []), p.nombre]);
      }
      const inicial: ResultadoPlan[] = [...porEsquema.keys()]
        .sort((x, y) => x.localeCompare(y, 'es', { numeric: true }))
        .map((codigo) => ({
          esquemaCodigo: codigo,
          esquemaNombre: '',
          puntos: porEsquema.get(codigo) ?? [],
          estado: 'pendiente',
          paso: 'pendiente',
          mensaje: '',
        }));
      const ins = await cliente.query<{ id: string }>(
        `INSERT INTO drivin_planes_generacion (fecha, origen, usuario, resultado, estado)
         VALUES ($1::date, $2, $3, $4::jsonb, 'en_curso') RETURNING id`,
        [fecha, origen, nombreUsuario, JSON.stringify(inicial)],
      );
      id = String(ins.rows[0].id);
      const terminado = this.ejecutarGeneracionPlanes(id, cliente, fecha, origen, nombreUsuario, apiKey, inicial);
      return { id, terminado };
    } catch (e) {
      // Si no arrancó la ejecución, se libera aquí el bloqueo y la conexión.
      if (!id) {
        await cliente.query(`SELECT pg_advisory_unlock(hashtext('drivin_generar_planes'))`).catch(() => undefined);
        cliente.release();
      }
      throw e;
    }
  }

  /** Crea, aprueba y optimiza (o completa) los planes de una corrida. */
  private async ejecutarGeneracionPlanes(
    id: string,
    cliente: PoolClient,
    fecha: string,
    origen: 'automatico' | 'manual',
    nombreUsuario: string | null,
    apiKey: string,
    resultado: ResultadoPlan[],
  ): Promise<GeneracionPlanes> {
    const hoy = this.diaBogota();
    let errorGeneral: string | null = null;
    // Guarda el avance (en serie, para que no se pisen las escrituras).
    let cola: Promise<unknown> = Promise.resolve();
    const guardar = () => {
      const json = JSON.stringify(resultado);
      cola = cola
        .then(() =>
          this.pool.query(`UPDATE drivin_planes_generacion SET resultado = $2::jsonb WHERE id = $1`, [id, json]),
        )
        .catch(() => undefined);
      return cola;
    };
    const set = (r: ResultadoPlan, cambios: Partial<ResultadoPlan>) => {
      Object.assign(r, cambios);
      return guardar();
    };
    /**
     * Optimiza (si falta), espera a que Drivin termine de optimizar y aprueba.
     * Drivin NO deja aprobar un plan sin optimizar ("not_optimized").
     */
    const optimizarYAprobar = async (r: ResultadoPlan, token: string, yaOptimizado: boolean) => {
      if (!yaOptimizado) {
        await set(r, { paso: 'optimizando', estadoDrivin: null });
        const op = await this.accionPlanDrivin(token, 'optimize', apiKey, r.esquemaCodigo, fecha);
        if (!op.ok) {
          await set(r, { optimizado: false, errorOptimizacion: op.error });
          return;
        }
        // La optimización es asíncrona: se espera a que el plan quede optimizado.
        const espera = await this.esperarOptimizacionPlan(token, (estado) =>
          set(r, { estadoDrivin: estado }),
        );
        await set(r, { optimizado: espera.ok, errorOptimizacion: espera.ok ? null : espera.error });
        if (!espera.ok) return;
      } else {
        await set(r, { optimizado: true });
      }
      await set(r, { paso: 'aprobando' });
      const ap = await this.accionPlanDrivin(token, 'approve', apiKey, r.esquemaCodigo, fecha);
      await set(r, { aprobado: ap.ok, errorAprobacion: ap.ok ? null : ap.error });
    };

    try {
      const [schemas, existentes] = await Promise.all([
        this.drivinSchemas(true),
        this.drivinScenarios(fecha, true),
      ]);
      const schemaPorCodigo = new Map(schemas.filter((s) => s.code).map((s) => [String(s.code), s]));
      const yaExisten = new Set(existentes.map((s) => String(s.schema_code ?? '')));
      const tokensExistentes = new Set(existentes.map((s) => String(s.token ?? '')));
      for (const r of resultado) r.esquemaNombre = schemaPorCodigo.get(r.esquemaCodigo)?.name ?? '';
      await guardar();

      // Planes que SIGCOMPRO ya creó para ese día (el más reciente por esquema).
      const pendientes = await this.pool.query<{ codigo: string; token: string }>(
        `SELECT DISTINCT ON (r->>'esquemaCodigo') r->>'esquemaCodigo' AS codigo, r->>'token' AS token
           FROM drivin_planes_generacion g, jsonb_array_elements(g.resultado) r
          WHERE g.fecha = $1::date AND g.id <> $2
            AND r->>'estado' = 'creado' AND COALESCE(r->>'token', '') <> ''
          ORDER BY r->>'esquemaCodigo', g.creado_en DESC`,
        [fecha, id],
      );
      const hechos = await this.pool.query<{ token: string; aprobado: boolean; optimizado: boolean }>(
        `SELECT r->>'token' AS token,
                bool_or(COALESCE((r->>'aprobado')::boolean, false)) AS aprobado,
                bool_or(COALESCE((r->>'optimizado')::boolean, false)) AS optimizado
           FROM drivin_planes_generacion g, jsonb_array_elements(g.resultado) r
          WHERE g.fecha = $1::date AND g.id <> $2 AND COALESCE(r->>'token', '') <> ''
          GROUP BY r->>'token'`,
        [fecha, id],
      );
      const estadoToken = new Map(hechos.rows.map((x) => [x.token, x]));
      // Se confirma con Drivin que cada plan creado por SIGCOMPRO siga existiendo
      // (aunque no salga en el listado del día). Si existe, NO se vuelve a crear.
      const propiosPorEsquema = new Map<string, { token: string; aprobado: boolean; optimizado: boolean }>();
      for (const x of pendientes.rows) {
        const existe =
          tokensExistentes.has(x.token) || (await this.estadoPlanDrivin(x.token, apiKey)) !== null;
        if (!existe) continue;
        const e = estadoToken.get(x.token);
        propiosPorEsquema.set(x.codigo, { token: x.token, aprobado: !!e?.aprobado, optimizado: !!e?.optimizado });
        yaExisten.add(x.codigo);
      }

      const [a, m, d] = fecha.split('-');
      const fechaCorta = `${d}-${m}-${a.slice(2)}`;

      for (const r of resultado) {
        const codigo = r.esquemaCodigo;
        const sch = schemaPorCodigo.get(codigo);
        if (yaExisten.has(codigo)) {
          const propio = propiosPorEsquema.get(codigo);
          if (!propio || (propio.aprobado && propio.optimizado)) {
            await set(r, {
              estado: 'existente',
              paso: 'listo',
              mensaje: 'Ya existía',
              ...(propio ? { token: propio.token, optimizado: true, aprobado: true } : {}),
            });
            continue;
          }
          await set(r, { estado: 'existente', token: propio.token, mensaje: 'Ya existía · completando pasos pendientes' });
          await optimizarYAprobar(r, propio.token, propio.optimizado);
          await set(r, {
            paso: 'listo',
            mensaje: r.aprobado
              ? 'Ya existía · se completó (optimizado y aprobado)'
              : r.optimizado
                ? 'Ya existía · optimizado, sigue sin aprobar'
                : 'Ya existía · sigue sin optimizar',
          });
          continue;
        }
        if (!sch?.name) {
          await set(r, {
            estado: 'error',
            paso: 'listo',
            mensaje: `El esquema "${codigo}" no existe en Drivin. Revisa el código en la pestaña Esquemas.`,
          });
          continue;
        }
        const descripcion = `${sch.name.replace(/\s*carnes\s+santacruz\s*/gi, ' ').replace(/\s+/g, ' ').trim()} Domicilios ${fechaCorta}`;
        await set(r, { paso: 'creando', mensaje: descripcion });
        try {
          const { status, text } = await this.drivinRequest(
            'POST',
            '/scenarios',
            apiKey,
            JSON.stringify({
              description: descripcion,
              date: fecha,
              fleet_name: sch.fleet ?? null,
              schema_name: sch.name,
              clients: [],
            }),
          );
          this.logger.log(
            `Drivin crear plan ${codigo} ${fecha} (${origen}): status=${status} resp=${(text ?? '').slice(0, 300)}`,
          );
          if (status < 200 || status >= 300) {
            let detalle = text ?? '';
            try {
              const j = JSON.parse(text) as { message?: string; error?: string; response?: { description?: string } };
              detalle = j.response?.description || j.message || j.error || text;
            } catch {
              /* respuesta no JSON */
            }
            await set(r, { estado: 'error', paso: 'listo', mensaje: `Drivin respondió ${status}: ${String(detalle).slice(0, 300)}` });
            continue;
          }
          let token: string | null = null;
          try {
            token = (JSON.parse(text) as { response?: { scenario_token?: string } }).response?.scenario_token ?? null;
          } catch {
            /* respuesta no JSON */
          }
          await set(r, { estado: 'creado', token });
          if (!token) {
            await set(r, { optimizado: false, errorOptimizacion: 'Drivin no devolvió el token del plan.' });
          } else {
            await optimizarYAprobar(r, token, false);
          }
          await set(r, { paso: 'listo' });
        } catch (e) {
          await set(r, { estado: 'error', paso: 'listo', mensaje: e instanceof Error ? e.message : String(e) });
        }
      }
    } catch (e) {
      errorGeneral = e instanceof Error ? e.message : String(e);
      this.logger.error(`Error al generar planes ${fecha}: ${errorGeneral}`);
      for (const r of resultado) {
        if (r.paso !== 'listo') Object.assign(r, { estado: 'error', paso: 'listo', mensaje: r.mensaje || errorGeneral });
      }
    } finally {
      await cliente.query(`SELECT pg_advisory_unlock(hashtext('drivin_generar_planes'))`).catch(() => undefined);
      cliente.release();
    }

    // Los planes nuevos deben verse ya (asignaciones, envíos y pestaña Planes).
    this.cacheScenarios.delete(fecha);
    this.cachePlanes.delete(fecha);
    if (fecha === hoy) {
      this.cacheAsignaciones = null;
      this.ultimaLecturaCompleta = null;
      this.ultimoRefrescoEscenarios = 0;
    }

    await cola;
    const fin = await this.pool.query<{ creado_en: string }>(
      `UPDATE drivin_planes_generacion
          SET resultado = $2::jsonb, estado = $3, error = $4, terminado_en = now()
        WHERE id = $1 RETURNING creado_en`,
      [id, JSON.stringify(resultado), errorGeneral ? 'error' : 'terminado', errorGeneral],
    );
    const creados = resultado.filter((r) => r.estado === 'creado').length;
    const errores = resultado.filter((r) => r.estado === 'error').length;
    const sinAprobar = resultado.filter((r) => r.aprobado === false).length;
    const sinOptimizar = resultado.filter((r) => r.optimizado === false).length;
    const msg =
      `Planes Drivin ${fecha} (${origen}): ${creados} creados, ${resultado.length - creados - errores} ya existían, ` +
      `${errores} con error, ${sinAprobar} sin aprobar, ${sinOptimizar} sin optimizar`;
    if (errores || sinAprobar || sinOptimizar || errorGeneral) this.logger.warn(msg);
    else this.logger.log(msg);
    return {
      id,
      fecha,
      origen,
      usuario: nombreUsuario,
      resultado,
      creadoEn: fin.rows[0]?.creado_en ?? new Date().toISOString(),
      estado: errorGeneral ? 'error' : 'terminado',
      error: errorGeneral,
    };
  }

  /** Genera los planes de un día y espera a que termine (lo usa el cron). */
  async generarPlanesDrivin(
    fecha: string,
    origen: 'automatico' | 'manual',
    usuario?: JwtPayload,
  ): Promise<GeneracionPlanes> {
    const { terminado } = await this.iniciarGeneracionPlanes(fecha, origen, usuario);
    return terminado;
  }

  /** Estado de un plan en Drivin (GET /scenarios/{token}/status); null si no existe. */
  private async estadoPlanDrivin(token: string, apiKey: string): Promise<string | null> {
    for (let intento = 1; intento <= 3; intento++) {
      try {
        const { status, text } = await this.drivinRequest(
          'GET',
          `/scenarios/${encodeURIComponent(token)}/status`,
          apiKey,
        );
        if (status === 404) return null;
        if (status >= 200 && status < 300) {
          const j = JSON.parse(text) as { response?: { status?: string } };
          return j.response?.status ?? '';
        }
      } catch {
        /* reintenta */
      }
      await new Promise((r) => setTimeout(r, 700 * intento));
    }
    // Si Drivin no responde, se asume que existe (es preferible no duplicar).
    return '';
  }

  /**
   * Espera (máx. 4 min) a que Drivin termine de optimizar un plan. Reporta el
   * estado de Drivin en cada consulta para mostrarlo en vivo.
   */
  private async esperarOptimizacionPlan(
    token: string,
    onEstado: (estado: string) => unknown,
  ): Promise<{ ok: boolean; error: string | null }> {
    const apiKey = this.config.get<string>('DRIVIN_API_KEY') ?? '';
    const inicio = Date.now();
    const limite = inicio + 4 * 60_000;
    let ultimo = '';
    let empezo = false;
    while (Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 3000));
      const estado = await this.estadoPlanDrivin(token, apiKey);
      if (estado === null) return { ok: false, error: 'El plan ya no existe en Drivin.' };
      if (estado && estado !== ultimo) {
        ultimo = estado;
        await onEstado(estado);
      }
      const e = estado.toLowerCase();
      if (/optimiz/.test(e)) empezo = true;
      if (/optimized|approved|started|finished|completed/.test(e) && !/optimizing/.test(e)) {
        return { ok: true, error: null };
      }
      if (/error|fail/.test(e)) return { ok: false, error: `Drivin reportó el estado "${estado}" al optimizar.` };
      // Si en 30 s Drivin ni siquiera empezó a optimizar, no se sigue esperando.
      if (!empezo && Date.now() - inicio > 30_000) {
        return {
          ok: false,
          error: `Drivin no empezó a optimizar el plan (sigue en "${ultimo || 'desconocido'}").`,
        };
      }
    }
    return {
      ok: false,
      error: `La optimización no terminó en 4 minutos (último estado en Drivin: "${ultimo || 'desconocido'}").`,
    };
  }

  /**
   * Ejecuta una acción sobre un plan en Drivin: PUT /scenarios/{token}/approve
   * u /optimize. Reintenta hasta 3 veces porque la API de Drivin es
   * intermitente. Nunca lanza error.
   */
  private async accionPlanDrivin(
    token: string,
    accion: 'approve' | 'optimize',
    apiKey: string,
    codigo: string,
    fecha: string,
  ): Promise<{ ok: boolean; error: string | null }> {
    const verbo = accion === 'approve' ? 'aprobar' : 'optimizar';
    let error: string | null = null;
    for (let intento = 1; intento <= 3; intento++) {
      try {
        const { status, text } = await this.drivinRequest(
          'PUT',
          `/scenarios/${encodeURIComponent(token)}/${accion}`,
          apiKey,
        );
        this.logger.log(
          `Drivin ${verbo} plan ${codigo} ${fecha} (intento ${intento}): status=${status} resp=${(text ?? '').slice(0, 200)}`,
        );
        if (status >= 200 && status < 300) return { ok: true, error: null };
        let detalle = text ?? '';
        try {
          const j = JSON.parse(text) as { response?: { description?: string }; message?: string };
          detalle = j.response?.description || j.message || text;
        } catch {
          /* respuesta no JSON */
        }
        error = `Drivin respondió ${status} al ${verbo}: ${String(detalle).slice(0, 300)}`;
        // Un 4xx es definitivo (no se arregla reintentando).
        if (status >= 400 && status < 500) break;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      if (intento < 3) await new Promise((r) => setTimeout(r, 1000 * intento));
    }
    return { ok: false, error };
  }

  /**
   * Estado de la generación AUTOMÁTICA de planes (la del cambio de día) para el
   * aviso global de todas las pantallas. Activa si está en curso o si terminó
   * hace menos de 15 s (para mostrar "listos" un momento). Consulta liviana.
   */
  async avisoGeneracionAutomatica(): Promise<{
    activa: boolean;
    id?: string;
    fecha?: string;
    estado?: 'en_curso' | 'terminado' | 'error' | 'interrumpida';
    total?: number;
    listos?: number;
    actual?: { esquemaCodigo: string; puntos: string[]; paso: string } | null;
    pendientes?: number;
  }> {
    const r = await this.pool.query<{
      id: string;
      fecha: string;
      estado: string;
      resultado: ResultadoPlan[];
    }>(
      `SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, estado, resultado
         FROM drivin_planes_generacion
        WHERE origen = 'automatico'
          AND (
            (estado = 'en_curso' AND creado_en > now() - interval '60 minutes')
            OR terminado_en > now() - interval '15 seconds'
          )
        ORDER BY creado_en DESC LIMIT 1`,
    );
    const g = r.rows[0];
    if (!g) return { activa: false };
    const res = Array.isArray(g.resultado) ? g.resultado : [];
    const actual = res.find((x) => x.paso === 'creando' || x.paso === 'optimizando' || x.paso === 'aprobando');
    return {
      activa: true,
      id: String(g.id),
      fecha: g.fecha,
      estado: g.estado as 'en_curso' | 'terminado' | 'error' | 'interrumpida',
      total: res.length,
      listos: res.filter((x) => x.paso === 'listo').length,
      actual: actual
        ? { esquemaCodigo: actual.esquemaCodigo, puntos: actual.puntos, paso: actual.paso ?? '' }
        : null,
      pendientes: res.filter(
        (x) => x.estado === 'error' || x.aprobado === false || x.optimizado === false,
      ).length,
    };
  }

  /** Una generación (para seguir su avance en vivo). */
  async generacionPlanes(id: string): Promise<GeneracionPlanes> {
    if (!/^\d+$/.test(String(id ?? ''))) throw new BadRequestException('Generación inválida');
    const r = await this.listarGeneraciones(`WHERE id = $1::bigint`, [id]);
    if (!r[0]) throw new NotFoundException('Generación no encontrada');
    return r[0];
  }

  /** Últimas generaciones de planes (para el historial del módulo). */
  async historialGeneracionPlanes(limite = 20): Promise<GeneracionPlanes[]> {
    return this.listarGeneraciones(`ORDER BY creado_en DESC LIMIT $1`, [Math.min(100, Math.max(1, limite))]);
  }

  private async listarGeneraciones(sufijo: string, params: unknown[]): Promise<GeneracionPlanes[]> {
    const r = await this.pool.query<{
      id: string;
      fecha: string;
      origen: 'automatico' | 'manual';
      usuario: string | null;
      resultado: ResultadoPlan[];
      creado_en: string;
      estado: string | null;
      error: string | null;
      terminado_en: string | null;
    }>(
      `SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, origen, usuario, resultado, creado_en,
              estado, error, terminado_en
         FROM drivin_planes_generacion ${sufijo}`,
      params,
    );
    return r.rows.map((x) => {
      // Una corrida "en curso" por más de 60 min quedó interrumpida
      // (p. ej. se reinició el servidor).
      const estado =
        x.estado === 'en_curso' && Date.now() - new Date(x.creado_en).getTime() > 60 * 60_000
          ? 'interrumpida'
          : ((x.estado ?? 'terminado') as GeneracionPlanes['estado']);
      return {
        id: String(x.id),
        fecha: x.fecha,
        origen: x.origen,
        usuario: x.usuario,
        resultado: x.resultado ?? [],
        creadoEn: x.creado_en,
        estado,
        error: x.error,
        terminadoEn: x.terminado_en,
      };
    });
  }

  /**
   * Esquemas de Drivin por punto de venta: configuración guardada, valor
   * EFECTIVO (con el respaldo por número de punto) y si Drivin tiene un plan
   * de hoy para ese esquema.
   */
  async esquemasDrivin(): Promise<EsquemaPunto[]> {
    const hoy = this.diaBogota();
    let scenarios: DrivinScenario[] = [];
    let drivinOk = true;
    try {
      scenarios = await this.drivinScenarios(hoy);
    } catch {
      drivinOk = false;
    }
    const porCodigo = new Map<string, DrivinScenario>();
    for (const s of scenarios) if (s.schema_code) porCodigo.set(String(s.schema_code), s);

    const r = await this.pool.query<{
      id: string;
      nombre: string;
      codigo: string | null;
      drivin: boolean;
      drivin_schema_code: string | null;
      drivin_localidad: string | null;
      activo: boolean | null;
    }>(
      `SELECT id, nombre, codigo, drivin, drivin_schema_code, drivin_localidad, activo
         FROM puntos_venta ORDER BY nombre`,
    );
    const salida: EsquemaPunto[] = [];
    for (const p of r.rows) {
      const cfg = await this.puntoDrivinCfg(String(p.id), p.codigo ?? '', p.nombre);
      const plan = porCodigo.get(cfg.schema);
      salida.push({
        puntoId: String(p.id),
        puntoNombre: p.nombre,
        puntoCodigo: p.codigo ?? '',
        activo: p.activo !== false,
        drivin: p.drivin === true,
        esquemaConfigurado: p.drivin_schema_code?.trim() || null,
        localidadConfigurada: p.drivin_localidad?.trim() || null,
        esquemaEfectivo: cfg.schema,
        localidadEfectiva: cfg.localidad,
        esquemaNombreDrivin: plan?.schema_name ?? null,
        planHoy: drivinOk ? !!plan : null,
        estadoPlanHoy: plan?.status ?? null,
      });
    }
    return salida;
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

    // Config Drivin del punto (interruptor + schema). Si el punto NO está
    // integrado con Drivin, no se sube (flujo manual).
    const cfg = await this.puntoDrivinCfg(d.puntoId, d.puntoCodigo, d.puntoNombre);
    if (!cfg.drivin) {
      throw new BadRequestException(
        'Este punto de venta no está integrado con Drivin.',
      );
    }
    const schema = cfg.schema;
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
    // Réplica subida: queda marcada en el servidor (con la hora) aunque se
    // cierre la pantalla; la sincronización usa esa hora para saber de qué día es.
    if (typeof replica === 'number' && replica >= 1) {
      await this.parcharReplica(id, replica, {
        drivinEnviado: true,
        drivinEnviadoEn: new Date().toISOString(),
      }).catch((e) =>
        this.logger.warn(`No se pudo marcar la réplica ${d.comanda} como enviada: ${String(e)}`),
      );
    }
    return { status, comanda: d.comanda, respuesta: data };
  }

  /**
   * Sincroniza cancelaciones desde Drivin: consulta las órdenes que fueron
   * canceladas o rechazadas en Drivin (status = rejected/cancelled) y marca
    * los pedidos correspondientes en SIGCOMPRO según la regla de negocio.
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

      // Procesar órdenes canceladas/rechazadas en Drivin.
      // Reglas acordadas:
      // - rejected  -> estado "Rechazado" (dentro de entregados, con motivo)
      // - cancelled -> estado "Anulado"   (anulado=true)
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

      // Actualizar comandas rejected a estado "Rechazado"
      if (comandasRechazadas.size > 0) {
        const resRechazados = await this.pool.query<{
          id: string;
          comanda: string;
          estado: string | null;
          data: PedidoData;
        }>(
          `SELECT id, data->>'comanda' as comanda, estado, data
           FROM pedidos
           WHERE (data->>'comanda') = ANY($1)
             AND LOWER(COALESCE(estado, '')) NOT IN ('rechazado', 'devolución', 'devolucion')`,
          [[...comandasRechazadas]],
        );

        for (const ped of resRechazados.rows) {
          try {
            const actualizado = await this.guardar(
              {
                ...(ped.data ?? {}),
                id: ped.id,
                anulado: false,
                estado: 'Rechazado',
                motivo: 'Cliente no atendía (rechazado por Drivin)',
              },
              undefined,
            );
            if (actualizado) {
              actualizados++;
              this.logger.log(
                `Pedido ${ped.id} (${ped.comanda}) sincronizado como Rechazado por Drivin rejected (antes: ${ped.estado})`,
              );
            }
          } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            this.logger.warn(
              `No se pudo sincronizar rejected del pedido ${ped.id}: ${error}`,
            );
          }
        }
      }

      // Actualizar comandas cancelled a estado "Anulado"
      if (comandasCanceladas.size > 0) {
        const resCancelados = await this.pool.query<{
          id: string;
          comanda: string;
          estado: string | null;
          data: PedidoData;
        }>(
          `SELECT id, data->>'comanda' as comanda, estado, data
           FROM pedidos
           WHERE (data->>'comanda') = ANY($1)
             AND anulado = false
             AND LOWER(COALESCE(estado, '')) != 'anulado'`,
          [[...comandasCanceladas]],
        );

        for (const ped of resCancelados.rows) {
          try {
            const actualizado = await this.guardar(
              {
                ...(ped.data ?? {}),
                id: ped.id,
                anulado: true,
                estado: 'Anulado',
                motivo: 'Cancelado por Drivin',
              },
              undefined,
            );
            if (actualizado) {
              actualizados++;
              this.logger.log(
                `Pedido ${ped.id} (${ped.comanda}) sincronizado: anulado por Drivin`,
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

        // Schema de Drivin para el punto (config del punto, con fallback).
        const cfg = await this.puntoDrivinCfg(undefined, puntoCodigo, puntoNombre);
        const schema = cfg.schema;
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

  /**
   * Corrige la fecha de despacho (delivery_date/deploy_date) de un pedido que
   * YA fue enviado a Drivin, cuando DESPUÉS de facturar se edita la "Entrega
   * programada" (Posterior) o la fecha elegida. Sin esto, Drivin se queda con
   * la fecha del envío original (la bandera drivinEnviado bloquea el reenvío
   * completo) y el pedido aparece en Drivin con la fecha vieja en vez de la
   * programada. Se actualiza SOLO la fecha, vía PUT sobre la orden existente.
   */
  private async actualizarFechaEnDrivin(pedidoId: string): Promise<void> {
    try {
      const apiKey = this.config.get<string>('DRIVIN_API_KEY');
      if (!apiKey) {
        this.logger.warn(
          'No se pudo corregir fecha en Drivin: falta DRIVIN_API_KEY',
        );
        return;
      }

      const d = await this.construirDespacho(pedidoId);
      const comandaLimpia = String(d.comanda ?? '').trim();
      if (!comandaLimpia) return;

      const cfg = await this.puntoDrivinCfg(
        d.puntoId,
        d.puntoCodigo,
        d.puntoNombre,
      );
      if (!cfg.drivin) return;

      // La orden vive en el escenario del día en que se subió originalmente
      // (normalmente HOY, porque la edición suele ocurrir el mismo día que la
      // facturación). Si no aparece ahí, se intenta con el escenario de la
      // fecha de entrega recién calculada, por si ya cambió de día.
      const hoy = this.diaBogota();
      let token = await this.tokenScenarioPunto(cfg.schema, hoy);
      if (!token && d.fechaEntrega && d.fechaEntrega !== hoy) {
        token = await this.tokenScenarioPunto(cfg.schema, d.fechaEntrega);
      }
      if (!token) {
        this.logger.warn(
          `Pedido ${pedidoId} (${comandaLimpia}): sin escenario en Drivin para corregir fecha`,
        );
        return;
      }

      const body = JSON.stringify({
        delivery_date: d.fechaEntrega,
        deploy_date: d.fechaEntrega,
      });
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
          `✓ Drivin orden ${comandaLimpia}: fecha corregida a ${d.fechaEntrega}`,
        );
      } else {
        this.logger.warn(
          `Drivin orden ${comandaLimpia}: respuesta inesperada al corregir fecha (status: ${status})`,
        );
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `No se pudo corregir fecha en Drivin (pedido ${pedidoId}): ${error}`,
      );
    }
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
