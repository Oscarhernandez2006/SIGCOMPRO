import { Body, Controller, Get, Logger, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PedidosService } from '../pedidos/pedidos.service';

/**
 * Planes y esquemas de Drivin (panel administrativo). Los planes del día se
 * crean solos (cron 00:01); `POST /planes/generar` los crea a mano para un día.
 * Los esquemas de cada punto se editan con PATCH /puntos-venta/:id.
 */
@Controller('planes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'desarrollador')
export class PlanesController {
  private readonly logger = new Logger(PlanesController.name);
  constructor(private readonly pedidos: PedidosService) {}

  /** Esquema de Drivin efectivo de cada punto y si tiene plan hoy. */
  @Get('esquemas')
  esquemas() {
    return this.pedidos.esquemasDrivin();
  }

  /** Historial de generación de planes (automática y manual). */
  @Get('generaciones')
  generaciones() {
    return this.pedidos.historialGeneracionPlanes();
  }

  /** Avance en vivo de una generación (se consulta cada segundo desde el modal). */
  @Get('generaciones/:id')
  generacion(@Param('id') id: string) {
    return this.pedidos.generacionPlanes(id);
  }

  /**
   * Inicia la creación (crear → aprobar → optimizar) de los planes que falten
   * de un día. Responde de inmediato con el id; el avance se lee aparte.
   */
  @Post('generar')
  async generar(@Req() req: Request & { user: JwtPayload }, @Body('fecha') fecha: string) {
    const { id, terminado } = await this.pedidos.iniciarGeneracionPlanes(
      String(fecha ?? ''),
      'manual',
      req.user,
    );
    terminado.catch((e) => this.logger.error(`Generación de planes ${id}: ${String(e)}`));
    return { id };
  }

  /** Planes (escenarios) de Drivin de un día con sus órdenes. */
  @Get()
  planes(@Query('fecha') fecha?: string, @Query('fresco') fresco?: string) {
    const dia =
      fecha ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    return this.pedidos.planesDrivin(dia, fresco === '1');
  }
}
