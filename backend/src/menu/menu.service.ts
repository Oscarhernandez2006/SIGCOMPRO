import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { tieneAccesoTotal } from '../users/permisos.catalog';

export interface MenuProducto {
  referencia: string;
  producto: string;
  um: string;
  precio: number;
}

/** Ítem curado guardado en la configuración del menú de un punto. */
export interface ItemMenu {
  referencia: string;
  producto: string;
  categoria: string;
  um: string;
  precio: number;
}

export interface MenuCategoria {
  categoria: string;
  productos: MenuProducto[];
}

export interface MenuTienda {
  slug: string;
  nombre: string;
  listaNombre?: string;
  direccion: string | null;
  telefono: string | null;
  barrio: string | null;
  ciudad: string | null;
  categorias: MenuCategoria[];
}

export interface TiendaResumen {
  slug: string;
  nombre: string;
  ciudad: string | null;
}

interface PuntoRow {
  id: string;
  nombre: string;
  codigo: string | null;
  direccion: string | null;
  telefono: string | null;
  lista_precio: string | null;
  barrio: string | null;
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

// Orden de categorías del listado de marca (res, cerdo, pollo, …). Las que no
// coincidan van al final, ordenadas alfabéticamente.
const ORDEN_CATEGORIAS = [
  'res',
  'cerdo',
  'pollo',
  'viscera',
  'pescado',
  'embutido',
  'extra',
  'asadero',
];

function rangoCategoria(categoria: string): number {
  const s = slugify(categoria);
  for (let i = 0; i < ORDEN_CATEGORIAS.length; i++) {
    if (s.includes(ORDEN_CATEGORIAS[i])) return i;
  }
  return ORDEN_CATEGORIAS.length;
}

@Injectable()
export class MenuService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    // Configuración del menú público por punto: los productos y precios que el
    // usuario curó en "Lista de Precios" y que se muestran al cliente.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS menu_config (
        punto_id text PRIMARY KEY,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS menu_listas (
        id text PRIMARY KEY,
        punto_id text NOT NULL,
        nombre text NOT NULL,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS menu_listas_punto_idx ON menu_listas (punto_id)`);
  }

  async listas(puntoId: string) {
    const { rows } = await this.pool.query<{ id: string; nombre: string }>(
      `SELECT id, nombre FROM menu_listas WHERE punto_id = $1 ORDER BY actualizado_en, id`,
      [String(puntoId)],
    );
    return [{ id: 'general', nombre: 'General' }, ...rows];
  }

  async verificarPunto(user: JwtPayload, puntoId: string) {
    if (tieneAccesoTotal(user.rol)) return;
    const { rowCount } = await this.pool.query(
      `SELECT 1 FROM usuario_punto_venta WHERE usuario_id = $1 AND punto_venta_id::text = $2 LIMIT 1`,
      [user.sub, puntoId],
    );
    if (!rowCount) throw new ForbiddenException('No tiene asignado este punto de venta.');
  }

  async crearLista(puntoId: string, nombre: unknown) {
    const titulo = typeof nombre === 'string' ? nombre.trim() : '';
    if (!titulo || titulo.length > 80) throw new BadRequestException('Escriba un nombre de hasta 80 caracteres');
    const id = randomUUID();
    const { rows } = await this.pool.query<{ id: string; nombre: string }>(
      `INSERT INTO menu_listas (id, punto_id, nombre, items)
       SELECT $1, id::text, $3, COALESCE((SELECT items FROM menu_config WHERE punto_id = $2), '[]'::jsonb)
       FROM puntos_venta WHERE id::text = $2 AND activo = true
       RETURNING id, nombre`,
      [id, String(puntoId), titulo],
    );
    if (!rows[0]) throw new NotFoundException('Punto de venta no encontrado');
    return rows[0];
  }

  /** Ítems guardados (curados) del menú de un punto. */
  async obtenerConfig(puntoId: string, listaId = 'general'): Promise<ItemMenu[]> {
    if (listaId !== 'general') {
      const { rows } = await this.pool.query<{ items: ItemMenu[] }>(
        `SELECT items FROM menu_listas WHERE punto_id = $1 AND id = $2`,
        [String(puntoId), listaId],
      );
      if (!rows[0]) throw new NotFoundException('Lista no encontrada');
      return rows[0].items;
    }
    const res = await this.pool.query<{ items: ItemMenu[] }>(
      `SELECT items FROM menu_config WHERE punto_id = $1`,
      [String(puntoId)],
    );
    return res.rows[0]?.items ?? [];
  }

  /** Guarda (reemplaza) los ítems curados del menú de un punto. */
  async guardarConfig(
    puntoId: string,
    items: unknown,
    listaId = 'general',
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
            } as ItemMenu;
          })
          .filter((x): x is ItemMenu => x !== null)
      : [];

    if (listaId !== 'general') {
      const result = await this.pool.query(
        `UPDATE menu_listas SET items = $3::jsonb, actualizado_en = now() WHERE punto_id = $1 AND id = $2`,
        [String(puntoId), listaId, JSON.stringify(limpios)],
      );
      if (!result.rowCount) throw new NotFoundException('Lista no encontrada');
      return { ok: true, total: limpios.length };
    }
    await this.pool.query(
      `INSERT INTO menu_config (punto_id, items, actualizado_en)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (punto_id) DO UPDATE
         SET items = EXCLUDED.items, actualizado_en = now()`,
      [String(puntoId), JSON.stringify(limpios)],
    );
    return { ok: true, total: limpios.length };
  }

  private async puntosActivos(): Promise<PuntoRow[]> {
    const res = await this.pool.query<PuntoRow>(
      `SELECT id, nombre, codigo, direccion, telefono, lista_precio, barrio, ciudad
         FROM puntos_venta
        WHERE activo = true`,
    );
    return res.rows;
  }

  /** Slug público del punto: basado en nombre comercial. */
  private slugDe(p: PuntoRow): string {
    return slugify(p.nombre) || String(p.id);
  }

  /** Tiendas públicas disponibles (activas y con lista de precios). */
  async tiendas(): Promise<TiendaResumen[]> {
    const puntos = await this.puntosActivos();
    return puntos
      .filter((p) => p.lista_precio?.trim())
      .map((p) => ({ slug: this.slugDe(p), nombre: p.nombre, ciudad: p.ciudad }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  /** Menú público de una tienda por su slug (código o nombre). */
  async tienda(slug: string, listaId = 'general'): Promise<MenuTienda> {
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

    // Preferimos la configuración curada del punto; si no hay, mostramos toda
    // la lista de precios como respaldo.
    const config = await this.obtenerConfig(punto.id, listaId);
    const lista = listaId === 'general' ? undefined : (await this.listas(punto.id)).find((item) => item.id === listaId);
    const categorias =
      config.length > 0 || listaId !== 'general'
        ? this.agrupar(config)
        : punto.lista_precio?.trim()
          ? await this.productos(punto.lista_precio)
          : [];

    return {
      slug: this.slugDe(punto),
      nombre: punto.nombre,
      listaNombre: lista?.nombre,
      direccion: punto.direccion,
      telefono: punto.telefono,
      barrio: punto.barrio,
      ciudad: punto.ciudad,
      categorias,
    };
  }

  /** Agrupa ítems curados por categoría, conservando su orden guardado. */
  private agrupar(items: ItemMenu[]): MenuCategoria[] {
    const map = new Map<string, MenuProducto[]>();
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
    return Array.from(map, ([categoria, productos]) => ({
      categoria,
      productos,
    }));
  }

  /** Productos de una lista agrupados por categoría (orden de marca). */
  private async productos(lista: string): Promise<MenuCategoria[]> {
    const res = await this.pool.query<{
      referencia: string;
      producto: string | null;
      categoria: string | null;
      um: string | null;
      precio: string | number;
    }>(
      `SELECT referencia, producto, categoria, um, precio
         FROM productos_precios
        WHERE lista_precio = $1
        ORDER BY producto NULLS LAST`,
      [lista],
    );

    const map = new Map<string, MenuProducto[]>();
    for (const r of res.rows) {
      const cat = (r.categoria ?? '').trim() || 'Otros';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push({
        referencia: r.referencia,
        producto: (r.producto ?? '').trim(),
        um: r.um ?? '',
        precio: Number(r.precio) || 0,
      });
    }

    return Array.from(map, ([categoria, productos]) => ({
      categoria,
      productos,
    })).sort(
      (a, b) =>
        rangoCategoria(a.categoria) - rangoCategoria(b.categoria) ||
        a.categoria.localeCompare(b.categoria),
    );
  }
}
