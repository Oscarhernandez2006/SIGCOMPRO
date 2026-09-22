import { ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CrearGrupoDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  nombre!: string;

  /** Imagen del grupo en base64 (con prefijo data:<mime>;base64,...), opcional. */
  @IsOptional()
  @IsString()
  imagen?: string;

  /** Ids de los usuarios participantes (sin contar al creador, que se agrega solo). */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  miembros!: string[];
}
