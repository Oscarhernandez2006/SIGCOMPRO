import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { PG_POOL } from '../database/database.module';
import { PedidosService } from '../pedidos/pedidos.service';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';

/**
 * Estructura libre de una cotización tal como la maneja el frontend. El carrito
 * usa el mismo formato que un pedido, pero el `precio` de cada producto puede
 * haber sido editado manualmente (es el precio que sale en la cotización y el
 * que se usa al convertirla en pedido).
 */
type CotizacionData = Record<string, unknown> & {
  id?: string;
  numero?: number;
  fecha?: string;
  estado?: string;
  pedidoId?: string;
  pedidoComanda?: string;
  total?: number;
  observacion?: string;
  vendedorNombre?: string;
  vendedorCedula?: string;
  punto?: { id?: string; nombre?: string; codigo?: string | null } | null;
  cliente?: Record<string, unknown> | null;
  carrito?: unknown[];
};

@Injectable()
export class CotizacionesService implements OnModuleInit {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly pedidos: PedidosService,
  ) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS cotizaciones (
        id text PRIMARY KEY,
        numero int,
        punto_id text,
        estado text,
        pedido_id text,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  /** Todas las cotizaciones (más recientes primero). */
  async listar(): Promise<CotizacionData[]> {
    const res = await this.pool.query<{ data: CotizacionData }>(
      `SELECT data FROM cotizaciones
        ORDER BY numero DESC NULLS LAST, creado_en DESC`,
    );
    return res.rows.map((r) => r.data);
  }

  /**
   * Crea o actualiza una cotización (upsert por id). Cualquier usuario con
   * permiso puede editar; el número se asigna atómicamente al crear.
   */
  async guardar(cot: CotizacionData, user?: JwtPayload): Promise<CotizacionData> {
    const id = String(cot.id ?? '').trim();
    if (!id) throw new Error('La cotización no tiene id.');
    const puntoId = cot.punto?.id ? String(cot.punto.id) : null;
    const finalCot: CotizacionData = { ...cot };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const prev = await client.query<{
        numero: number | null;
        data: CotizacionData;
      }>(`SELECT numero, data FROM cotizaciones WHERE id = $1 FOR UPDATE`, [id]);

      if (prev.rowCount) {
        // Edición: conserva número, fecha y —si ya fue confirmada— su estado
        // y el pedido generado.
        const prevData = prev.rows[0].data ?? {};
        finalCot.numero =
          (typeof prevData.numero === 'number'
            ? prevData.numero
            : prev.rows[0].numero) ?? finalCot.numero;
        finalCot.fecha = prevData.fecha ?? finalCot.fecha;
        if (prevData.estado === 'confirmada') {
          finalCot.estado = 'confirmada';
          finalCot.pedidoId = prevData.pedidoId ?? finalCot.pedidoId;
          finalCot.pedidoComanda =
            prevData.pedidoComanda ?? finalCot.pedidoComanda;
        }
      } else {
        // Nueva: asigna el número consecutivo de forma atómica (global).
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          'cotizacion_numero',
        ]);
        const max = await client.query<{ siguiente: number }>(
          `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM cotizaciones`,
        );
        finalCot.numero = Number(max.rows[0].siguiente) || 1;
      }

      const estado = finalCot.estado ? String(finalCot.estado) : 'borrador';
      finalCot.estado = estado;

      await client.query(
        `INSERT INTO cotizaciones
           (id, numero, punto_id, estado, pedido_id, data)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           numero = EXCLUDED.numero,
           punto_id = EXCLUDED.punto_id,
           estado = EXCLUDED.estado,
           pedido_id = EXCLUDED.pedido_id,
           data = EXCLUDED.data,
           actualizado_en = now()`,
        [
          id,
          finalCot.numero ?? null,
          puntoId,
          estado,
          finalCot.pedidoId ?? null,
          JSON.stringify(finalCot),
        ],
      );

      await client.query('COMMIT');
      return finalCot;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Elimina una cotización. Solo el creador (o admin) puede hacerlo. */
  async eliminar(id: string, user?: JwtPayload): Promise<{ id: string }> {
    const res = await this.pool.query<{ data: CotizacionData }>(
      `SELECT data FROM cotizaciones WHERE id = $1`,
      [id],
    );
    if (res.rowCount) {
      const cot = res.rows[0].data ?? {};
      const cedulaCreador = String(cot.vendedorCedula ?? '').trim();
      if (cedulaCreador && user?.cedula) {
        const esAdmin = user?.rol
          ? ['admin', 'gerente', 'superadmin'].includes(
              String(user.rol).toLowerCase(),
            )
          : false;
        if (!esAdmin && String(user.cedula).trim() !== cedulaCreador) {
          throw new BadRequestException(
            'Solo el vendedor que creó la cotización puede eliminarla.',
          );
        }
      }
    }
    await this.pool.query(`DELETE FROM cotizaciones WHERE id = $1`, [id]);
    return { id };
  }

  /**
   * Convierte una cotización en un PEDIDO real, conservando los precios que se
   * fijaron en la cotización (cada item del carrito ya trae su `producto.precio`
   * editado). El pedido queda "En proceso" para continuar el flujo normal.
   */
  async convertir(
    id: string,
    user?: JwtPayload,
  ): Promise<{ pedido: unknown; cotizacion: CotizacionData }> {
    const res = await this.pool.query<{ data: CotizacionData }>(
      `SELECT data FROM cotizaciones WHERE id = $1`,
      [id],
    );
    if (!res.rowCount) {
      throw new NotFoundException('Cotización no encontrada.');
    }
    const cot = res.rows[0].data ?? {};
    if (cot.pedidoId) {
      throw new Error('Esta cotización ya fue convertida en pedido.');
    }

    const carrito = Array.isArray(cot.carrito) ? cot.carrito : [];
    const total = typeof cot.total === 'number' ? cot.total : 0;

    const pedido: Record<string, unknown> = {
      id: randomUUID(),
      consecutivo: 0,
      punto: cot.punto,
      cliente: cot.cliente,
      carrito,
      entrega: null,
      pago: null,
      total,
      valorDomicilio: 0,
      observacion: cot.observacion,
      vendedorNombre: cot.vendedorNombre,
      vendedorCedula: cot.vendedorCedula,
      estado: 'En proceso',
      fecha: new Date().toISOString(),
      // Referencia a la cotización de origen (trazabilidad).
      cotizacionNumero: cot.numero,
    };

    const finalPedido = await this.pedidos.guardar(pedido, user);
    const finalId = (finalPedido as { id?: string }).id;
    const finalComanda = (finalPedido as { comanda?: string }).comanda;

    cot.estado = 'confirmada';
    cot.pedidoId = finalId;
    cot.pedidoComanda = finalComanda;
    const cotizacion = await this.guardar(cot);

    return { pedido: finalPedido, cotizacion };
  }
}
