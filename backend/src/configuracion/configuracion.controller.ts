import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  ConfiguracionService,
  PersonalDespacho,
} from './configuracion.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('configuracion')
@UseGuards(JwtAuthGuard)
export class ConfiguracionController {
  constructor(private readonly configuracion: ConfiguracionService) {}

  /**
   * Personal de despacho de todos los puntos, indexado por id de punto.
   * Lo usa el despacho para llenar el selector de cada pedido. Lectura
   * autenticada.
   */
  @Get('despacho')
  personalDespachoTodos() {
    return this.configuracion.personalDespachoTodos();
  }

  /** Personal de despacho de un punto de venta. Lectura autenticada. */
  @Get('despacho/:puntoId')
  personalDespachoDePunto(@Param('puntoId') puntoId: string) {
    return this.configuracion.personalDespachoDePunto(puntoId);
  }

  /**
   * Guarda el personal de despacho de un punto de venta.
   * Solo administrador/desarrollador.
   */
  @Put('despacho/:puntoId')
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  guardarPersonalDespachoDePunto(
    @Param('puntoId') puntoId: string,
    @Body() body: Partial<PersonalDespacho>,
  ) {
    return this.configuracion.guardarPersonalDespachoDePunto(
      puntoId,
      body ?? {},
    );
  }
}
