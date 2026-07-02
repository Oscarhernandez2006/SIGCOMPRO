import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISOS_KEY } from '../decorators/permisos.decorator';
import { JwtPayload } from './jwt-auth.guard';
import { UsersService } from '../../users/users.service';
import { tieneAccesoTotal } from '../../users/permisos.catalog';

/**
 * Comprueba que el usuario autenticado tenga asignado alguno de los módulos
 * requeridos por la ruta. Los roles con acceso total siempre pasan.
 *
 * Los permisos se leen desde la base de datos en cada petición, de modo que
 * un cambio de permisos surte efecto sin necesidad de volver a iniciar sesión.
 */
@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISOS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<
      Request & { user?: JwtPayload }
    >();
    const user = req.user;

    // Los roles con acceso total ignoran la asignación de módulos.
    if (tieneAccesoTotal(user?.rol)) {
      return true;
    }

    if (!user?.sub) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }

    const usuario = await this.users.obtener(user.sub);
    const permisos = usuario.permisos ?? [];
    const permitido = required.some((modulo) => permisos.includes(modulo));

    if (!permitido) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    return true;
  }
}
