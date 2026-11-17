import { execFile } from 'node:child_process';
import sharp from 'sharp';

export interface LecturaComprobante {
  estado: 'positivo' | 'dudoso' | 'no_disponible';
  referencia: string | null;
  entidad: string | null;
}

export function interpretarComprobante(texto: string): LecturaComprobante {
  const normal = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const entidad = /nequi/.test(normal) ? 'Nequi' : /bancolombia/.test(normal) ? 'Bancolombia'
    : /daviplata/.test(normal) ? 'Daviplata' : /davivienda/.test(normal) ? 'Davivienda'
      : /banco de bogota/.test(normal) ? 'Banco de Bogotá' : null;
  const lineas = normal.split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean);
  let referencia: string | null = null;
  for (let indice = 0; indice < lineas.length; indice++) {
    const etiqueta = /(?:referencia|transaccion|aprobacion|comprobante|registro|movimiento)\s*(?:n(?:ro|umero|o)?\.?\s*)?[:#.-]?\s*(.*)$/.exec(lineas[indice]);
    if (!etiqueta) continue;
    const candidato = (etiqueta[1].trim() || lineas[indice + 1] || '').toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9 .-]{3,39}$/.test(candidato) || (candidato.match(/\d/g) ?? []).length < 4) continue;
    referencia = candidato.replace(/[ .]/g, '');
    break;
  }
  const accion = /transferencia|transferiste|enviaste|envio exitoso|pago exitoso|transaccion exitosa|comprobante de pago|aprobado/.test(normal);
  const advertencia = /fallid[ao]|rechazad[ao]|no se pudo|no fue|no exitosa|pendiente|en proceso|cancelad[ao]/.test(normal);
  return { estado: accion && !advertencia && (!!referencia || !!entidad) ? 'positivo' : 'dudoso', referencia, entidad };
}

export async function leerComprobante(imagen: string): Promise<LecturaComprobante> {
  const base64 = imagen.includes(',') ? imagen.slice(imagen.indexOf(',') + 1) : imagen;
  const buffer = await sharp(Buffer.from(base64, 'base64'), { limitInputPixels: 30000000 })
    .rotate().resize({ width: 1600, height: 2000, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }).grayscale().normalise().sharpen().png().toBuffer();
  const texto = await new Promise<string>((resolve, reject) => {
    const proceso = execFile('tesseract', ['stdin', 'stdout', '-l', 'spa', '--oem', '1', '--psm', '11', '--dpi', '200'],
      { timeout: 4000, killSignal: 'SIGKILL', maxBuffer: 128 * 1024, windowsHide: true,
        env: { ...process.env, OMP_THREAD_LIMIT: '1' } },
      (error, salida) => error ? reject(error) : resolve(salida));
    proceso.stdin?.on('error', () => undefined);
    proceso.stdin?.end(buffer);
  });
  return interpretarComprobante(texto);
}