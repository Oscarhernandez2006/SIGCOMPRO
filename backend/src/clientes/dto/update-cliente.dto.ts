import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateClienteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  nit_cedula?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  apellidos?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  referencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  barrio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ciudad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  correo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  punto_venta?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsBoolean()
  horeca?: boolean;

  @IsOptional()
  @IsBoolean()
  direccion_incorrecta?: boolean;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  /** Días en que se puede despachar al cliente HORECA (lun..dom). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dias_despacho?: string[];
}
