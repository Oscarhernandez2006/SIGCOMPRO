import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AlmuerzosService } from './almuerzos.service';
import { SharedSecretGuard } from '../provisioning/guards/shared-secret.guard';

/**
 * API server-to-server para Mi Variable Liquidación (cabecera X-SSO-Secret).
 * El domiciliario se identifica por su documento; SIGCOMPRO valida que esté
 * registrado y activo en el punto de venta.
 */
@Controller('externo/almuerzos')
@UseGuards(SharedSecretGuard)
export class AlmuerzosExternoController {
  constructor(private readonly almuerzos: AlmuerzosService) {}

  @Get('puntos')
  puntos(@Query('documento') documento?: string) {
    return this.almuerzos.puntosDomiciliario(documento ?? '');
  }

  @Get()
  listar(@Query('documento') documento?: string) {
    return this.almuerzos.listarDomiciliario(documento ?? '');
  }

  @Post()
  crear(@Body() body: { documento?: string; puntoId?: string; hora?: string; nota?: string }) {
    return this.almuerzos.crear(body ?? {});
  }

  @Patch(':id/cancelar')
  cancelar(@Param('id') id: string, @Body() body: { documento?: string }) {
    return this.almuerzos.cancelar(id, body?.documento);
  }

  @Patch(':id/disponible')
  disponible(@Param('id') id: string, @Body() body: { documento?: string }) {
    return this.almuerzos.disponible(id, body?.documento);
  }
}
