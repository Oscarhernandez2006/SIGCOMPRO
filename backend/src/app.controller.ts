import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database/database.module';
import { SharedSecretGuard } from './provisioning/guards/shared-secret.guard';

@Controller()
export class AppController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get('health')
  health() {
    return {
      service: 'Carnes Santacruz API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /** Resumen ejecutivo para el dashboard cruzado de la Suite. */
  @Get('resumen-ejecutivo')
  @UseGuards(SharedSecretGuard)
  async resumenEjecutivo() {
    const res = await this.pool.query(`
      WITH d AS (SELECT (now() AT TIME ZONE 'America/Bogota')::date AS hoy)
      SELECT
        COUNT(p.id) FILTER (WHERE (p.fecha AT TIME ZONE 'America/Bogota')::date = d.hoy AND NOT p.anulado) AS pedidos_hoy,
        COUNT(p.id) FILTER (WHERE NOT p.anulado AND lower(p.estado) IN ('en proceso','en producción')) AS pendientes,
        COUNT(p.id) FILTER (WHERE NOT p.anulado AND lower(p.estado) = 'alistado') AS alistados,
        COUNT(p.id) FILTER (WHERE NOT p.anulado
           AND lower(p.estado) IN ('despachado','en tránsito','en transito','entregado')
           AND p.meta->>'despachoFin' ~ '^\\d{4}-\\d{2}-\\d{2}'
           AND ((p.meta->>'despachoFin')::timestamptz AT TIME ZONE 'America/Bogota')::date = d.hoy) AS despachados_hoy,
        COUNT(p.id) FILTER (WHERE NOT p.anulado
           AND lower(coalesce(p.estado,'')) NOT IN ('despachado','anulado','entregado','cancelado','en tránsito','en transito','facturado','rechazado')
           AND (CASE WHEN p.data->>'entregaProgramada' = 'true' AND p.data->>'fechaProgramada' ~ '^\\d{4}-\\d{2}-\\d{2}'
                     THEN substring(p.data->>'fechaProgramada' from 1 for 10)::date
                     ELSE (p.fecha AT TIME ZONE 'America/Bogota')::date END) < d.hoy) AS atrasados
      FROM d LEFT JOIN pedidos p ON true
      GROUP BY d.hoy
    `);
    const row = res.rows[0] ?? {};
    const r = {
      pedidos_hoy: Number(row.pedidos_hoy) || 0,
      pendientes: Number(row.pendientes) || 0,
      atrasados: Number(row.atrasados) || 0,
      alistados: Number(row.alistados) || 0,
      despachados_hoy: Number(row.despachados_hoy) || 0,
    };
    return {
      ...r,
      metrics: [
        { key: 'pedidos_hoy', label: 'Pedidos hoy', value: r.pedidos_hoy },
        { key: 'pendientes', label: 'En proceso', value: r.pendientes },
        { key: 'atrasados', label: 'Atrasados', value: r.atrasados, tone: r.atrasados > 0 ? 'warn' : 'default' },
        { key: 'despachados_hoy', label: 'Despachados hoy', value: r.despachados_hoy, tone: 'good', hint: `${r.alistados} alistados` },
      ],
    };
  }
}
