import {
  Controller,
  Get,
  Body,
  Patch,
  Req,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductosService } from './productos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';

@Controller('productos')
@UseGuards(JwtAuthGuard)
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  @Get('listas')
  listas() {
    return this.productos.listas();
  }

  @Get('ultima-sincronizacion')
  ultima() {
    return this.productos.ultimaSincronizacion();
  }

  @Get('movimientos')
  movimientos(@Query('dias') dias?: string) {
    return this.productos.movimientos(dias ? Number(dias) : undefined);
  }

  @Get()
  listar(@Query('lista') lista?: string, @Query('buscar') buscar?: string) {
    return this.productos.listar(lista, buscar);
  }

  @Patch('agotado')
  @UseGuards(RolesGuard)
  @Roles('administrador', 'administrador app', 'desarrollador')
  agotado(@Body() body: { lista_precio?: string; referencia?: string; agotado?: boolean }, @Req() req: { user: JwtPayload }) {
    return this.productos.actualizarAgotado(body?.lista_precio ?? '', body?.referencia ?? '', body?.agotado === true, req.user?.cedula ?? req.user?.sub ?? '');
  }

  /**
   * Sincroniza la lista de precios desde la API externa. Disponible para los
   * roles con acceso total y para los usuarios (p. ej. televentas) que tengan
   * el permiso 'pedidos.sincronizar', para poder actualizarla antes de las 8am.
   */
  @Post('sincronizar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermisosGuard)
  @Permisos('pedidos.sincronizar')
  sincronizar() {
    return this.productos.sincronizar();
  }
}
