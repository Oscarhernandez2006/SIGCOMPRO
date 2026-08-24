import { Controller, Get, Param } from '@nestjs/common';
import { MenuService } from './menu.service';

/**
 * Menú público de precios por tienda. NO requiere autenticación: es la vista
 * que televentas comparte con los clientes (URL /tienda/<slug>).
 */
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get('tiendas')
  tiendas() {
    return this.menu.tiendas();
  }

  @Get(':slug')
  tienda(@Param('slug') slug: string) {
    return this.menu.tienda(slug);
  }
}
