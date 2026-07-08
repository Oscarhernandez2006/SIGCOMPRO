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
  Query,
  UseGuards,
} from '@nestjs/common';
import { MotivosService, TipoMotivo } from './motivos.service';
import { CreateMotivoDto } from './dto/create-motivo.dto';
import { UpdateMotivoDto } from './dto/update-motivo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('motivos')
@UseGuards(JwtAuthGuard)
export class MotivosController {
  constructor(private readonly motivos: MotivosService) {}

  /**
   * Lista los motivos. Cualquier usuario autenticado puede leerlos (los
   * necesita el modal de anular/cancelar). ?tipo=anular|cancelar y ?activos=1
   * filtran el resultado.
   */
  @Get()
  listar(
    @Query('tipo') tipo?: TipoMotivo,
    @Query('activos') activos?: string,
  ) {
    const t = tipo === 'anular' || tipo === 'cancelar' ? tipo : undefined;
    return this.motivos.listar(t, activos === '1' || activos === 'true');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  crear(@Body() dto: CreateMotivoDto) {
    return this.motivos.crear(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  actualizar(@Param('id') id: string, @Body() dto: UpdateMotivoDto) {
    return this.motivos.actualizar(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  eliminar(@Param('id') id: string) {
    return this.motivos.eliminar(id);
  }
}
