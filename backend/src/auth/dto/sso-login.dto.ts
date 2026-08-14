import { IsString, MinLength } from 'class-validator';

/** Ticket SSO de un solo uso emitido por la suite (SCTOOLS). */
export class SsoLoginDto {
  @IsString()
  @MinLength(10)
  ticket: string;
}
