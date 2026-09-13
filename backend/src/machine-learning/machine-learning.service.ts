import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { normalizarDireccion, tituloCase } from './normalizador-direcciones';

/** Índices de columna (0-based) según la plantilla acordada. */
const COL = {
  razonSocial: 1, // B
  contacto: 4, // E
  barrio: 5, // F
  direccion: 6, // G (Dirección 1) — se sobrescribe
  info: 9, // J (nueva columna "Información adicional")
} as const;

@Injectable()
export class MachineLearningService {
  /**
   * Procesa un Excel de clientes: normaliza la Dirección 1 (columna G), agrega
   * la columna "Información adicional" (J) con lo extraído, y capitaliza Razón
   * social, Contacto y Barrio. El resto de columnas no se toca. Devuelve el
   * mismo archivo (mismas filas y orden) ya corregido.
   */
  procesarDirecciones(
    buffer: Buffer,
    nombreOriginal?: string,
  ): { filename: string; buffer: Buffer; filas: number } {
    let libro: XLSX.WorkBook;
    try {
      libro = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    } catch {
      throw new BadRequestException('No se pudo leer el archivo Excel.');
    }

    const nombreHoja = libro.SheetNames[0];
    const hoja = nombreHoja ? libro.Sheets[nombreHoja] : undefined;
    if (!hoja) {
      throw new BadRequestException('El archivo no tiene ninguna hoja válida.');
    }

    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
      header: 1,
      blankrows: false,
      defval: null,
    });
    if (filas.length < 2) {
      throw new BadRequestException('El archivo no contiene datos.');
    }

    // Encabezado: agrega "Información adicional" en la columna J (índice 9).
    const cabecera = (filas[0] as unknown[]).slice();
    while (cabecera.length <= COL.info) cabecera.push(null);
    cabecera[COL.info] = 'Información adicional';

    const salida: unknown[][] = [cabecera];
    for (let r = 1; r < filas.length; r++) {
      const fila = (filas[r] as unknown[]).slice();
      while (fila.length <= COL.info) fila.push(null);

      const { direccion, informacionAdicional } = normalizarDireccion(
        fila[COL.direccion],
      );
      fila[COL.direccion] = direccion;
      fila[COL.info] = informacionAdicional;

      fila[COL.razonSocial] = this.capitalizar(fila[COL.razonSocial]);
      fila[COL.contacto] = this.capitalizar(fila[COL.contacto]);
      fila[COL.barrio] = this.capitalizar(fila[COL.barrio]);

      salida.push(fila);
    }

    const nuevaHoja = XLSX.utils.aoa_to_sheet(salida);
    const nuevoLibro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(nuevoLibro, nuevaHoja, nombreHoja || 'Clientes');
    const out = XLSX.write(nuevoLibro, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    const base = (nombreOriginal ?? 'clientes').replace(
      /\.(xlsx|xls|xlsm|csv)$/i,
      '',
    );
    return { filename: `${base}_normalizado.xlsx`, buffer: out, filas: filas.length - 1 };
  }

  /** Capitaliza tipo título solo si la celda es texto no vacío (no toca vacíos ni números). */
  private capitalizar(valor: unknown): unknown {
    if (typeof valor !== 'string') return valor;
    const s = valor.trim();
    return s ? tituloCase(s) : valor;
  }
}
