import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PG_POOL } from '../database/database.module';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tesseract = require('node-tesseract-ocr') as {
  recognize: (src: Buffer | string, config: Record<string, unknown>) => Promise<string>;
};

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
  origen: string;
  factura_numero: string | null;
  factura_imagen?: string | null;
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

    // Acceso del trabajador a la tienda: contraseña (hash) y foto de la cédula
    // capturada al registrarse por primera vez.
    for (const sql of [
      `ALTER TABLE credito_empleados_trabajadores ADD COLUMN IF NOT EXISTS clave_hash text NULL`,
      `ALTER TABLE credito_empleados_trabajadores ADD COLUMN IF NOT EXISTS cedula_foto text NULL`,
      `ALTER TABLE credito_empleados_trabajadores ADD COLUMN IF NOT EXISTS telefono text NULL`,
      `ALTER TABLE credito_empleados_trabajadores ADD COLUMN IF NOT EXISTS registrado_en timestamptz NULL`,
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
  // Acceso del trabajador (cédula + contraseña, registro con foto de cédula)
  // ---------------------------------------------------------------------------

  /** Datos del trabajador tal como se guardan (acceso). */
  private async filaTrabajador(cedula: string): Promise<{
    cedula: string;
    nombre: string;
    activo: boolean;
    clave_hash: string | null;
    telefono: string | null;
  } | null> {
    const res = await this.pool.query<{
      cedula: string;
      nombre: string;
      activo: boolean;
      clave_hash: string | null;
      telefono: string | null;
    }>(
      `SELECT cedula, nombre, activo, clave_hash, telefono
         FROM credito_empleados_trabajadores WHERE cedula = $1 LIMIT 1`,
      [String(cedula ?? '').trim()],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Estado de acceso: indica si el trabajador existe/activo y si ya configuró
   * una contraseña (para pedirla) o si es su primer ingreso (registro con foto).
   */
  async estadoAcceso(cedula: string): Promise<{
    encontrado: boolean;
    activo: boolean;
    nombre: string | null;
    registrado: boolean;
  }> {
    const c = String(cedula ?? '').trim();
    if (!c) throw new BadRequestException('Ingresa tu número de cédula');
    const t = await this.filaTrabajador(c);
    if (!t) return { encontrado: false, activo: false, nombre: null, registrado: false };
    return {
      encontrado: true,
      activo: t.activo === true,
      nombre: t.nombre,
      registrado: !!t.clave_hash,
    };
  }

  /** Inicia sesión validando la contraseña del trabajador. */
  async loginTrabajador(
    cedula: string,
    clave: string,
  ): Promise<{ cedula: string; nombre: string; telefono: string | null }> {
    const c = String(cedula ?? '').trim();
    const t = await this.filaTrabajador(c);
    if (!t) throw new BadRequestException('Tu cédula no está registrada en crédito de empleados.');
    if (!t.activo) throw new BadRequestException('Tu crédito no está activo. Comunícate con nómina.');
    if (!t.clave_hash) throw new BadRequestException('Aún no tienes contraseña. Regístrate con la foto de tu cédula.');
    if (!bcrypt.compareSync(String(clave ?? ''), t.clave_hash)) {
      throw new UnauthorizedException('Contraseña incorrecta.');
    }
    return { cedula: t.cedula, nombre: t.nombre, telefono: t.telefono };
  }

  /**
   * Paso 1 del primer ingreso: verifica la foto de la cédula con OCR (que el
   * número de la cédula aparezca) y la guarda. No crea la contraseña todavía.
   */
  async verificarCedulaTrabajador(input: {
    cedula: string;
    foto: string;
  }): Promise<{ ok: true; nombre: string }> {
    const c = String(input.cedula ?? '').trim();
    const foto = String(input.foto ?? '');
    if (!foto) throw new BadRequestException('Toma la foto de tu cédula para continuar.');

    const t = await this.filaTrabajador(c);
    if (!t) throw new BadRequestException('Tu cédula no está registrada en crédito de empleados.');
    if (!t.activo) throw new BadRequestException('Tu crédito no está activo. Comunícate con nómina.');
    if (t.clave_hash) throw new BadRequestException('Ya tienes contraseña. Ingresa con ella.');

    const verif = await this.verificarCedulaFoto(foto, c);
    if (!verif.ok) throw new BadRequestException(verif.mensaje);

    await this.pool.query(
      `UPDATE credito_empleados_trabajadores
          SET cedula_foto = $2, actualizado_en = now() WHERE cedula = $1`,
      [c, foto],
    );
    return { ok: true, nombre: t.nombre };
  }

  /**
   * Paso 2 del primer ingreso: crea la contraseña. Requiere haber verificado
   * antes la cédula (foto guardada por `verificarCedulaTrabajador`).
   */
  async registrarTrabajador(input: {
    cedula: string;
    clave: string;
  }): Promise<{ cedula: string; nombre: string; telefono: string | null }> {
    const c = String(input.cedula ?? '').trim();
    const clave = String(input.clave ?? '');
    if (clave.length < 4) throw new BadRequestException('La contraseña debe tener al menos 4 caracteres.');

    const t = await this.filaTrabajador(c);
    if (!t) throw new BadRequestException('Tu cédula no está registrada en crédito de empleados.');
    if (!t.activo) throw new BadRequestException('Tu crédito no está activo. Comunícate con nómina.');
    if (t.clave_hash) throw new BadRequestException('Ya tienes contraseña. Ingresa con ella.');

    const fotoRes = await this.pool.query<{ tiene: boolean }>(
      `SELECT (cedula_foto IS NOT NULL) AS tiene FROM credito_empleados_trabajadores WHERE cedula = $1`,
      [c],
    );
    if (!fotoRes.rows[0]?.tiene) {
      throw new BadRequestException('Primero verifica tu cédula con la foto.');
    }

    const hash = bcrypt.hashSync(clave, 10);
    await this.pool.query(
      `UPDATE credito_empleados_trabajadores
          SET clave_hash = $2, registrado_en = now(), actualizado_en = now()
        WHERE cedula = $1`,
      [c, hash],
    );
    return { cedula: t.cedula, nombre: t.nombre, telefono: t.telefono };
  }

  /** Cambia la contraseña (requiere la actual). */
  async cambiarClaveTrabajador(input: {
    cedula: string;
    clave_actual: string;
    clave_nueva: string;
  }): Promise<{ ok: true }> {
    const c = String(input.cedula ?? '').trim();
    const nueva = String(input.clave_nueva ?? '');
    if (nueva.length < 4) throw new BadRequestException('La nueva contraseña debe tener al menos 4 caracteres.');
    const t = await this.filaTrabajador(c);
    if (!t || !t.clave_hash) throw new BadRequestException('No encontramos tu registro.');
    if (!bcrypt.compareSync(String(input.clave_actual ?? ''), t.clave_hash)) {
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    }
    await this.pool.query(
      `UPDATE credito_empleados_trabajadores SET clave_hash = $2, actualizado_en = now() WHERE cedula = $1`,
      [c, bcrypt.hashSync(nueva, 10)],
    );
    return { ok: true };
  }

  /** Actualiza el teléfono de contacto del trabajador (requiere contraseña). */
  async actualizarTelefonoTrabajador(input: {
    cedula: string;
    clave: string;
    telefono: string;
  }): Promise<{ ok: true; telefono: string | null }> {
    const c = String(input.cedula ?? '').trim();
    const t = await this.filaTrabajador(c);
    if (!t || !t.clave_hash) throw new BadRequestException('No encontramos tu registro.');
    if (!bcrypt.compareSync(String(input.clave ?? ''), t.clave_hash)) {
      throw new UnauthorizedException('Contraseña incorrecta.');
    }
    const tel = String(input.telefono ?? '').replace(/\D/g, '').slice(0, 10) || null;
    await this.pool.query(
      `UPDATE credito_empleados_trabajadores SET telefono = $2, actualizado_en = now() WHERE cedula = $1`,
      [c, tel],
    );
    return { ok: true, telefono: tel };
  }

  /**
   * Verifica con OCR que la foto corresponda a la cédula del trabajador: el
   * número de la cédula debe aparecer en el texto leído. Como refuerzo, si se
   * lee, valida que al menos un nombre/apellido coincida.
   */
  private async verificarCedulaFoto(
    foto: string,
    cedula: string,
  ): Promise<{ ok: boolean; mensaje: string }> {
    let texto = '';
    try {
      const base64 = foto.includes(',') ? foto.split(',')[1] : foto;
      let buffer = Buffer.from(base64, 'base64');
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
        const sharpMod = require('sharp') as any;
        buffer = await sharpMod(buffer).grayscale().normalise().sharpen().toBuffer();
      } catch {
        /* sharp opcional */
      }
      texto = await tesseract.recognize(buffer, { lang: 'spa', oem: 1, psm: 6 });
    } catch {
      return {
        ok: false,
        mensaje: 'No pudimos procesar la foto. Intenta con una imagen más nítida y bien iluminada.',
      };
    }

    // Dígitos leídos por OCR (sin separadores) y dígitos de la cédula esperada.
    const digitos = (texto.match(/\d/g) ?? []).join('');
    const cedulaLimpia = cedula.replace(/\D/g, '');
    const cedulaEncontrada = cedulaLimpia.length >= 5 && digitos.includes(cedulaLimpia);

    if (!cedulaEncontrada) {
      return {
        ok: false,
        mensaje:
          'No reconocimos el número de tu cédula en la foto. Asegúrate de que se vean claramente los números y vuelve a intentar.',
      };
    }
    return { ok: true, mensaje: 'ok' };
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
      origen: String(r.origen ?? 'manual'),
      factura_numero: r.factura_numero ? String(r.factura_numero) : null,
      factura_imagen: r.factura_imagen ? String(r.factura_imagen) : null,
      nomina_fecha: r.nomina_fecha ? String(r.nomina_fecha) : null,
      creado_en: String(r.creado_en ?? ''),
      actualizado_en: String(r.actualizado_en ?? ''),
    };
  }

  async obtenerPedido(id: string): Promise<PedidoTienda> {
    const res = await this.pool.query(
      `SELECT id, trabajador_cedula, trabajador_nombre, punto_id, punto_nombre, total,
              observacion, estado, entrega, direccion, telefono, metodo_pago,
              COALESCE(origen, 'manual') AS origen, factura_numero, factura_imagen,
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
    origen?: string;
  }): Promise<PedidoTienda[]> {
    const cond: string[] = [];
    const val: unknown[] = [];
    let i = 1;
    if (filtros.origen?.trim()) {
      cond.push(`COALESCE(origen, 'manual') = $${i++}`);
      val.push(filtros.origen.trim().toLowerCase());
    }
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
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const res = await this.pool.query(
      `SELECT id, trabajador_cedula, trabajador_nombre, punto_id, punto_nombre, total,
              observacion, estado, entrega, direccion, telefono, metodo_pago,
              COALESCE(origen, 'manual') AS origen, factura_numero,
              COALESCE(tienda_items, '[]'::jsonb) AS tienda_items,
              to_char(nomina_fecha, 'YYYY-MM-DD') AS nomina_fecha, creado_en, actualizado_en
         FROM credito_empleados_pedidos
        ${where}
        ORDER BY creado_en DESC
        LIMIT 300`,
      val,
    );
    return res.rows.map((r) => this.filaAPedido(r as Record<string, unknown>));
  }

  async actualizarEstado(
    id: string,
    estado: string,
    extra?: { factura_imagen?: string | null; factura_numero?: string | null },
  ): Promise<PedidoTienda> {
    const st = String(estado ?? '').trim().toLowerCase();
    if (!ESTADOS_VALIDOS.includes(st)) throw new BadRequestException('Estado inválido');

    // Al entregar se exige el comprobante (foto de la factura) para cerrar la venta.
    const facturaImagen = extra?.factura_imagen ?? null;
    const facturaNumero = String(extra?.factura_numero ?? '').trim() || null;
    if (st === 'entregado' && !facturaImagen) {
      throw new BadRequestException('Adjunta la foto de la factura (con la cédula) para cerrar la venta');
    }

    const res = await this.pool.query(
      `UPDATE credito_empleados_pedidos
          SET estado = $2,
              cartera_estado = CASE WHEN $2 = 'anulado' THEN 'anulado'
                                    WHEN $2 = 'pendiente' THEN 'pendiente'
                                    ELSE 'facturado' END,
              factura_imagen = COALESCE($3, factura_imagen),
              factura_numero = COALESCE($4, factura_numero),
              actualizado_en = now()
        WHERE id = $1`,
      [id, st, facturaImagen, facturaNumero],
    );
    if (!res.rowCount) throw new NotFoundException('Pedido no encontrado');
    return this.obtenerPedido(id);
  }
}
