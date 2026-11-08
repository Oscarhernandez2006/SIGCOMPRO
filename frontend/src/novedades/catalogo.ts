/**
 * Novedades de SIGCOMPRO que se presentan a "administrador app" y
 * "desarrollador" la primera vez que entran tras una actualización.
 *
 * Al subir cambios: agregar una versión NUEVA al final (id único, p. ej. la
 * fecha "2026-11-08"; si hay dos el mismo día, "2026-11-08b"). Cada novedad
 * apunta a una animación de `components/novedades/demos` por su clave `demo`.
 * Los `pasos` de la animación resaltan los `puntos` por índice.
 */

export type DemoNovedad = "fundacion" | "validar-cedula" | "importar-excel" | "replicas" | "reenviar-drivin";

export interface Novedad {
  id: string;
  modulo: string;
  titulo: string;
  resumen: string;
  puntos: string[];
  nota?: string;
  demo: DemoNovedad;
}

export interface VersionNovedades {
  version: string;
  /** Fecha legible de la actualización. */
  fecha: string;
  novedades: Novedad[];
}

export const NOVEDADES: VersionNovedades[] = [
  {
    version: "2026-11-08",
    fecha: "8 de noviembre de 2026",
    novedades: [
      {
        id: "fundacion",
        modulo: "Clientes · Despacho",
        titulo: "Nueva clasificación: Fundación",
        resumen:
          "Los clientes ahora pueden ser Hogar, HORECA o Fundación. Las fundaciones reciben pedidos en sus direcciones alternas desde Despacho.",
        puntos: [
          "En Clientes → Editar, la sección Clasificación tiene la nueva opción «Fundación» (es excluyente con Hogar y HORECA).",
          "Al marcar el código original, TODAS sus direcciones alternas (NIT-1, NIT-2, …) quedan como fundación automáticamente. Si se desmarca, se quita de todas.",
          "En Despacho, el botón «Puntos de envío» ahora solo aparece en pedidos de clientes Fundación.",
        ],
        nota: "Las direcciones alternas que se creen después heredan la clasificación de su código original.",
        demo: "fundacion",
      },
      {
        id: "validar-cedula",
        modulo: "Clientes · Pedidos",
        titulo: "Validar cédula: aviso de posible estafa",
        resumen:
          "Cuando ADRES no encuentra la cédula, la validación ya no se queda cargando: avisa de inmediato y te deja corregirla.",
        puntos: [
          "Si la cédula no existe en ADRES, se muestra en rojo «no existe — posible estafa».",
          "Confirma el número con el cliente antes de continuar con el pedido.",
          "«Corregir la cédula» cierra la validación y vuelve al formulario para escribirla y validar otra vez.",
        ],
        nota: "Si ADRES no responde en 30 segundos, la consulta se cancela sola y puedes reintentar o escribir los datos a mano. Actualiza la extensión a la versión 1.9.0 cuando SIGCOMPRO lo pida.",
        demo: "validar-cedula",
      },
      {
        id: "importar-excel",
        modulo: "Clientes",
        titulo: "Importar Excel ahora sí aplica tus correcciones",
        resumen:
          "Descarga la base de clientes, corrígela en Excel y vuelve a subirla: los cambios se guardan.",
        puntos: [
          "Descarga el archivo con «Descargar Excel».",
          "Corrige lo que necesites: nombres, apellidos, dirección, teléfono, correo, HORECA, Fundación, días de despacho o Lat/Lng.",
          "Súbelo con «Importar DB»: se aplican todas las correcciones, incluso de mayúsculas y tildes.",
          "Si solo cambia el formato se conservan las coordenadas; si cambia la dirección, el cliente queda «sin verificar». El punto de venta no se modifica.",
        ],
        demo: "importar-excel",
      },
      {
        id: "replicas",
        modulo: "Despacho",
        titulo: "Réplicas en orden: una a la vez",
        resumen:
          "Para no acumular réplicas sin asignar en Drivin, la siguiente réplica se libera solo cuando la anterior ya fue asignada.",
        puntos: [
          "Mientras la réplica anterior esté «En espera» en Drivin, el botón de la siguiente queda bloqueado.",
          "Cuando Drivin la asigna (domiciliario o estado de entrega), se libera la siguiente réplica.",
          "Así cada réplica llega a Drivin en orden y nada queda sin asignar.",
        ],
        demo: "replicas",
      },
      {
        id: "reenviar-drivin",
        modulo: "Despacho",
        titulo: "«Reenviar a Drivin» solo para administración",
        resumen:
          "El reenvío manual de un pedido a Drivin quedó reservado para Administrador App y Desarrollador.",
        puntos: [
          "Los demás usuarios de Despacho ya no ven el botón «Reenviar a Drivin».",
          "Administrador App y Desarrollador lo siguen viendo cuando una comanda facturada no aparece en Drivin.",
          "El servidor también bloquea el reenvío si se intenta desde otro rol.",
        ],
        nota: "Los envíos automáticos a Drivin y las réplicas no cambian: siguen funcionando para todos.",
        demo: "reenviar-drivin",
      },
    ],
  },
];

/** Roles que ven las novedades. */
export const ROLES_NOVEDADES = ["administrador app", "desarrollador"];
