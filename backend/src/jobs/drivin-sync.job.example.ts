/**
 * Job/Cron para sincronizar cancelaciones desde Drivin automáticamente.
 * 
 * Instalación:
 * 1. npm install --save @nestjs/schedule
 * 
 * 2. Importar en app.module.ts:
 *    - ScheduleModule.forRoot()
 * 
 * 3. Agregar este archivo en src/jobs/drivin-sync.job.ts
 * 
 * 4. Importar DrvinSyncJob en el módulo correspondiente
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PedidosService } from '../pedidos/pedidos.service';

@Injectable()
export class DrivinSyncJob {
  private readonly logger = new Logger(DrivinSyncJob.name);

  constructor(private readonly pedidos: PedidosService) {}

  /**
   * Sincroniza desasignaciones: cada 5 minutos durante el horario de operación.
   * Corre de 06:00 a 22:00 (Bogotá) de lunes a sábado.
   */
  @Cron('0 */5 6-22 * * 1-6', {
    name: 'sincronizar-desasignaciones-drivin',
    timeZone: 'America/Bogota',
  })
  async sincronizarDesasignaciones() {
    try {
      const count = await this.pedidos.sincronizarDesasignacionesDrivin();
      if (count > 0) {
        this.logger.log(
          `✓ Sincronización desasignaciones: ${count} pedidos actualizados`,
        );
      }
    } catch (error) {
      this.logger.error(
        `✗ Error en sincronización desasignaciones: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Sincroniza cancelaciones: cada 5 minutos durante el horario de operación.
   * Corre de 06:00 a 22:00 (Bogotá) de lunes a sábado.
   */
  @Cron('0 */5 6-22 * * 1-6', {
    name: 'sincronizar-cancelaciones-drivin',
    timeZone: 'America/Bogota',
  })
  async sincronizarCancelaciones() {
    try {
      const count = await this.pedidos.sincronizarCancelacionesDrivin();
      if (count > 0) {
        this.logger.log(
          `✓ Sincronización cancelaciones: ${count} pedidos actualizados`,
        );
      }
    } catch (error) {
      this.logger.error(
        `✗ Error en sincronización cancelaciones: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Sincronización completa: cada hora como fallback.
   * Si por alguna razón las sincronizaciones cada 5 min no funcionan.
   */
  @Cron('0 0 6-22 * * 1-6', {
    name: 'sincronizar-drivin-fallback',
    timeZone: 'America/Bogota',
  })
  async sincronizarCompleto() {
    try {
      this.logger.log('Iniciando sincronización completa con Drivin...');
      
      const desasignados = await this.pedidos.sincronizarDesasignacionesDrivin();
      const cancelados = await this.pedidos.sincronizarCancelacionesDrivin();
      
      this.logger.log(
        `✓ Sincronización completa: ` +
        `${desasignados} desasignados, ${cancelados} cancelados`,
      );
    } catch (error) {
      this.logger.error(
        `✗ Error en sincronización completa: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/**
 * INSTALACIÓN EN app.module.ts:
 * 
 * import { ScheduleModule } from '@nestjs/schedule';
 * import { DrivinSyncJob } from './jobs/drivin-sync.job';
 * 
 * @Module({
 *   imports: [
 *     ScheduleModule.forRoot(),
 *     // ... otros imports
 *   ],
 *   providers: [
 *     DrivinSyncJob,
 *     // ... otros providers
 *   ],
 * })
 * export class AppModule {}
 * 
 * CONFIGURACIÓN ALTERNATIVA (sin Job automático):
 * 
 * Si prefieres ejecutar la sincronización manualmente, simplemente llama a:
 * 
 *   POST /pedidos/drivin/sincronizar-cancelaciones
 *   POST /pedidos/drivin/sincronizar-desasignaciones
 * 
 * desde tu frontend o desde un scheduler externo.
 */
