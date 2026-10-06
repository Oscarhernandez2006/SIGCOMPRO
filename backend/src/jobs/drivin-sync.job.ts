import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PedidosService } from '../pedidos/pedidos.service';

/**
 * Mantiene SIGCOMPRO sincronizado con Drivin: si un domiciliario es
 * desasignado o un pedido es cancelado directamente en Drivin, este job lo
 * refleja acá automáticamente sin depender de que alguien tenga Despacho
 * abierto en el navegador (esa sincronización solo corre mientras la pestaña
 * está activa).
 */
@Injectable()
export class DrivinSyncJob {
  private readonly logger = new Logger(DrivinSyncJob.name);

  constructor(private readonly pedidos: PedidosService) {}

  /** Cada 5 minutos en horario de operación (6am-10pm, lunes a sábado). */
  @Cron('0 */5 6-22 * * 1-6', {
    name: 'sincronizar-desasignaciones-drivin',
    timeZone: 'America/Bogota',
  })
  async sincronizarDesasignaciones() {
    try {
      const count = await this.pedidos.sincronizarDesasignacionesDrivin();
      if (count > 0) {
        this.logger.log(`✓ Sincronización desasignaciones: ${count} pedidos actualizados`);
      }
    } catch (error) {
      this.logger.error(
        `✗ Error en sincronización desasignaciones: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Cada 5 minutos en horario de operación (6am-10pm, lunes a sábado). */
  @Cron('0 */5 6-22 * * 1-6', {
    name: 'sincronizar-cancelaciones-drivin',
    timeZone: 'America/Bogota',
  })
  async sincronizarCancelaciones() {
    try {
      const count = await this.pedidos.sincronizarCancelacionesDrivin();
      if (count > 0) {
        this.logger.log(`✓ Sincronización cancelaciones: ${count} pedidos actualizados`);
      }
    } catch (error) {
      this.logger.error(
        `✗ Error en sincronización cancelaciones: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Respaldo cada hora, por si las corridas de 5 minutos fallaron silenciosamente. */
  @Cron('0 0 6-22 * * 1-6', {
    name: 'sincronizar-drivin-fallback',
    timeZone: 'America/Bogota',
  })
  async sincronizarCompleto() {
    try {
      const desasignados = await this.pedidos.sincronizarDesasignacionesDrivin();
      const cancelados = await this.pedidos.sincronizarCancelacionesDrivin();
      this.logger.log(`✓ Sincronización completa: ${desasignados} desasignados, ${cancelados} cancelados`);
    } catch (error) {
      this.logger.error(
        `✗ Error en sincronización completa: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
