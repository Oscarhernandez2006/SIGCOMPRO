import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

/** Borrador de pedido en espera (congelado), tal como lo maneja el frontend. */
export type CongeladoData = Record<string, unknown> & {
  id?: string;
  tempConsecutivo?: number;
};

@Injectable()
export class CongeladosService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos_congelados (
        id text PRIMARY KEY,
        usuario text NOT NULL,
        temp_consecutivo int NOT NULL DEFAULT 0,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pedidos_congelados_usuario
        ON pedidos_congelados (usuario)
    `);
  }

  /** Lista los congelados del usuario, del más antiguo al más reciente. */
  async listar(usuario: string): Promise<CongeladoData[]> {
    const res = await this.pool.query<{ data: CongeladoData }>(
      `SELECT data FROM pedidos_congelados WHERE usuario = $1 ORDER BY creado_en ASC`,
      [usuario],
    );
    return res.rows.map((r) => r.data);
  }

  /**
   * Crea o actualiza un congelado del usuario. Asigna un consecutivo temporal
   * incremental por usuario cuando no viene uno (etiqueta CONG-N solo visual).
   */
  async guardar(
    usuario: string,
    id: string,
    data: CongeladoData,
  ): Promise<CongeladoData> {
    const existente = await this.pool.query<{ temp_consecutivo: number }>(
      `SELECT temp_consecutivo FROM pedidos_congelados WHERE id = $1 AND usuario = $2`,
      [id, usuario],
    );

    let temp = Number(data.tempConsecutivo) || 0;
    if (existente.rowCount) {
      // Conserva el consecutivo temporal ya asignado.
      temp = existente.rows[0].temp_consecutivo;
    } else if (!temp) {
      const max = await this.pool.query<{ siguiente: number }>(
        `SELECT COALESCE(MAX(temp_consecutivo), 0) + 1 AS siguiente
           FROM pedidos_congelados WHERE usuario = $1`,
        [usuario],
      );
      temp = Number(max.rows[0].siguiente) || 1;
    }

    const finalData: CongeladoData = { ...data, id, tempConsecutivo: temp };

    await this.pool.query(
      `INSERT INTO pedidos_congelados (id, usuario, temp_consecutivo, data, actualizado_en)
         VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE
         SET temp_consecutivo = EXCLUDED.temp_consecutivo,
             data = EXCLUDED.data,
             actualizado_en = now()
         WHERE pedidos_congelados.usuario = EXCLUDED.usuario`,
      [id, usuario, temp, finalData],
    );

    return finalData;
  }

  /** Elimina un congelado del usuario. */
  async eliminar(usuario: string, id: string): Promise<{ ok: boolean }> {
    await this.pool.query(
      `DELETE FROM pedidos_congelados WHERE id = $1 AND usuario = $2`,
      [id, usuario],
    );
    return { ok: true };
  }
}
