import { BadRequestException, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { NovedadesService } from './novedades.service';

type ReqUsuario = Request & { user: JwtPayload };

@Controller('novedades')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador app', 'desarrollador')
export class NovedadesController {
  constructor(private readonly novedades: NovedadesService) {}

  /** Versiones de novedades que el usuario ya vio. */
  @Get('vistas')
  vistas(@Req() req: ReqUsuario) {
    return this.novedades.vistas(req.user.sub);
  }

  @Post(':version/vista')
  marcar(@Req() req: ReqUsuario, @Param('version') version: string) {
    if (!/^[\w.-]{1,40}$/.test(version)) throw new BadRequestException('Versión inválida');
    return this.novedades.marcarVista(req.user.sub, version);
  }
}
