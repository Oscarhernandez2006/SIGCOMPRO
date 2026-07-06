import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';

/** Borrador de pedido en espera (congelado), tal como lo maneja el frontend. */
export type CongeladoData = Record<string, unknown> & {
  id?: string;
  tempConsecutivo?: number;
  punto?: { id?: string | number | null } | null;
};

const ROLES_ADMIN = ['administrador', 'desarrollador'];

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
    // Scope por punto de venta: los congelados se comparten entre las
    // televendedoras del mismo punto.
    await this.pool.query(
      `ALTER TABLE pedidos_congelados ADD COLUMN IF NOT EXISTS punto_id bigint`,
    );
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pedidos_congelados_punto
        ON pedidos_congelados (punto_id)
    `);
  }

  private esAdmin(rol?: string): boolean {
    return ROLES_ADMIN.includes((rol ?? '').toLowerCase());
  }

  /** Extrae el id del punto de venta del borrador (si lo tiene). */
  private puntoIdDeData(data: CongeladoData): number | null {
    const raw = data?.punto?.id;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Lista los congelados que el usuario puede ver:
   * - admin/desarrollador: todos.
   * - resto: los de sus puntos de venta asignados + los suyos sin punto.
   */
  async listar(user: JwtPayload): Promise<CongeladoData[]> {
    if (this.esAdmin(user.rol)) {
      const res = await this.pool.query<{ data: CongeladoData }>(
        `SELECT data FROM pedidos_congelados ORDER BY creado_en ASC`,
      );
      return res.rows.map((r) => r.data);
    }
    const res = await this.pool.query<{ data: CongeladoData }>(
      `SELECT data FROM pedidos_congelados
        WHERE (
          punto_id IS NOT NULL
          AND punto_id IN (
            SELECT punto_venta_id FROM usuario_punto_venta WHERE usuario_id = $1::bigint
          )
        )
        OR (punto_id IS NULL AND usuario = $2)
        ORDER BY creado_en ASC`,
      [user.sub, user.sub],
    );
    return res.rows.map((r) => r.data);
  }

  /**
   * Crea o actualiza un congelado. El consecutivo temporal (CONG-N) es
   * incremental por punto de venta (o por usuario si el borrador aún no tiene
   * punto). Guarda quién lo congeló (usuario) para auditoría/scope.
   */
  async guardar(
    user: JwtPayload,
    id: string,
    data: CongeladoData,
  ): Promise<CongeladoData> {
    const puntoId = this.puntoIdDeData(data);

    const existente = await this.pool.query<{ temp_consecutivo: number }>(
      `SELECT temp_consecutivo FROM pedidos_congelados WHERE id = $1`,
      [id],
    );

    let temp = Number(data.tempConsecutivo) || 0;
    if (existente.rowCount) {
      // Conserva el consecutivo temporal ya asignado.
      temp = existente.rows[0].temp_consecutivo;
    } else if (!temp) {
      const max =
        puntoId != null
          ? await this.pool.query<{ siguiente: number }>(
              `SELECT COALESCE(MAX(temp_consecutivo), 0) + 1 AS siguiente
                 FROM pedidos_congelados WHERE punto_id = $1::bigint`,
              [puntoId],
            )
          : await this.pool.query<{ siguiente: number }>(
              `SELECT COALESCE(MAX(temp_consecutivo), 0) + 1 AS siguiente
                 FROM pedidos_congelados WHERE usuario = $1`,
              [user.sub],
            );
      temp = Number(max.rows[0].siguiente) || 1;
    }

    const finalData: CongeladoData = { ...data, id, tempConsecutivo: temp };

    await this.pool.query(
      `INSERT INTO pedidos_congelados (id, usuario, punto_id, temp_consecutivo, data, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE
         SET temp_consecutivo = EXCLUDED.temp_consecutivo,
             punto_id = EXCLUDED.punto_id,
             data = EXCLUDED.data,
             actualizado_en = now()`,
      [id, user.sub, puntoId, temp, finalData],
    );

    return finalData;
  }

  /**
   * Elimina (descongela) un congelado si el usuario tiene acceso: admin, el
   * que lo congeló, o alguien asignado al mismo punto de venta.
   */
  async eliminar(user: JwtPayload, id: string): Promise<{ ok: boolean }> {
    if (this.esAdmin(user.rol)) {
      await this.pool.query(`DELETE FROM pedidos_congelados WHERE id = $1`, [id]);
      return { ok: true };
    }
    await this.pool.query(
      `DELETE FROM pedidos_congelados
        WHERE id = $1
          AND (
            usuario = $2
            OR (
              punto_id IS NOT NULL
              AND punto_id IN (
                SELECT punto_venta_id FROM usuario_punto_venta WHERE usuario_id = $2::bigint
              )
            )
          )`,
      [id, user.sub],
    );
    return { ok: true };
  }
}
