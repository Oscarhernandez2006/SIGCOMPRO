import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import {
  ItemPedidoTienda,
  TiendaEmpleadosService,
} from './tienda-empleados.service';

@Controller('tienda-empleados')
export class TiendaEmpleadosController {
  constructor(private readonly tienda: TiendaEmpleadosService) {}

  // --------------------------- PÚBLICO (sin auth) ---------------------------

  /** Lista de tiendas de empleados publicadas (con catálogo). */
  @Get('tiendas')
  tiendas() {
    return this.tienda.tiendas();
  }

  /** Saldo disponible del trabajador por cédula. */
  @Get('saldo/:cedula')
  saldo(@Param('cedula') cedula: string) {
    return this.tienda.saldoPorCedula(cedula);
  }

  /** Catálogo público de una tienda por slug. */
  @Get('tienda/:slug')
  tiendaPublica(@Param('slug') slug: string) {
    return this.tienda.tienda(slug);
  }

  /** Crea un pedido desde la tienda pública (validado contra el cupo). */
  @Post('pedidos')
  crearPedido(
    @Body()
    body: {
      cedula: string;
      slug: string;
      items: ItemPedidoTienda[];
      entrega: string;
      direccion?: string;
      telefono?: string;
      observacion?: string;
    },
  ) {
    return this.tienda.crearPedido(body);
  }

  // --------------------------- ADMIN (con auth) -----------------------------

  @Get('catalogo/:puntoId')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  obtenerCatalogo(@Param('puntoId') puntoId: string) {
    return this.tienda.obtenerCatalogo(puntoId);
  }

  @Put('catalogo/:puntoId')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  guardarCatalogo(
    @Param('puntoId') puntoId: string,
    @Body() body: { items: unknown },
  ) {
    return this.tienda.guardarCatalogo(puntoId, body?.items);
  }

  @Get('pedidos')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  pedidos(
    @Query('estado') estado?: string,
    @Query('punto_id') punto_id?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.tienda.listarPedidos({ estado, punto_id, desde, hasta });
  }

  @Patch('pedidos/:id/estado')
  @UseGuards(JwtAuthGuard, PermisosGuard)
  @Permisos('credito_empleados')
  estado(@Param('id') id: string, @Body() body: { estado: string }) {
    return this.tienda.actualizarEstado(id, body?.estado);
  }
}
