import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

/** Parámetros de liquidación variable de un punto de venta. */
export interface ConfigLiquidacion {
  /** Mínimo garantizado por quincena para porcionadores. */
  porcionador_minimo: number;
  /** Pago por kilo procesado (porcionadores). */
  porcionador_por_kg: number;
  /** Segundos mínimos por kilo para que un alistado sea "razonable". */
  porcionador_seg_por_kg: number;
  /** Valor por pedido preparado a tiempo (televentas). */
  televentas_por_pedido: number;
  /** Valor por pedido preparado a tiempo (caja). */
  caja_por_pedido: number;
  /** Valor por pedido entregado/despachado a tiempo (facturación). */
  facturacion_por_pedido: number;
}

export const CONFIG_LIQUIDACION_DEFECTO: ConfigLiquidacion = {
  porcionador_minimo: 150000,
  porcionador_por_kg: 100,
  porcionador_seg_por_kg: 20,
  televentas_por_pedido: 0,
  caja_por_pedido: 0,
  facturacion_por_pedido: 0,
};

const ROLES = ['porcionador', 'televentas', 'caja', 'facturacion'];

@Injectable()
export class LiquidacionVariableService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS liquidacion_config (
        punto_id text PRIMARY KEY,
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Decisión manual (pagar Sí/No) por periodo + rol + pedido.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS liquidacion_overrides (
        periodo text NOT NULL,
        rol text NOT NULL,
        pedido_id text NOT NULL,
        pagar boolean NOT NULL,
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (periodo, rol, pedido_id)
      )
    `);
  }

  // ---------------------------------------------------------------------------
  // Configuración por punto
  // ---------------------------------------------------------------------------

  private normalizarConfig(raw: unknown): ConfigLiquidacion {
    const o = (raw ?? {}) as Record<string, unknown>;
    const num = (v: unknown, def: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : def;
    };
    return {
      porcionador_minimo: num(o.porcionador_minimo, CONFIG_LIQUIDACION_DEFECTO.porcionador_minimo),
      porcionador_por_kg: num(o.porcionador_por_kg, CONFIG_LIQUIDACION_DEFECTO.porcionador_por_kg),
      porcionador_seg_por_kg: num(o.porcionador_seg_por_kg, CONFIG_LIQUIDACION_DEFECTO.porcionador_seg_por_kg),
      televentas_por_pedido: num(o.televentas_por_pedido, CONFIG_LIQUIDACION_DEFECTO.televentas_por_pedido),
      caja_por_pedido: num(o.caja_por_pedido, CONFIG_LIQUIDACION_DEFECTO.caja_por_pedido),
      facturacion_por_pedido: num(o.facturacion_por_pedido, CONFIG_LIQUIDACION_DEFECTO.facturacion_por_pedido),
    };
  }

  /** Configuración de todos los puntos (con valores por defecto donde falte). */
  async obtenerConfigs(): Promise<Record<string, ConfigLiquidacion>> {
    const res = await this.pool.query<{ punto_id: string; config: unknown }>(
      `SELECT punto_id, config FROM liquidacion_config`,
    );
    const mapa: Record<string, ConfigLiquidacion> = {};
    for (const r of res.rows) {
      mapa[String(r.punto_id)] = this.normalizarConfig(r.config);
    }
    return mapa;
  }

  async guardarConfig(
    puntoId: string,
    config: unknown,
  ): Promise<ConfigLiquidacion> {
    const pid = String(puntoId ?? '').trim();
    if (!pid) throw new BadRequestException('Falta el punto de venta');
    const limpia = this.normalizarConfig(config);
    await this.pool.query(
      `INSERT INTO liquidacion_config (punto_id, config, actualizado_en)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (punto_id) DO UPDATE
         SET config = EXCLUDED.config, actualizado_en = now()`,
      [pid, JSON.stringify(limpia)],
    );
    return limpia;
  }

  // ---------------------------------------------------------------------------
  // Pedidos de un rango (para calcular en el frontend con la misma lógica de
  // tiempos que Despacho/Dashboard).
  // ---------------------------------------------------------------------------

  async pedidosRango(
    desde: string,
    hasta: string,
    puntoId?: string,
  ): Promise<{ pedidos: unknown[]; meta: Record<string, unknown> }> {
    const d = String(desde ?? '').trim();
    const h = String(hasta ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(h)) {
      throw new BadRequestException('Fechas inválidas (usa YYYY-MM-DD)');
    }
    const cond = [`fecha >= $1::date`, `fecha < ($2::date + interval '1 day')`];
    const val: unknown[] = [d, h];
    if (puntoId?.trim()) {
      cond.push(`punto_id = $3`);
      val.push(puntoId.trim());
    }
    const res = await this.pool.query<{
      id: string;
      data: Record<string, unknown>;
      meta: Record<string, unknown> | null;
    }>(
      `SELECT id, data, meta FROM pedidos
        WHERE ${cond.join(' AND ')}
          AND anulado = false
        ORDER BY fecha ASC`,
      val,
    );
    const pedidos = res.rows.map((r) => ({ ...(r.data ?? {}), id: r.id }));
    const meta: Record<string, unknown> = {};
    for (const r of res.rows) meta[r.id] = r.meta ?? {};
    return { pedidos, meta };
  }

  // ---------------------------------------------------------------------------
  // Decisiones manuales (pagar Sí/No)
  // ---------------------------------------------------------------------------

  /** Overrides de un periodo: { `${rol}|${pedido_id}`: pagar }. */
  async overridesPeriodo(periodo: string): Promise<Record<string, boolean>> {
    const p = String(periodo ?? '').trim();
    if (!p) return {};
    const res = await this.pool.query<{ rol: string; pedido_id: string; pagar: boolean }>(
      `SELECT rol, pedido_id, pagar FROM liquidacion_overrides WHERE periodo = $1`,
      [p],
    );
    const mapa: Record<string, boolean> = {};
    for (const r of res.rows) mapa[`${r.rol}|${r.pedido_id}`] = r.pagar === true;
    return mapa;
  }

  async guardarOverride(input: {
    periodo: string;
    rol: string;
    pedido_id: string;
    pagar: boolean;
  }): Promise<{ ok: true }> {
    const periodo = String(input.periodo ?? '').trim();
    const rol = String(input.rol ?? '').trim().toLowerCase();
    const pedidoId = String(input.pedido_id ?? '').trim();
    if (!periodo || !pedidoId || !ROLES.includes(rol)) {
      throw new BadRequestException('Datos de la decisión inválidos');
    }
    await this.pool.query(
      `INSERT INTO liquidacion_overrides (periodo, rol, pedido_id, pagar, actualizado_en)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (periodo, rol, pedido_id) DO UPDATE
         SET pagar = EXCLUDED.pagar, actualizado_en = now()`,
      [periodo, rol, pedidoId, input.pagar === true],
    );
    return { ok: true };
  }
}
