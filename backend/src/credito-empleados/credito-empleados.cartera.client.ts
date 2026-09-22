import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Documento de cartera crudo devuelto por el API de Santacruz. */
export interface CarteraFila {
  CODIGO?: string;
  RAZON_SOCIAL?: string;
  SALDO?: number;
  DEBITO?: number;
  CREDITO?: number;
  FECHA?: string;
  FECHA_VCTO?: string;
  TIPO_DOC_CRUCE?: string;
  CONS_DOC_CRUCE?: number;
}

interface CarteraResponse {
  cia?: number;
  nit?: string;
  count?: number;
  data?: CarteraFila[];
}

/** Tercero de Siesa devuelto por GET /empleados (uno por cada cia donde existe). */
export interface EmpleadoSiesaFila {
  f200_id_cia?: number;
  f200_rowid?: number;
  codigo_tercero?: string;
  f200_nit?: string;
  f200_razon_social?: string;
  f200_apellido1?: string;
  f200_apellido2?: string;
  f200_nombres?: string;
  /** 1 = es empleado. */
  f200_ind_empleado?: number;
  /** 1 = activo, 0 = inactivo/retirado. */
  f200_ind_estado?: number;
}

interface EmpleadosResponse {
  cia?: number | null;
  count?: number;
  data?: EmpleadoSiesaFila[];
}

/** Empleado ya normalizado, listo para sincronizar con la BD local. */
export interface EmpleadoSiesa {
  cedula: string;
  nombre: string;
  activo: boolean;
}

/**
 * Consulta la cartera de un trabajador en Siesa usando el mismo endpoint
 * que ya usa SIGCOM (apiconsulta.grupo-santacruz.com).
 *
 * Vars de entorno requeridas:
 *   PRICE_LISTS_BASE_URL  → https://apiconsulta.grupo-santacruz.com
 *   PRICE_LISTS_TOKEN     → token compartido con SIGCOM
 *   SIESA_CIA_EMPLEADOS   → código de compañía (CIA) en Siesa para empleados
 */
@Injectable()
export class CreditoEmpleadosCarteraClient {
  private readonly logger = new Logger(CreditoEmpleadosCarteraClient.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Busca el nombre de un tercero en Siesa consultando su cartera.
   * Retorna el RAZON_SOCIAL si existe, o null si no se encuentra.
   */
  async buscarNombreEnSiesa(cedula: string): Promise<string | null> {
    const baseUrl = this.config.get<string>('PRICE_LISTS_BASE_URL', '').trim();
    const token   = this.config.get<string>('PRICE_LISTS_TOKEN', '').trim();
    const cia     = this.config.get<string>('SIESA_CIA_EMPLEADOS', '').trim();

    if (!baseUrl || !token || !cia) return null;

    const url = `${baseUrl}/cartera?cia=${encodeURIComponent(cia)}&nit=${encodeURIComponent(cedula)}&token=${encodeURIComponent(token)}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: Array<{ RAZON_SOCIAL?: string }> };
      const razon = body?.data?.[0]?.RAZON_SOCIAL;
      return razon ? String(razon).trim() : null;
    } catch {
      return null;
    }
  }

  /**
   * Devuelve el saldo total de cartera del trabajador en Siesa.
   * Retorna `null` si la integración no está configurada o falla.
   */
  async consultarSaldo(cedula: string): Promise<number | null> {
    const baseUrl = this.config.get<string>('PRICE_LISTS_BASE_URL', '').trim();
    const token   = this.config.get<string>('PRICE_LISTS_TOKEN', '').trim();
    const cia     = this.config.get<string>('SIESA_CIA_EMPLEADOS', '').trim();

    if (!baseUrl || !token || !cia) {
      return null;
    }

    const url = `${baseUrl}/cartera?cia=${encodeURIComponent(cia)}&nit=${encodeURIComponent(cedula)}&token=${encodeURIComponent(token)}`;

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        this.logger.warn(`Cartera Siesa respondió ${res.status} para cédula ${cedula}`);
        return null;
      }

      const body = (await res.json()) as CarteraResponse;
      const filas: CarteraFila[] = body?.data ?? [];

      // Suma de saldos positivos (documentos por cobrar)
      const saldo = filas.reduce((acc, f) => acc + (Number(f.SALDO) || 0), 0);
      return saldo;
    } catch (err) {
      this.logger.warn(
        `No se pudo consultar cartera Siesa para ${cedula}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Indica si el trabajador existe como tercero en Siesa (tiene al menos un
   * registro de cartera). Devuelve `null` si la integración no está activa.
   */
  async existeComoTercero(cedula: string): Promise<boolean | null> {
    const saldo = await this.consultarSaldo(cedula);
    if (saldo === null) return null;
    // Si tiene saldo 0 también existe — solo null significa "no pudimos consultar"
    return true;
  }

  /**
   * Lista los empleados de Siesa (GET /empleados). Si `SIESA_CIA_EMPLEADOS`
   * está configurada, filtra por esa compañía (?cia=N); si no, trae TODAS las
   * compañías (un mismo NIT puede repetirse una vez por cada cia donde tiene
   * tercero, por eso se deduplica por cédula al normalizar).
   * Solo se incluyen filas con `f200_ind_empleado = 1` (terceros que son
   * empleados). `activo` refleja `f200_ind_estado` (1 = activo).
   * Lanza un error si la integración no está configurada o la petición falla.
   */
  async listarEmpleados(): Promise<EmpleadoSiesa[]> {
    const baseUrl = this.config.get<string>('PRICE_LISTS_BASE_URL', '').trim();
    const token   = this.config.get<string>('PRICE_LISTS_TOKEN', '').trim();
    const cia     = this.config.get<string>('SIESA_CIA_EMPLEADOS', '').trim();

    if (!baseUrl || !token) {
      throw new Error(
        'Integración con Siesa no configurada (falta PRICE_LISTS_BASE_URL o PRICE_LISTS_TOKEN)',
      );
    }

    const qs = cia ? `?cia=${encodeURIComponent(cia)}&token=${encodeURIComponent(token)}` : `?token=${encodeURIComponent(token)}`;
    const url = `${baseUrl}/empleados${qs}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Siesa /empleados respondió ${res.status}`);
    }
    const body = (await res.json()) as EmpleadosResponse;
    const filas = Array.isArray(body?.data) ? body.data : [];

    const porCedula = new Map<string, EmpleadoSiesa>();
    for (const f of filas) {
      if (f.f200_ind_empleado !== 1) continue;
      const cedula = String(f.f200_nit ?? f.codigo_tercero ?? '').trim();
      if (!cedula) continue;
      const nombre =
        (f.f200_razon_social ?? '').trim() ||
        [f.f200_apellido1, f.f200_apellido2, f.f200_nombres]
          .map((s) => (s ?? '').trim())
          .filter(Boolean)
          .join(' ');
      if (!nombre) continue;
      // Si el mismo NIT aparece en varias compañías, se prefiere el activo.
      const activo = f.f200_ind_estado === 1;
      const previo = porCedula.get(cedula);
      if (!previo || (activo && !previo.activo)) {
        porCedula.set(cedula, { cedula, nombre, activo });
      }
    }
    return [...porCedula.values()];
  }
}
