import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CotizacionesService } from './cotizaciones.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';

@Controller('cotizaciones')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('cotizaciones')
export class CotizacionesController {
  constructor(private readonly cotizaciones: CotizacionesService) {}

  /** Todas las cotizaciones. */
  @Get()
  listar() {
    return this.cotizaciones.listar();
  }

  /** Crea o actualiza una cotización completa. */
  @Put(':id')
  guardar(
    @Param('id') _id: string,
    @Body() cotizacion: Record<string, unknown>,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.cotizaciones.guardar(cotizacion, req.user);
  }

  /** Elimina una cotización. */
  @Delete(':id')
  eliminar(
    @Param('id') id: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.cotizaciones.eliminar(id, req.user);
  }

  /** Convierte la cotización en un pedido (conservando los precios fijados). */
  @Post(':id/convertir')
  convertir(
    @Param('id') id: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.cotizaciones.convertir(id, req.user);
  }
}
