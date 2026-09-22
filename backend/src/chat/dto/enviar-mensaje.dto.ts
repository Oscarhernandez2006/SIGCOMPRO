import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class EnviarMensajeDto {
  @IsNotEmpty()
  @IsString()
  destinatarioId!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(4000)
  contenido!: string;

  /** Id del mensaje al que se responde (opcional, tipo cita de WhatsApp). */
  @IsOptional()
  @IsString()
  respondeAId?: string;
}
