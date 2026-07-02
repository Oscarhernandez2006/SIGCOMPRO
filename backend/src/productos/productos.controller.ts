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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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

  @Post('sincronizar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  sincronizar() {
    return this.productos.sincronizar();
  }
}
