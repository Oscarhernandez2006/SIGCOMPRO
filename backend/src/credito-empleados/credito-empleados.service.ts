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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tesseract = require('node-tesseract-ocr') as {
  recognize: (src: Buffer | string, config: Record<string, unknown>) => Promise<string>;
};

export interface ProductoFactura {
  numero: number;
  descripcion: string;
  referencia: string;
  cantidad: number;
  um: string;
  precio_unitario: number;
  total: number;
}

export interface TrabajadorCredito {
  cedula: string;
  nombre: string;
  cupo_asignado: number;
  activo: boolean;
  /** Fecha del próximo descuento de nómina (YYYY-MM-DD). */
  fecha_proximo_descuento: string | null;
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
  /** Fecha de nómina en que se cobrará (13 o 27 del mes, YYYY-MM-DD). */
  nomina_fecha: string | null;
  /** Total extraído por OCR de la foto de factura. */
  factura_total_leido: number | null;
  /** true si el OCR confirmó que el total coincide. */
  factura_validada: boolean;
  /** Productos extraídos del tiquete por OCR (SIESA POS). */
  factura_productos: ProductoFactura[];
  /** Imagen base64 de la factura (solo en obtenerPedido, no en listado). */
  factura_imagen?: string | null;
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
    await this.pool.query(
      `ALTER TABLE credito_empleados_trabajadores ADD COLUMN IF NOT EXISTS fecha_proximo_descuento date NULL`,
    );

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
    // Columnas de nómina y factura OCR.
    for (const sql of [
      `ALTER TABLE credito_empleados_pedidos ADD COLUMN IF NOT EXISTS nomina_fecha date NULL`,
      `ALTER TABLE credito_empleados_pedidos ADD COLUMN IF NOT EXISTS factura_imagen text NULL`,
      `ALTER TABLE credito_empleados_pedidos ADD COLUMN IF NOT EXISTS factura_total_leido numeric NULL`,
      `ALTER TABLE credito_empleados_pedidos ADD COLUMN IF NOT EXISTS factura_validada boolean NOT NULL DEFAULT false`,
      `ALTER TABLE credito_empleados_pedidos ADD COLUMN IF NOT EXISTS factura_productos jsonb NOT NULL DEFAULT '[]'::jsonb`,
    ]) {
      await this.pool.query(sql);
    }
  }

  /**
   * Fecha de nómina en que se cobrará el pedido.
   * Nóminas: 13 y 27 de cada mes.
   * Si quedan ≤ 3 días para la próxima nómina → cobrar en la siguiente.
   */
  private calcularFechaNomina(fecha: Date): string {
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bogotaStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
    }).format(fecha);
    const [y, m, d] = bogotaStr.split('-').map(Number);
    const hoy = new Date(y, m - 1, d);
    const candidates: Date[] = [];
    for (let i = 0; i < 3; i++) {
      const cm = m - 1 + i;
      const yr = y + Math.floor(cm / 12);
      const mo = cm % 12;
      candidates.push(new Date(yr, mo, 13), new Date(yr, mo, 27));
    }
    const futuras = candidates
      .filter((c) => c.getTime() >= hoy.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    if (futuras.length === 0) return fmt(new Date(y, m, 13));
    const proxima = futuras[0];
    const diffDias = Math.round((proxima.getTime() - hoy.getTime()) / 86_400_000);
    if (diffDias <= 3) {
      if (futuras[1]) return fmt(futuras[1]);
      return proxima.getDate() === 13
        ? fmt(new Date(proxima.getFullYear(), proxima.getMonth(), 27))
        : fmt(new Date(proxima.getFullYear(), proxima.getMonth() + 1, 13));
    }
    return fmt(proxima);
  }

  /**
   * Procesa la imagen con Tesseract OCR (open-source, sin API key).
   * Preprocesa con sharp (escala de grises + contraste) para mejor precisión.
   * Parsea formato SIESA POS extrayendo total y lista de productos.
   */
  private async procesarOCR(
    imagen: string,
  ): Promise<{ total: number | null; productos: ProductoFactura[] }> {
    try {
      const base64 = imagen.includes(',') ? imagen.split(',')[1] : imagen;
      let buffer = Buffer.from(base64, 'base64');

      // Preprocesamiento: escala de grises + normalización para mejor OCR.
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const sharp = require('sharp') as typeof import('sharp');
        buffer = await sharp(buffer).grayscale().normalise().sharpen().toBuffer();
      } catch {
        /* sharp falla silenciosamente; usa imagen original */
      }

      const texto = await tesseract.recognize(buffer, {
        lang: 'spa',
        oem: 1, // LSTM engine (mejor precisión)
        psm: 6, // bloque uniforme de texto
      });

      this.logger.debug(`OCR extraído (${texto.length} chars)`);
      return this.parsearFacturaSiesaPos(texto);
    } catch (e) {
      this.logger.warn(`OCR falló: ${String(e)}`);
      return { total: null, productos: [] };
    }
  }

  /** Parsea texto OCR de factura SIESA POS → total y líneas de producto. */
  private parsearFacturaSiesaPos(texto: string): { total: number | null; productos: ProductoFactura[] } {
    const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);

    // Total: "T O T A L .......... $10,086"
    let total: number | null = null;
    for (const l of lineas) {
      const m = l.match(/T\s*O\s*T\s*A\s*L[\s.]*\$?\s*([\d,]+)/i);
      if (m && !/ITEMS/i.test(l)) { total = this.parsearNumero(m[1]); break; }
    }

    // Productos: sección entre "# Descripcion de Item" y "TOTAL ITEMS"
    const productos: ProductoFactura[] = [];
    let ini = -1, fin = -1;
    for (let i = 0; i < lineas.length; i++) {
      if (ini < 0 && /descripcion de item|# desc/i.test(lineas[i])) ini = i + 2;
      if (ini >= 0 && /TOTAL ITEMS/i.test(lineas[i])) { fin = i; break; }
    }

    if (ini >= 0 && fin > ini) {
      let i = ini;
      while (i < fin) {
        const l1 = lineas[i];
        const l2 = i + 1 < fin ? lineas[i + 1] : '';
        // Línea 1: "{num} {descripcion}"
        const m1 = l1.match(/^(\d+)\s+(.+)$/);
        if (m1) {
          // Línea 2: "{ref} {cant} {UM} {precio_unit} {total}[**]"
          const m2 = l2.match(/^(\d+)\s+([\d.]+)\s+([A-Z]+)\s+([\d,]+)\s+([\d,]+)/i);
          if (m2) {
            productos.push({
              numero: Number(m1[1]),
              descripcion: m1[2].trim(),
              referencia: m2[1],
              cantidad: this.parsearNumero(m2[2]),
              um: m2[3].toUpperCase(),
              precio_unitario: this.parsearNumero(m2[4]),
              total: this.parsearNumero(m2[5]),
            });
            i += 2; continue;
          }
        }
        i++;
      }
    }
    return { total, productos };
  }

  /** "20,999" → 20999 · "0.48" → 0.48 (formato SIESA POS). */
  private parsearNumero(s: string): number {
    const c = s.replace(/[*$\s]/g, '');
    if (/^\d{1,3}(,\d{3})+$/.test(c)) return Number(c.replace(/,/g, ''));
    if (/^\d+\.\d+$/.test(c)) return Number(c);
    return Number(c.replace(/,/g, '')) || 0;
  }

  /** Totales por fecha de nómina para el panel de cobros. */
  async resumenNomina(): Promise<
    Array<{ nomina_fecha: string; total: number; n_pedidos: number; trabajadores: number }>
  > {
    const res = await this.pool.query<{
      nomina_fecha: string; total: string; n_pedidos: string; trabajadores: string;
    }>(
      `SELECT
         to_char(nomina_fecha, 'YYYY-MM-DD') AS nomina_fecha,
         SUM(total)::text                    AS total,
         COUNT(*)::text                      AS n_pedidos,
         COUNT(DISTINCT trabajador_cedula)::text AS trabajadores
       FROM credito_empleados_pedidos
       WHERE estado <> 'anulado' AND nomina_fecha IS NOT NULL
       GROUP BY nomina_fecha ORDER BY nomina_fecha ASC`,
    );
    return res.rows.map((r) => ({
      nomina_fecha: r.nomina_fecha,
      total: Number(r.total) || 0,
      n_pedidos: Number(r.n_pedidos) || 0,
      trabajadores: Number(r.trabajadores) || 0,
    }));
  }

  private filaATrabajador(r: Record<string, unknown>, siesaSaldo: number | null = null): TrabajadorCreditoResumen {
    const cupo = Number(r.cupo_asignado) || 0;
    const deuda = Number(r.deuda_vigente) || 0;
    return {
      cedula: String(r.cedula ?? ''),
      nombre: String(r.nombre ?? ''),
      cupo_asignado: cupo,
      activo: r.activo === true,
      fecha_proximo_descuento: r.fecha_proximo_descuento ? String(r.fecha_proximo_descuento).split('T')[0] : null,
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
    fecha_proximo_descuento?: string | null;
  }): Promise<TrabajadorCreditoResumen> {
    const cedula = String(input.cedula ?? '').trim();
    const nombre = String(input.nombre ?? '').trim();
    const cupo = Number(input.cupo_asignado) || 0;
    const fechaDesc = input.fecha_proximo_descuento?.trim() || null;
    if (!cedula || !nombre) {
      throw new BadRequestException('La cédula y el nombre son obligatorios');
    }
    if (cupo < 0) {
      throw new BadRequestException('El cupo asignado no puede ser negativo');
    }

    await this.pool.query(
      `INSERT INTO credito_empleados_trabajadores
         (cedula, nombre, cupo_asignado, activo, fecha_proximo_descuento, actualizado_en)
       VALUES ($1, $2, $3, COALESCE($4, true), $5::date, now())
       ON CONFLICT (cedula) DO UPDATE
         SET nombre = EXCLUDED.nombre,
             cupo_asignado = EXCLUDED.cupo_asignado,
             activo = EXCLUDED.activo,
             fecha_proximo_descuento = EXCLUDED.fecha_proximo_descuento,
             actualizado_en = now()`,
      [cedula, nombre, cupo, input.activo ?? true, fechaDesc],
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
    factura_imagen?: string | null;
  }): Promise<PedidoCredito> {
    const cedula = String(input.trabajador_cedula ?? '').trim();
    const puntoId = String(input.punto_id ?? '').trim();
    const puntoNombre = String(input.punto_nombre ?? '').trim();
    const total = Number(input.total) || 0;
    const observacion = String(input.observacion ?? '').trim() || null;
    const facturaImagen = input.factura_imagen ?? null;

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

    const nominaFecha = this.calcularFechaNomina(new Date());
    const ocrResult = facturaImagen ? await this.procesarOCR(facturaImagen) : { total: null, productos: [] };
    const facturaTotal = ocrResult.total;
    const facturaProductos = ocrResult.productos;
    const facturaValidada = facturaTotal !== null && Math.abs(facturaTotal - total) <= total * 0.02;

    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO credito_empleados_pedidos
         (id, trabajador_cedula, trabajador_nombre, punto_id, punto_nombre, total,
          observacion, estado, cartera_estado, creado_por_id, creado_por_nombre,
          nomina_fecha, factura_imagen, factura_total_leido, factura_validada,
          factura_productos, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente', 'pendiente', $8, $9,
               $10::date, $11, $12, $13, $14::jsonb, now())`,
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
        nominaFecha,
        facturaImagen,
        facturaTotal,
        facturaValidada,
        JSON.stringify(facturaProductos),
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
              creado_por_id, creado_por_nombre, creado_en, actualizado_en,
              to_char(nomina_fecha, 'YYYY-MM-DD') AS nomina_fecha,
              factura_total_leido, factura_validada, factura_imagen,
              COALESCE(factura_productos, '[]'::jsonb) AS factura_productos
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
              creado_por_id, creado_por_nombre, creado_en, actualizado_en,
              to_char(nomina_fecha, 'YYYY-MM-DD') AS nomina_fecha,
              factura_total_leido, factura_validada,
              COALESCE(factura_productos, '[]'::jsonb) AS factura_productos
         FROM credito_empleados_pedidos
         ${where}
        ORDER BY creado_en DESC
        LIMIT 300`,
      valores,
    );

    return res.rows.map((r) => ({ ...r, total: Number(r.total) || 0 }));
  }

  /** Busca el nombre de un tercero directamente en Siesa por cédula. */
  async buscarEnSiesa(cedula: string): Promise<{ cedula: string; nombre: string | null; encontrado: boolean }> {
    const c = String(cedula).trim();
    const nombre = await this.carteraClient.buscarNombreEnSiesa(c);
    return { cedula: c, nombre, encontrado: nombre !== null };
  }

  /** Importa trabajadores en masa; crea los nuevos y actualiza los existentes (upsert). */
  async importarTrabajadores(
    lista: Array<{ cedula: string; nombre: string; cupo_asignado?: number }>,
  ): Promise<{ importados: number; errores: Array<{ cedula: string; error: string }> }> {
    let importados = 0;
    const errores: Array<{ cedula: string; error: string }> = [];

    for (const item of lista) {
      const cedula = String(item.cedula ?? '').trim();
      const nombre = String(item.nombre ?? '').trim();
      if (!cedula || !nombre) {
        errores.push({ cedula: cedula || '?', error: 'Cédula o nombre vacíos' });
        continue;
      }
      try {
        await this.pool.query(
          `INSERT INTO credito_empleados_trabajadores
             (cedula, nombre, cupo_asignado, activo, actualizado_en)
           VALUES ($1, $2, $3, true, now())
           ON CONFLICT (cedula) DO UPDATE
             SET nombre = EXCLUDED.nombre,
                 cupo_asignado = CASE WHEN $3 > 0 THEN EXCLUDED.cupo_asignado ELSE credito_empleados_trabajadores.cupo_asignado END,
                 actualizado_en = now()`,
          [cedula, nombre, Number(item.cupo_asignado) || 0],
        );
        importados++;
      } catch (err) {
        errores.push({ cedula, error: err instanceof Error ? err.message : 'Error desconocido' });
      }
    }

    this.logger.log(`Importación masiva: ${importados} OK, ${errores.length} errores`);
    return { importados, errores };
  }
}

