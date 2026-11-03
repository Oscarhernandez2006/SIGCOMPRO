import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { diaDeMs, type MetaMap, type PedidoResumen } from './dashboard.metricas';

/**
 * Proyección de un pedido con SOLO los campos que usan los resúmenes/dashboard
 * (sin dirección, teléfono, notas ni trazabilidad). La comparten
 * `resumenLigero` y la caché del dashboard.
 */
export const PROYECCION_RESUMEN_SQL = `
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
  )`;

/** Mismas expresiones que `construirScope` (día de entrega efectivo y "activo"). */
const DIA_EFECTIVO_SQL = `
  CASE
    WHEN (data->>'entregaProgramada') = 'true'
         AND COALESCE(data->>'fechaProgramada', '') <> ''
    THEN (data->>'fechaProgramada')::date
    ELSE (fecha AT TIME ZONE 'America/Bogota')::date
  END`;
const ACTIVO_SQL = `(anulado = false AND lower(coalesce(estado, '')) NOT IN ('despachado', 'anulado', 'entregado', 'cancelado', 'en tránsito', 'en transito', 'devolución', 'devolucion'))`;
const NO_CLUB_SQL = `COALESCE(data->>'canal', '') <> 'club'`;

/** Días que cubre la caché: 30 del periodo + 30 del anterior (deltas) + margen. */
const DIAS_VENTANA = 62;
/** Cada cuánto, como máximo, se consulta la BD por cambios. */
const INTERVALO_SYNC_MS = 10_000;
/** Solape para no perder filas cuya transacción cerró después de capturar `now()`. */
const SOLAPE_SYNC = '30 seconds';

interface Fila {
  data: PedidoResumen;
  meta: MetaMap[string] | null;
  dia: string;
  activo: boolean;
}

interface FilaSQL {
  id: string;
  dia: string;
  activo: boolean;
  data: PedidoResumen;
  meta: MetaMap[string] | null;
}

/**
 * Caché en memoria de los pedidos recientes (proyectados) para el dashboard.
 *
 * El cuello de botella del dashboard no es el SQL (~1.5 s) sino TRANSFERIR
 * decenas de MB desde la BD remota en cada consulta (60+ s para 30 días).
 * Esta caché trae la ventana completa UNA sola vez y luego sólo pide a la BD
 * las filas con `actualizado_en` posterior a la última sincronización (unos
 * KB), igual que el polling incremental de Pedidos/Despacho. Cada petición del
 * dashboard calcula sus métricas sobre los datos en RAM en milisegundos.
 */
export class DashboardCache {
  private readonly filas = new Map<string, Fila>();
  /** `now()` de la BD en la última sincronización (null = sin cargar). */
  private marca: string | null = null;
  private ultimaSyncMs = 0;
  private enCurso: Promise<void> | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly logger: Logger,
  ) {}

  get cargada(): boolean {
    return this.marca !== null;
  }

  /** Carga inicial en segundo plano (no lanza; registra el error). */
  precargar(): void {
    this.sincronizar().catch((e) =>
      this.logger.warn(`Dashboard caché: no se pudo precargar (${(e as Error).message})`),
    );
  }

  /**
   * Pedidos + meta equivalentes a `resumenLigero(rango, fecha, hasta)` tomados
   * de la caché, o `null` si el alcance pedido se sale de la ventana cubierta
   * (p. ej. "Todo" o un rango antiguo) y hay que ir a la BD.
   */
  async obtener(
    rango: string,
    fecha?: string,
    hasta?: string,
    ahora = Date.now(),
  ): Promise<{ pedidos: PedidoResumen[]; meta: MetaMap } | null> {
    const hoy = diaDeMs(ahora);
    const limite = this.inicioVentana(ahora);
    let incluir: (f: Fila) => boolean;
    if (rango === 'hoy') {
      incluir = (f) => f.dia === hoy || f.activo;
    } else if (rango === 'rango' && fecha && fecha >= limite) {
      incluir = (f) => f.dia >= fecha && (!hasta || f.dia <= hasta);
    } else {
      return null;
    }

    await this.sincronizar();

    const pedidos: PedidoResumen[] = [];
    const meta: MetaMap = {};
    for (const [id, f] of this.filas) {
      if (!incluir(f)) continue;
      pedidos.push(f.data);
      if (f.meta) meta[id] = f.meta;
    }
    return { pedidos, meta };
  }

  private inicioVentana(ahora: number): string {
    return diaDeMs(ahora - (DIAS_VENTANA - 2) * 86_400_000);
  }

  /** Sincroniza con la BD (completa la primera vez, incremental después). */
  private sincronizar(): Promise<void> {
    if (this.enCurso) return this.enCurso;
    if (this.marca && Date.now() - this.ultimaSyncMs < INTERVALO_SYNC_MS) {
      return Promise.resolve();
    }
    this.enCurso = (this.marca ? this.incremental() : this.completa()).finally(() => {
      this.enCurso = null;
    });
    return this.enCurso;
  }

  private async completa(): Promise<void> {
    const t0 = Date.now();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '180s'`);
      const marca = (await client.query<{ ahora: string }>(`SELECT now()::text AS ahora`)).rows[0].ahora;
      const res = await client.query<FilaSQL>(
        `SELECT id, (${DIA_EFECTIVO_SQL})::text AS dia, ${ACTIVO_SQL} AS activo,
                ${PROYECCION_RESUMEN_SQL} AS data, meta
           FROM pedidos
          WHERE ((${DIA_EFECTIVO_SQL}) >= (now() AT TIME ZONE 'America/Bogota')::date - $1::int
                 OR ${ACTIVO_SQL})
            AND ${NO_CLUB_SQL}`,
        [DIAS_VENTANA],
      );
      await client.query('COMMIT');
      this.filas.clear();
      for (const r of res.rows) this.guardar(r);
      this.marca = marca;
      this.ultimaSyncMs = Date.now();
      this.logger.log(
        `Dashboard caché: ${res.rows.length} pedidos (${DIAS_VENTANA} días) en ${((Date.now() - t0) / 1000).toFixed(1)} s`,
      );
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  private async incremental(): Promise<void> {
    const marca = (await this.pool.query<{ ahora: string }>(`SELECT now()::text AS ahora`)).rows[0].ahora;
    const res = await this.pool.query<FilaSQL>(
      `SELECT id, (${DIA_EFECTIVO_SQL})::text AS dia, ${ACTIVO_SQL} AS activo,
              ${PROYECCION_RESUMEN_SQL} AS data, meta
         FROM pedidos
        WHERE actualizado_en > $1::timestamptz - interval '${SOLAPE_SYNC}'
          AND ${NO_CLUB_SQL}`,
      [this.marca],
    );
    for (const r of res.rows) this.guardar(r);
    this.marca = marca;
    this.ultimaSyncMs = Date.now();
    this.podar();
    if (res.rows.length > 0) {
      this.logger.debug(`Dashboard caché: ${res.rows.length} pedidos actualizados`);
    }
  }

  private guardar(r: FilaSQL): void {
    const meta = r.meta && Object.keys(r.meta).length > 0 ? r.meta : null;
    this.filas.set(r.id, { data: r.data, meta, dia: r.dia, activo: r.activo });
  }

  /** Suelta los pedidos que ya quedaron fuera de la ventana (y no están activos). */
  private podar(): void {
    const limite = this.inicioVentana(Date.now());
    for (const [id, f] of this.filas) {
      if (!f.activo && f.dia < limite) this.filas.delete(id);
    }
  }
}
