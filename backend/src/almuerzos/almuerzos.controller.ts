import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AlmuerzosService } from './almuerzos.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';

type ReqUsuario = Request & { user?: JwtPayload };

@Controller('almuerzos')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('despacho')
export class AlmuerzosController {
  constructor(private readonly almuerzos: AlmuerzosService) {}

  @Get('punto/:puntoId')
  listarPunto(@Req() req: ReqUsuario, @Param('puntoId') puntoId: string, @Query('dia') dia?: string) {
    return this.almuerzos.listarPunto(req.user!, puntoId, dia);
  }

  @Patch(':id/aprobar')
  aprobar(@Req() req: ReqUsuario, @Param('id') id: string) {
    return this.almuerzos.aprobar(req.user!, id);
  }

  @Patch(':id/rechazar')
  rechazar(@Req() req: ReqUsuario, @Param('id') id: string, @Body() body: { motivo?: string }) {
    return this.almuerzos.rechazar(req.user!, id, body?.motivo);
  }

  @Patch(':id/reprogramar')
  reprogramar(@Req() req: ReqUsuario, @Param('id') id: string, @Body() body: { hora?: string }) {
    return this.almuerzos.reprogramar(req.user!, id, body?.hora);
  }
}
