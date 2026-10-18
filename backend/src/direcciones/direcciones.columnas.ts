/**
 * Columnas de la hoja "Direcciones" (formato de importación de direcciones de
 * Drivin), en el MISMO orden del Excel. Cada fila se guarda como jsonb con la
 * letra de la columna como clave (A, B, ..., BN).
 *
 * - `visible`: se muestra en la tabla del módulo (las que traen datos).
 * - `defecto`: valor fijo que Drivin espera en las filas nuevas.
 */
export interface ColumnaDireccion {
  letra: string;
  nombre: string;
  visible?: boolean;
  defecto?: string | number;
}

export const COLUMNAS_DIRECCIONES: ColumnaDireccion[] = [
  { letra: 'A', nombre: 'Código de Dirección', visible: true },
  { letra: 'B', nombre: 'Nombre de Dirección', visible: true },
  { letra: 'C', nombre: 'Cliente', visible: true },
  { letra: 'D', nombre: 'Tipo de Dirección', visible: true },
  { letra: 'E', nombre: 'Dirección', visible: true },
  { letra: 'F', nombre: 'Referencia', visible: true },
  { letra: 'G', nombre: 'Descripción' },
  { letra: 'H', nombre: 'Comuna', visible: true },
  { letra: 'I', nombre: 'Provincia', visible: true },
  { letra: 'J', nombre: 'Región', visible: true, defecto: 'Atlántico' },
  { letra: 'K', nombre: 'País', visible: true, defecto: 'Colombia' },
  { letra: 'L', nombre: 'Código Postal', visible: true },
  { letra: 'M', nombre: 'Lat', visible: true },
  { letra: 'N', nombre: 'Lon', visible: true },
  { letra: 'O', nombre: 'Nombre de Esquema', visible: true },
  { letra: 'P', nombre: 'Tiempo de Servicio' },
  { letra: 'Q', nombre: 'Inicio vt' },
  { letra: 'R', nombre: 'Fin vt' },
  { letra: 'S', nombre: 'Características de la Dirección' },
  { letra: 'T', nombre: 'Vehículo asignado' },
  { letra: 'U', nombre: 'Teléfono', visible: true },
  { letra: 'V', nombre: 'Correo' },
  { letra: 'W', nombre: 'Exclusivo' },
  { letra: 'X', nombre: 'Inicio vt 2' },
  { letra: 'Y', nombre: 'Fin vt 2' },
  { letra: 'Z', nombre: 'Comentario' },
  { letra: 'AA', nombre: 'Código Cliente', visible: true },
  { letra: 'AB', nombre: 'Nombre Contacto', visible: true },
  { letra: 'AC', nombre: 'Correo al aprobar ruta' },
  { letra: 'AD', nombre: 'Correo al iniciar ruta' },
  { letra: 'AE', nombre: 'Correo en camino a dirección' },
  { letra: 'AF', nombre: 'Correo de entrega finalizada' },
  { letra: 'AG', nombre: 'Etiqueta Costos' },
  { letra: 'AH', nombre: 'Código Zona de Venta' },
  { letra: 'AI', nombre: 'Nombre Zona de Venta' },
  { letra: 'AJ', nombre: 'Código Proveedor' },
  { letra: 'AK', nombre: 'Nombre Proveedor' },
  { letra: 'AL', nombre: 'Fecha Entrega' },
  { letra: 'AM', nombre: 'Tiempo entre entregas', defecto: 0 },
  { letra: 'AN', nombre: 'Días de la semana disponibles', defecto: '0,0,0,0,0,0,0' },
  { letra: 'AO', nombre: 'Días de procesamiento', defecto: '0,0,0,0,0,0,0' },
  { letra: 'AP', nombre: 'Días de entrega post procesamiento', defecto: '0,0,0,0,0,0,0' },
  { letra: 'AQ', nombre: 'Constante días de entrega', defecto: 0 },
  { letra: 'AR', nombre: 'Código Empresa de Transporte' },
  { letra: 'AS', nombre: 'Empresa de Transporte' },
  { letra: 'AT', nombre: 'Prioridad' },
  { letra: 'AU', nombre: 'Prioridad de Secuencia' },
  { letra: 'AV', nombre: 'Umbral de parada conocida' },
  { letra: 'AW', nombre: 'Evitar Telescopeo', defecto: 0 },
  { letra: 'AX', nombre: 'Nombre 2do Contacto' },
  { letra: 'AY', nombre: 'Teléfono 2do Contacto' },
  { letra: 'AZ', nombre: 'Correo 2do Contacto' },
  { letra: 'BA', nombre: 'Ventanas Horarias por Día' },
  { letra: 'BB', nombre: 'Frecuencia', defecto: '0,0,0,0,0' },
  { letra: 'BC', nombre: 'Código Esquema Empleador' },
  { letra: 'BD', nombre: 'Tags de búsqueda' },
  { letra: 'BE', nombre: 'Nombre contacto ruta aprobada' },
  { letra: 'BF', nombre: 'Nombre contacto inicio de ruta' },
  { letra: 'BG', nombre: 'Nombre contacto próximo a llegar' },
  { letra: 'BH', nombre: 'Nombre contacto dirección cerrada' },
  { letra: 'BI', nombre: 'Solicitar activos retornables', defecto: 'default' },
  { letra: 'BJ', nombre: 'Zonas' },
  { letra: 'BK', nombre: 'Lat sugerida' },
  { letra: 'BL', nombre: 'Long sugerida' },
  { letra: 'BM', nombre: 'Sugerencia' },
  { letra: 'BN', nombre: 'Fecha de sugerencia' },
];

export const LETRAS_DIRECCIONES = new Set(COLUMNAS_DIRECCIONES.map((c) => c.letra));

/** Valores por defecto de una fila nueva (columnas fijas de Drivin). */
export function datosPorDefecto(): Record<string, string | number> {
  const d: Record<string, string | number> = {};
  for (const c of COLUMNAS_DIRECCIONES) {
    if (c.defecto !== undefined) d[c.letra] = c.defecto;
  }
  return d;
}
