import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class EnviarMensajeGrupoDto {
  /** Puede ir vacío si el mensaje es solo un adjunto (foto/video/archivo). */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  contenido?: string;

  /** Id del mensaje al que se responde (opcional, tipo cita de WhatsApp). */
  @IsOptional()
  @IsString()
  respondeAId?: string;

  /** Adjunto en base64 (con prefijo data:<mime>;base64,...). */
  @IsOptional()
  @IsString()
  adjuntoData?: string;

  @IsOptional()
  @IsString()
  adjuntoMime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  adjuntoNombre?: string;

  @IsOptional()
  @IsIn(['imagen', 'video', 'archivo'])
  adjuntoTipo?: 'imagen' | 'video' | 'archivo';
}
