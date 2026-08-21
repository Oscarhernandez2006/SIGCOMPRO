import { IsBoolean, IsOptional } from 'class-validator';

/** Cambia el estado del usuario: activo y/o bloqueo por la suite. */
export class EstadoDto {
  @IsBoolean()
  @IsOptional()
  activo?: boolean;

  @IsBoolean()
  @IsOptional()
  bloqueadoSuite?: boolean;
}
