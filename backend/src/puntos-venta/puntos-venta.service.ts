import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { CreatePuntoVentaDto } from './dto/create-punto-venta.dto';
import { UpdatePuntoVentaDto } from './dto/update-punto-venta.dto';

export interface PuntoVentaRow {
  id: string;
  nombre: string;
  codigo: string | null;
  direccion: string | null;
  telefono: string | null;
  lista_precio: string | null;
  barrio: string | null;
  ciudad: string | null;
  lat: number | null;
  lng: number | null;
  /** Km incluidos en la tarifa base del domicilio. */
  dom_km_base: number;
  /** Valor base del domicilio (cubre hasta dom_km_base km). */
  dom_valor_base: number;
  /** Valor por cada km adicional pasado dom_km_base. */
  dom_valor_km: number;
  /** Valor del pedido a partir del cual el domicilio es gratis (0 = sin gratis). */
  dom_gratis_desde: number;
  /** Margen de error hacia abajo para aplicar el domicilio gratis. */
  dom_gratis_margen: number;
  activo: boolean;
  creado_en: string;
}

export interface PuntoVentaConUsuarios extends PuntoVentaRow {
  usuarios: number;
}

const COLUMNS =
  'id, nombre, codigo, direccion, telefono, lista_precio, barrio, ciudad, lat, lng, dom_km_base, dom_valor_base, dom_valor_km, dom_gratis_desde, dom_gratis_margen, activo, creado_en';

@Injectable()
export class PuntosVentaService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(
      `ALTER TABLE puntos_venta ADD COLUMN IF NOT EXISTS lista_precio text`,
    );
    // Coordenadas del punto (para calcular el domicilio por distancia).
    await this.pool.query(
      `ALTER TABLE puntos_venta ADD COLUMN IF NOT EXISTS barrio text`,
    );
    await this.pool.query(
      `ALTER TABLE puntos_venta ADD COLUMN IF NOT EXISTS ciudad text`,
    );
    await this.pool.query(
      `ALTER TABLE puntos_venta ADD COLUMN IF NOT EXISTS lat double precision`,
    );
    await this.pool.query(
      `ALTER TABLE puntos_venta ADD COLUMN IF NOT EXISTS lng double precision`,
    );
    // Tarifa de domicilio por punto: base cubre dom_km_base km; luego +dom_valor_km por km.
    await this.pool.query(
      `ALTER TABLE puntos_venta ADD COLUMN IF NOT EXISTS dom_km_base int NOT NULL DEFAULT 4`,
    );
    await this.pool.query(
      `ALTER TABLE puntos_venta ADD COLUMN IF NOT EXISTS dom_valor_base int NOT NULL DEFAULT 4000`,
    );
    await this.pool.query(
      `ALTER TABLE puntos_venta ADD COLUMN IF NOT EXISTS dom_valor_km int NOT NULL DEFAULT 1000`,
    );
    // Domicilio gratis: si el valor del pedido alcanza dom_gratis_desde (menos
    // el margen dom_gratis_margen), el domicilio no se cobra. 0 = sin gratis.
    await this.pool.query(
      `ALTER TABLE puntos_venta ADD COLUMN IF NOT EXISTS dom_gratis_desde int NOT NULL DEFAULT 225000`,
    );
    await this.pool.query(
      `ALTER TABLE puntos_venta ADD COLUMN IF NOT EXISTS dom_gratis_margen int NOT NULL DEFAULT 3000`,
    );
  }

  /** Lista todos los puntos de venta con su número de usuarios asignados. */
  async listar(): Promise<PuntoVentaConUsuarios[]> {
    const res = await this.pool.query<PuntoVentaConUsuarios>(
      `SELECT p.id, p.nombre, p.codigo, p.direccion, p.telefono, p.lista_precio,
              p.barrio, p.ciudad, p.lat, p.lng, p.dom_km_base, p.dom_valor_base, p.dom_valor_km,
              p.dom_gratis_desde, p.dom_gratis_margen,
              p.activo, p.creado_en,
              COUNT(upv.usuario_id)::int AS usuarios
       FROM puntos_venta p
       LEFT JOIN usuario_punto_venta upv ON upv.punto_venta_id = p.id
       GROUP BY p.id
       ORDER BY p.id ASC`,
    );
    return res.rows;
  }

  /**
   * Ubicaciones (id, nombre, código, lat/lng) de los puntos ACTIVOS. Se usa
   * para recomendar el punto más cercano al cliente. Lectura autenticada.
   */
  async ubicaciones(): Promise<
    {
      id: string;
      nombre: string;
      codigo: string | null;
      lat: number | null;
      lng: number | null;
    }[]
  > {
    const res = await this.pool.query(
      `SELECT id, nombre, codigo, lat, lng
       FROM puntos_venta
       WHERE activo = true
       ORDER BY nombre ASC`,
    );
    return res.rows as {
      id: string;
      nombre: string;
      codigo: string | null;
      lat: number | null;
      lng: number | null;
    }[];
  }

  async obtener(id: string): Promise<PuntoVentaRow> {
    const res = await this.pool.query<PuntoVentaRow>(
      `SELECT ${COLUMNS} FROM puntos_venta WHERE id = $1 LIMIT 1`,
      [id],
    );
    const punto = res.rows[0];
    if (!punto) {
      throw new NotFoundException('Punto de venta no encontrado');
    }
    return punto;
  }

  async crear(dto: CreatePuntoVentaDto): Promise<PuntoVentaRow> {
    const codigo = dto.codigo?.trim() || null;
    if (codigo) {
      const existe = await this.pool.query(
        `SELECT 1 FROM puntos_venta WHERE codigo = $1 LIMIT 1`,
        [codigo],
      );
      if (existe.rowCount) {
        throw new ConflictException('Ya existe un punto de venta con ese código');
      }
    }
    const res = await this.pool.query<PuntoVentaRow>(
      `INSERT INTO puntos_venta (nombre, codigo, direccion, telefono, lista_precio, barrio, ciudad, lat, lng, dom_km_base, dom_valor_base, dom_valor_km, dom_gratis_desde, dom_gratis_margen, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING ${COLUMNS}`,
      [
        dto.nombre.trim(),
        codigo,
        dto.direccion?.trim() || null,
        dto.telefono?.trim() || null,
        dto.lista_precio?.trim() || null,
        dto.barrio?.trim() || null,
        dto.ciudad?.trim() || null,
        dto.lat ?? null,
        dto.lng ?? null,
        dto.dom_km_base ?? 4,
        dto.dom_valor_base ?? 4000,
        dto.dom_valor_km ?? 1000,
        dto.dom_gratis_desde ?? 225000,
        dto.dom_gratis_margen ?? 3000,
        dto.activo ?? true,
      ],
    );
    return res.rows[0];
  }

  async actualizar(id: string, dto: UpdatePuntoVentaDto): Promise<PuntoVentaRow> {
    await this.obtener(id);

    if (dto.codigo !== undefined && dto.codigo.trim()) {
      const otro = await this.pool.query<{ id: string }>(
        `SELECT id FROM puntos_venta WHERE codigo = $1 AND id <> $2 LIMIT 1`,
        [dto.codigo.trim(), id],
      );
      if (otro.rowCount) {
        throw new ConflictException('Ya existe un punto de venta con ese código');
      }
    }

    const sets: string[] = [];
    const valores: unknown[] = [];
    let i = 1;

    if (dto.nombre !== undefined) {
      sets.push(`nombre = $${i++}`);
      valores.push(dto.nombre.trim());
    }
    if (dto.codigo !== undefined) {
      sets.push(`codigo = $${i++}`);
      valores.push(dto.codigo.trim() || null);
    }
    if (dto.direccion !== undefined) {
      sets.push(`direccion = $${i++}`);
      valores.push(dto.direccion.trim() || null);
    }
    if (dto.telefono !== undefined) {
      sets.push(`telefono = $${i++}`);
      valores.push(dto.telefono.trim() || null);
    }
    if (dto.lista_precio !== undefined) {
      sets.push(`lista_precio = $${i++}`);
      valores.push(dto.lista_precio.trim() || null);
    }
    if (dto.barrio !== undefined) {
      sets.push(`barrio = $${i++}`);
      valores.push(dto.barrio.trim() || null);
    }
    if (dto.ciudad !== undefined) {
      sets.push(`ciudad = $${i++}`);
      valores.push(dto.ciudad.trim() || null);
    }
    if (dto.lat !== undefined) {
      sets.push(`lat = $${i++}`);
      valores.push(dto.lat);
    }
    if (dto.lng !== undefined) {
      sets.push(`lng = $${i++}`);
      valores.push(dto.lng);
    }
    if (dto.dom_km_base !== undefined) {
      sets.push(`dom_km_base = $${i++}`);
      valores.push(dto.dom_km_base);
    }
    if (dto.dom_valor_base !== undefined) {
      sets.push(`dom_valor_base = $${i++}`);
      valores.push(dto.dom_valor_base);
    }
    if (dto.dom_valor_km !== undefined) {
      sets.push(`dom_valor_km = $${i++}`);
      valores.push(dto.dom_valor_km);
    }
    if (dto.dom_gratis_desde !== undefined) {
      sets.push(`dom_gratis_desde = $${i++}`);
      valores.push(dto.dom_gratis_desde);
    }
    if (dto.dom_gratis_margen !== undefined) {
      sets.push(`dom_gratis_margen = $${i++}`);
      valores.push(dto.dom_gratis_margen);
    }
    if (dto.activo !== undefined) {
      sets.push(`activo = $${i++}`);
      valores.push(dto.activo);
    }

    if (sets.length === 0) {
      return this.obtener(id);
    }

    valores.push(id);
    const res = await this.pool.query<PuntoVentaRow>(
      `UPDATE puntos_venta SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING ${COLUMNS}`,
      valores,
    );
    return res.rows[0];
  }

  async eliminar(id: string): Promise<{ id: string }> {
    const res = await this.pool.query(`DELETE FROM puntos_venta WHERE id = $1`, [
      id,
    ]);
    if (res.rowCount === 0) {
      throw new NotFoundException('Punto de venta no encontrado');
    }
    return { id };
  }

  /** IDs de usuarios asignados a un punto de venta. */
  async usuariosDe(id: string): Promise<string[]> {
    await this.obtener(id);
    const res = await this.pool.query<{ usuario_id: string }>(
      `SELECT usuario_id FROM usuario_punto_venta WHERE punto_venta_id = $1`,
      [id],
    );
    return res.rows.map((r) => String(r.usuario_id));
  }

  /** Reemplaza por completo la lista de usuarios asignados al punto. */
  async asignarUsuarios(id: string, usuarioIds: string[]): Promise<string[]> {
    await this.obtener(id);
    const ids = Array.from(new Set(usuarioIds.map((u) => String(u))));
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(
        `DELETE FROM usuario_punto_venta WHERE punto_venta_id = $1`,
        [id],
      );
      for (const usuarioId of ids) {
        await cliente.query(
          `INSERT INTO usuario_punto_venta (usuario_id, punto_venta_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [usuarioId, id],
        );
      }
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
    return ids;
  }

  /** Puntos de venta asignados a un usuario (panel operativo). */
  async puntosDeUsuario(usuarioId: string): Promise<PuntoVentaRow[]> {
    const res = await this.pool.query<PuntoVentaRow>(
      `SELECT ${COLUMNS.split(', ')
        .map((c) => `p.${c}`)
        .join(', ')}
       FROM puntos_venta p
       JOIN usuario_punto_venta upv ON upv.punto_venta_id = p.id
       WHERE upv.usuario_id = $1 AND p.activo = true
       ORDER BY p.id ASC`,
      [usuarioId],
    );
    return res.rows;
  }

  /** IDs de puntos de venta asignados a un usuario (para el asistente admin). */
  async idsPuntosDeUsuario(usuarioId: string): Promise<string[]> {
    const res = await this.pool.query<{ punto_venta_id: string }>(
      `SELECT punto_venta_id FROM usuario_punto_venta WHERE usuario_id = $1`,
      [usuarioId],
    );
    return res.rows.map((r) => String(r.punto_venta_id));
  }

  /** Reemplaza por completo la lista de puntos asignados a un usuario. */
  async asignarPuntosAUsuario(
    usuarioId: string,
    puntoIds: string[],
  ): Promise<string[]> {
    const ids = Array.from(new Set(puntoIds.map((p) => String(p))));
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(
        `DELETE FROM usuario_punto_venta WHERE usuario_id = $1`,
        [usuarioId],
      );
      for (const puntoId of ids) {
        await cliente.query(
          `INSERT INTO usuario_punto_venta (usuario_id, punto_venta_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [usuarioId, puntoId],
        );
      }
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
    return ids;
  }
}
