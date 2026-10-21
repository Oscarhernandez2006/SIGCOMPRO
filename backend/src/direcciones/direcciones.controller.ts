import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';
import { DireccionesService } from './direcciones.service';

type ReqUser = Request & { user: JwtPayload };

@Controller('direcciones')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('direcciones')
export class DireccionesController {
  constructor(private readonly direcciones: DireccionesService) {}

  @Get('columnas')
  columnas() {
    return this.direcciones.columnas();
  }

  @Get('tipos')
  tipos() {
    return this.direcciones.tipos();
  }

  @Get()
  listar(
    @Query('q') q?: string,
    @Query('estado') estado?: string,
    @Query('tipo') tipo?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.direcciones.listar({
      q,
      estado,
      tipo,
      offset: offset ? Number(offset) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('exportar')
  @Permisos('direcciones.exportar')
  exportar() {
    return this.direcciones.exportar();
  }

  @Get('codigos')
  @Permisos('direcciones.importar')
  codigos() {
    return this.direcciones.codigos();
  }

  @Post('importar')
  @Permisos('direcciones.importar')
  importar(@Req() req: ReqUser, @Body('filas') filas: unknown) {
    return this.direcciones.importar(req.user, filas);
  }

  @Post()
  @Permisos('direcciones.editar')
  agregar(@Req() req: ReqUser, @Body('datos') datos?: Record<string, unknown>) {
    return this.direcciones.agregar(req.user, datos);
  }

  @Post('marcar')
  @Permisos('direcciones.marcar')
  marcar(
    @Req() req: ReqUser,
    @Body('ids') ids: unknown,
    @Body('corregida') corregida: boolean,
  ) {
    return this.direcciones.marcar(req.user, ids, corregida !== false);
  }

  @Post('eliminar')
  @Permisos('direcciones.eliminar')
  eliminar(@Body('ids') ids: unknown) {
    return this.direcciones.eliminar(ids);
  }

  @Patch(':id')
  @Permisos('direcciones.editar')
  actualizarCelda(
    @Req() req: ReqUser,
    @Param('id') id: string,
    @Body('columna') columna: string,
    @Body('valor') valor: unknown,
  ) {
    return this.direcciones.actualizarCelda(req.user, id, columna, valor);
  }
}
