import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UbicacionesService } from './ubicaciones.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ubicaciones')
@UseGuards(JwtAuthGuard)
export class UbicacionesController {
  constructor(private readonly ubicaciones: UbicacionesService) {}

  @Get('ciudades')
  ciudades(@Query('q') q?: string) {
    return this.ubicaciones.buscarCiudades(q);
  }
}
