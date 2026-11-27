import { BadRequestException, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

/** Línea de factura tal como la devuelve /ventas/facturas-todos-pdv. */
interface LineaApi {
  CO?: string | number;
  PDV?: string;
  FACTURA?: string;
  FECHA_HORA?: string;
  NIT_CLIENTE?: string | number;
  NOMBRE_CLIENTE?: string;
  CAJERO?: string;
  ESTADO?: string;
  TOTAL_FACTURA?: number;
  COD_ITEM?: string | number;
  PRODUCTO?: string;
  UM?: string;
  CANTIDAD?: number;
  PRECIO_UNIT?: number;
  VLR_NETO_LINEA?: number;
}

interface FacturaSiesa {
  factura: string;
  co: string;
  pdv: string;
  fechaHora: string | null;
  nit: string;
  cliente: string;
  cajero: string;
  estado: string;
  total: number;
  lineas: Map<string, { cod: string; producto: string; um: string; cantidad: number; neto: number }>;
}

interface PedidoCandidato {
  id: string;
  punto_id: string;
  nit: string | null;
  consecutivo: string;
}

export type EstadoCruce = 'sin_facturar' | 'pendiente' | 'no_encontrada' | 'coincide' | 'diferencia';

/** Primer día con pedidos en SIGCOMPRO (no hay nada que sincronizar antes). */
const DIA_INICIAL = '2026-07-01';
/** Tolerancia (COP) para considerar que el valor facturado coincide con el pedido. */
const TOLERANCIA = 1;

const soloDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
/** Consecutivo numérico de la factura: '07F-00031087', '07F31087' o '31087' -> '31087'. */
const consecutivo = (v: unknown) => {
  const m = String(v ?? '').trim().match(/(\d+)\s*$/);
  return m ? String(Number(m[1])) : '';
};
/** NIT/cédula base para comparar (sin dígito de verificación ni sufijo de alterna). */
const nitBase = (v: unknown) => soloDigitos(String(v ?? '').split('-')[0]);

/**
 * Cruce de pedidos de SIGCOMPRO con las facturas de Siesa (API de consultas
 * del grupo). La API devuelve todas las ventas POS de cada día, así que se
 * descarga por día en segundo plano y solo se guardan las facturas que
 * corresponden a un pedido; el reporte lee de esa tabla.
 */
@Injectable()
export class SiesaService implements OnModuleInit {
  private readonly logger = new Logger(SiesaService.name);
  private corriendo = false;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos_facturacion_siesa (
        pedido_id text PRIMARY KEY,
        factura text NOT NULL,
        co text NOT NULL DEFAULT '',
        pdv text NOT NULL DEFAULT '',
        fecha_hora timestamp NULL,
        nit text NOT NULL DEFAULT '',
        cliente text NOT NULL DEFAULT '',
        cajero text NOT NULL DEFAULT '',
        estado text NOT NULL DEFAULT '',
        total numeric NOT NULL DEFAULT 0,
        lineas jsonb NOT NULL DEFAULT '[]'::jsonb,
        metodo text NOT NULL DEFAULT '',
        actualizado_en timestamptz NOT NULL DEFAULT now()
      )`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS siesa_dias_sincronizados (
        dia date PRIMARY KEY,
        sincronizado_en timestamptz NOT NULL DEFAULT now(),
        lineas int NOT NULL DEFAULT 0,
        relacionadas int NOT NULL DEFAULT 0
      )`);
    // Limpieza de la primera versión: el cruce sin NIT ni CO ('unico') daba relaciones dudosas.
    const borradas = await this.pool.query(`DELETE FROM pedidos_facturacion_siesa WHERE metodo = 'unico'`);
    if (borradas.rowCount) {
      await this.pool.query(`DELETE FROM siesa_dias_sincronizados WHERE dia >= current_date - 30`);
    }
  }

  private get apiUrl() {
    return this.config.get<string>('SIESA_API_URL', 'https://apiconsulta.grupo-santacruz.com').replace(/\/+$/, '');
  }

  private get token() {
    return this.config.get<string>('SIESA_API_TOKEN', '');
  }

  private hoyBogota(offsetDias = 0) {
    return new Date(Date.now() + offsetDias * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  }

  /** Descarga todas las líneas de facturas de un día (paginado). */
  private async *lineasDelDia(dia: string): AsyncGenerator<LineaApi[]> {
    let offset = 0;
    for (let pagina = 0; pagina < 60; pagina++) {
      const url = new URL(`${this.apiUrl}/ventas/facturas-todos-pdv`);
      url.searchParams.set('fecha_inicio', dia);
      url.searchParams.set('fecha_fin', dia);
      url.searchParams.set('limit', '5000');
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('token', this.token);
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`API de facturas respondió ${res.status} (día ${dia})`);
      const j = (await res.json()) as { data?: LineaApi[]; has_more?: boolean; next_offset?: number | null };
      const data = Array.isArray(j.data) ? j.data : [];
      yield data;
      if (!j.has_more || !data.length) return;
      offset = typeof j.next_offset === 'number' ? j.next_offset : offset + data.length;
    }
  }

  /** CO de Siesa de cada punto, aprendido de los cruces confirmados por NIT. */
  private async coPorPunto(): Promise<Map<string, string>> {
    const r = await this.pool.query<{ punto_id: string; co: string }>(
      `SELECT DISTINCT ON (p.punto_id) p.punto_id, s.co
         FROM pedidos_facturacion_siesa s JOIN pedidos p ON p.id = s.pedido_id
        WHERE s.metodo = 'nit' AND s.co <> ''
        GROUP BY p.punto_id, s.co
        ORDER BY p.punto_id, COUNT(*) DESC`,
    );
    return new Map(r.rows.map((x) => [String(x.punto_id), x.co]));
  }

  /**
   * Sincroniza un día: relaciona los pedidos facturados (sin factura Siesa
   * todavía) con las facturas de ese día por consecutivo, validando con el NIT
   * del cliente o el CO del punto.
   */
  async sincronizarDia(dia: string): Promise<{ lineas: number; relacionadas: number }> {
    if (!this.token) throw new Error('Falta SIESA_API_TOKEN en el backend.');
    // Pedidos de hasta 10 días antes (los programados se facturan el día de entrega).
    const peds = await this.pool.query<PedidoCandidato>(
      `SELECT p.id, p.punto_id, p.data->'cliente'->>'nit_cedula' AS nit, p.meta->>'facturaNumero' AS consecutivo
         FROM pedidos p
        WHERE p.anulado = false
          AND COALESCE(p.meta->>'facturaNumero', '') <> ''
          AND p.fecha >= ($1::date - interval '10 days') AND p.fecha < ($1::date + interval '2 days')
          AND NOT EXISTS (SELECT 1 FROM pedidos_facturacion_siesa s WHERE s.pedido_id = p.id)`,
      [dia],
    );
    const porConsecutivo = new Map<string, PedidoCandidato[]>();
    for (const p of peds.rows) {
      const c = consecutivo(p.consecutivo);
      if (!c) continue;
      (porConsecutivo.get(c) ?? porConsecutivo.set(c, []).get(c)!).push(p);
    }

    const facturas = new Map<string, FacturaSiesa>();
    let lineas = 0;
    for await (const lote of this.lineasDelDia(dia)) {
      lineas += lote.length;
      for (const l of lote) {
        const c = consecutivo(l.FACTURA);
        if (!c || !porConsecutivo.has(c)) continue;
        const clave = String(l.FACTURA);
        let f = facturas.get(clave);
        if (!f) {
          f = {
            factura: clave,
            co: String(l.CO ?? ''),
            pdv: String(l.PDV ?? ''),
            fechaHora: l.FECHA_HORA ?? null,
            nit: String(l.NIT_CLIENTE ?? ''),
            cliente: String(l.NOMBRE_CLIENTE ?? ''),
            cajero: String(l.CAJERO ?? ''),
            estado: String(l.ESTADO ?? ''),
            total: Number(l.TOTAL_FACTURA) || 0,
            lineas: new Map(),
          };
          facturas.set(clave, f);
        }
        const cod = String(l.COD_ITEM ?? '');
        const prev = f.lineas.get(cod);
        const cant = Number(l.CANTIDAD) || 0;
        const neto = Number(l.VLR_NETO_LINEA) || 0;
        if (prev) {
          prev.cantidad += cant;
          prev.neto += neto;
        } else {
          f.lineas.set(cod, { cod, producto: String(l.PRODUCTO ?? ''), um: String(l.UM ?? ''), cantidad: cant, neto });
        }
      }
    }

    const coPunto = await this.coPorPunto();
    const facturasPorConsecutivo = new Map<string, FacturaSiesa[]>();
    for (const f of facturas.values()) {
      const c = consecutivo(f.factura);
      (facturasPorConsecutivo.get(c) ?? facturasPorConsecutivo.set(c, []).get(c)!).push(f);
    }

    const usadas = new Set<string>();
    let relacionadas = 0;
    for (const [c, pedidos] of porConsecutivo) {
      const opciones = facturasPorConsecutivo.get(c) ?? [];
      if (!opciones.length) continue;
      for (const p of pedidos) {
        const nitP = nitBase(p.nit);
        const coP = coPunto.get(String(p.punto_id));
        let mejor: { f: FacturaSiesa; metodo: string; puntos: number } | null = null;
        for (const f of opciones) {
          if (usadas.has(f.factura)) continue;
          const nitF = nitBase(f.nit);
          const porNit = !!nitP && nitP.length >= 5 && nitF === nitP;
          const porCo = !!coP && coP === f.co;
          const puntos = (porNit ? 4 : 0) + (porCo ? 3 : 0);
          if (!mejor || puntos > mejor.puntos) mejor = { f, metodo: porNit ? 'nit' : 'co', puntos };
        }
        // Solo se relaciona si coincide el NIT del cliente o el CO aprendido del punto.
        if (!mejor || mejor.puntos === 0) continue;
        usadas.add(mejor.f.factura);
        const f = mejor.f;
        await this.pool.query(
          `INSERT INTO pedidos_facturacion_siesa
             (pedido_id, factura, co, pdv, fecha_hora, nit, cliente, cajero, estado, total, lineas, metodo, actualizado_en)
           VALUES ($1,$2,$3,$4,$5::timestamp,$6,$7,$8,$9,$10,$11::jsonb,$12, now())
           ON CONFLICT (pedido_id) DO UPDATE SET
             factura = EXCLUDED.factura, co = EXCLUDED.co, pdv = EXCLUDED.pdv, fecha_hora = EXCLUDED.fecha_hora,
             nit = EXCLUDED.nit, cliente = EXCLUDED.cliente, cajero = EXCLUDED.cajero, estado = EXCLUDED.estado,
             total = EXCLUDED.total, lineas = EXCLUDED.lineas, metodo = EXCLUDED.metodo, actualizado_en = now()`,
          [
            p.id,
            f.factura,
            f.co,
            f.pdv,
            f.fechaHora,
            f.nit,
            f.cliente,
            f.cajero,
            f.estado,
            Math.round(f.total),
            JSON.stringify([...f.lineas.values()].map((x) => ({ ...x, neto: Math.round(x.neto) }))),
            mejor.metodo,
          ],
        );
        relacionadas++;
      }
    }

    await this.pool.query(
      `INSERT INTO siesa_dias_sincronizados (dia, sincronizado_en, lineas, relacionadas)
       VALUES ($1::date, now(), $2, $3)
       ON CONFLICT (dia) DO UPDATE SET sincronizado_en = now(), lineas = EXCLUDED.lineas,
         relacionadas = siesa_dias_sincronizados.relacionadas + EXCLUDED.relacionadas`,
      [dia, lineas, relacionadas],
    );
    return { lineas, relacionadas };
  }

  /**
   * Cada 5 minutos: refresca hoy y ayer (facturas recientes) y avanza el
   * histórico de a 3 días (del más reciente al más antiguo). Un bloqueo en la
   * BD evita que dos instancias lo hagan a la vez.
   */
  @Cron('0 */5 * * * *', { timeZone: 'America/Bogota' })
  async cronSincronizar() {
    if (!this.token || this.corriendo) return;
    this.corriendo = true;
    const cliente = await this.pool.connect();
    try {
      const lock = await cliente.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtext('siesa_sync')) AS ok`);
      if (!lock.rows[0]?.ok) return;
      try {
        const sinc = await this.pool.query<{ dia: string; hace: number }>(
          `SELECT to_char(dia, 'YYYY-MM-DD') AS dia, EXTRACT(EPOCH FROM now() - sincronizado_en)::int AS hace
             FROM siesa_dias_sincronizados`,
        );
        const hechos = new Map(sinc.rows.map((r) => [r.dia, r.hace]));
        const recientes = [this.hoyBogota(), this.hoyBogota(-1)].filter((d) => (hechos.get(d) ?? Infinity) > 600);
        const pendientes: string[] = [];
        for (let i = 2; i < 400 && pendientes.length < 3; i++) {
          const d = this.hoyBogota(-i);
          if (d < DIA_INICIAL) break;
          // Los días de hace menos de una semana se repasan una vez al día (facturas tardías).
          const hace = hechos.get(d);
          if (hace === undefined || (i <= 7 && hace > 86_400)) pendientes.push(d);
        }
        for (const d of [...recientes, ...pendientes]) {
          try {
            const r = await this.sincronizarDia(d);
            this.logger.log(`Siesa ${d}: ${r.lineas} líneas, ${r.relacionadas} pedidos relacionados`);
          } catch (e) {
            this.logger.warn(`Siesa ${d}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      } finally {
        await cliente.query(`SELECT pg_advisory_unlock(hashtext('siesa_sync'))`).catch(() => undefined);
      }
    } finally {
      cliente.release();
      this.corriendo = false;
    }
  }

  /** Reporte Pedido vs facturado: una fila por pedido (solo lectura de la BD). */
  async reporte(f: { punto_id?: string; desde?: string; hasta?: string; detalle?: boolean }) {
    const desde = String(f.desde ?? '').trim();
    const hasta = String(f.hasta ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      throw new BadRequestException('Indica el rango de fechas (desde y hasta).');
    }
    if (hasta < desde) throw new BadRequestException('La fecha final es anterior a la inicial.');
    if ((Date.parse(hasta) - Date.parse(desde)) / 86_400_000 > 92) {
      throw new BadRequestException('El rango máximo es de 3 meses.');
    }
    const val: unknown[] = [desde, hasta];
    let filtroPunto = '';
    if (f.punto_id?.trim()) {
      val.push(f.punto_id.trim());
      filtroPunto = `AND p.punto_id = $${val.length}`;
    }
    const r = await this.pool.query<{
      id: string;
      comanda: string;
      fecha: Date;
      punto: string;
      cliente: string;
      nit: string;
      estado: string;
      pago: string;
      total: string | null;
      factura_digitada: string | null;
      valor_digitado: string | null;
      carrito: unknown;
      s_factura: string | null;
      s_fecha: string | null;
      s_total: string | null;
      s_estado: string | null;
      s_pdv: string | null;
      s_cajero: string | null;
      s_metodo: string | null;
      s_lineas: unknown;
      dia_sinc: boolean;
    }>(
      `SELECT p.id, p.data->>'comanda' AS comanda, p.fecha,
              COALESCE(p.data->'punto'->>'nombre', '') AS punto,
              COALESCE(p.data->'cliente'->>'nombre', '') AS cliente,
              COALESCE(p.data->'cliente'->>'nit_cedula', '') AS nit,
              COALESCE(p.estado, p.data->>'estado', '') AS estado,
              COALESCE(p.data->>'pago', '') AS pago,
              p.data->>'total' AS total,
              NULLIF(btrim(p.meta->>'facturaNumero'), '') AS factura_digitada,
              p.meta->>'facturaValor' AS valor_digitado,
              ${f.detalle ? `p.data->'carrito'` : 'NULL'} AS carrito,
              s.factura AS s_factura, to_char(s.fecha_hora, 'YYYY-MM-DD"T"HH24:MI:SS') AS s_fecha, s.total AS s_total, s.estado AS s_estado,
              s.pdv AS s_pdv, s.cajero AS s_cajero, s.metodo AS s_metodo,
              ${f.detalle ? 's.lineas' : 'NULL'} AS s_lineas,
              EXISTS (
                SELECT 1 FROM siesa_dias_sincronizados d
                 WHERE d.dia = (p.fecha AT TIME ZONE 'America/Bogota')::date
              ) AS dia_sinc
         FROM pedidos p
         LEFT JOIN pedidos_facturacion_siesa s ON s.pedido_id = p.id
        WHERE p.anulado = false
          AND p.fecha >= ($1::date::timestamp AT TIME ZONE 'America/Bogota')
          AND p.fecha < (($2::date + 1)::timestamp AT TIME ZONE 'America/Bogota')
          ${filtroPunto}
        ORDER BY p.fecha DESC`,
      val,
    );

    const filas = r.rows.map((x) => {
      const total = Number(x.total) || 0;
      const facturado = x.s_total != null ? Number(x.s_total) : null;
      let estadoCruce: EstadoCruce;
      if (!x.factura_digitada) estadoCruce = 'sin_facturar';
      else if (facturado == null) estadoCruce = x.dia_sinc ? 'no_encontrada' : 'pendiente';
      else estadoCruce = Math.abs(facturado - total) <= TOLERANCIA ? 'coincide' : 'diferencia';
      return {
        id: x.id,
        comanda: x.comanda,
        fecha: x.fecha.toISOString(),
        punto: x.punto,
        cliente: x.cliente,
        nit: x.nit,
        estado: x.estado,
        pago: x.pago,
        totalPedido: total,
        facturaDigitada: x.factura_digitada,
        valorDigitado: x.valor_digitado != null && x.valor_digitado !== '' ? Number(x.valor_digitado) || 0 : null,
        facturaSiesa: x.s_factura,
        fechaFactura: x.s_fecha,
        totalFacturado: facturado,
        diferencia: facturado != null ? facturado - total : null,
        estadoFactura: x.s_estado,
        pdvSiesa: x.s_pdv,
        cajero: x.s_cajero,
        metodo: x.s_metodo,
        estadoCruce,
        ...(f.detalle ? { productos: this.productosPedido(x.carrito), lineasFactura: x.s_lineas ?? [] } : {}),
      };
    });

    const resumen = {
      pedidos: filas.length,
      totalPedidos: filas.reduce((s, x) => s + x.totalPedido, 0),
      totalFacturado: filas.reduce((s, x) => s + (x.totalFacturado ?? 0), 0),
      coinciden: filas.filter((x) => x.estadoCruce === 'coincide').length,
      conDiferencia: filas.filter((x) => x.estadoCruce === 'diferencia').length,
      noEncontradas: filas.filter((x) => x.estadoCruce === 'no_encontrada').length,
      pendientes: filas.filter((x) => x.estadoCruce === 'pendiente').length,
      sinFacturar: filas.filter((x) => x.estadoCruce === 'sin_facturar').length,
    };
    return { filas, resumen };
  }

  private productosPedido(carrito: unknown) {
    return (Array.isArray(carrito) ? carrito : []).map((i: any) => ({
      cod: String(i?.producto?.referencia ?? ''),
      producto: String(i?.producto?.producto ?? ''),
      um: String(i?.producto?.um ?? ''),
      cantidad: Number(i?.cantidad) || 0,
      valor: Math.round((Number(i?.producto?.precio) || 0) * (Number(i?.cantidad) || 0)),
    }));
  }

  /** Detalle de un pedido: productos del pedido vs líneas de la factura Siesa. */
  async detalle(pedidoId: string) {
    const r = await this.pool.query<{ carrito: unknown; lineas: unknown }>(
      `SELECT p.data->'carrito' AS carrito, s.lineas
         FROM pedidos p LEFT JOIN pedidos_facturacion_siesa s ON s.pedido_id = p.id
        WHERE p.id = $1`,
      [pedidoId],
    );
    if (!r.rows[0]) throw new NotFoundException('Pedido no encontrado.');
    return { productos: this.productosPedido(r.rows[0].carrito), lineasFactura: r.rows[0].lineas ?? [] };
  }

  /** Fuerza la sincronización de los días del rango que aún no están (máx. 3 por llamada). */
  async sincronizarRango(desde: string, hasta: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      throw new BadRequestException('Rango inválido.');
    }
    const hechos = new Set(
      (
        await this.pool.query<{ dia: string }>(
          `SELECT to_char(dia, 'YYYY-MM-DD') AS dia FROM siesa_dias_sincronizados WHERE dia BETWEEN $1::date AND $2::date`,
          [desde, hasta],
        )
      ).rows.map((r) => r.dia),
    );
    const hoy = this.hoyBogota();
    const faltan: string[] = [];
    for (let d = hasta; d >= desde && faltan.length < 3; ) {
      if (d <= hoy && (!hechos.has(d) || d === hoy)) faltan.push(d);
      d = new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    }
    let relacionadas = 0;
    for (const d of faltan) relacionadas += (await this.sincronizarDia(d)).relacionadas;
    return { dias: faltan, relacionadas };
  }

  /**
   * Consulta en Siesa (TPV) una factura por número, con la CIA y el C.O. del
   * punto del pedido, para facturar desde Despacho con el valor real. Acepta el
   * número completo (933C10565) o solo el consecutivo (10565); en ese caso, si
   * hay varias cajas con ese consecutivo, desempata por el NIT del cliente.
   */
  async consultarFacturaTpv(pedidoId: string, numeroIn: string) {
    const numero = String(numeroIn ?? '').trim().toUpperCase();
    if (!pedidoId || !numero) throw new BadRequestException('Indica el pedido y el número de factura.');
    if (!/^[A-Z0-9-]{1,30}$/.test(numero)) throw new BadRequestException('Número de factura inválido.');
    if (!this.token) throw new BadRequestException('Falta SIESA_API_TOKEN en el backend.');

    const ped = await this.pool.query<{
      punto_id: string;
      nit: string | null;
      compania: string | null;
      centro_operacion: string | null;
      nombre: string | null;
    }>(
      `SELECT p.punto_id, p.data->'cliente'->>'nit_cedula' AS nit,
              pv.compania, pv.centro_operacion, pv.nombre
         FROM pedidos p LEFT JOIN puntos_venta pv ON pv.id::text = p.punto_id
        WHERE p.id = $1`,
      [pedidoId],
    );
    const pv = ped.rows[0];
    if (!pv) throw new NotFoundException('Pedido no encontrado.');
    const cia = pv.compania?.trim();
    const co = pv.centro_operacion?.trim();
    if (!cia || !co) {
      throw new BadRequestException(
        `El punto ${pv.nombre ?? pv.punto_id} no tiene C.O. y CIA configurados (Admin → Puntos de venta).`,
      );
    }

    const url = new URL(`${this.apiUrl}/ventas/facturas-tpv-sigcompro`);
    url.searchParams.set('cia', cia);
    url.searchParams.set('co', co);
    url.searchParams.set('numero', numero);
    url.searchParams.set('token', this.token);
    let filas: Array<Record<string, unknown>>;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { data?: Array<Record<string, unknown>> };
      filas = Array.isArray(j.data) ? j.data : [];
    } catch (e) {
      this.logger.warn(`Consulta de factura ${numero} (CO ${co}) falló: ${e instanceof Error ? e.message : e}`);
      throw new BadRequestException('No se pudo consultar la factura en Siesa. Intenta de nuevo.');
    }

    const num = (f: Record<string, unknown>) => String(f.NUMERO_FACTURA ?? '').trim().toUpperCase();
    let candidatas = filas.filter((f) => num(f) === numero);
    if (!candidatas.length) candidatas = filas;
    if (!candidatas.length) {
      throw new NotFoundException(`No se encontró la factura ${numero} en el C.O. ${co}.`);
    }
    // Solo el consecutivo y hay una factura por caja: el usuario escoge cuál usar.
    if (candidatas.length > 1) {
      const numeros = candidatas.map(num);
      const usadas = await this.pool.query<{ numero: string; consecutivo: number }>(
        `SELECT upper(trim(meta->>'facturaNumero')) AS numero, consecutivo FROM pedidos
          WHERE id <> $1 AND anulado = false AND upper(trim(meta->>'facturaNumero')) = ANY($2::text[])`,
        [pedidoId, numeros],
      );
      const usadaEn = new Map(usadas.rows.map((r) => [r.numero, r.consecutivo]));
      const nit = nitBase(pv.nit);
      return {
        opciones: candidatas.map((f) => ({
          numero: num(f),
          valor: Math.round(Number(f.VALOR_TOTAL) || 0),
          estado: String(f.ESTADO ?? ''),
          tpv: String(f.TPV ?? ''),
          nit: String(f.NIT_CLIENTE ?? ''),
          cliente: String(f.CLIENTE ?? ''),
          fechaHora: (f.FECHA_HORA as string | undefined) ?? null,
          delCliente: Boolean(nit) && nitBase(f.NIT_CLIENTE) === nit,
          usadaEnPedido: usadaEn.get(num(f)) ?? null,
        })),
      };
    }
    const f = candidatas[0];
    const numeroFinal = num(f) || numero;
    const estado = String(f.ESTADO ?? '');
    if (/anulad/i.test(estado)) throw new BadRequestException(`La factura ${numeroFinal} está anulada en Siesa.`);
    const valor = Math.round(Number(f.VALOR_TOTAL) || 0);
    if (valor <= 0) throw new BadRequestException(`La factura ${numeroFinal} no tiene valor en Siesa.`);

    // Una factura solo puede respaldar un pedido.
    const usada = await this.pool.query<{ consecutivo: number }>(
      `SELECT consecutivo FROM pedidos
        WHERE id <> $1 AND anulado = false AND upper(trim(meta->>'facturaNumero')) = $2
        LIMIT 1`,
      [pedidoId, numeroFinal],
    );
    if (usada.rows.length) {
      throw new BadRequestException(
        `La factura ${numeroFinal} ya está registrada en el pedido #${usada.rows[0].consecutivo}.`,
      );
    }

    return {
      numero: numeroFinal,
      valor,
      estado,
      co: String(f.CO ?? co),
      pdv: String(f.PDV ?? ''),
      nit: String(f.NIT_CLIENTE ?? ''),
      cliente: String(f.CLIENTE ?? ''),
      fechaHora: (f.FECHA_HORA as string | undefined) ?? null,
    };
  }
}