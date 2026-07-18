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
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PedidosService } from './pedidos.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('pedidos')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('pedidos', 'despacho')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  /** Estado completo: pedidos + metadata de despacho + impresos. */
  @Get()
  estado(@Query('dias') dias?: string) {
    const n = dias ? parseInt(dias, 10) : NaN;
    return this.pedidos.estado(Number.isFinite(n) && n > 0 ? n : undefined);
  }

  /** Descarga el Excel de despacho del pedido (formato del software de ruteo). */
  @Get(':id/excel')
  async excel(
    @Param('id') id: string,
    @Query('replica') replica: string | undefined,
    @Res() res: Response,
  ) {
    const n = replica ? Number(replica) : undefined;
    const { filename, buffer } = await this.pedidos.generarExcelDespacho(
      id,
      Number.isFinite(n) ? n : undefined,
    );
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** Envía el pedido directamente a Drivin (reemplazo del Excel de cargue). */
  @Post(':id/drivin')
  async drivin(
    @Param('id') id: string,
    @Query('replica') replica: string | undefined,
  ) {
    const n = replica ? Number(replica) : undefined;
    return this.pedidos.enviarADrivin(
      id,
      Number.isFinite(n) ? n : undefined,
    );
  }

  /** Crea o actualiza un pedido completo. */
  @Put(':id')
  guardar(
    @Param('id') _id: string,
    @Body() pedido: Record<string, unknown>,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.pedidos.guardar(pedido, req.user);
  }

  /** Mezcla cambios en la metadata de despacho de un pedido. */
  @Patch(':id/meta')
  actualizarMeta(
    @Param('id') id: string,
    @Body() cambios: Record<string, unknown>,
  ) {
    return this.pedidos.actualizarMeta(id, cambios);
  }

  /** Marca un pedido como impreso. */
  @Patch(':id/impreso')
  marcarImpreso(
    @Param('id') id: string,
    @Body() body: { impreso?: boolean },
  ) {
    return this.pedidos.marcarImpreso(id, body?.impreso ?? true);
  }

  /** Borra todos los pedidos. Solo administrador/desarrollador. */
  @Delete()
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  vaciar() {
    return this.pedidos.vaciar();
  }
}
