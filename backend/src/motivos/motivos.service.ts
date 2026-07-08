import {
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CreateMotivoDto } from './dto/create-motivo.dto';
import { UpdateMotivoDto } from './dto/update-motivo.dto';

export type TipoMotivo = 'anular' | 'cancelar';

export interface MotivoRow {
  id: string;
  tipo: TipoMotivo;
  nombre: string;
  activo: boolean;
  creado_en: string;
}

const COLUMNS = 'id, tipo, nombre, activo, creado_en';

// Motivos precargados la primera vez (si la tabla está vacía).
const SEMILLA: { tipo: TipoMotivo; nombre: string }[] = [
  { tipo: 'anular', nombre: 'Pedido Doble' },
  { tipo: 'anular', nombre: 'Error dirección' },
  { tipo: 'anular', nombre: 'Inventario Agotados' },
  { tipo: 'cancelar', nombre: 'Cliente Cerrado' },
  { tipo: 'cancelar', nombre: 'Promesa no Cumplida' },
];

@Injectable()
export class MotivosService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS motivos (
        id bigserial PRIMARY KEY,
        tipo text NOT NULL CHECK (tipo IN ('anular', 'cancelar')),
        nombre text NOT NULL,
        activo boolean NOT NULL DEFAULT true,
        creado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Precarga los motivos por defecto solo si la tabla está vacía.
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM motivos`,
    );
    if (Number(rows[0]?.n ?? 0) === 0) {
      for (const m of SEMILLA) {
        await this.pool.query(
          `INSERT INTO motivos (tipo, nombre) VALUES ($1, $2)`,
          [m.tipo, m.nombre],
        );
      }
    }
  }

  /** Lista los motivos; opcionalmente filtrados por tipo y/o solo activos. */
  async listar(tipo?: TipoMotivo, soloActivos = false): Promise<MotivoRow[]> {
    const condiciones: string[] = [];
    const valores: unknown[] = [];
    if (tipo) {
      valores.push(tipo);
      condiciones.push(`tipo = $${valores.length}`);
    }
    if (soloActivos) {
      condiciones.push(`activo = true`);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const res = await this.pool.query<MotivoRow>(
      `SELECT ${COLUMNS} FROM motivos ${where}
       ORDER BY tipo ASC, nombre ASC`,
      valores,
    );
    return res.rows;
  }

  async obtener(id: string): Promise<MotivoRow> {
    const res = await this.pool.query<MotivoRow>(
      `SELECT ${COLUMNS} FROM motivos WHERE id = $1 LIMIT 1`,
      [id],
    );
    const motivo = res.rows[0];
    if (!motivo) throw new NotFoundException('Motivo no encontrado');
    return motivo;
  }

  async crear(dto: CreateMotivoDto): Promise<MotivoRow> {
    const res = await this.pool.query<MotivoRow>(
      `INSERT INTO motivos (tipo, nombre, activo)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [dto.tipo, dto.nombre.trim(), dto.activo ?? true],
    );
    return res.rows[0];
  }

  async actualizar(id: string, dto: UpdateMotivoDto): Promise<MotivoRow> {
    await this.obtener(id);
    const sets: string[] = [];
    const valores: unknown[] = [];
    let i = 1;
    if (dto.tipo !== undefined) {
      sets.push(`tipo = $${i++}`);
      valores.push(dto.tipo);
    }
    if (dto.nombre !== undefined) {
      sets.push(`nombre = $${i++}`);
      valores.push(dto.nombre.trim());
    }
    if (dto.activo !== undefined) {
      sets.push(`activo = $${i++}`);
      valores.push(dto.activo);
    }
    if (sets.length === 0) return this.obtener(id);
    valores.push(id);
    const res = await this.pool.query<MotivoRow>(
      `UPDATE motivos SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING ${COLUMNS}`,
      valores,
    );
    return res.rows[0];
  }

  async eliminar(id: string): Promise<{ id: string }> {
    const res = await this.pool.query(`DELETE FROM motivos WHERE id = $1`, [id]);
    if (res.rowCount === 0) {
      throw new NotFoundException('Motivo no encontrado');
    }
    return { id };
  }
}
