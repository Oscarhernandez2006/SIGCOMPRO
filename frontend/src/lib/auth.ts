/**
 * Utilidades de autenticación y roles (lado cliente).
 *
 * Los roles funcionan como un identificador del usuario, no como una forma
 * de asignar permisos particulares: los permisos se definen por usuario.
 * Excepción: los roles "administrador" y "desarrollador" tienen acceso a
 * todos los módulos y a todos sus permisos.
 */

export interface Usuario {
  id: string;
  nombre: string;
  cedula: string;
  rol: string;
  permisos?: string[];
}

/** Roles que tienen acceso total (todos los módulos y permisos). */
export const ROLES_ADMINISTRATIVOS = [
  "administrador",
  "administrador app",
  "desarrollador",
] as const;

/** Indica si un rol tiene acceso al panel administrativo (acceso total). */
export function tieneAccesoAdministrativo(rol?: string | null): boolean {
  return ROLES_ADMINISTRATIVOS.includes(
    (rol ?? "").trim().toLowerCase() as (typeof ROLES_ADMINISTRATIVOS)[number],
  );
}

/* -------------------------------------------------------------------------- */
/* Sesión en cookies (no se usa localStorage en ninguna parte del ecosistema) */
/* -------------------------------------------------------------------------- */

const COOKIE_TOKEN = "vc_token";
const COOKIE_USUARIO = "vc_usuario";
/** Duración de la cookie en segundos (1 día, igual que el JWT). */
const COOKIE_MAX_AGE = 60 * 60 * 24;

function escribirCookie(nombre: string, valor: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${nombre}=${encodeURIComponent(
    valor,
  )}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

function leerCookie(nombre: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${nombre}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function borrarCookie(nombre: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${nombre}=; path=/; max-age=0; samesite=lax`;
}

/** Guarda la sesión (token + usuario) tras el login. */
export function guardarSesion(token: string, usuario: Usuario): void {
  escribirCookie(COOKIE_TOKEN, token);
  escribirCookie(COOKIE_USUARIO, JSON.stringify(usuario));
}

/** Lee el token de acceso almacenado. */
export function getToken(): string | null {
  return leerCookie(COOKIE_TOKEN);
}

/** Lee el usuario almacenado tras el login. */
export function getUsuario(): Usuario | null {
  const raw = leerCookie(COOKIE_USUARIO);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Usuario;
  } catch {
    return null;
  }
}

/** Borra la sesión almacenada. */
export function limpiarSesion(): void {
  borrarCookie(COOKIE_TOKEN);
  borrarCookie(COOKIE_USUARIO);
}
