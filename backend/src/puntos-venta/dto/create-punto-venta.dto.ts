import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePuntoVentaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  codigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lista_precio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  barrio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ciudad?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dom_km_base?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dom_valor_base?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dom_valor_km?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dom_gratis_desde?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dom_gratis_margen?: number;

  @IsOptional()
  @IsBoolean()
  drivin?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  drivin_schema_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  drivin_localidad?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
