import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { LiquidacionVariableService } from './liquidacion-variable.service';

@Controller('liquidacion-variable')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('liquidacion_variable')
export class LiquidacionVariableController {
  constructor(private readonly liq: LiquidacionVariableService) {}

  @Get('config')
  configs() {
    return this.liq.obtenerConfigs();
  }

  @Put('config/:puntoId')
  guardarConfig(
    @Param('puntoId') puntoId: string,
    @Body() body: unknown,
  ) {
    return this.liq.guardarConfig(puntoId, body);
  }

  /** Pedidos del rango (para calcular la liquidación en el frontend). */
  @Get('pedidos')
  pedidos(
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('punto_id') puntoId?: string,
  ) {
    return this.liq.pedidosRango(desde, hasta, puntoId);
  }

  @Get('overrides')
  overrides(@Query('periodo') periodo: string) {
    return this.liq.overridesPeriodo(periodo);
  }

  @Put('overrides')
  guardarOverride(
    @Body()
    body: { periodo: string; rol: string; pedido_id: string; pagar: boolean },
  ) {
    return this.liq.guardarOverride(body);
  }
}
