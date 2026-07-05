import {
  Controller,
  Get,
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

  @Get()
  listar(@Query('lista') lista?: string, @Query('buscar') buscar?: string) {
    return this.productos.listar(lista, buscar);
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
