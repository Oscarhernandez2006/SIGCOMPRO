import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

/** Personal de despacho de un punto (vista que consume el módulo de despacho). */
export interface PersonalDespacho {
  porcionadores: string[];
  domiciliarios: string[];
}

/** Una persona (porcionador o domiciliario) con los puntos donde está asignada. */
export interface PersonaAsignada {
  nombre: string;
  puntos: string[];
}

/** Registro global de personas, centrado en la persona (no en el punto). */
export interface RegistroPersonal {
  porcionadores: PersonaAsignada[];
  domiciliarios: PersonaAsignada[];
}

/** Prefijo antiguo (personal por punto). Se usa solo para migrar una vez. */
const PREFIJO_DESPACHO = 'despacho_personal:';
/** Clave del registro global centrado en la persona. */
const CLAVE_REGISTRO = 'personal_despacho:registro';

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

  /* ------------------------------------------------------------------ */
  /* Registro global (centrado en la persona)                           */
  /* ------------------------------------------------------------------ */

  /**
   * Devuelve el registro global de porcionadores y domiciliarios con los
   * puntos donde está asignada cada persona. Si aún no existe (primera vez),
   * lo construye migrando la configuración antigua guardada por punto.
   */
  async obtenerRegistro(): Promise<RegistroPersonal> {
    const res = await this.pool.query<{ valor: Partial<RegistroPersonal> }>(
      `SELECT valor FROM configuracion WHERE clave = $1 LIMIT 1`,
      [CLAVE_REGISTRO],
    );
    if (res.rows[0]?.valor && this.tieneContenido(res.rows[0].valor)) {
      return this.normalizarRegistro(res.rows[0].valor);
    }
    // Migración desde el modelo antiguo (personal por punto de venta).
    const migrado = await this.migrarDesdePorPunto();
    await this.persistirRegistro(migrado);
    return migrado;
  }

  /** Guarda (reemplaza) el registro global. Solo administradores. */
  async guardarRegistro(
    datos: Partial<RegistroPersonal>,
  ): Promise<RegistroPersonal> {
    const registro = this.normalizarRegistro(datos);
    await this.persistirRegistro(registro);
    return registro;
  }

  private async persistirRegistro(registro: RegistroPersonal): Promise<void> {
    await this.pool.query(
      `INSERT INTO configuracion (clave, valor)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (clave) DO UPDATE SET
         valor = EXCLUDED.valor,
         actualizado_en = now()`,
      [CLAVE_REGISTRO, JSON.stringify(registro)],
    );
  }

  /** Construye el registro global invirtiendo las claves antiguas por punto. */
  private async migrarDesdePorPunto(): Promise<RegistroPersonal> {
    const res = await this.pool.query<{
      clave: string;
      valor: Partial<PersonalDespacho>;
    }>(`SELECT clave, valor FROM configuracion WHERE clave LIKE $1`, [
      `${PREFIJO_DESPACHO}%`,
    ]);

    const porc = new Map<string, PersonaAsignada>();
    const domi = new Map<string, PersonaAsignada>();
    const agregar = (
      mapa: Map<string, PersonaAsignada>,
      nombre: string,
      puntoId: string,
    ) => {
      const limpio = String(nombre ?? '').trim();
      if (!limpio) return;
      const k = limpio.toLowerCase();
      const existente = mapa.get(k);
      if (existente) {
        if (!existente.puntos.includes(puntoId)) existente.puntos.push(puntoId);
      } else {
        mapa.set(k, { nombre: limpio, puntos: [puntoId] });
      }
    };

    for (const row of res.rows) {
      const puntoId = row.clave.slice(PREFIJO_DESPACHO.length).trim();
      if (!puntoId) continue;
      for (const n of row.valor?.porcionadores ?? []) agregar(porc, n, puntoId);
      for (const n of row.valor?.domiciliarios ?? []) agregar(domi, n, puntoId);
    }

    return {
      porcionadores: [...porc.values()],
      domiciliarios: [...domi.values()],
    };
  }

  /* ------------------------------------------------------------------ */
  /* Vistas por punto (las consume el módulo de despacho, sin cambios)  */
  /* ------------------------------------------------------------------ */

  /** Personal de despacho de todos los puntos, indexado por id de punto. */
  async personalDespachoTodos(): Promise<Record<string, PersonalDespacho>> {
    const registro = await this.obtenerRegistro();
    const mapa: Record<string, PersonalDespacho> = {};
    const asegurar = (id: string): PersonalDespacho => {
      if (!mapa[id]) mapa[id] = { porcionadores: [], domiciliarios: [] };
      return mapa[id];
    };
    for (const p of registro.porcionadores) {
      for (const id of p.puntos) asegurar(id).porcionadores.push(p.nombre);
    }
    for (const d of registro.domiciliarios) {
      for (const id of d.puntos) asegurar(id).domiciliarios.push(d.nombre);
    }
    return mapa;
  }

  /** Personal de despacho de un punto de venta (listas vacías si no hay nada). */
  async personalDespachoDePunto(puntoId: string): Promise<PersonalDespacho> {
    const id = String(puntoId).trim();
    const registro = await this.obtenerRegistro();
    return {
      porcionadores: registro.porcionadores
        .filter((p) => p.puntos.includes(id))
        .map((p) => p.nombre),
      domiciliarios: registro.domiciliarios
        .filter((d) => d.puntos.includes(id))
        .map((d) => d.nombre),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Normalización                                                      */
  /* ------------------------------------------------------------------ */

  private tieneContenido(valor: Partial<RegistroPersonal>): boolean {
    return (
      Array.isArray(valor.porcionadores) || Array.isArray(valor.domiciliarios)
    );
  }

  private normalizarRegistro(
    datos: Partial<RegistroPersonal>,
  ): RegistroPersonal {
    return {
      porcionadores: this.limpiarPersonas(datos.porcionadores),
      domiciliarios: this.limpiarPersonas(datos.domiciliarios),
    };
  }

  /** Normaliza personas: nombres únicos (case-insensitive) y puntos únicos. */
  private limpiarPersonas(lista: unknown): PersonaAsignada[] {
    if (!Array.isArray(lista)) return [];
    const vistos = new Set<string>();
    const salida: PersonaAsignada[] = [];
    for (const item of lista) {
      const obj = item as Partial<PersonaAsignada> | undefined;
      const nombre = String(obj?.nombre ?? '').trim();
      if (!nombre) continue;
      const k = nombre.toLowerCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      const puntos = Array.isArray(obj?.puntos)
        ? [
            ...new Set(
              obj!.puntos
                .map((x) => String(x ?? '').trim())
                .filter((x) => x.length > 0),
            ),
          ]
        : [];
      salida.push({ nombre, puntos });
    }
    return salida;
  }
}
