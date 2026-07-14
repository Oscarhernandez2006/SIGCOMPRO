import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  ConfiguracionService,
  RegistroPersonal,
} from './configuracion.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('configuracion')
@UseGuards(JwtAuthGuard)
export class ConfiguracionController {
  constructor(private readonly configuracion: ConfiguracionService) {}

  /**
   * Registro global de porcionadores y domiciliarios con los puntos donde
   * está asignada cada persona. Lo usa el editor del panel de configuración.
   */
  @Get('personal')
  registro() {
    return this.configuracion.obtenerRegistro();
  }

  /** Guarda el registro global de personas. Solo administrador/desarrollador. */
  @Put('personal')
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  guardarRegistro(@Body() body: Partial<RegistroPersonal>) {
    return this.configuracion.guardarRegistro(body ?? {});
  }

  /**
   * Personal de despacho de todos los puntos, indexado por id de punto.
   * Lo usa el despacho para llenar el selector de cada pedido. Lectura
   * autenticada.
   */
  @Get('despacho')
  personalDespachoTodos() {
    return this.configuracion.personalDespachoTodos();
  }

  /** Personal de despacho de un punto de venta. Lectura autenticada. */
  @Get('despacho/:puntoId')
  personalDespachoDePunto(@Param('puntoId') puntoId: string) {
    return this.configuracion.personalDespachoDePunto(puntoId);
  }

  /**
   * Lista de tipos de corte (porcionado). Lectura autenticada: la usa el
   * wizard de pedidos para llenar el selector de corte.
   */
  @Get('cortes')
  cortes() {
    return this.configuracion.obtenerCortes();
  }

  /** Guarda la lista de tipos de corte. Solo administrador/desarrollador. */
  @Put('cortes')
  @UseGuards(RolesGuard)
  @Roles('administrador', 'desarrollador')
  guardarCortes(@Body() body: { lista?: string[] } | string[]) {
    const lista = Array.isArray(body) ? body : (body?.lista ?? []);
    return this.configuracion.guardarCortes(lista);
  }

  /**
   * ¿El cuadre de caja de un punto en una fecha ya está cerrado? Lectura
   * autenticada: la cajera consulta al abrir el módulo.
   */
  @Get('cuadre/cerrado')
  async cuadreCerrado(
    @Query('puntoId') puntoId: string,
    @Query('fecha') fecha: string,
  ) {
    const cerrado = await this.configuracion.cuadreEstaCerrado(puntoId, fecha);
    return { cerrado };
  }

  /** Cierra el cuadre de caja de un punto en una fecha. Autenticado. */
  @Post('cuadre/cerrar')
  cerrarCuadre(@Body() body: { puntoId?: string; fecha?: string }) {
    return this.configuracion.cerrarCuadre(body?.puntoId ?? '', body?.fecha ?? '');
  }
}
