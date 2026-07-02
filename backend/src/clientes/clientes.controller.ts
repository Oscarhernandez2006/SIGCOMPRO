import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermisosGuard } from '../auth/guards/permisos.guard';
import { Permisos } from '../auth/decorators/permisos.decorator';

@Controller('clientes')
@UseGuards(JwtAuthGuard, PermisosGuard)
@Permisos('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  listar(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.clientes.listar(
      q,
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined,
    );
  }

  @Get('barrios')
  barrios(@Query('q') q?: string, @Query('ciudad') ciudad?: string) {
    return this.clientes.listarBarrios(q, ciudad);
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.clientes.obtener(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permisos('clientes.crear')
  crear(@Body() dto: CreateClienteDto) {
    return this.clientes.crear(dto);
  }

  /** Importa/actualiza clientes desde un Excel. */
  @Post('importar')
  @HttpCode(HttpStatus.OK)
  @Permisos('clientes.importar')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: 30 * 1024 * 1024 },
    }),
  )
  importar(@UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) {
      throw new BadRequestException('Adjunta el archivo Excel en el campo "archivo".');
    }
    return this.clientes.importarDesdeExcel(archivo.buffer);
  }

  @Patch(':id')
  @Permisos('clientes.editar', 'clientes.estado')
  actualizar(@Param('id') id: string, @Body() dto: UpdateClienteDto) {
    return this.clientes.actualizar(id, dto);
  }

  @Delete(':id')
  @Permisos('clientes.eliminar')
  eliminar(@Param('id') id: string) {
    return this.clientes.eliminar(id);
  }
}
