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
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const res = await this.pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE estado IN ('En proceso','En producción') AND (anulado IS NULL OR NOT anulado)) AS pendientes,
          COUNT(*) FILTER (WHERE estado = 'Alistado' AND (anulado IS NULL OR NOT anulado)) AS alistados,
          COUNT(*) FILTER (WHERE estado IN ('Facturado','Despachado') AND created_at::date = $1::date) AS despachados_hoy,
          0 AS atrasados
        FROM pedidos
      `, [hoy]);
      const r = res.rows[0];
      return {
        pendientes: parseInt(r.pendientes, 10) || 0,
        atrasados: parseInt(r.atrasados, 10) || 0,
        alistados: parseInt(r.alistados, 10) || 0,
        despachados_hoy: parseInt(r.despachados_hoy, 10) || 0,
      };
    } catch {
      return { pendientes: 0, atrasados: 0, alistados: 0, despachados_hoy: 0 };
    }
  }
}
