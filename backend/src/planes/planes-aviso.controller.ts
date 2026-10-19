import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PedidosService } from '../pedidos/pedidos.service';

/**
 * Aviso global (todas las pantallas, cualquier usuario con sesión) de que la
 * generación automática de planes de Drivin está corriendo.
 */
@Controller('planes-aviso')
@UseGuards(JwtAuthGuard)
export class PlanesAvisoController {
  constructor(private readonly pedidos: PedidosService) {}

  @Get()
  aviso() {
    return this.pedidos.avisoGeneracionAutomatica();
  }
}
