import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';

/**
 * Configuración del menú por punto (autenticada). La edita el módulo "Lista de
 * Precios": guarda los productos y precios que se mostrarán en el menú público.
 */
@Controller('menu-config')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('lista_precios')
export class MenuConfigController {
  constructor(private readonly menu: MenuService) {}

  @Get(':puntoId')
  obtener(@Param('puntoId') puntoId: string) {
    return this.menu.obtenerConfig(puntoId);
  }

  @Put(':puntoId')
  guardar(
    @Param('puntoId') puntoId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.menu.guardarConfig(puntoId, body?.items);
  }
}
