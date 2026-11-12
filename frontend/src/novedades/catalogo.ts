/**
 * Novedades de SIGCOMPRO que se presentan a "administrador app" y
 * "desarrollador" la primera vez que entran tras una actualización.
 *
 * Al subir cambios: agregar una versión NUEVA al final (id único, p. ej. la
 * fecha "2026-11-08"; si hay dos el mismo día, "2026-11-08b"). Cada novedad
 * apunta a una animación de `components/novedades/demos` por su clave `demo`.
 * Los `pasos` de la animación resaltan los `puntos` por índice.
 */

export type DemoNovedad =
  | "fundacion"
  | "validar-cedula"
  | "importar-excel"
  | "replicas"
  | "reenviar-drivin"
  | "menu-perfil"
  | "kilos-comanda"
  | "orden-alternas"
  | "no-gestionado"
  | "sync-direcciones"
  | "cerrar-scroll"
  | "filtro-posteriores"
  | "tipo-factura"
  | "aviso-riesgo"
  | "responsable-auto";

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
  {
    version: "2026-11-09",
    fecha: "9 de noviembre de 2026",
    novedades: [
      {
        id: "menu-perfil",
        modulo: "General",
        titulo: "Vuelve a ver las novedades cuando quieras",
        resumen: "El menú de perfil tiene la opción «Novedades» para repasar, por fecha, las funciones nuevas con sus animaciones.",
        puntos: [
          "Haz clic en tu avatar (las iniciales arriba a la derecha).",
          "En el menú que se abre, elige «Novedades»: aparece la lista de actualizaciones por fecha.",
          "Selecciona la fecha que quieres repasar y se muestran solo las novedades de ese día, con su animación.",
        ],
        demo: "menu-perfil",
      },
      {
        id: "kilos-comanda",
        modulo: "Pedidos · Despacho",
        titulo: "Total de kilos en la comanda",
        resumen: "La comanda impresa ahora muestra cuántos kilos lleva el pedido en total, en kilos y en libras.",
        puntos: [
          "Imprime la comanda como siempre.",
          "Debajo del Total en pesos sale la línea «Total kilos».",
          "Suma los productos por kilo y el peso de los de unidad (según su descripción o el peso variable digitado).",
        ],
        nota: "Si el pedido no tiene productos con peso, la línea no se imprime.",
        demo: "kilos-comanda",
      },
      {
        id: "orden-alternas",
        modulo: "Pedidos · Clientes",
        titulo: "Direcciones alternas en orden",
        resumen: "Al buscar por cédula o NIT, el código original y sus direcciones alternas salen en orden numérico.",
        puntos: [
          "Digita la cédula o el NIT en Nuevo pedido o en el menú Clientes.",
          "Primero sale el código original y después sus alternas: -1, -2, -3…",
          "La -10 ya no aparece pegada a la -1: va después de la -9, como debe ser.",
        ],
        nota: "Si buscas por nombre se sigue ordenando por nombre, y dentro del mismo nombre las alternas también van en orden.",
        demo: "orden-alternas",
      },
      {
        id: "no-gestionado",
        modulo: "Despacho · Administración",
        titulo: "Marcar pedidos no gestionados e informe de incumplimientos",
        resumen:
          "Al cierre del turno puedes registrar los pedidos que quedaron sin gestionar, asignarlos al responsable y generar un informe PDF con la evidencia.",
        puntos: [
          "Desde las 8:00 p. m., los pedidos sin finalizar (pendientes, atrasados, retenidos, en producción, alistados, facturados, despachados o en tránsito) muestran la bandera «Marcar no gestionado» en la esquina de la fila.",
          "Eliges a la persona responsable del punto, el motivo y describes lo ocurrido. Se guarda una foto de la fila y una copia fija del pedido.",
          "El pedido queda sellado con la bandera roja «No gestionado» ese día (no se puede marcar dos veces).",
          "En el avatar → «Incumplimientos del personal» eliges a la persona, filtras el periodo y generas el informe PDF para gerencia.",
        ],
        nota: "Solo Administrador App y Desarrollador pueden marcar pedidos y ver los informes.",
        demo: "no-gestionado",
      },
      {
        id: "sync-direcciones",
        modulo: "Direcciones",
        titulo: "Direcciones sincronizadas con Drivin",
        resumen:
          "Importa el Excel exportado de Drivin, corrige en SIGCOMPRO y exporta para volver a cargarlo a Drivin.",
        puntos: [
          "«Importar Excel» con el archivo exportado de Drivin.",
          "Los códigos nuevos entran sin amarillo; los existentes sin corregir se actualizan con lo de Drivin y los corregidos (amarillos) se respetan.",
          "Las direcciones que ya no vienen en Drivin se eliminan, previa confirmación con el conteo.",
          "Al terminar de corregir, «Exportar Excel» genera el archivo con las 66 columnas para cargarlo a Drivin.",
        ],
        nota: "Importa siempre el export COMPLETO de Drivin: si el archivo trae solo una parte, las demás se eliminarían.",
        demo: "sync-direcciones",
      },
      {
        id: "cerrar-scroll",
        modulo: "Despacho · Cuadre de caja",
        titulo: "Las fichas flotantes se cierran solas al hacer scroll",
        resumen:
          "La ficha del cliente en Despacho y el detalle del consecutivo en Cuadre de caja se cierran cuando salen de la pantalla.",
        puntos: [
          "Abre la ficha haciendo clic en el nombre del cliente (o en el consecutivo en Cuadre de caja).",
          "Si haces scroll y la ficha sale por completo de la vista, se cierra automáticamente.",
          "Al volver arriba ya no queda abierta tapando otros pedidos.",
        ],
        demo: "cerrar-scroll",
      },
    ],
  },
  {
    version: "2026-11-11",
    fecha: "11 de noviembre de 2026",
    novedades: [
      {
        id: "responsable-auto",
        modulo: "Despacho · Incumplimientos",
        titulo: "Responsable automático y anular desde el registro",
        resumen:
          "Al marcar un pedido no gestionado, SIGCOMPRO elige solo a la persona responsable y puedes anular el pedido desde la misma ventana.",
        puntos: [
          "Al abrir «Marcar no gestionado» el responsable ya viene seleccionado, con la explicación de por qué.",
          "Reglas: quien asignó el porcionador (en producción/alistado); quien facturó y no asignó en Drivin; si no, la persona del punto con la última actividad del turno.",
          "«Anular pedido» (abajo a la izquierda) pide el motivo y anula el pedido ahí mismo.",
        ],
        nota: "Puedes cambiar la persona si hace falta; el informe indica si fue asignación automática o manual.",
        demo: "responsable-auto",
      },
      {
        id: "filtro-posteriores",
        modulo: "Pedidos",
        titulo: "Filtro de pedidos posteriores",
        resumen: "Un botón junto a «Hoy» muestra solo los pedidos programados para días siguientes.",
        puntos: [
          "El botón «Posteriores» indica cuántos pedidos programados hay en el punto.",
          "Al activarlo la lista muestra solo esos pedidos (la búsqueda sigue funcionando).",
          "Tócalo de nuevo, elige un día o «Limpiar» para volver a la lista normal.",
        ],
        demo: "filtro-posteriores",
      },
      {
        id: "tipo-factura",
        modulo: "Pedidos",
        titulo: "Tipo de factura en la comanda",
        resumen: "En Entrega y pago puedes marcar Factura Electrónica o Consumidor Final y sale impreso en la comanda.",
        puntos: [
          "Debajo de Domicilio / Recoge elige «Factura Electrónica» o «Consumidor Final» (opcional; clic de nuevo para quitarlo).",
          "Los botones del método de pago ahora son más compactos.",
          "La comanda impresa muestra el tipo de factura en OBSERVACIÓN; si no se marca, no sale nada.",
        ],
        demo: "tipo-factura",
      },
      {
        id: "aviso-riesgo",
        modulo: "Despacho",
        titulo: "Puedes ocultar el aviso de pedidos en riesgo",
        resumen: "El aviso flotante de pedidos en riesgo tiene nuevo diseño y una X para ocultarlo.",
        puntos: [
          "El aviso muestra el número de pedidos en riesgo; al tocarlo abre el detalle.",
          "La X lo oculta.",
          "Solo vuelve a aparecer si entra un pedido nuevo en riesgo.",
        ],
        demo: "aviso-riesgo",
      },
    ],
  },
];

/** Roles que ven las novedades. */
export const ROLES_NOVEDADES = ["administrador app", "desarrollador"];
