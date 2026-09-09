import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PG_POOL } from '../database/database.module';

/** Ítem del catálogo curado de la tienda de empleados (por punto). */
export interface ItemCatalogoTienda {
  referencia: string;
  producto: string;
  categoria: string;
  um: string;
  precio: number;
}

/** Ítem del carrito enviado al crear un pedido. */
export interface ItemPedidoTienda {
  referencia: string;
  producto: string;
  um: string;
  precio: number;
  cantidad: number;
  observacion?: string;
}

export interface TiendaResumen {
  slug: string;
  nombre: string;
  ciudad: string | null;
}

export interface CategoriaTienda {
  categoria: string;
  productos: Array<{ referencia: string; producto: string; um: string; precio: number }>;
}

export interface TiendaCatalogoPublico {
  slug: string;
  punto_id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  ciudad: string | null;
  categorias: CategoriaTienda[];
}

export interface SaldoTrabajador {
  cedula: string;
  nombre: string | null;
  encontrado: boolean;
  activo: boolean;
  cupo_asignado: number;
  cupo_disponible: number;
}

export interface PedidoTienda {
  id: string;
  trabajador_cedula: string;
  trabajador_nombre: string;
  punto_id: string;
  punto_nombre: string;
  total: number;
  entrega: string;
  direccion: string | null;
  telefono: string | null;
  metodo_pago: string | null;
  observacion: string | null;
  items: ItemPedidoTienda[];
  estado: string;
  nomina_fecha: string | null;
  creado_en: string;
  actualizado_en: string;
}

interface PuntoRow {
  id: string;
  nombre: string;
  codigo: string | null;
  direccion: string | null;
  telefono: string | null;
  lista_precio: string | null;
  ciudad: string | null;
}

/** Normaliza un texto a slug URL (sin acentos, minúsculas, guiones). */
function slugify(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const ESTADOS_VALIDOS = ['pendiente', 'facturado', 'entregado', 'anulado'];

@Injectable()
export class TiendaEmpleadosService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    // Catálogo curado de la tienda de empleados por punto de venta.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tienda_empleados_catalogo (
        punto_id text PRIMARY KEY,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Los pedidos de la tienda se guardan en la MISMA tabla de crédito para que
    // el cupo/nómina los descuente automáticamente. Se agregan columnas propias
    // del flujo de tienda online y se marca el origen.
    for (const sql of [
      `ALTER TABLE credito_empleados_pedidos ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual'`,
      `ALTER TABLE credito_empleados_pedidos ADD COLUMN IF NOT EXISTS entrega text NULL`,
      `ALTER TABLE credito_empleados_pedidos ADD COLUMN IF NOT EXISTS direccion text NULL`,
      `ALTER TABLE credito_empleados_pedidos ADD COLUMN IF NOT EXISTS telefono text NULL`,
      `ALTER TABLE credito_empleados_pedidos ADD COLUMN IF NOT EXISTS metodo_pago text NULL`,
      `ALTER TABLE credito_empleados_pedidos ADD COLUMN IF NOT EXISTS tienda_items jsonb NOT NULL DEFAULT '[]'::jsonb`,
    ]) {
      await this.pool.query(sql);
    }
    // Se agrega el estado 'entregado' al CHECK (para el flujo de reclamo).
    await this.pool.query(`
      DO $$ BEGIN
        ALTER TABLE credito_empleados_pedidos
          DROP CONSTRAINT IF EXISTS credito_empleados_pedidos_estado_check;
        ALTER TABLE credito_empleados_pedidos
          ADD CONSTRAINT credito_empleados_pedidos_estado_check
          CHECK (estado IN ('pendiente','facturado','entregado','anulado'));
      EXCEPTION WHEN others THEN NULL; END $$;
    `);
  }

  // ---------------------------------------------------------------------------
  // Catálogo (admin)
  // ---------------------------------------------------------------------------

  async obtenerCatalogo(puntoId: string): Promise<ItemCatalogoTienda[]> {
    const res = await this.pool.query<{ items: ItemCatalogoTienda[] }>(
      `SELECT items FROM tienda_empleados_catalogo WHERE punto_id = $1`,
      [String(puntoId)],
    );
    return res.rows[0]?.items ?? [];
  }

  async guardarCatalogo(
    puntoId: string,
    items: unknown,
  ): Promise<{ ok: true; total: number }> {
    const limpios = Array.isArray(items)
      ? items
          .map((it) => {
            const o = (it ?? {}) as Record<string, unknown>;
            const referencia = String(o.referencia ?? '').trim();
            if (!referencia) return null;
            return {
              referencia,
              producto: String(o.producto ?? '').trim(),
              categoria: String(o.categoria ?? '').trim(),
              um: String(o.um ?? '').trim(),
              precio: Number(o.precio) || 0,
            } as ItemCatalogoTienda;
          })
          .filter((x): x is ItemCatalogoTienda => x !== null)
      : [];

    await this.pool.query(
      `INSERT INTO tienda_empleados_catalogo (punto_id, items, actualizado_en)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (punto_id) DO UPDATE
         SET items = EXCLUDED.items, actualizado_en = now()`,
      [String(puntoId), JSON.stringify(limpios)],
    );
    return { ok: true, total: limpios.length };
  }

  // ---------------------------------------------------------------------------
  // Tiendas públicas
  // ---------------------------------------------------------------------------

  private async puntosActivos(): Promise<PuntoRow[]> {
    const res = await this.pool.query<PuntoRow>(
      `SELECT id, nombre, codigo, direccion, telefono, lista_precio, ciudad
         FROM puntos_venta
        WHERE activo = true`,
    );
    return res.rows;
  }

  private slugDe(p: PuntoRow): string {
    return slugify(p.nombre) || String(p.id);
  }

  /** Tiendas de empleados publicadas: puntos activos con catálogo cargado. */
  async tiendas(): Promise<TiendaResumen[]> {
    const puntos = await this.puntosActivos();
    const cats = await this.pool.query<{ punto_id: string; n: number }>(
      `SELECT punto_id, jsonb_array_length(items) AS n
         FROM tienda_empleados_catalogo`,
    );
    const conCatalogo = new Set(
      cats.rows.filter((r) => Number(r.n) > 0).map((r) => String(r.punto_id)),
    );
    return puntos
      .filter((p) => conCatalogo.has(String(p.id)))
      .map((p) => ({ slug: this.slugDe(p), nombre: p.nombre, ciudad: p.ciudad }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  private async resolverPunto(slug: string): Promise<PuntoRow> {
    const objetivo = slugify(slug);
    const puntos = await this.puntosActivos();
    const punto = puntos.find(
      (p) =>
        this.slugDe(p) === objetivo ||
        slugify(p.nombre) === objetivo ||
        (p.codigo ? slugify(p.codigo) === objetivo : false) ||
        String(p.id) === slug,
    );
    if (!punto) throw new NotFoundException('Tienda no encontrada');
    return punto;
  }

  /** Catálogo público de una tienda por su slug. */
  async tienda(slug: string): Promise<TiendaCatalogoPublico> {
    const punto = await this.resolverPunto(slug);
    const items = await this.obtenerCatalogo(punto.id);
    if (items.length === 0) {
      throw new NotFoundException('Esta tienda aún no tiene productos publicados');
    }
    const map = new Map<string, CategoriaTienda['productos']>();
    for (const it of items) {
      const cat = (it.categoria ?? '').trim() || 'Otros';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push({
        referencia: it.referencia,
        producto: (it.producto ?? '').trim(),
        um: it.um ?? '',
        precio: Number(it.precio) || 0,
      });
    }
    return {
      slug: this.slugDe(punto),
      punto_id: String(punto.id),
      nombre: punto.nombre,
      direccion: punto.direccion,
      telefono: punto.telefono,
      ciudad: punto.ciudad,
      categorias: Array.from(map, ([categoria, productos]) => ({ categoria, productos })),
    };
  }

  // ---------------------------------------------------------------------------
  // Saldo del trabajador (público, solo por cédula)
  // ---------------------------------------------------------------------------

  async saldoPorCedula(cedula: string): Promise<SaldoTrabajador> {
    const c = String(cedula ?? '').trim();
    if (!c) throw new BadRequestException('Ingresa tu número de cédula');
    const res = await this.pool.query<{
      cedula: string;
      nombre: string;
      cupo_asignado: string;
      activo: boolean;
      deuda_vigente: string;
    }>(
      `SELECT t.cedula, t.nombre, t.cupo_asignado, t.activo,
              COALESCE(SUM(CASE WHEN p.estado <> 'anulado' THEN p.total ELSE 0 END), 0) AS deuda_vigente
         FROM credito_empleados_trabajadores t
         LEFT JOIN credito_empleados_pedidos p ON p.trabajador_cedula = t.cedula
        WHERE t.cedula = $1
        GROUP BY t.cedula, t.nombre, t.cupo_asignado, t.activo
        LIMIT 1`,
      [c],
    );
    const row = res.rows[0];
    if (!row) {
      return {
        cedula: c,
        nombre: null,
        encontrado: false,
        activo: false,
        cupo_asignado: 0,
        cupo_disponible: 0,
      };
    }
    const cupo = Number(row.cupo_asignado) || 0;
    const deuda = Number(row.deuda_vigente) || 0;
    return {
      cedula: row.cedula,
      nombre: row.nombre,
      encontrado: true,
      activo: row.activo === true,
      cupo_asignado: cupo,
      cupo_disponible: Math.max(0, cupo - deuda),
    };
  }

  // ---------------------------------------------------------------------------
  // Crear pedido (público)
  // ---------------------------------------------------------------------------

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
    if (diffDias <= 3 && futuras[1]) return fmt(futuras[1]);
    return fmt(proxima);
  }

  async crearPedido(input: {
    cedula: string;
    slug: string;
    items: ItemPedidoTienda[];
    entrega: string;
    direccion?: string;
    telefono?: string;
    observacion?: string;
  }): Promise<PedidoTienda> {
    const cedula = String(input.cedula ?? '').trim();
    const entrega = String(input.entrega ?? '').trim().toLowerCase();
    if (!cedula) throw new BadRequestException('Falta la cédula del trabajador');
    if (entrega !== 'recoge' && entrega !== 'domicilio') {
      throw new BadRequestException('Selecciona cómo recibes el pedido');
    }

    const punto = await this.resolverPunto(String(input.slug ?? ''));
    const catalogo = await this.obtenerCatalogo(punto.id);
    const precios = new Map(catalogo.map((c) => [c.referencia, c]));

    const items: ItemPedidoTienda[] = Array.isArray(input.items) ? input.items : [];
    if (items.length === 0) throw new BadRequestException('El carrito está vacío');

    // Se recalcula el total con los precios del catálogo del servidor (no se
    // confía en los precios enviados por el cliente).
    let total = 0;
    const limpios: ItemPedidoTienda[] = [];
    for (const it of items) {
      const ref = String(it.referencia ?? '').trim();
      const cant = Number(it.cantidad) || 0;
      const cat = precios.get(ref);
      if (!ref || !cat || cant <= 0) continue;
      const precio = Number(cat.precio) || 0;
      total += precio * cant;
      limpios.push({
        referencia: ref,
        producto: cat.producto,
        um: cat.um,
        precio,
        cantidad: cant,
        observacion: String(it.observacion ?? '').trim() || undefined,
      });
    }
    if (limpios.length === 0) throw new BadRequestException('Ningún producto del carrito es válido');
    total = Math.round(total);

    const direccion = String(input.direccion ?? '').trim() || null;
    const telefono = String(input.telefono ?? '').trim() || null;
    if (entrega === 'domicilio' && (!direccion || !telefono)) {
      throw new BadRequestException('Para domicilio ingresa la dirección y el teléfono');
    }
    const observacion = String(input.observacion ?? '').trim() || null;

    const saldo = await this.saldoPorCedula(cedula);
    if (!saldo.encontrado) {
      throw new BadRequestException('Tu cédula no está registrada en crédito de empleados');
    }
    if (!saldo.activo) {
      throw new BadRequestException('Tu crédito no está activo. Comunícate con nómina.');
    }
    if (total > saldo.cupo_disponible) {
      throw new BadRequestException(
        `Tu saldo disponible es $${saldo.cupo_disponible.toLocaleString('es-CO')} y el pedido suma $${total.toLocaleString('es-CO')}.`,
      );
    }

    const id = randomUUID();
    const nominaFecha = this.calcularFechaNomina(new Date());
    await this.pool.query(
      `INSERT INTO credito_empleados_pedidos
         (id, trabajador_cedula, trabajador_nombre, punto_id, punto_nombre, total,
          observacion, estado, cartera_estado, origen, entrega, direccion, telefono,
          metodo_pago, tienda_items, nomina_fecha, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente', 'pendiente', 'tienda',
               $8, $9, $10, 'Crédito (descuento nómina)', $11::jsonb, $12::date, now())`,
      [
        id,
        saldo.cedula,
        saldo.nombre ?? '',
        String(punto.id),
        punto.nombre,
        total,
        observacion,
        entrega,
        direccion,
        telefono,
        JSON.stringify(limpios),
        nominaFecha,
      ],
    );
    return this.obtenerPedido(id);
  }

  // ---------------------------------------------------------------------------
  // Pedidos (admin)
  // ---------------------------------------------------------------------------

  private filaAPedido(r: Record<string, unknown>): PedidoTienda {
    return {
      id: String(r.id ?? ''),
      trabajador_cedula: String(r.trabajador_cedula ?? ''),
      trabajador_nombre: String(r.trabajador_nombre ?? ''),
      punto_id: String(r.punto_id ?? ''),
      punto_nombre: String(r.punto_nombre ?? ''),
      total: Number(r.total) || 0,
      entrega: String(r.entrega ?? ''),
      direccion: r.direccion ? String(r.direccion) : null,
      telefono: r.telefono ? String(r.telefono) : null,
      metodo_pago: r.metodo_pago ? String(r.metodo_pago) : null,
      observacion: r.observacion ? String(r.observacion) : null,
      items: Array.isArray(r.tienda_items) ? (r.tienda_items as ItemPedidoTienda[]) : [],
      estado: String(r.estado ?? 'pendiente'),
      nomina_fecha: r.nomina_fecha ? String(r.nomina_fecha) : null,
      creado_en: String(r.creado_en ?? ''),
      actualizado_en: String(r.actualizado_en ?? ''),
    };
  }

  async obtenerPedido(id: string): Promise<PedidoTienda> {
    const res = await this.pool.query(
      `SELECT id, trabajador_cedula, trabajador_nombre, punto_id, punto_nombre, total,
              observacion, estado, entrega, direccion, telefono, metodo_pago,
              COALESCE(tienda_items, '[]'::jsonb) AS tienda_items,
              to_char(nomina_fecha, 'YYYY-MM-DD') AS nomina_fecha, creado_en, actualizado_en
         FROM credito_empleados_pedidos
        WHERE id = $1 LIMIT 1`,
      [id],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundException('Pedido de tienda no encontrado');
    return this.filaAPedido(row as Record<string, unknown>);
  }

  async listarPedidos(filtros: {
    estado?: string;
    punto_id?: string;
    desde?: string;
    hasta?: string;
  }): Promise<PedidoTienda[]> {
    const cond: string[] = [`origen = 'tienda'`];
    const val: unknown[] = [];
    let i = 1;
    if (filtros.estado?.trim()) {
      cond.push(`estado = $${i++}`);
      val.push(filtros.estado.trim().toLowerCase());
    }
    if (filtros.punto_id?.trim()) {
      cond.push(`punto_id = $${i++}`);
      val.push(filtros.punto_id.trim());
    }
    if (filtros.desde?.trim()) {
      cond.push(`creado_en >= $${i++}::date`);
      val.push(filtros.desde.trim());
    }
    if (filtros.hasta?.trim()) {
      cond.push(`creado_en < ($${i++}::date + interval '1 day')`);
      val.push(filtros.hasta.trim());
    }
    const res = await this.pool.query(
      `SELECT id, trabajador_cedula, trabajador_nombre, punto_id, punto_nombre, total,
              observacion, estado, entrega, direccion, telefono, metodo_pago,
              COALESCE(tienda_items, '[]'::jsonb) AS tienda_items,
              to_char(nomina_fecha, 'YYYY-MM-DD') AS nomina_fecha, creado_en, actualizado_en
         FROM credito_empleados_pedidos
        WHERE ${cond.join(' AND ')}
        ORDER BY creado_en DESC
        LIMIT 300`,
      val,
    );
    return res.rows.map((r) => this.filaAPedido(r as Record<string, unknown>));
  }

  async actualizarEstado(id: string, estado: string): Promise<PedidoTienda> {
    const st = String(estado ?? '').trim().toLowerCase();
    if (!ESTADOS_VALIDOS.includes(st)) throw new BadRequestException('Estado inválido');
    const res = await this.pool.query(
      `UPDATE credito_empleados_pedidos
          SET estado = $2,
              cartera_estado = CASE WHEN $2 = 'anulado' THEN 'anulado'
                                    WHEN $2 = 'pendiente' THEN 'pendiente'
                                    ELSE 'facturado' END,
              actualizado_en = now()
        WHERE id = $1 AND origen = 'tienda'`,
      [id, st],
    );
    if (!res.rowCount) throw new NotFoundException('Pedido de tienda no encontrado');
    return this.obtenerPedido(id);
  }
}
