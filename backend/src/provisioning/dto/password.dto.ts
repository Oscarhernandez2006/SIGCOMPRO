import { IsString, MinLength } from 'class-validator';

/** Restablece la contraseña de un usuario desde la suite. */
export class PasswordDto {
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;
}
