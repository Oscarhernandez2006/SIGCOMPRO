import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PuntosVentaService } from './puntos-venta.service';
import { CreatePuntoVentaDto } from './dto/create-punto-venta.dto';
import { UpdatePuntoVentaDto } from './dto/update-punto-venta.dto';
import { AsignarUsuariosDto } from './dto/asignar-usuarios.dto';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('puntos-venta')
@UseGuards(JwtAuthGuard)
export class PuntosVentaController {
  constructor(private readonly puntos: PuntosVentaService) {}

  /** Puntos de venta asignados al usuario autenticado (panel operativo). */
  @Get('mios')
  mios(@Req() req: Request & { user?: JwtPayload }) {
    return this.puntos.puntosDeUsuario(req.user!.sub);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  listar() {
    return this.puntos.listar();
  }

  @Get(':id/usuarios')
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  usuarios(@Param('id') id: string) {
    return this.puntos.usuariosDe(id);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  obtener(@Param('id') id: string) {
    return this.puntos.obtener(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  crear(@Body() dto: CreatePuntoVentaDto) {
    return this.puntos.crear(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  actualizar(@Param('id') id: string, @Body() dto: UpdatePuntoVentaDto) {
    return this.puntos.actualizar(id, dto);
  }

  @Put(':id/usuarios')
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  asignar(@Param('id') id: string, @Body() dto: AsignarUsuariosDto) {
    return this.puntos.asignarUsuarios(id, dto.usuarioIds);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  eliminar(@Param('id') id: string) {
    return this.puntos.eliminar(id);
  }
}
