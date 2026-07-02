import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class AsignarUsuariosDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  usuarioIds!: string[];
}
