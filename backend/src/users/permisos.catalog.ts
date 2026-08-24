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
          { key: 'pedidos.cancelar', label: 'Cancelar pedido' },
          { key: 'pedidos.imprimir', label: 'Reimprimir comanda / Excel' },
          { key: 'pedidos.clonar', label: 'Clonar pedido' },
          {
            key: 'pedidos.sincronizar',
            label: 'Sincronizar lista de precios',
          },
          {
            key: 'pedidos.multipunto',
            label: 'Ver y cambiar entre varios puntos de venta (Pedidos y Despacho)',
          },
        ],
      },
      {
        key: 'despacho',
        label: 'Despacho',
        acciones: [
          {
            key: 'despacho.estado',
            label: 'Cambiar estado (cualquiera)',
          },
          {
            key: 'despacho.estado.proceso',
            label: "Devolver a 'En proceso'",
          },
          {
            key: 'despacho.estado.produccion',
            label: "Colocar en 'En producción'",
          },
          {
            key: 'despacho.estado.alistado',
            label: "Colocar en 'Alistado'",
          },
          {
            key: 'despacho.estado.facturado',
            label: "Facturar (colocar en 'Facturado')",
          },
          {
            key: 'despacho.estado.despachado',
            label: "Despachar (colocar en 'Despachado')",
          },
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
      {
        key: 'dashboard',
        label: 'Dashboard',
      },
      {
        key: 'cuadre_caja',
        label: 'Cuadre de caja',
      },
      {
        key: 'cotizaciones',
        label: 'Cotizaciones',
        acciones: [
          { key: 'cotizaciones.crear', label: 'Crear cotización' },
          { key: 'cotizaciones.editar', label: 'Editar cotización' },
          { key: 'cotizaciones.eliminar', label: 'Eliminar cotización' },
          {
            key: 'cotizaciones.convertir',
            label: 'Convertir cotización en pedido',
          },
        ],
      },
      {
        key: 'lista_precios',
        label: 'Lista de precios',
      },
      {
        key: 'mi_resumen',
        label: 'Mi resumen',
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
  'gerencia',
  'gerente',
];

/** ¿El rol indicado tiene acceso total a todos los módulos? */
export function tieneAccesoTotal(rol: string | undefined): boolean {
  return ROLES_ACCESO_TOTAL.includes((rol ?? '').trim().toLowerCase());
}
