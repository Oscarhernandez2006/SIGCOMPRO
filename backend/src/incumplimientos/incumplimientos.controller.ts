import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { IncumplimientosService } from './incumplimientos.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';

type ReqUsuario = Request & { user?: JwtPayload };

/** Solo estos dos roles (RolesGuard dejaría pasar también a gerencia/administrador). */
@Injectable()
class SoloAdminAppGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const rol = (ctx.switchToHttp().getRequest<ReqUsuario>().user?.rol ?? '').trim().toLowerCase();
    if (rol === 'administrador app' || rol === 'desarrollador') return true;
    throw new ForbiddenException('Solo Administrador App y Desarrollador pueden gestionar incumplimientos.');
  }
}

@Controller('incumplimientos')
@UseGuards(JwtAuthGuard, SoloAdminAppGuard)
export class IncumplimientosController {
  constructor(private readonly inc: IncumplimientosService) {}

  @Get('responsables/:puntoId')
  responsables(@Param('puntoId') puntoId: string) {
    return this.inc.responsables(puntoId);
  }

  @Get('marcados-hoy')
  marcadosHoy() {
    return this.inc.marcadosHoy();
  }

  @Get('personas')
  personas() {
    return this.inc.personas();
  }

  @Get('personas/:usuarioId')
  persona(@Param('usuarioId') usuarioId: string) {
    return this.inc.persona(usuarioId);
  }

  @Post()
  crear(
    @Req() req: ReqUsuario,
    @Body() body: { pedidoId?: string; usuarioId?: string; motivo?: string; descripcion?: string; imagen?: string },
  ) {
    return this.inc.crear(req.user!, body ?? {});
  }

  @Delete(':id')
  eliminar(@Param('id') id: string) {
    return this.inc.eliminar(id);
  }
}
