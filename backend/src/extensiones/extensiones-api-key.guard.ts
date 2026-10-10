import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

/** API externa de extensiones: cabecera `X-API-Key` contra `EXTENSIONES_API_KEY`. */
@Injectable()
export class ExtensionesApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const clave = this.config.get<string>('EXTENSIONES_API_KEY') ?? '';
    if (!clave) {
      throw new ServiceUnavailableException('La API externa de extensiones no está configurada');
    }
    const req = context.switchToHttp().getRequest<Request>();
    // También acepta ?apiKey= para poder probar desde el navegador.
    const recibida = String(req.headers['x-api-key'] ?? req.query['apiKey'] ?? '');
    const a = Buffer.from(recibida);
    const b = Buffer.from(clave);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('No autorizado');
    }
    return true;
  }
}
