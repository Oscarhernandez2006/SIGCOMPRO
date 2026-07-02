import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import { PG_POOL } from '../database/database.module';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { sanitizarPermisos } from './permisos.catalog';

export interface UsuarioRow {
  id: string;
  cedula: string;
  nombre: string;
  password_hash: string;
  rol: string;
  activo: boolean;
  creado_en: string;
  permisos: string[];
}

/** Usuario expuesto al cliente (sin el hash de la contraseña). */
export type UsuarioPublico = Omit<UsuarioRow, 'password_hash'>;

const COLUMNS_PUBLICAS = 'id, cedula, nombre, rol, activo, creado_en, permisos';

@Injectable()
export class UsersService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByCedula(cedula: string): Promise<UsuarioRow | null> {
    const res = await this.pool.query<UsuarioRow>(
      `SELECT id, cedula, nombre, password_hash, rol, activo, creado_en, permisos
       FROM usuarios
       WHERE cedula = $1
       LIMIT 1`,
      [cedula],
    );
    return res.rows[0] ?? null;
  }

  async listar(): Promise<UsuarioPublico[]> {
    const res = await this.pool.query<UsuarioPublico>(
      `SELECT ${COLUMNS_PUBLICAS}
       FROM usuarios
       ORDER BY creado_en DESC`,
    );
    return res.rows;
  }

  async obtener(id: string): Promise<UsuarioPublico> {
    const res = await this.pool.query<UsuarioPublico>(
      `SELECT ${COLUMNS_PUBLICAS} FROM usuarios WHERE id = $1 LIMIT 1`,
      [id],
    );
    const usuario = res.rows[0];
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return usuario;
  }

  async crear(dto: CreateUserDto): Promise<UsuarioPublico> {
    const cedula = dto.cedula.trim();
    const yaExiste = await this.findByCedula(cedula);
    if (yaExiste) {
      throw new ConflictException('Ya existe un usuario con esa cédula');
    }

    const passwordHash = bcrypt.hashSync(dto.password, 10);
    const res = await this.pool.query<UsuarioPublico>(
      `INSERT INTO usuarios (cedula, nombre, password_hash, rol, activo, permisos)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS_PUBLICAS}`,
      [
        cedula,
        dto.nombre.trim(),
        passwordHash,
        dto.rol?.trim() || 'operador',
        dto.activo ?? true,
        JSON.stringify(sanitizarPermisos(dto.permisos)),
      ],
    );
    return res.rows[0];
  }

  async actualizar(id: string, dto: UpdateUserDto): Promise<UsuarioPublico> {
    // Aseguramos que exista antes de actualizar.
    await this.obtener(id);

    // Si cambia la cédula, validamos que no choque con otro usuario.
    if (dto.cedula !== undefined) {
      const otro = await this.findByCedula(dto.cedula.trim());
      if (otro && otro.id !== id) {
        throw new ConflictException('Ya existe un usuario con esa cédula');
      }
    }

    const sets: string[] = [];
    const valores: unknown[] = [];
    let i = 1;

    if (dto.cedula !== undefined) {
      sets.push(`cedula = $${i++}`);
      valores.push(dto.cedula.trim());
    }
    if (dto.nombre !== undefined) {
      sets.push(`nombre = $${i++}`);
      valores.push(dto.nombre.trim());
    }
    if (dto.rol !== undefined) {
      sets.push(`rol = $${i++}`);
      valores.push(dto.rol.trim());
    }
    if (dto.activo !== undefined) {
      sets.push(`activo = $${i++}`);
      valores.push(dto.activo);
    }
    if (dto.password) {
      sets.push(`password_hash = $${i++}`);
      valores.push(bcrypt.hashSync(dto.password, 10));
    }
    if (dto.permisos !== undefined) {
      sets.push(`permisos = $${i++}`);
      valores.push(JSON.stringify(sanitizarPermisos(dto.permisos)));
    }

    if (sets.length === 0) {
      return this.obtener(id);
    }

    valores.push(id);
    const res = await this.pool.query<UsuarioPublico>(
      `UPDATE usuarios SET ${sets.join(', ')}
       WHERE id = $${i}
       RETURNING ${COLUMNS_PUBLICAS}`,
      valores,
    );
    return res.rows[0];
  }

  async eliminar(id: string): Promise<{ id: string }> {
    const res = await this.pool.query(`DELETE FROM usuarios WHERE id = $1`, [
      id,
    ]);
    if (res.rowCount === 0) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return { id };
  }
}
