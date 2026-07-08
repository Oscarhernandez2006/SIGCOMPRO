import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMotivoDto {
  @IsIn(['anular', 'cancelar'])
  tipo!: 'anular' | 'cancelar';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
