import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Restringe el acceso a la ruta a los roles indicados. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
