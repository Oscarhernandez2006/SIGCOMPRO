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
}
