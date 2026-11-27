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

  /** Busca en Siesa (TPV) la factura digitada en Despacho y devuelve su valor. */
  @Get('factura-tpv')
  @Permisos('despacho', 'credito_empleados')
  facturaTpv(@Query('pedido_id') pedidoId: string, @Query('numero') numero: string) {
    return this.siesa.consultarFacturaTpv(pedidoId, numero);
  }

  /** Trae ya de Siesa los días del rango que faltan (máx. 3 por llamada). */
  @Post('sincronizar')
  sincronizar(@Query('desde') desde: string, @Query('hasta') hasta: string) {
    return this.siesa.sincronizarRango(desde, hasta);
  }
}
