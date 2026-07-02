import { SetMetadata } from '@nestjs/common';

export const PERMISOS_KEY = 'permisos';

/**
 * Restringe el acceso a la ruta a los usuarios que tengan asignado al menos
 * uno de los módulos indicados. Los roles con acceso total lo ignoran.
 */
export const Permisos = (...modulos: string[]) =>
  SetMetadata(PERMISOS_KEY, modulos);
