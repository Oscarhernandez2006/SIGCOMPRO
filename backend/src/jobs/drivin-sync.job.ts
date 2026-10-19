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

  /**
   * Crea automáticamente los planes del día en Drivin para todos los esquemas
   * activos al cambiar de día (00:01 hora Colombia). Reintenta a las 00:20 y a
   * las 05:00 por si Drivin falló: solo crea los que falten (no duplica).
   */
  @Cron('0 1 0 * * *', { name: 'generar-planes-drivin', timeZone: 'America/Bogota' })
  generarPlanesMedianoche() {
    return this.generarPlanesDelDia();
  }

  @Cron('0 20 0 * * *', { name: 'generar-planes-drivin-reintento-1', timeZone: 'America/Bogota' })
  generarPlanesReintento1() {
    return this.generarPlanesDelDia();
  }

  @Cron('0 0 5 * * *', { name: 'generar-planes-drivin-reintento-2', timeZone: 'America/Bogota' })
  generarPlanesReintento2() {
    return this.generarPlanesDelDia();
  }

  private async generarPlanesDelDia() {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    try {
      const r = await this.pedidos.generarPlanesDrivin(hoy, 'automatico');
      const errores = r.resultado.filter((x) => x.estado === 'error').length;
      const sinAprobar = r.resultado.filter((x) => x.aprobado === false).length;
      const sinOptimizar = r.resultado.filter((x) => x.optimizado === false).length;
      if (errores || sinAprobar || sinOptimizar) {
        this.logger.warn(
          `✗ Generación automática de planes ${hoy}: ${errores} esquema(s) con error, ${sinAprobar} sin aprobar, ${sinOptimizar} sin optimizar`,
        );
      }
    } catch (error) {
      this.logger.error(
        `✗ Error en generación automática de planes ${hoy}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Cada minuto en horario de operación (6am-10pm, todos los días). */
  @Cron('0 * 6-22 * * *', {
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
