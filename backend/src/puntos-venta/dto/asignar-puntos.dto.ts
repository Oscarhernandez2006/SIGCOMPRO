import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class AsignarPuntosDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  puntoIds!: string[];
}
