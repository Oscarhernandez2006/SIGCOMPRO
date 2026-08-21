import { Injectable, UnauthorizedException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  /** Periodo de rotación de la clave dinámica (segundos), tipo Nequi. */
  private static readonly PERIODO_CLAVE_S = 60;

  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const usuario = await this.users.findByCedula(dto.cedula.trim());

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (usuario.bloqueado_suite) {
      throw new UnauthorizedException(
        'Usuario bloqueado desde la suite. Contacte al administrador.',
      );
    }

    const passwordOk = bcrypt.compareSync(dto.password, usuario.password_hash);
    if (!passwordOk) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: usuario.id,
      cedula: usuario.cedula,
      rol: usuario.rol,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        cedula: usuario.cedula,
        rol: usuario.rol,
        permisos: usuario.permisos ?? [],
      },
    };
  }

  /**
   * Inicia sesión con un ticket SSO emitido por la suite (SCTOOLS).
   * El ticket se canjea server-to-server contra la suite, que devuelve la
   * cédula del usuario. Con esa cédula (clave común entre sistemas) se busca la
   * cuenta local y se emite un JWT propio de esta aplicación.
   */
  async loginBySso(ticket: string) {
    const issuerUrl = (
      this.config.get<string>('SSO_ISSUER_URL') ?? ''
    ).replace(/\/+$/, '');
    const sharedSecret = this.config.get<string>('SSO_SHARED_SECRET') ?? '';

    if (!issuerUrl || !sharedSecret) {
      throw new ServiceUnavailableException('SSO no está configurado');
    }

    let redeem: { cedula?: string };
    try {
      const res = await fetch(`${issuerUrl}/api/sso/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-SSO-Secret': sharedSecret,
        },
        body: JSON.stringify({ ticket }),
      });

      if (!res.ok) {
        throw new UnauthorizedException('Ticket SSO inválido o expirado');
      }

      redeem = (await res.json()) as { cedula?: string };
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.error(`No se pudo contactar la suite SSO: ${String(err)}`);
      throw new ServiceUnavailableException(
        'No se pudo validar la sesión con la suite',
      );
    }

    const cedula = (redeem.cedula ?? '').trim();
    if (!cedula) {
      throw new UnauthorizedException('Ticket SSO inválido');
    }

    const usuario = await this.users.findByCedula(cedula);
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'El usuario no está registrado en esta aplicación',
      );
    }

    if (usuario.bloqueado_suite) {
      throw new UnauthorizedException(
        'Usuario bloqueado desde la suite. Contacte al administrador.',
      );
    }

    const payload = {
      sub: usuario.id,
      cedula: usuario.cedula,
      rol: usuario.rol,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        cedula: usuario.cedula,
        rol: usuario.rol,
        permisos: usuario.permisos ?? [],
      },
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Clave dinámica (TOTP de 60 s) para autorizaciones de administradores    */
  /* ---------------------------------------------------------------------- */

  /** Secreto usado para derivar la clave dinámica (se queda en el servidor). */
  private secretoClave(): string {
    return (
      this.config.get<string>('CLAVE_DINAMICA_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'volando-carnes-clave-dinamica'
    );
  }

  /** Deriva un código de 6 dígitos (HOTP/RFC 4226) para un contador dado. */
  private codigoTotp(contador: number): string {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(contador));
    const hmac = crypto
      .createHmac('sha1', this.secretoClave())
      .update(buf)
      .digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binario =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(binario % 1_000_000).padStart(6, '0');
  }

  /**
   * Genera la clave dinámica vigente: un código de 6 dígitos que rota cada
   * 60 segundos (igual que la de Nequi). Devuelve además cuántos segundos le
   * quedan de vigencia para el contador regresivo del cliente.
   */
  claveDinamica(ahoraMs: number = Date.now()): {
    codigo: string;
    expiraEn: number;
    periodo: number;
  } {
    const periodo = AuthService.PERIODO_CLAVE_S;
    const segundos = Math.floor(ahoraMs / 1000);
    const contador = Math.floor(segundos / periodo);
    return {
      codigo: this.codigoTotp(contador),
      expiraEn: periodo - (segundos % periodo),
      periodo,
    };
  }

  /**
   * Verifica un código dinámico. Acepta el periodo actual y el anterior para
   * tolerar un pequeño desfase de reloj o que el minuto expire mientras se usa.
   */
  verificarClave(codigo: string, ahoraMs: number = Date.now()): boolean {
    const limpio = (codigo ?? '').replace(/\D/g, '');
    if (limpio.length !== 6) return false;
    const contador = Math.floor(ahoraMs / 1000 / AuthService.PERIODO_CLAVE_S);
    for (const c of [contador, contador - 1]) {
      const esperado = this.codigoTotp(c);
      if (
        crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(limpio))
      ) {
        return true;
      }
    }
    return false;
  }
}
