import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SsoLoginDto } from './dto/sso-login.dto';
import { JwtAuthGuard, JwtPayload } from './guards/jwt-auth.guard';

/** Roles autorizados a ver/usar la clave dinámica (NO el "administrador" liso). */
const ROLES_CLAVE_DINAMICA = ['administrador app', 'desarrollador'];

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** Inicia sesión canjeando un ticket SSO emitido por la suite (SCTOOLS). */
  @Post('sso')
  @HttpCode(HttpStatus.OK)
  ssoLogin(@Body() dto: SsoLoginDto) {
    return this.authService.loginBySso(dto.ticket);
  }

  @Get('claves-dinamicas')
  @UseGuards(JwtAuthGuard)
  clavesDinamicas(@Req() req: Request & { user?: JwtPayload }) {
    this.exigirRolClave(req);
    return this.authService.clavesDinamicas();
  }

  @Post('clave-dinamica/verificar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  verificarClave(@Body() body: { puntoVentaId?: string; codigo?: string }) {
    // Cualquier usuario autenticado puede VERIFICAR un código de un punto: la
    // idea es que un operador ingrese el código que le dicta/muestra un
    // administrador para autorizar una acción sensible (ver el código sigue
    // siendo solo de admins). El código es de un solo uso por punto de venta.
    return this.authService.verificarClave(
      body?.puntoVentaId ?? '',
      body?.codigo ?? '',
    );
  }

  /** Solo "administrador app" y "desarrollador" pueden usar la clave dinámica. */
  private exigirRolClave(req: Request & { user?: JwtPayload }): void {
    const rol = (req.user?.rol ?? '').trim().toLowerCase();
    if (!ROLES_CLAVE_DINAMICA.includes(rol)) {
      throw new ForbiddenException('No autorizado');
    }
  }
}
