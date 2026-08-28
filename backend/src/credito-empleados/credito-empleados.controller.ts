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
export class CreditoEmpleadosController {
  constructor(private readonly credito: CreditoEmpleadosService) {}

  /** Busca el nombre de un tercero en Siesa por cédula (autocompletar). */
  @Get('buscar-en-siesa/:cedula')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  buscarEnSiesa(@Param('cedula') cedula: string) {
    return this.credito.buscarEnSiesa(cedula);
  }

  /** Importa trabajadores en masa desde un arreglo [{cedula,nombre,cupo_asignado?}]. */
  @Post('importar')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  importar(
    @Body()
    body: { trabajadores: Array<{ cedula: string; nombre: string; cupo_asignado?: number }> },
  ) {
    return this.credito.importarTrabajadores(body.trabajadores ?? []);
  }

  /** Consulta pública del estado de crédito de un colaborador (solo requiere sesión). */
  @Get('consulta/:cedula')
  @UseGuards(JwtAuthGuard)
  consulta(@Param('cedula') cedula: string) {
    return this.credito.obtenerTrabajador(cedula);
  }

  @Get('trabajadores')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  trabajadores(@Query('q') q?: string) {
    return this.credito.buscarTrabajadores(q ?? '');
  }

  @Get('trabajadores/:cedula')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  trabajador(@Param('cedula') cedula: string) {
    return this.credito.obtenerTrabajador(cedula);
  }

  @Post('trabajadores')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  guardarTrabajador(
    @Body()
    body: {
      cedula: string;
      nombre: string;
      cupo_asignado: number;
      activo?: boolean;
      fecha_proximo_descuento?: string | null;
    },
  ) {
    return this.credito.guardarTrabajador(body);
  }

  @Get('resumen-nomina')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  resumenNomina() {
    return this.credito.resumenNomina();
  }

  @Get('pedidos')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  pedidos(
    @Query('cedula') cedula?: string,
    @Query('estado') estado?: string,
    @Query('punto_id') punto_id?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.credito.listarPedidos({ cedula, estado, punto_id, desde, hasta });
  }

  @Post('pedidos')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  crearPedido(
    @Body()
    body: {
      trabajador_cedula: string;
      punto_id: string;
      punto_nombre: string;
      total: number;
      observacion?: string;
      factura_imagen?: string | null;
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
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  estado(
    @Param('id') id: string,
    @Body() body: { estado: 'pendiente' | 'facturado' | 'anulado' },
  ) {
    return this.credito.actualizarEstadoPedido(id, body?.estado);
  }
}
