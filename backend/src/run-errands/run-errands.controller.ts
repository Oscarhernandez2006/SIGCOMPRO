import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { RunErrandsService } from './run-errands.service';

@Controller('run-errands')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('run_errands')
export class RunErrandsController {
  constructor(private readonly svc: RunErrandsService) {}

  // ── Puntos de venta ──────────────────────────────────────────────────
  @Get('puntos-venta')
  puntosVenta(@Query('todos') todos?: string) {
    return this.svc.listarPuntosVenta(todos === '1');
  }

  @Post('puntos-venta')
  @Permisos('run_errands.editar')
  crearPuntoVenta(@Body() body: { nombre: string }) {
    return this.svc.crearPuntoVenta(body?.nombre);
  }

  @Put('puntos-venta/:id')
  @Permisos('run_errands.editar')
  actualizarPuntoVenta(@Param('id') id: string, @Body() body: { nombre?: string; activo?: boolean }) {
    return this.svc.actualizarPuntoVenta(id, body);
  }

  @Delete('puntos-venta/:id')
  @Permisos('run_errands.editar')
  eliminarPuntoVenta(@Param('id') id: string) {
    return this.svc.eliminarPuntoVenta(id);
  }

  // ── Domiciliarios ────────────────────────────────────────────────────
  @Get('domiciliarios')
  domiciliarios(@Query('todos') todos?: string, @Query('pdv') pdv?: string) {
    return this.svc.listarDomiciliarios(todos === '1', pdv);
  }

  @Post('domiciliarios')
  @Permisos('run_errands.editar')
  crearDomiciliario(
    @Body() body: { nombre: string; telefono?: string; cedula?: string; email?: string; puntoVentaId?: string | null },
  ) {
    return this.svc.crearDomiciliario(body);
  }

  @Put('domiciliarios/:id')
  @Permisos('run_errands.editar')
  actualizarDomiciliario(
    @Param('id') id: string,
    @Body()
    body: {
      nombre?: string; telefono?: string; cedula?: string; email?: string;
      puntoVentaId?: string | null; activo?: boolean;
    },
  ) {
    return this.svc.actualizarDomiciliario(id, body);
  }

  @Delete('domiciliarios/:id')
  @Permisos('run_errands.editar')
  eliminarDomiciliario(@Param('id') id: string) {
    return this.svc.eliminarDomiciliario(id);
  }

  @Post('domiciliarios/borrar-todos')
  @Permisos('run_errands.editar')
  borrarTodosDomiciliarios() {
    return this.svc.borrarTodosDomiciliarios();
  }

  @Post('domiciliarios/carga-masiva')
  @Permisos('run_errands.editar')
  cargaMasivaDomiciliarios(
    @Body() body: { filas: { nombre: string; telefono?: string; cedula?: string; email?: string; puntoVentaNombre?: string }[] },
  ) {
    if (!Array.isArray(body?.filas) || body.filas.length === 0) {
      throw new BadRequestException('No se recibieron filas para importar');
    }
    return this.svc.cargaMasivaDomiciliarios(body.filas);
  }

  // ── Clientes ─────────────────────────────────────────────────────────
  @Get('clientes')
  clientes(@Query('buscar') buscar?: string, @Query('todos') todos?: string) {
    return this.svc.listarClientes(buscar ?? '', todos === '1');
  }

  @Get('clientes/:id')
  cliente(@Param('id') id: string) {
    return this.svc.obtenerCliente(id);
  }

  @Post('clientes')
  @Permisos('run_errands.editar')
  crearCliente(
    @Body()
    body: {
      nombre: string; direccion?: string; referencia?: string; barrio?: string;
      ciudad?: string; region?: string; telefono?: string; email?: string; observaciones?: string;
    },
  ) {
    return this.svc.crearCliente(body);
  }

  @Put('clientes/:id')
  @Permisos('run_errands.editar')
  actualizarCliente(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      nombre: string; direccion: string; referencia: string; barrio: string; ciudad: string;
      region: string; telefono: string; email: string; observaciones: string; activo: boolean;
    }>,
  ) {
    return this.svc.actualizarCliente(id, body);
  }

  @Delete('clientes/:id')
  @Permisos('run_errands.editar')
  eliminarCliente(@Param('id') id: string) {
    return this.svc.eliminarCliente(id);
  }

  @Post('clientes/borrar-todos')
  @Permisos('run_errands.editar')
  borrarTodosClientes() {
    return this.svc.borrarTodosClientes();
  }

  @Post('clientes/carga-masiva')
  @Permisos('run_errands.editar')
  cargaMasivaClientes(
    @Body()
    body: {
      filas: {
        codigo?: string; nombre: string; direccion?: string; referencia?: string; barrio?: string;
        ciudad?: string; region?: string; telefono?: string; email?: string; observaciones?: string;
      }[];
    },
  ) {
    if (!Array.isArray(body?.filas) || body.filas.length === 0) {
      throw new BadRequestException('No se recibieron filas para importar');
    }
    return this.svc.cargaMasivaClientes(body.filas);
  }

  // ── Pedidos ──────────────────────────────────────────────────────────
  @Get('pedidos')
  pedidos(
    @Query('estado') estado?: string,
    @Query('pdv') pdv?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.svc.listarPedidos({ estado, pdv, desde, hasta });
  }

  @Get('pedidos-next-numero')
  siguienteNumero() {
    return this.svc.siguienteNumeroPedido().then((numeroPedido) => ({ numeroPedido }));
  }

  @Get('pedidos/:id')
  pedido(@Param('id') id: string) {
    return this.svc.obtenerPedido(id);
  }

  @Get('drivin-esquemas')
  esquemasDrivin() {
    return this.svc.listarEsquemasDrivin();
  }

  @Post('pedidos')
  @Permisos('run_errands.editar')
  crearPedidos(
    @Body()
    body: {
      pedidos?: {
        clienteId: string; puntoVentaId?: string | null; domiciliarioId?: string | null;
        kilos?: number; estado?: string; observaciones?: string; schemaName?: string;
      }[];
      clienteId?: string; puntoVentaId?: string | null; domiciliarioId?: string | null;
      kilos?: number; estado?: string; observaciones?: string; schemaName?: string;
    },
    @Req() req: Request & { user?: JwtPayload },
  ) {
    const esBatch = Array.isArray(body?.pedidos) && body.pedidos.length > 0;
    if (!esBatch && !body?.clienteId) throw new BadRequestException('Falta el cliente del pedido');
    const filas = esBatch ? body.pedidos! : [{ ...body, clienteId: body.clienteId! }];
    return this.svc
      .crearPedidos(filas, req.user?.cedula ?? null)
      .then((creados) => (esBatch ? { creados } : creados[0]));
  }

  @Put('pedidos/:id')
  @Permisos('run_errands.editar')
  actualizarPedido(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      clienteId: string; puntoVentaId: string | null; domiciliarioId: string | null;
      kilos: number; estado: string; observaciones: string; drivinSchemaName: string;
    }>,
  ) {
    return this.svc.actualizarPedido(id, body);
  }

  @Put('pedidos/:id/estado')
  @Permisos('run_errands.editar')
  cambiarEstado(@Param('id') id: string, @Body() body: { estado: string }) {
    return this.svc.cambiarEstadoPedido(id, body?.estado);
  }

  @Post('pedidos/:id/reenviar-drivin')
  @Permisos('run_errands.editar')
  reenviarDrivin(@Param('id') id: string) {
    return this.svc.reenviarDrivin(id);
  }

  @Post('pedidos/sync-drivin')
  @Permisos('run_errands.editar')
  syncDrivin(@Body() body: { desde: string; hasta: string }) {
    if (!body?.desde || !body?.hasta) throw new BadRequestException('Faltan las fechas desde/hasta');
    return this.svc.syncDrivin(body.desde, body.hasta);
  }

  @Delete('pedidos/:id')
  @Permisos('run_errands.editar')
  eliminarPedido(@Param('id') id: string) {
    return this.svc.eliminarPedido(id);
  }

  @Post('pedidos/borrar-todos')
  @Permisos('run_errands.editar')
  borrarTodosPedidos() {
    return this.svc.borrarTodosPedidos();
  }

  // ── Dashboard ────────────────────────────────────────────────────────
  @Get('dashboard')
  dashboard(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.svc.dashboard(desde, hasta);
  }
}
