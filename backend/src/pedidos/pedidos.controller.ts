import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PedidosService } from './pedidos.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('pedidos')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('pedidos', 'despacho')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  /** Estado completo: pedidos + metadata de despacho + impresos. */
  @Get()
  estado(
    @Query('desde') desde?: string,
    @Query('rango') rango?: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.pedidos.estado(desde, rango, fecha);
  }

  /** Trazabilidad (historial) de un pedido, bajo demanda (no viaja en el listado). */
  @Get(':id/trazabilidad')
  trazabilidad(@Param('id') id: string) {
    return this.pedidos.trazabilidad(id);
  }

  /** Últimos pedidos de un cliente (para la función "espejo"). */
  @Get('cliente/:clienteId')
  porCliente(
    @Param('clienteId') clienteId: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Number(limit) : undefined;
    return this.pedidos.porCliente(clienteId, Number.isFinite(n) ? n : undefined);
  }

  /** Descarga el Excel de despacho del pedido (formato del software de ruteo). */
  @Get(':id/excel')
  async excel(
    @Param('id') id: string,
    @Query('replica') replica: string | undefined,
    @Res() res: Response,
  ) {
    const n = replica ? Number(replica) : undefined;
    const { filename, buffer } = await this.pedidos.generarExcelDespacho(
      id,
      Number.isFinite(n) ? n : undefined,
    );
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** Domiciliarios (vehículos de Drivin) asignados a un punto de venta. */
  @Get('drivin/domiciliarios')
  domiciliariosDrivin(
    @Query('codigo') codigo?: string,
    @Query('nombre') nombre?: string,
  ) {
    return this.pedidos.domiciliariosDrivinPunto(codigo ?? '', nombre ?? '');
  }

  /** Mapa comanda -> domiciliario que Drivin asignó (para bajar la asignación). */
  @Get('drivin/asignaciones')
  asignacionesDrivin() {
    return this.pedidos.asignacionesDrivin();
  }

  /** Envía el pedido directamente a Drivin (reemplazo del Excel de cargue). */
  @Post(':id/drivin')
  async drivin(
    @Param('id') id: string,
    @Query('replica') replica: string | undefined,
    @Query('vehiculo') vehiculo: string | undefined,
  ) {
    const n = replica ? Number(replica) : undefined;
    return this.pedidos.enviarADrivin(
      id,
      Number.isFinite(n) ? n : undefined,
      vehiculo,
    );
  }

  /** Crea o actualiza un pedido completo. */
  @Put(':id')
  guardar(
    @Param('id') _id: string,
    @Body() pedido: Record<string, unknown>,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.pedidos.guardar(pedido, req.user);
  }

  /** Mezcla cambios en la metadata de despacho de un pedido. */
  @Patch(':id/meta')
  actualizarMeta(
    @Param('id') id: string,
    @Body() cambios: Record<string, unknown>,
  ) {
    return this.pedidos.actualizarMeta(id, cambios);
  }

  /** Marca un pedido como impreso. */
  @Patch(':id/impreso')
  marcarImpreso(
    @Param('id') id: string,
    @Body() body: { impreso?: boolean },
  ) {
    return this.pedidos.marcarImpreso(id, body?.impreso ?? true);
  }

  /** Devuelve el comprobante de pago (imagen) de un pedido, si existe. */
  @Get(':id/comprobante')
  obtenerComprobante(@Param('id') id: string) {
    return this.pedidos.obtenerComprobante(id);
  }

  /** Sube (o reemplaza) el comprobante de pago de un pedido. Queda sin confirmar. */
  @Post(':id/comprobante')
  subirComprobante(
    @Param('id') id: string,
    @Body() body: { imagen: string; mime?: string; subidoPor?: string },
  ) {
    return this.pedidos.guardarComprobante(
      id,
      body?.imagen,
      body?.mime ?? null,
      body?.subidoPor ?? null,
    );
  }

  /** Confirma el comprobante de pago de un pedido (solo lectura después). */
  @Patch(':id/comprobante/confirmar')
  confirmarComprobante(
    @Param('id') id: string,
    @Body() body: { confirmadoPor?: string },
  ) {
    return this.pedidos.confirmarComprobante(id, body?.confirmadoPor ?? null);
  }

  /** Elimina el comprobante de pago de un pedido. */
  @Delete(':id/comprobante')
  @HttpCode(HttpStatus.OK)
  eliminarComprobante(@Param('id') id: string) {
    return this.pedidos.eliminarComprobante(id);
  }

  /** Borra todos los pedidos. Solo administrador/desarrollador. */
  @Delete()
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  vaciar() {
    return this.pedidos.vaciar();
  }
}
