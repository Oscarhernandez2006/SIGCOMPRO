import { Body, Controller, ForbiddenException, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AlmuerzosService } from './almuerzos.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { tieneAccesoTotal } from '../users/permisos.catalog';

type ReqUsuario = Request & { user?: JwtPayload };

@Controller('almuerzos')
@UseGuards(JwtAuthGuard)
export class AlmuerzosController {
  constructor(private readonly almuerzos: AlmuerzosService, private readonly users: UsersService) {}

  private async autorizar(user?: JwtPayload) {
    const rol = String(user?.rol ?? '').trim().toLowerCase();
    if (!user || (!['despacho', 'supervisor general', 'supervisor_general', 'administrador pdv'].includes(rol) && !tieneAccesoTotal(rol))) {
      throw new ForbiddenException('Solo despacho, supervisores generales y administradores pueden gestionar almuerzos.');
    }
    if (tieneAccesoTotal(rol) || ['supervisor general', 'supervisor_general'].includes(rol)) return;
    if (rol === 'administrador pdv') return;
    const permisos = (await this.users.obtenerCacheado(user.sub)).permisos ?? [];
    if (!permisos.includes('despacho') && !permisos.includes('almuerzos')) throw new ForbiddenException('No tienes el permiso para aprobar almuerzos.');
  }

  @Get('punto/:puntoId')
  async listarPunto(@Req() req: ReqUsuario, @Param('puntoId') puntoId: string, @Query('dia') dia?: string) {
    await this.autorizar(req.user);
    return this.almuerzos.listarPunto(req.user!, puntoId, dia);
  }

  @Patch(':id/aprobar')
  async aprobar(@Req() req: ReqUsuario, @Param('id') id: string) {
    await this.autorizar(req.user);
    return this.almuerzos.aprobar(req.user!, id);
  }

  @Patch(':id/rechazar')
  async rechazar(@Req() req: ReqUsuario, @Param('id') id: string, @Body() body: { motivo?: string }) {
    await this.autorizar(req.user);
    return this.almuerzos.rechazar(req.user!, id, body?.motivo);
  }

  @Patch(':id/reprogramar')
  async reprogramar(@Req() req: ReqUsuario, @Param('id') id: string, @Body() body: { hora?: string; motivo?: string }) {
    await this.autorizar(req.user);
    return this.almuerzos.reprogramar(req.user!, id, body?.hora, body?.motivo);
  }
}
