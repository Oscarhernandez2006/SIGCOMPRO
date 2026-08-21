import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PG_POOL } from '../database/database.module';
import {
  CATALOGO_PERMISOS,
  ROLES_ACCESO_TOTAL,
  sanitizarPermisos,
} from '../users/permisos.catalog';
import { ProvisionUsuarioDto } from './dto/provision-usuario.dto';

/** Roles sugeridos para la UI de la suite (el campo `rol` es texto libre). */
const ROLES_SUGERIDOS = [
  'administrador',
  'administrador app',
  'desarrollador',
  'gerente',
  'gerencia',
  'facturador',
  'despachador',
  'operador',
  'televentas',
];

const COLUMNS_PUBLICAS =
  'id, cedula, nombre, rol, activo, bloqueado_suite, creado_en, permisos';

export interface UsuarioProvisionado {
  id: string;
  cedula: string;
  nombre: string;
  rol: string;
  activo: boolean;
  bloqueado_suite: boolean;
  creado_en: string;
  permisos: string[];
}

/**
 * Aprovisionamiento de usuarios controlado por la suite (SCTOOLS).
 * Crea/actualiza usuarios, cambia estado (activo/bloqueo), contraseña y
 * permisos escribiendo directamente en la BD de esta aplicación. La suite es la
 * fuente de verdad; aquí solo se refleja.
 */
@Injectable()
export class ProvisioningService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    // Bandera de bloqueo desde la suite: si es true, el usuario no puede
    // iniciar sesión en esta app aunque `activo` sea true.
    await this.pool.query(
      `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_suite boolean NOT NULL DEFAULT false`,
    );
  }

  /** Catálogo de roles sugeridos y módulos/permisos para la UI de la suite. */
  catalogo() {
    return {
      roles: ROLES_SUGERIDOS,
      rolesAccesoTotal: ROLES_ACCESO_TOTAL,
      permisos: CATALOGO_PERMISOS,
    };
  }

  private async buscarPorCedula(
    cedula: string,
  ): Promise<UsuarioProvisionado | null> {
    const res = await this.pool.query<UsuarioProvisionado>(
      `SELECT ${COLUMNS_PUBLICAS} FROM usuarios WHERE cedula = $1 LIMIT 1`,
      [cedula],
    );
    return res.rows[0] ?? null;
  }

  async obtenerPorCedula(cedula: string): Promise<UsuarioProvisionado> {
    const usuario = await this.buscarPorCedula(cedula.trim());
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return usuario;
  }

  /** Crea o actualiza (upsert por cédula) un usuario. */
  async upsertUsuario(dto: ProvisionUsuarioDto): Promise<UsuarioProvisionado> {
    const cedula = dto.cedula.trim();
    if (!cedula) {
      throw new BadRequestException('La cédula es obligatoria');
    }

    const permisos =
      dto.permisos !== undefined
        ? JSON.stringify(sanitizarPermisos(dto.permisos))
        : undefined;

    const existente = await this.buscarPorCedula(cedula);

    if (existente) {
      const sets: string[] = [];
      const valores: unknown[] = [];
      let i = 1;

      if (dto.nombre !== undefined) {
        sets.push(`nombre = $${i++}`);
        valores.push(dto.nombre.trim());
      }
      if (dto.rol !== undefined) {
        sets.push(`rol = $${i++}`);
        valores.push(dto.rol.trim() || 'operador');
      }
      if (dto.activo !== undefined) {
        sets.push(`activo = $${i++}`);
        valores.push(dto.activo);
      }
      if (permisos !== undefined) {
        sets.push(`permisos = $${i++}`);
        valores.push(permisos);
      }
      if (dto.password) {
        sets.push(`password_hash = $${i++}`);
        valores.push(bcrypt.hashSync(dto.password, 10));
      }

      if (sets.length === 0) {
        return existente;
      }

      valores.push(cedula);
      const res = await this.pool.query<UsuarioProvisionado>(
        `UPDATE usuarios SET ${sets.join(', ')}
         WHERE cedula = $${i}
         RETURNING ${COLUMNS_PUBLICAS}`,
        valores,
      );
      return res.rows[0];
    }

    // Alta: si no llega contraseña se genera una aleatoria (el usuario entra
    // por SSO desde la suite; puede cambiarla luego).
    const passwordHash = bcrypt.hashSync(
      dto.password && dto.password.length
        ? dto.password
        : crypto.randomBytes(24).toString('hex'),
      10,
    );

    const res = await this.pool.query<UsuarioProvisionado>(
      `INSERT INTO usuarios (cedula, nombre, password_hash, rol, activo, permisos)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS_PUBLICAS}`,
      [
        cedula,
        (dto.nombre ?? '').trim() || cedula,
        passwordHash,
        (dto.rol ?? '').trim() || 'operador',
        dto.activo ?? true,
        permisos ?? '[]',
      ],
    );
    return res.rows[0];
  }

  /** Cambia estado (activo) y/o bloqueo por la suite. */
  async setEstado(
    cedula: string,
    activo?: boolean,
    bloqueadoSuite?: boolean,
  ): Promise<UsuarioProvisionado> {
    const sets: string[] = [];
    const valores: unknown[] = [];
    let i = 1;

    if (activo !== undefined) {
      sets.push(`activo = $${i++}`);
      valores.push(activo);
    }
    if (bloqueadoSuite !== undefined) {
      sets.push(`bloqueado_suite = $${i++}`);
      valores.push(bloqueadoSuite);
    }

    if (sets.length === 0) {
      return this.obtenerPorCedula(cedula);
    }

    valores.push(cedula.trim());
    const res = await this.pool.query<UsuarioProvisionado>(
      `UPDATE usuarios SET ${sets.join(', ')}
       WHERE cedula = $${i}
       RETURNING ${COLUMNS_PUBLICAS}`,
      valores,
    );
    if (!res.rows[0]) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return res.rows[0];
  }

  /** Restablece la contraseña. */
  async setPassword(
    cedula: string,
    password: string,
  ): Promise<UsuarioProvisionado> {
    const res = await this.pool.query<UsuarioProvisionado>(
      `UPDATE usuarios SET password_hash = $1
       WHERE cedula = $2
       RETURNING ${COLUMNS_PUBLICAS}`,
      [bcrypt.hashSync(password, 10), cedula.trim()],
    );
    if (!res.rows[0]) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return res.rows[0];
  }

  /** Define rol y/o módulos (permisos). */
  async setPermisos(
    cedula: string,
    rol?: string,
    permisos?: string[],
  ): Promise<UsuarioProvisionado> {
    const sets: string[] = [];
    const valores: unknown[] = [];
    let i = 1;

    if (rol !== undefined) {
      sets.push(`rol = $${i++}`);
      valores.push(rol.trim() || 'operador');
    }
    if (permisos !== undefined) {
      sets.push(`permisos = $${i++}`);
      valores.push(JSON.stringify(sanitizarPermisos(permisos)));
    }

    if (sets.length === 0) {
      return this.obtenerPorCedula(cedula);
    }

    valores.push(cedula.trim());
    const res = await this.pool.query<UsuarioProvisionado>(
      `UPDATE usuarios SET ${sets.join(', ')}
       WHERE cedula = $${i}
       RETURNING ${COLUMNS_PUBLICAS}`,
      valores,
    );
    if (!res.rows[0]) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return res.rows[0];
  }
}
