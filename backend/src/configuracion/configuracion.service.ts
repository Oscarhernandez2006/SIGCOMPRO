import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

/** Personal de despacho configurable (porcionadores y domiciliarios). */
export interface PersonalDespacho {
  porcionadores: string[];
  domiciliarios: string[];
}

/** Prefijo de la clave con la que se guarda el personal por punto de venta. */
const PREFIJO_DESPACHO = 'despacho_personal:';

@Injectable()
export class ConfiguracionService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS configuracion (
        clave text PRIMARY KEY,
        valor jsonb NOT NULL DEFAULT '{}'::jsonb,
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  /** Personal de despacho de un punto de venta (listas vacías si no hay nada). */
  async personalDespachoDePunto(puntoId: string): Promise<PersonalDespacho> {
    const res = await this.pool.query<{ valor: Partial<PersonalDespacho> }>(
      `SELECT valor FROM configuracion WHERE clave = $1 LIMIT 1`,
      [this.clave(puntoId)],
    );
    const valor = res.rows[0]?.valor ?? {};
    return {
      porcionadores: this.limpiarLista(valor.porcionadores),
      domiciliarios: this.limpiarLista(valor.domiciliarios),
    };
  }

  /**
   * Personal de despacho de todos los puntos, indexado por id de punto.
   * Lo usa el módulo de despacho para mostrar el selector de cada pedido
   * según su punto de venta.
   */
  async personalDespachoTodos(): Promise<Record<string, PersonalDespacho>> {
    const res = await this.pool.query<{
      clave: string;
      valor: Partial<PersonalDespacho>;
    }>(`SELECT clave, valor FROM configuracion WHERE clave LIKE $1`, [
      `${PREFIJO_DESPACHO}%`,
    ]);
    const mapa: Record<string, PersonalDespacho> = {};
    for (const row of res.rows) {
      const puntoId = row.clave.slice(PREFIJO_DESPACHO.length);
      if (!puntoId) continue;
      mapa[puntoId] = {
        porcionadores: this.limpiarLista(row.valor?.porcionadores),
        domiciliarios: this.limpiarLista(row.valor?.domiciliarios),
      };
    }
    return mapa;
  }

  /** Guarda (reemplaza) el personal de despacho de un punto de venta. */
  async guardarPersonalDespachoDePunto(
    puntoId: string,
    datos: Partial<PersonalDespacho>,
  ): Promise<PersonalDespacho> {
    const valor: PersonalDespacho = {
      porcionadores: this.limpiarLista(datos.porcionadores),
      domiciliarios: this.limpiarLista(datos.domiciliarios),
    };
    await this.pool.query(
      `INSERT INTO configuracion (clave, valor)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (clave) DO UPDATE SET
         valor = EXCLUDED.valor,
         actualizado_en = now()`,
      [this.clave(puntoId), JSON.stringify(valor)],
    );
    return valor;
  }

  /** Clave de almacenamiento para el punto de venta indicado. */
  private clave(puntoId: string): string {
    return `${PREFIJO_DESPACHO}${String(puntoId).trim()}`;
  }

  /** Normaliza una lista: solo strings no vacíos, sin duplicados, recortados. */
  private limpiarLista(lista: unknown): string[] {
    if (!Array.isArray(lista)) return [];
    const vistos = new Set<string>();
    const salida: string[] = [];
    for (const item of lista) {
      const nombre = String(item ?? '').trim();
      if (!nombre) continue;
      const clave = nombre.toLowerCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      salida.push(nombre);
    }
    return salida;
  }
}
