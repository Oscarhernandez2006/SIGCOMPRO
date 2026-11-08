import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

/**
 * Registro de qué usuario ya vio cada actualización ("Novedades"). El
 * contenido de cada versión vive en el frontend; aquí solo se guarda la vista.
 */
@Injectable()
export class NovedadesService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS novedades_vistas (
         usuario_id text NOT NULL,
         version text NOT NULL,
         visto_en timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (usuario_id, version)
       )`,
    );
  }

  async vistas(usuarioId: string): Promise<string[]> {
    const res = await this.pool.query<{ version: string }>(
      `SELECT version FROM novedades_vistas WHERE usuario_id = $1`,
      [usuarioId],
    );
    return res.rows.map((r) => r.version);
  }

  async marcarVista(usuarioId: string, version: string): Promise<{ ok: true }> {
    await this.pool.query(
      `INSERT INTO novedades_vistas (usuario_id, version) VALUES ($1, $2)
       ON CONFLICT (usuario_id, version) DO NOTHING`,
      [usuarioId, version],
    );
    return { ok: true };
  }
}
