import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMotivoDto {
  @IsOptional()
  @IsIn(['anular', 'cancelar'])
  tipo?: 'anular' | 'cancelar';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
