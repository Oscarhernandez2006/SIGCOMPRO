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
  | "responsable-auto"
  | "pedido-vs-facturado"
  | "detalle-pedido"
  | "viveres-extras"
  | "validar-guardar"
  | "cliente-no-confiable"
  | "factura-despacho"
  | "registro-incumplimiento"
  | "numero-aprobacion"
  | "pdv-incumplimientos"
  | "validar-solo-nuevos"
  | "cedula-no-existe"
  | "permiso-productos";

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
  {
    version: "2026-11-15",
    fecha: "15 de noviembre de 2026",
    novedades: [
      {
        id: "pedido-vs-facturado",
        modulo: "Informes",
        titulo: "Pedido vs facturado (Siesa)",
        resumen:
          "Nueva pestaña en el reporte de productos: cada pedido con su factura de Siesa, el valor del pedido y el valor facturado.",
        puntos: [
          "En el reporte de productos elige la pestaña «Pedido vs facturado».",
          "Una fila por pedido: comanda, cliente, factura de Siesa, valor del pedido, valor facturado, diferencia y resultado (coincide, con diferencia, no encontrada…).",
          "Haz clic en un pedido para ver producto por producto lo pedido contra lo facturado. El Excel trae las dos vistas.",
        ],
        nota: "Las facturas se traen solas de Siesa cada 5 minutos. El reporte de productos por cliente ahora carga el último mes y solo se genera al pulsar «Generar» (más rápido).",
        demo: "pedido-vs-facturado",
      },
      {
        id: "detalle-pedido",
        modulo: "Pedidos · Despacho",
        titulo: "Detalle del pedido más completo",
        resumen: "Al ver un pedido (ojito) salen el vendedor en un solo dato, la nota del pedido y el total de kilos.",
        puntos: [
          "Vendedor: cédula y nombre en un solo dato.",
          "Nota del pedido: la observación y el tipo de factura elegido.",
          "Total de kilos (y libras) junto al total del pedido. En Despacho, la alerta de pedidos vencidos es más ancha y muestra solo el número de comanda.",
        ],
        demo: "detalle-pedido",
      },
      {
        id: "viveres-extras",
        modulo: "Lista de precios",
        titulo: "Víveres ya no salen en Cortes de Res",
        resumen: "En el listado de precios, los productos de Víveres ahora van en la hoja Extras.",
        puntos: [
          "Antes masas, arepas, miel o bollos aparecían en la hoja «Cortes de Res».",
          "Ahora la hoja de Res solo trae cortes de res y los víveres salen en «Extras».",
        ],
        demo: "viveres-extras",
      },
    ],
  },
  {
    version: "2026-11-21",
    fecha: "21 de noviembre de 2026",
    novedades: [
      {
        id: "validar-guardar",
        modulo: "Clientes · Pedidos",
        titulo: "La cédula se valida sola al guardar",
        resumen: "Si no usaron «Validar», al pulsar Guardar se abre la validación de la cédula automáticamente.",
        puntos: [
          "Al guardar un cliente sin haber validado, se abre sola la ventana «Validar cédula».",
          "«Confirmar» pone el nombre validado y guarda. Si es un NIT de empresa, «Cancelar y guardar» guarda sin validar.",
          "Los clientes guardados en MAYÚSCULAS se muestran y guardan con mayúscula inicial al editarlos.",
        ],
        demo: "validar-guardar",
      },
      {
        id: "cliente-no-confiable",
        modulo: "Clientes · Pedidos",
        titulo: "Marca de cliente no confiable",
        resumen: "Si el nombre no corresponde a la cédula, se puede marcar al cliente como no confiable y se avisa al tomarle pedidos.",
        puntos: [
          "La validación avisa cuando el nombre registrado no corresponde a la cédula.",
          "«Marcar cliente no confiable» conserva sus datos y guarda el motivo.",
          "En Nuevo pedido, al digitar la cédula, el cliente sale con la etiqueta roja «No confiable» y el motivo.",
        ],
        nota: "La marca se puede quitar desde Editar cliente con «Quitar marca».",
        demo: "cliente-no-confiable",
      },
      {
        id: "factura-despacho",
        modulo: "Despacho",
        titulo: "Número y valor de factura sin cambios accidentales",
        resumen: "El valor de la factura ya no tiene flechas y el número ya no se cambia solo al pasar al otro campo.",
        puntos: [
          "El N° de factura y el valor se guardan al salir del campo (clic afuera, Tab o Enter).",
          "El valor ya no tiene flechas ni cambia con la rueda del mouse.",
          "«Facturado» sigue funcionando igual: guarda lo escrito y valida.",
        ],
        demo: "factura-despacho",
      },
      {
        id: "registro-incumplimiento",
        modulo: "Despacho · Incumplimientos",
        titulo: "Registro de incumplimiento más claro",
        resumen: "Al anular desde el registro, el motivo se elige a mano y el botón indica qué falta para confirmar.",
        puntos: [
          "Al activar «Anular pedido», el motivo de anulación arranca vacío: hay que elegirlo.",
          "Junto al botón aparece lo que falta (por ejemplo, la descripción de mínimo 10 caracteres).",
          "Con la anulación activada el botón dice «Registrar y anular».",
        ],
        demo: "registro-incumplimiento",
      },
    ],
  },
  {
    version: "2026-11-21b",
    fecha: "21 de noviembre de 2026",
    novedades: [
      {
        id: "numero-aprobacion",
        modulo: "Cuadre de caja",
        titulo: "Nueva columna No. Aprob.",
        resumen: "En el cuadre se digita el número con que se aprobó cada transferencia.",
        puntos: [
          "Junto a «Método de pago» está la columna «No. Aprob.»: se digita y se guarda al salir del campo.",
          "Queda guardado en el pedido y sale también en el reporte impreso del cuadre.",
          "Solo se digita en pagos por transferencia o mixtos; los demás muestran «—».",
        ],
        demo: "numero-aprobacion",
      },
      {
        id: "pdv-incumplimientos",
        modulo: "Incumplimientos",
        titulo: "Punto de venta en el resumen",
        resumen: "En «Personas con más incumplimientos» se ve el punto de venta de cada persona.",
        puntos: [
          "Al lado del nombre aparece el PDV donde ocurrieron sus incumplimientos.",
          "Si fueron en varios puntos, se muestran todos (según el rango de fechas elegido).",
        ],
        demo: "pdv-incumplimientos",
      },
    ],
  },
  {
    version: "2026-11-21c",
    fecha: "21 de noviembre de 2026",
    novedades: [
      {
        id: "validar-solo-nuevos",
        modulo: "Clientes",
        titulo: "Validación automática solo para clientes nuevos",
        resumen: "Al editar un cliente ya no se abre sola la validación de cédula.",
        puntos: [
          "Al entrar a «Editar cliente» ya no arranca la validación.",
          "Guardar un cliente existente guarda directo; la validación al guardar queda solo para clientes nuevos.",
        ],
        nota: "El botón «Validar» sigue disponible para validar a mano cuando se quiera.",
        demo: "validar-solo-nuevos",
      },
      {
        id: "cedula-no-existe",
        modulo: "Clientes · Validar cédula",
        titulo: "Cédula que no existe: aviso y cliente en riesgo",
        resumen: "Si ADRES no encuentra la cédula o no responde, se puede marcar al cliente como no confiable desde la misma ventana.",
        puntos: [
          "La extensión (v1.10.0) detecta mejor cuando ADRES no encuentra la cédula y muestra el aviso rojo.",
          "Nuevo botón «Marcar cliente no confiable» en el aviso, también cuando ADRES no responde.",
          "El cliente queda con la etiqueta «No confiable» y el motivo, y se avisa al tomarle pedidos.",
        ],
        nota: "Actualiza la extensión con «Instalar extensión» para tener la detección nueva.",
        demo: "cedula-no-existe",
      },
    ],
  },
  {
    version: "2026-11-21d",
    fecha: "21 de noviembre de 2026",
    novedades: [
      {
        id: "permiso-productos",
        modulo: "Usuarios · Productos y precios",
        titulo: "Permiso de Productos y precios",
        resumen: "Ya se puede dar acceso a Productos y precios a supervisores y otros roles desde sus permisos.",
        puntos: [
          "En Permisos → Módulos operativos aparece «Productos y precios».",
          "El sub-permiso «Marcar productos agotados / disponibles» habilita los botones Agotado/Disponible.",
          "Quien lo tenga ve «Productos y precios» en su menú; «Sincronizar» solo sale con el permiso de sincronizar lista de precios.",
        ],
        nota: "También: si ADRES no encuentra una cédula se avisa que no aparece (puede ser real sin afiliación a salud), no que es falsa.",
        demo: "permiso-productos",
      },
    ],
  },
];

/** Roles que ven las novedades. */
export const ROLES_NOVEDADES = ["administrador app", "desarrollador"];
