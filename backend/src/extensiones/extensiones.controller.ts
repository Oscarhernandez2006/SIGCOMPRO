import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ExtensionesService } from './extensiones.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

type ReqUsuario = Request & { user?: JwtPayload };

@Controller('extensiones')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExtensionesController {
  constructor(private readonly ext: ExtensionesService) {}

  /** Solicitudes del punto en un día (hoy por defecto). */
  @Get('punto/:puntoId')
  @Roles('despacho')
  listarPunto(@Req() req: ReqUsuario, @Param('puntoId') puntoId: string, @Query('dia') dia?: string) {
    return this.ext.listarPunto(req.user!, puntoId, dia);
  }

  @Post()
  @Roles('despacho')
  crear(
    @Req() req: ReqUsuario,
    @Body()
    body: {
      puntoId?: string;
      domiciliario?: string;
      domiciliarioCodigo?: string;
      motivo?: string;
      snapshot?: unknown;
    },
  ) {
    return this.ext.crear(req.user!, body ?? {});
  }

  @Patch(':id/cancelar')
  @Roles('despacho')
  cancelar(@Req() req: ReqUsuario, @Param('id') id: string) {
    return this.ext.cancelar(req.user!, id);
  }

  @Get(':id/pedidos')
  @Roles('despacho', 'administrador app', 'desarrollador')
  pedidos(@Req() req: ReqUsuario, @Param('id') id: string) {
    return this.ext.pedidos(req.user!, id);
  }

  /** Listado administrativo de todas las solicitudes (todos los puntos). */
  @Get()
  @Roles('administrador app', 'desarrollador')
  listarAdmin(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('puntoId') puntoId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.ext.listarAdmin({ desde, hasta, puntoId, estado });
  }

  @Patch(':id/aprobar')
  @Roles('administrador app', 'desarrollador')
  aprobar(@Req() req: ReqUsuario, @Param('id') id: string) {
    return this.ext.aprobar(req.user!, id);
  }

  @Patch(':id/rechazar')
  @Roles('administrador app', 'desarrollador')
  rechazar(@Req() req: ReqUsuario, @Param('id') id: string, @Body() body: { motivo?: string }) {
    return this.ext.rechazar(req.user!, id, body?.motivo);
  }

  @Get('config/valores')
  @Roles('administrador app', 'desarrollador')
  config() {
    return this.ext.config();
  }

  @Put('config/:puntoId')
  @Roles('administrador app', 'desarrollador')
  guardarConfig(@Req() req: ReqUsuario, @Param('puntoId') puntoId: string, @Body() body: { valor?: unknown }) {
    return this.ext.guardarConfig(req.user!, puntoId, body?.valor);
  }
}
