import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CongeladosService } from './congelados.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';

@Controller('congelados')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('pedidos', 'despacho')
export class CongeladosController {
  constructor(private readonly congelados: CongeladosService) {}

  /** Congelados del usuario autenticado. */
  @Get()
  listar(@Req() req: Request & { user?: JwtPayload }) {
    return this.congelados.listar(req.user!.sub);
  }

  /** Crea o actualiza un congelado del usuario. */
  @Put(':id')
  guardar(
    @Param('id') id: string,
    @Body() data: Record<string, unknown>,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.congelados.guardar(req.user!.sub, id, data);
  }

  /** Elimina un congelado del usuario. */
  @Delete(':id')
  eliminar(
    @Param('id') id: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.congelados.eliminar(req.user!.sub, id);
  }
}
