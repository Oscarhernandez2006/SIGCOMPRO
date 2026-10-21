import { BadRequestException, ForbiddenException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';

/** Personal de despacho de un punto (vista que consume el módulo de despacho). */
export interface PersonalDespacho {
  porcionadores: string[];
  domiciliarios: string[];
}

/** Una persona (porcionador o domiciliario) con los puntos donde está asignada. */
export interface PersonaAsignada {
  nombre: string;
  puntos: string[];
  /** ¿Activa? Si es false, no aparece en los selectores de despacho. */
  activo?: boolean;
  /**
   * Cédula (solo dígitos). `undefined` = nunca se ha definido (se intenta
   * completar desde `domiciliarios_cedula`); `''` = se dejó vacía a propósito.
   */
  cedula?: string;
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
/** Clave de la lista de tipos de corte (porcionado). */
const CLAVE_CORTES = 'tipos_corte:lista';
/** Clave del registro de cuadres de caja cerrados (por punto + día). */
const CLAVE_CUADRE_CERRADOS = 'cuadre_caja:cerrados';
/** Lista de cortes por defecto (semilla la primera vez). */
const CORTES_DEFAULT = [
  'Mariposa',
  'Relajado / Filete',
  'Bife Chorizo',
  'Churrasco',
  'Pinta de Lanza',
  'Goulash',
  'Sabana',
  'Posta / Medallones',
  'Tira / Fajitas',
];

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

  private claveOrdenSidebar(panel: string) {
    if (!['administrativo', 'operativo', 'club', 'run-errands'].includes(panel)) {
      throw new BadRequestException('Panel no valido.');
    }
    return `sidebar:orden:${panel}`;
  }

  async obtenerOrdenSidebar(panel: string): Promise<{ orden: string[] }> {
    const clave = this.claveOrdenSidebar(panel);
    const { rows } = await this.pool.query<{ valor: string[] }>(
      `SELECT valor FROM configuracion WHERE clave = $1 LIMIT 1`, [clave],
    );
    return { orden: Array.isArray(rows[0]?.valor) ? rows[0].valor : [] };
  }

  async guardarOrdenSidebar(panel: string, orden: unknown, user: JwtPayload) {
    if (!['administrador', 'administrador app', 'desarrollador'].includes(String(user.rol ?? '').trim().toLowerCase())) {
      throw new ForbiddenException('Solo los administradores pueden organizar el menu.');
    }
    const clave = this.claveOrdenSidebar(panel);
    if (!Array.isArray(orden) || orden.length > 150 || orden.some((item) => typeof item !== 'string' || item.length > 200 || !/^(?:grupo:)?\/[a-zA-Z0-9/_-]+$/.test(item)) || new Set(orden).size !== orden.length) {
      throw new BadRequestException('El orden del menu no es valido.');
    }
    await this.pool.query(
      `INSERT INTO configuracion (clave, valor, actualizado_en) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`,
      [clave, JSON.stringify(orden)],
    );
    return { orden };
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

  /**
   * Registro global con la cédula de cada persona. A quien aún no tiene cédula
   * definida se le completa desde `domiciliarios_cedula` (cargada con nombres
   * completos) si su nombre casa con UN solo registro de esa tabla.
   */
  async obtenerRegistroConCedulas(): Promise<RegistroPersonal> {
    return this.completarCedulas(await this.obtenerRegistro());
  }

  private async completarCedulas(
    registro: RegistroPersonal,
  ): Promise<RegistroPersonal> {
    const pendientes = [
      ...registro.porcionadores,
      ...registro.domiciliarios,
    ].filter((p) => p.cedula === undefined);
    if (pendientes.length === 0) return registro;
    const res = await this.pool.query<{ cedula: string; nombre: string }>(
      `SELECT cedula, nombre FROM domiciliarios_cedula`,
    );
    const cargadas = res.rows.map((r) => ({
      cedula: soloDigitos(r.cedula),
      tokens: tokensNombre(r.nombre),
    }));
    for (const p of pendientes) {
      const corto = tokensNombre(p.nombre);
      const candidatas = cargadas.filter(
        (c) => c.cedula && nombreCasa(corto, c.tokens),
      );
      if (candidatas.length === 1) p.cedula = candidatas[0].cedula;
    }
    return registro;
  }

  /** Guarda (reemplaza) el registro global. Solo administradores. */
  async guardarRegistro(
    datos: Partial<RegistroPersonal>,
  ): Promise<RegistroPersonal> {
    const registro = this.normalizarRegistro(datos);
    await this.persistirRegistro(registro);
    return this.completarCedulas(registro);
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
  /* Tipos de corte (porcionado)                                        */
  /* ------------------------------------------------------------------ */

  /** Lista de tipos de corte. Si no existe, siembra la lista por defecto. */
  async obtenerCortes(): Promise<string[]> {
    const res = await this.pool.query<{ valor: unknown }>(
      `SELECT valor FROM configuracion WHERE clave = $1 LIMIT 1`,
      [CLAVE_CORTES],
    );
    const valor = res.rows[0]?.valor as
      | { lista?: unknown }
      | unknown[]
      | undefined;
    const cruda = Array.isArray(valor)
      ? valor
      : valor && Array.isArray((valor as { lista?: unknown }).lista)
        ? (valor as { lista: unknown[] }).lista
        : null;
    if (cruda) return this.limpiarCortes(cruda);
    // Primera vez: siembra la lista por defecto.
    await this.persistirCortes(CORTES_DEFAULT);
    return this.limpiarCortes(CORTES_DEFAULT);
  }

  /** Guarda (reemplaza) la lista de tipos de corte. Solo administradores. */
  async guardarCortes(lista: unknown): Promise<string[]> {
    const limpia = this.limpiarCortes(lista);
    await this.persistirCortes(limpia);
    return limpia;
  }

  private async persistirCortes(lista: string[]): Promise<void> {
    await this.pool.query(
      `INSERT INTO configuracion (clave, valor)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (clave) DO UPDATE SET
         valor = EXCLUDED.valor,
         actualizado_en = now()`,
      [CLAVE_CORTES, JSON.stringify({ lista })],
    );
  }

  /** Normaliza la lista de cortes: recorta, quita vacíos/duplicados y ordena. */
  private limpiarCortes(lista: unknown): string[] {
    if (!Array.isArray(lista)) return [];
    const vistos = new Set<string>();
    const salida: string[] = [];
    for (const item of lista) {
      const s = String(item ?? '').trim();
      if (!s) continue;
      const k = s.toLowerCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      salida.push(s);
    }
    return salida.sort((a, b) => a.localeCompare(b, 'es'));
  }

  /* ------------------------------------------------------------------ */
  /* Cuadre de caja: cierre por punto de venta + día                    */
  /* ------------------------------------------------------------------ */

  /** Devuelve las claves "puntoId|fecha" de los cuadres cerrados. */
  private async obtenerCierresCuadre(): Promise<string[]> {
    const res = await this.pool.query<{ valor: unknown }>(
      `SELECT valor FROM configuracion WHERE clave = $1 LIMIT 1`,
      [CLAVE_CUADRE_CERRADOS],
    );
    const valor = res.rows[0]?.valor as { claves?: unknown } | undefined;
    return valor && Array.isArray(valor.claves) ? valor.claves.map(String) : [];
  }

  /** Clave del cierre de UNA facturadora: "punto|fecha|F=<nombre en minúsculas>". */
  private claveFacturadora(p: string, f: string, facturadora: string): string {
    return `${p}|${f}|F=${facturadora.trim().toLowerCase()}`;
  }

  private async persistirCierres(claves: string[]): Promise<void> {
    await this.pool.query(
      `INSERT INTO configuracion (clave, valor)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (clave) DO UPDATE SET
         valor = EXCLUDED.valor,
         actualizado_en = now()`,
      [CLAVE_CUADRE_CERRADOS, JSON.stringify({ claves })],
    );
  }

  /**
   * ¿El cuadre de un punto en una fecha está cerrado? Si se pasa `facturadora`,
   * responde por ESA facturadora (cerrado si cerró ella o si el punto entero ya
   * está cerrado); si no, por el cierre GENERAL del punto.
   */
  async cuadreEstaCerrado(
    puntoId: string,
    fecha: string,
    facturadora?: string,
  ): Promise<boolean> {
    const p = String(puntoId ?? '').trim();
    const f = String(fecha ?? '').trim();
    const claves = new Set(await this.obtenerCierresCuadre());
    if (facturadora && facturadora.trim()) {
      return (
        claves.has(`${p}|${f}`) ||
        claves.has(this.claveFacturadora(p, f, facturadora))
      );
    }
    return claves.has(`${p}|${f}`);
  }

  /** Estado del cierre de un punto+fecha: cierre general y facturadoras cerradas. */
  async estadoCuadre(
    puntoId: string,
    fecha: string,
  ): Promise<{ general: boolean; facturadoras: string[] }> {
    const p = String(puntoId ?? '').trim();
    const f = String(fecha ?? '').trim();
    const claves = await this.obtenerCierresCuadre();
    const prefijo = `${p}|${f}|F=`;
    return {
      general: claves.includes(`${p}|${f}`),
      facturadoras: claves
        .filter((c) => c.startsWith(prefijo))
        .map((c) => c.slice(prefijo.length)),
    };
  }

  /**
   * Cierra el cuadre. Si se pasa `facturadora`, cierra SOLO esa facturadora; con
   * la lista `facturadoras` (todas las del punto/día) detecta si ya cerraron
   * TODAS y, en ese caso, marca también el cierre GENERAL del punto. Sin
   * `facturadora`, cierra el punto entero (comportamiento anterior).
   */
  async cerrarCuadre(
    puntoId: string,
    fecha: string,
    facturadora?: string,
    facturadoras?: string[],
  ): Promise<{ cerrado: boolean; todasCerradas: boolean }> {
    const p = String(puntoId ?? '').trim();
    const f = String(fecha ?? '').trim();
    if (!p || !f) return { cerrado: false, todasCerradas: false };
    const claves = new Set(await this.obtenerCierresCuadre());
    let todasCerradas = true;
    if (facturadora && facturadora.trim()) {
      claves.add(this.claveFacturadora(p, f, facturadora));
      const lista = (
        Array.isArray(facturadoras) && facturadoras.length
          ? facturadoras
          : [facturadora]
      )
        .map((x) => String(x).trim().toLowerCase())
        .filter(Boolean);
      todasCerradas = lista.every((x) => claves.has(`${p}|${f}|F=${x}`));
      if (todasCerradas) claves.add(`${p}|${f}`);
    } else {
      claves.add(`${p}|${f}`);
    }
    await this.persistirCierres([...claves]);
    return { cerrado: true, todasCerradas };
  }

  /**
   * Reabre (quita el cierre de) el cuadre. Con `facturadora` reabre solo esa (y
   * quita el cierre general, porque ya no están todas). Sin ella, reabre el
   * punto entero (general + todas las facturadoras). Se usa tras autorizar la
   * edición con la clave dinámica.
   */
  async reabrirCuadre(
    puntoId: string,
    fecha: string,
    facturadora?: string,
  ): Promise<{ cerrado: boolean }> {
    const p = String(puntoId ?? '').trim();
    const f = String(fecha ?? '').trim();
    let claves = await this.obtenerCierresCuadre();
    if (facturadora && facturadora.trim()) {
      const kf = this.claveFacturadora(p, f, facturadora);
      claves = claves.filter((c) => c !== kf && c !== `${p}|${f}`);
    } else {
      const prefijo = `${p}|${f}|F=`;
      claves = claves.filter(
        (c) => c !== `${p}|${f}` && !c.startsWith(prefijo),
      );
    }
    await this.persistirCierres(claves);
    return { cerrado: false };
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
      if (p.activo === false) continue;
      for (const id of p.puntos) asegurar(id).porcionadores.push(p.nombre);
    }
    for (const d of registro.domiciliarios) {
      if (d.activo === false) continue;
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
        .filter((p) => p.activo !== false && p.puntos.includes(id))
        .map((p) => p.nombre),
      domiciliarios: registro.domiciliarios
        .filter((d) => d.activo !== false && d.puntos.includes(id))
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
      const persona: PersonaAsignada = {
        nombre,
        puntos,
        activo: obj?.activo !== false,
      };
      if (obj?.cedula !== undefined && obj?.cedula !== null) {
        persona.cedula = soloDigitos(obj.cedula);
      }
      salida.push(persona);
    }
    return salida;
  }
}

/** Deja solo dígitos (máx. 15) de una cédula. */
function soloDigitos(valor: unknown): string {
  return String(valor ?? '')
    .replace(/\D+/g, '')
    .slice(0, 15);
}

/** Palabras del nombre sin tildes, mayúsculas ni signos. */
function tokensNombre(nombre: unknown): string[] {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** ¿Las palabras difieren a lo sumo en una letra? (solo palabras de 5+ letras). */
function casiIguales(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++dif > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

/** Palabra del nombre corto vs. palabra del completo (admite iniciales: "L." ~ "Luis"). */
function palabraCasa(corta: string, completa: string): boolean {
  return (
    (corta.length === 1 && completa.startsWith(corta)) ||
    casiIguales(corta, completa)
  );
}

/**
 * ¿El nombre corto ("Jhon Viloria Orozco") corresponde al completo
 * ("Jhon Jairo Viloria Orozco")? Todas sus palabras deben aparecer en orden y
 * la última (segundo apellido) debe coincidir con la última del completo.
 */
function nombreCasa(corto: string[], completo: string[]): boolean {
  if (corto.length < 2 || completo.length === 0) return false;
  if (!palabraCasa(corto[corto.length - 1], completo[completo.length - 1])) {
    return false;
  }
  let j = 0;
  for (const t of corto) {
    while (j < completo.length && !palabraCasa(t, completo[j])) j++;
    if (j >= completo.length) return false;
    j++;
  }
  return true;
}
