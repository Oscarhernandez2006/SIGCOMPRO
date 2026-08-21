import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Alta/actualización (upsert) de un usuario emitida por la suite.
 * La clave común entre sistemas es la cédula.
 */
export class ProvisionUsuarioDto {
  @IsString()
  @IsNotEmpty({ message: 'La cédula es obligatoria' })
  cedula: string;

  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  rol?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;

  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @IsOptional()
  password?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permisos?: string[];
}
