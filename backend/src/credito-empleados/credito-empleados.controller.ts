import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { CreditoEmpleadosService } from './credito-empleados.service';

@Controller('credito-empleados')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('credito_empleados')
export class CreditoEmpleadosController {
  constructor(private readonly credito: CreditoEmpleadosService) {}

  @Get('trabajadores')
  trabajadores(@Query('q') q?: string) {
    return this.credito.buscarTrabajadores(q ?? '');
  }

  @Get('trabajadores/:cedula')
  trabajador(@Param('cedula') cedula: string) {
    return this.credito.obtenerTrabajador(cedula);
  }

  @Post('trabajadores')
  guardarTrabajador(
    @Body()
    body: {
      cedula: string;
      nombre: string;
      cupo_asignado: number;
      activo?: boolean;
    },
  ) {
    return this.credito.guardarTrabajador(body);
  }

  @Get('pedidos')
  pedidos(
    @Query('cedula') cedula?: string,
    @Query('estado') estado?: string,
    @Query('punto_id') punto_id?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.credito.listarPedidos({
      cedula,
      estado,
      punto_id,
      desde,
      hasta,
    });
  }

  @Post('pedidos')
  crearPedido(
    @Body()
    body: {
      trabajador_cedula: string;
      punto_id: string;
      punto_nombre: string;
      total: number;
      observacion?: string;
    },
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.credito.crearPedidoCredito({
      ...body,
      creado_por_id: req.user?.sub ? String(req.user.sub) : null,
      creado_por_nombre: req.user?.cedula ?? null,
    });
  }

  @Patch('pedidos/:id/estado')
  estado(
    @Param('id') id: string,
    @Body() body: { estado: 'pendiente' | 'facturado' | 'anulado' },
  ) {
    return this.credito.actualizarEstadoPedido(id, body?.estado);
  }
}
