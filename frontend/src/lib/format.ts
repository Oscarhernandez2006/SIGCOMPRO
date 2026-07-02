/** Utilidades de formato de texto. */

/**
 * Convierte un texto a formato nombre propio: primera letra de cada palabra
 * en mayúscula y el resto en minúscula. Respeta los espacios mientras se
 * escribe (no recorta el espacio final).
 */
export function aNombrePropio(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/(^|\s|-)([a-záéíóúñü])/g, (_, sep, letra) => sep + letra.toUpperCase());
}
