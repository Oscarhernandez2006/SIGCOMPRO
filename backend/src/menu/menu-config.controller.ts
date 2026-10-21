import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Put,
  UseGuards,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';

type ReqUsuario = { user: JwtPayload };

/**
 * Configuración del menú por punto (autenticada). La edita el módulo "Lista de
 * Precios": guarda los productos y precios que se mostrarán en el menú público.
 */
@Controller('menu-config')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('lista_precios')
export class MenuConfigController {
  constructor(private readonly menu: MenuService) {}

  @Get(':puntoId/listas')
  async listas(@Param('puntoId') puntoId: string, @Req() req: ReqUsuario) {
    await this.menu.verificarPunto(req.user, puntoId);
    return this.menu.listas(puntoId);
  }

  @Post(':puntoId/listas')
  async crear(@Param('puntoId') puntoId: string, @Body() body: Record<string, unknown>, @Req() req: ReqUsuario) {
    await this.menu.verificarPunto(req.user, puntoId);
    return this.menu.crearLista(puntoId, body?.nombre);
  }

  @Get(':puntoId/listas/:listaId')
  async obtenerLista(@Param('puntoId') puntoId: string, @Param('listaId') listaId: string, @Req() req: ReqUsuario) {
    await this.menu.verificarPunto(req.user, puntoId);
    return this.menu.obtenerConfig(puntoId, listaId);
  }

  @Put(':puntoId/listas/:listaId')
  async guardarLista(@Param('puntoId') puntoId: string, @Param('listaId') listaId: string, @Body() body: Record<string, unknown>, @Req() req: ReqUsuario) {
    await this.menu.verificarPunto(req.user, puntoId);
    return this.menu.guardarConfig(puntoId, body?.items, listaId);
  }

  @Get(':puntoId')
  async obtener(@Param('puntoId') puntoId: string, @Req() req: ReqUsuario) {
    await this.menu.verificarPunto(req.user, puntoId);
    return this.menu.obtenerConfig(puntoId);
  }

  @Put(':puntoId')
  async guardar(
    @Param('puntoId') puntoId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: ReqUsuario,
  ) {
    await this.menu.verificarPunto(req.user, puntoId);
    return this.menu.guardarConfig(puntoId, body?.items);
  }
}
