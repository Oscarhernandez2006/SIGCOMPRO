import { IsArray, IsOptional, IsString } from 'class-validator';

/** Define el rol y/o los módulos (permisos) de un usuario desde la suite. */
export class PermisosDto {
  @IsString()
  @IsOptional()
  rol?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permisos?: string[];
}
