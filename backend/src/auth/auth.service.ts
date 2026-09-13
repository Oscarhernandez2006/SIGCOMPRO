import { Inject, Injectable, UnauthorizedException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Pool } from 'pg';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
import { PG_POOL } from '../database/database.module';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    @Inject(PG_POOL) private readonly pool: Pool,
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
  /* Clave dinámica de un solo uso, por punto de venta                       */
  /* ---------------------------------------------------------------------- */

  /** Vigencia máxima de un código sin usar antes de rotar solo. */
  private static readonly DURACION_CLAVE_MS = 5 * 60 * 1000;

  /** Código vigente, el último ya consumido (para avisar "caducada") y su fecha de creación, por punto. */
  private readonly clavesPorPunto = new Map<
    string,
    { actual: string; anterior: string | null; creadaEn: number }
  >();

  private generarCodigoClave(): string {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private entradaClave(puntoVentaId: string): {
    actual: string;
    anterior: string | null;
    creadaEn: number;
  } {
    const ahora = Date.now();
    let entrada = this.clavesPorPunto.get(puntoVentaId);
    if (!entrada) {
      entrada = { actual: this.generarCodigoClave(), anterior: null, creadaEn: ahora };
      this.clavesPorPunto.set(puntoVentaId, entrada);
      return entrada;
    }
    // Si nadie la usó en 5 minutos, rota sola (igual que si se hubiera usado).
    if (ahora - entrada.creadaEn >= AuthService.DURACION_CLAVE_MS) {
      entrada.anterior = entrada.actual;
      entrada.actual = this.generarCodigoClave();
      entrada.creadaEn = ahora;
    }
    return entrada;
  }

  /** Lista la clave vigente de cada punto de venta activo (solo admins). */
  async clavesDinamicas(): Promise<
    {
      puntoVentaId: string;
      puntoVentaNombre: string;
      codigo: string;
      /** Segundos que le quedan antes de rotar sola (si nadie la usa). */
      expiraEn: number;
      /** Duración total del ciclo en segundos (300 = 5 min). */
      duracion: number;
    }[]
  > {
    const res = await this.pool.query<{ id: string; nombre: string }>(
      `SELECT id, nombre FROM puntos_venta WHERE activo = true ORDER BY nombre`,
    );
    const duracion = AuthService.DURACION_CLAVE_MS / 1000;
    return res.rows.map((p) => {
      const entrada = this.entradaClave(String(p.id));
      const restanteMs = AuthService.DURACION_CLAVE_MS - (Date.now() - entrada.creadaEn);
      return {
        puntoVentaId: String(p.id),
        puntoVentaNombre: p.nombre,
        codigo: entrada.actual,
        expiraEn: Math.max(0, Math.ceil(restanteMs / 1000)),
        duracion,
      };
    });
  }

  /**
   * Verifica el código dinámico de UN punto de venta. Es de un solo uso: al
   * validarse correctamente rota de inmediato a un código nuevo. Si alguien
   * reutiliza el código ya consumido, se avisa "caducada" (en vez de decir
   * simplemente "incorrecta") para que pida uno nuevo al administrador.
   */
  verificarClave(
    puntoVentaId: string,
    codigo: string,
  ): { valido: boolean; motivo?: 'caducada' | 'incorrecta' } {
    const limpio = (codigo ?? '').replace(/\D/g, '');
    if (!puntoVentaId || limpio.length !== 6) {
      return { valido: false, motivo: 'incorrecta' };
    }
    const entrada = this.entradaClave(puntoVentaId);
    if (crypto.timingSafeEqual(Buffer.from(entrada.actual), Buffer.from(limpio))) {
      entrada.anterior = entrada.actual;
      entrada.actual = this.generarCodigoClave();
      entrada.creadaEn = Date.now();
      return { valido: true };
    }
    if (
      entrada.anterior &&
      crypto.timingSafeEqual(Buffer.from(entrada.anterior), Buffer.from(limpio))
    ) {
      return { valido: false, motivo: 'caducada' };
    }
    return { valido: false, motivo: 'incorrecta' };
  }
}
