import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PG_POOL } from '../database/database.module';
import { CreditoEmpleadosCarteraClient } from './credito-empleados.cartera.client';

export interface TrabajadorCredito {
  cedula: string;
  nombre: string;
  cupo_asignado: number;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface TrabajadorCreditoResumen extends TrabajadorCredito {
  deuda_vigente: number;
  cupo_disponible: number;
  /** Saldo en cartera de Siesa. null = integración no configurada o fallo. */
  siesa_saldo: number | null;
}

export interface PedidoCredito {
  id: string;
  trabajador_cedula: string;
  trabajador_nombre: string;
  punto_id: string;
  punto_nombre: string;
  total: number;
  observacion: string | null;
  estado: 'pendiente' | 'facturado' | 'anulado';
  cartera_referencia: string | null;
  cartera_estado: string | null;
  creado_por_id: string | null;
  creado_por_nombre: string | null;
  creado_en: string;
  actualizado_en: string;
}

@Injectable()
export class CreditoEmpleadosService implements OnModuleInit {
  private readonly logger = new Logger(CreditoEmpleadosService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly carteraClient: CreditoEmpleadosCarteraClient,
  ) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS credito_empleados_trabajadores (
        cedula text PRIMARY KEY,
        nombre text NOT NULL,
        cupo_asignado numeric(14,2) NOT NULL DEFAULT 0,
        activo boolean NOT NULL DEFAULT true,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS credito_empleados_pedidos (
        id text PRIMARY KEY,
        trabajador_cedula text NOT NULL REFERENCES credito_empleados_trabajadores(cedula),
        trabajador_nombre text NOT NULL,
        punto_id text NOT NULL,
        punto_nombre text NOT NULL,
        total numeric(14,2) NOT NULL,
        observacion text NULL,
        estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','facturado','anulado')),
        cartera_referencia text NULL,
        cartera_estado text NULL,
        creado_por_id text NULL,
        creado_por_nombre text NULL,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  private filaATrabajador(r: Record<string, unknown>, siesaSaldo: number | null = null): TrabajadorCreditoResumen {
    const cupo = Number(r.cupo_asignado) || 0;
    const deuda = Number(r.deuda_vigente) || 0;
    return {
      cedula: String(r.cedula ?? ''),
      nombre: String(r.nombre ?? ''),
      cupo_asignado: cupo,
      activo: r.activo === true,
      creado_en: String(r.creado_en ?? ''),
      actualizado_en: String(r.actualizado_en ?? ''),
      deuda_vigente: deuda,
      cupo_disponible: Math.max(0, cupo - deuda),
      siesa_saldo: siesaSaldo,
    };
  }

  async buscarTrabajadores(q = ''): Promise<TrabajadorCreditoResumen[]> {
    const term = String(q).trim();
    const p = `%${term}%`;
    const res = await this.pool.query(
      `SELECT
         t.cedula,
         t.nombre,
         t.cupo_asignado,
         t.activo,
         t.creado_en,
         t.actualizado_en,
         COALESCE(SUM(CASE WHEN p.estado <> 'anulado' THEN p.total ELSE 0 END), 0) AS deuda_vigente
       FROM credito_empleados_trabajadores t
       LEFT JOIN credito_empleados_pedidos p
         ON p.trabajador_cedula = t.cedula
       WHERE ($1 = '' OR t.cedula ILIKE $2 OR t.nombre ILIKE $2)
       GROUP BY t.cedula, t.nombre, t.cupo_asignado, t.activo, t.creado_en, t.actualizado_en
       ORDER BY t.nombre ASC
       LIMIT 100`,
      [term, p],
    );
    // No consultamos Siesa en búsqueda masiva (performance); siesa_saldo llega en obtenerTrabajador
    return res.rows.map((r) => this.filaATrabajador(r as Record<string, unknown>, null));
  }

  async obtenerTrabajador(cedula: string): Promise<TrabajadorCreditoResumen> {
    const c = String(cedula).trim();
    const [dbRes, siesaSaldo] = await Promise.all([
      this.pool.query(
        `SELECT
           t.cedula,
           t.nombre,
           t.cupo_asignado,
           t.activo,
           t.creado_en,
           t.actualizado_en,
           COALESCE(SUM(CASE WHEN p.estado <> 'anulado' THEN p.total ELSE 0 END), 0) AS deuda_vigente
         FROM credito_empleados_trabajadores t
         LEFT JOIN credito_empleados_pedidos p
           ON p.trabajador_cedula = t.cedula
         WHERE t.cedula = $1
         GROUP BY t.cedula, t.nombre, t.cupo_asignado, t.activo, t.creado_en, t.actualizado_en
         LIMIT 1`,
        [c],
      ),
      // Consulta de saldo en Siesa en paralelo; fallo = null (no bloquea)
      this.carteraClient.consultarSaldo(c),
    ]);

    if (!dbRes.rowCount) {
      throw new NotFoundException('Trabajador no encontrado en crédito empleados');
    }
    return this.filaATrabajador(dbRes.rows[0] as Record<string, unknown>, siesaSaldo);
  }

  async guardarTrabajador(input: {
    cedula: string;
    nombre: string;
    cupo_asignado: number;
    activo?: boolean;
  }): Promise<TrabajadorCreditoResumen> {
    const cedula = String(input.cedula ?? '').trim();
    const nombre = String(input.nombre ?? '').trim();
    const cupo = Number(input.cupo_asignado) || 0;
    if (!cedula || !nombre) {
      throw new BadRequestException('La cédula y el nombre son obligatorios');
    }
    if (cupo < 0) {
      throw new BadRequestException('El cupo asignado no puede ser negativo');
    }

    await this.pool.query(
      `INSERT INTO credito_empleados_trabajadores
         (cedula, nombre, cupo_asignado, activo, actualizado_en)
       VALUES ($1, $2, $3, COALESCE($4, true), now())
       ON CONFLICT (cedula) DO UPDATE
         SET nombre = EXCLUDED.nombre,
             cupo_asignado = EXCLUDED.cupo_asignado,
             activo = EXCLUDED.activo,
             actualizado_en = now()`,
      [cedula, nombre, cupo, input.activo ?? true],
    );

    return this.obtenerTrabajador(cedula);
  }

  async crearPedidoCredito(input: {
    trabajador_cedula: string;
    punto_id: string;
    punto_nombre: string;
    total: number;
    observacion?: string;
    creado_por_id?: string | null;
    creado_por_nombre?: string | null;
  }): Promise<PedidoCredito> {
    const cedula = String(input.trabajador_cedula ?? '').trim();
    const puntoId = String(input.punto_id ?? '').trim();
    const puntoNombre = String(input.punto_nombre ?? '').trim();
    const total = Number(input.total) || 0;
    const observacion = String(input.observacion ?? '').trim() || null;

    if (!cedula || !puntoId || !puntoNombre) {
      throw new BadRequestException('Faltan datos del trabajador o del punto de venta');
    }
    if (!Number.isFinite(total) || total <= 0) {
      throw new BadRequestException('El valor de la compra debe ser mayor a 0');
    }

    const trabajador = await this.obtenerTrabajador(cedula);
    if (!trabajador.activo) {
      throw new BadRequestException('Este trabajador no está activo para compras a crédito');
    }
    if (total > trabajador.cupo_disponible) {
      throw new BadRequestException(
        `Cupo insuficiente. Disponible: ${trabajador.cupo_disponible.toLocaleString('es-CO')}`,
      );
    }

    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO credito_empleados_pedidos
         (id, trabajador_cedula, trabajador_nombre, punto_id, punto_nombre, total,
          observacion, estado, cartera_estado, creado_por_id, creado_por_nombre, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente', 'pendiente', $8, $9, now())`,
      [
        id,
        trabajador.cedula,
        trabajador.nombre,
        puntoId,
        puntoNombre,
        total,
        observacion,
        input.creado_por_id ?? null,
        input.creado_por_nombre ?? null,
      ],
    );

    const pedido = await this.obtenerPedido(id);
    return pedido;
  }

  async actualizarEstadoPedido(
    id: string,
    estado: 'pendiente' | 'facturado' | 'anulado',
  ): Promise<PedidoCredito> {
    const st = String(estado).trim().toLowerCase();
    if (st !== 'pendiente' && st !== 'facturado' && st !== 'anulado') {
      throw new BadRequestException('Estado inválido');
    }

    const res = await this.pool.query(
      `UPDATE credito_empleados_pedidos
         SET estado = $2,
             cartera_estado = CASE
               WHEN $2 = 'facturado' THEN 'facturado'
               WHEN $2 = 'anulado' THEN 'anulado'
               ELSE 'pendiente'
             END,
             actualizado_en = now()
       WHERE id = $1`,
      [id, st],
    );

    if (!res.rowCount) {
      throw new NotFoundException('Pedido de crédito no encontrado');
    }

    const pedido = await this.obtenerPedido(id);
    return pedido;
  }

  async obtenerPedido(id: string): Promise<PedidoCredito> {
    const res = await this.pool.query<PedidoCredito>(
      `SELECT id, trabajador_cedula, trabajador_nombre, punto_id, punto_nombre,
              total, observacion, estado, cartera_referencia, cartera_estado,
              creado_por_id, creado_por_nombre, creado_en, actualizado_en
         FROM credito_empleados_pedidos
        WHERE id = $1
        LIMIT 1`,
      [id],
    );
    const row = res.rows[0];
    if (!row) {
      throw new NotFoundException('Pedido de crédito no encontrado');
    }
    row.total = Number(row.total) || 0;
    return row;
  }

  async listarPedidos(filtros: {
    cedula?: string;
    estado?: string;
    punto_id?: string;
    desde?: string;
    hasta?: string;
  }): Promise<PedidoCredito[]> {
    const condiciones: string[] = [];
    const valores: unknown[] = [];
    let i = 1;

    if (filtros.cedula?.trim()) {
      condiciones.push(`trabajador_cedula = $${i++}`);
      valores.push(filtros.cedula.trim());
    }
    if (filtros.estado?.trim()) {
      condiciones.push(`estado = $${i++}`);
      valores.push(filtros.estado.trim().toLowerCase());
    }
    if (filtros.punto_id?.trim()) {
      condiciones.push(`punto_id = $${i++}`);
      valores.push(filtros.punto_id.trim());
    }
    if (filtros.desde?.trim()) {
      condiciones.push(`creado_en >= $${i++}::date`);
      valores.push(filtros.desde.trim());
    }
    if (filtros.hasta?.trim()) {
      condiciones.push(`creado_en < ($${i++}::date + interval '1 day')`);
      valores.push(filtros.hasta.trim());
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const res = await this.pool.query<PedidoCredito>(
      `SELECT id, trabajador_cedula, trabajador_nombre, punto_id, punto_nombre,
              total, observacion, estado, cartera_referencia, cartera_estado,
              creado_por_id, creado_por_nombre, creado_en, actualizado_en
         FROM credito_empleados_pedidos
         ${where}
        ORDER BY creado_en DESC
        LIMIT 300`,
      valores,
    );

    return res.rows.map((r) => ({ ...r, total: Number(r.total) || 0 }));
  }
}

