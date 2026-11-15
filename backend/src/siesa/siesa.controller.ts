import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';
import { SiesaService } from './siesa.service';

@Controller('siesa')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('reporte_productos')
export class SiesaController {
  constructor(private readonly siesa: SiesaService) {}

  /** Reporte Pedido vs facturado (una fila por pedido). `detalle=1` incluye productos y líneas (Excel). */
  @Get('reporte-facturacion')
  reporte(
    @Query('punto_id') punto_id?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('detalle') detalle?: string,
  ) {
    return this.siesa.reporte({ punto_id, desde, hasta, detalle: detalle === '1' });
  }

  @Get('reporte-facturacion/:pedidoId')
  detalle(@Param('pedidoId') pedidoId: string) {
    return this.siesa.detalle(pedidoId);
  }

  /** Trae ya de Siesa los días del rango que faltan (máx. 3 por llamada). */
  @Post('sincronizar')
  sincronizar(@Query('desde') desde: string, @Query('hasta') hasta: string) {
    return this.siesa.sincronizarRango(desde, hasta);
  }
}
