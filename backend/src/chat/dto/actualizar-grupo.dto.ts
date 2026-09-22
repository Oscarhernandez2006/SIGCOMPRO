import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class ActualizarGrupoDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;

  /** Imagen del grupo en base64 (o null para quitarla). */
  @IsOptional()
  imagen?: string | null;

  /** Ids de usuarios a agregar al grupo. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agregar?: string[];

  /** Ids de usuarios a quitar del grupo. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  quitar?: string[];
}
