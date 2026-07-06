/** Utilidades de formato de texto. */
import type React from "react";

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

/**
 * Handler de onChange para inputs de nombre propio que aplica el formato
 * sin mover el cursor al final. Como el formato solo cambia mayúsculas
 * (misma longitud), restaura la posición del caret tras el re-render.
 */
export function onChangeNombrePropio(
  setter: (valor: string) => void,
): React.ChangeEventHandler<HTMLInputElement> {
  return (e) => {
    const el = e.currentTarget;
    const pos = el.selectionStart;
    setter(aNombrePropio(el.value));
    if (pos !== null) {
      requestAnimationFrame(() => {
        try {
          el.setSelectionRange(pos, pos);
        } catch {
          /* input ya no está en el DOM */
        }
      });
    }
  };
}
