import { apiFetch } from "./api";

export interface Usuario {
  id: string;
  cedula: string;
  nombre: string;
  rol: string;
  activo: boolean;
  creado_en: string;
  permisos: string[];
}

export interface CrearUsuarioInput {
  cedula: string;
  nombre: string;
  password: string;
  rol?: string;
  activo?: boolean;
  permisos?: string[];
}

export interface ActualizarUsuarioInput {
  cedula?: string;
  nombre?: string;
  password?: string;
  rol?: string;
  activo?: boolean;
  permisos?: string[];
}

/** Roles disponibles para asignar a los usuarios. */
export const ROLES_SUGERIDOS = [
  "Gerente",
  "Administrador pdv",
  "Administrador app",
  "Supervisor",
  "Televendedor",
  "Asesor Comercial",
  "Despacho",
  "Desarrollador",
] as const;

/**
 * Catálogo de apartados y módulos. Debe mantenerse alineado con el backend
 * (backend/src/users/permisos.catalog.ts).
 */
export interface AccionCatalogo {
  key: string;
  label: string;
}
export interface ModuloCatalogo {
  key: string;
  label: string;
  /** Acciones granulares (sub-permisos) que afectan/modifican datos. */
  acciones?: AccionCatalogo[];
}
export interface ApartadoCatalogo {
  key: string;
  label: string;
  modulos: ModuloCatalogo[];
}

export const CATALOGO_PERMISOS: ApartadoCatalogo[] = [
  {
    key: "operativo",
    label: "Módulos operativos",
    modulos: [
      {
        key: "pedidos",
        label: "Pedidos",
        acciones: [
          { key: "pedidos.crear", label: "Crear pedido" },
          { key: "pedidos.editar", label: "Editar pedido" },
          { key: "pedidos.anular", label: "Anular pedido" },
          { key: "pedidos.imprimir", label: "Reimprimir comanda / Excel" },
          { key: "pedidos.clonar", label: "Clonar pedido" },
          { key: "pedidos.sincronizar", label: "Sincronizar lista de precios" },
          { key: "pedidos.multipunto", label: "Ver y cambiar entre varios puntos de venta (Pedidos y Despacho)" },
        ],
      },
      {
        key: "despacho",
        label: "Despacho",
        acciones: [
          { key: "despacho.estado", label: "Cambiar estado del pedido" },
          { key: "despacho.pago", label: "Cambiar método de pago / liberar cartera" },
        ],
      },
      {
        key: "historicos",
        label: "Históricos",
      },
      {
        key: "clientes",
        label: "Clientes",
        acciones: [
          { key: "clientes.crear", label: "Crear cliente" },
          { key: "clientes.editar", label: "Editar cliente" },
          { key: "clientes.eliminar", label: "Eliminar cliente" },
          { key: "clientes.estado", label: "Activar / desactivar cliente" },
          { key: "clientes.importar", label: "Importar clientes (Excel)" },
        ],
      },
      {
        key: "dashboard",
        label: "Dashboard",
      },
      {
        key: "cuadre_caja",
        label: "Cuadre de caja",
      },
      {
        key: "cotizaciones",
        label: "Cotizaciones",
        acciones: [
          { key: "cotizaciones.crear", label: "Crear cotización" },
          { key: "cotizaciones.editar", label: "Editar cotización" },
          { key: "cotizaciones.eliminar", label: "Eliminar cotización" },
          { key: "cotizaciones.convertir", label: "Convertir cotización en pedido" },
        ],
      },
    ],
  },
];

export function listarUsuarios(): Promise<Usuario[]> {
  return apiFetch<Usuario[]>("/usuarios");
}

export function crearUsuario(input: CrearUsuarioInput): Promise<Usuario> {
  return apiFetch<Usuario>("/usuarios", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function actualizarUsuario(
  id: string,
  input: ActualizarUsuarioInput,
): Promise<Usuario> {
  return apiFetch<Usuario>(`/usuarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function eliminarUsuario(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/usuarios/${id}`, {
    method: "DELETE",
  });
}
