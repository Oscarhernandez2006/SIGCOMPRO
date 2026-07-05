/**
 * Catálogo de apartados y módulos del sistema.
 *
 * Un apartado agrupa módulos. A cada usuario se le asignan módulos concretos
 * (por su `key`). Más adelante cada módulo podrá tener características/permisos
 * más finos. Los roles con acceso total ignoran esta asignación.
 */

export interface ModuloCatalogo {
  key: string;
  label: string;
  /** Acciones granulares (sub-permisos) que afectan/modifican datos del módulo. */
  acciones?: { key: string; label: string }[];
}

export interface ApartadoCatalogo {
  key: string;
  label: string;
  modulos: ModuloCatalogo[];
}

export const CATALOGO_PERMISOS: ApartadoCatalogo[] = [
  {
    key: 'operativo',
    label: 'Módulos operativos',
    modulos: [
      {
        key: 'pedidos',
        label: 'Pedidos',
        acciones: [
          { key: 'pedidos.crear', label: 'Crear pedido' },
          { key: 'pedidos.editar', label: 'Editar pedido' },
          { key: 'pedidos.anular', label: 'Anular pedido' },
          { key: 'pedidos.imprimir', label: 'Reimprimir comanda / Excel' },
          { key: 'pedidos.clonar', label: 'Clonar pedido' },
          {
            key: 'pedidos.sincronizar',
            label: 'Sincronizar lista de precios',
          },
        ],
      },
      {
        key: 'despacho',
        label: 'Despacho',
        acciones: [
          { key: 'despacho.estado', label: 'Cambiar estado del pedido' },
          { key: 'despacho.pago', label: 'Cambiar método de pago / liberar cartera' },
        ],
      },
      {
        key: 'historicos',
        label: 'Históricos',
      },
      {
        key: 'clientes',
        label: 'Clientes',
        acciones: [
          { key: 'clientes.crear', label: 'Crear cliente' },
          { key: 'clientes.editar', label: 'Editar cliente' },
          { key: 'clientes.eliminar', label: 'Eliminar cliente' },
          { key: 'clientes.estado', label: 'Activar / desactivar cliente' },
          { key: 'clientes.importar', label: 'Importar clientes (Excel)' },
        ],
      },
    ],
  },
];

/** Conjunto de claves de módulo válidas (controlan navegación/visibilidad). */
export const MODULOS_VALIDOS: string[] = CATALOGO_PERMISOS.flatMap((a) =>
  a.modulos.map((m) => m.key),
);

/** Conjunto de todas las claves de permiso válidas: módulos + acciones. */
export const PERMISOS_VALIDOS: string[] = CATALOGO_PERMISOS.flatMap((a) =>
  a.modulos.flatMap((m) => [m.key, ...(m.acciones ?? []).map((x) => x.key)]),
);

/** Filtra una lista de permisos dejando solo claves válidas y únicas. */
export function sanitizarPermisos(permisos: string[] | undefined): string[] {
  if (!Array.isArray(permisos)) return [];
  const validos = permisos.filter((p) => PERMISOS_VALIDOS.includes(p));
  return Array.from(new Set(validos));
}

/** Roles con acceso total: ignoran la asignación de módulos. */
export const ROLES_ACCESO_TOTAL = [
  'administrador',
  'administrador app',
  'desarrollador',
];

/** ¿El rol indicado tiene acceso total a todos los módulos? */
export function tieneAccesoTotal(rol: string | undefined): boolean {
  return ROLES_ACCESO_TOTAL.includes((rol ?? '').trim().toLowerCase());
}
