import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';
import { SharedSecretGuard } from './guards/shared-secret.guard';
import { ProvisionUsuarioDto } from './dto/provision-usuario.dto';
import { EstadoDto } from './dto/estado.dto';
import { PasswordDto } from './dto/password.dto';
import { PermisosDto } from './dto/permisos.dto';

/**
 * API de aprovisionamiento invocada por la suite (server-to-server).
 * Protegida por el secreto compartido (SharedSecretGuard), sin sesión de
 * usuario. Prefijo global de la app: /api → estas rutas viven en
 * /api/provisioning/...
 */
@Controller('provisioning')
@UseGuards(SharedSecretGuard)
export class ProvisioningController {
  constructor(private readonly provisioning: ProvisioningService) {}

  /** Roles sugeridos y catálogo de módulos/permisos para la UI de la suite. */
  @Get('catalogo')
  catalogo() {
    return this.provisioning.catalogo();
  }

  /** Lista todos los usuarios (para importarlos/reflejarlos en la suite). */
  @Get('usuarios')
  listar() {
    return this.provisioning.listarUsuarios();
  }

  @Get('usuarios/:cedula')
  obtener(@Param('cedula') cedula: string) {
    return this.provisioning.obtenerPorCedula(cedula);
  }

  /** Crea o actualiza (upsert por cédula) un usuario. */
  @Post('usuarios')
  @HttpCode(HttpStatus.OK)
  upsert(@Body() dto: ProvisionUsuarioDto) {
    return this.provisioning.upsertUsuario(dto);
  }

  @Patch('usuarios/:cedula/estado')
  setEstado(@Param('cedula') cedula: string, @Body() dto: EstadoDto) {
    return this.provisioning.setEstado(cedula, dto.activo, dto.bloqueadoSuite);
  }

  @Patch('usuarios/:cedula/password')
  setPassword(@Param('cedula') cedula: string, @Body() dto: PasswordDto) {
    return this.provisioning.setPassword(cedula, dto.password);
  }

  @Patch('usuarios/:cedula/permisos')
  setPermisos(@Param('cedula') cedula: string, @Body() dto: PermisosDto) {
    return this.provisioning.setPermisos(cedula, dto.rol, dto.permisos);
  }
}
