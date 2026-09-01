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
 * Convierte un texto a formato "mayúscula inicial" (sentence case): solo la
 * primera letra del texto en mayúscula y todo lo demás en minúscula. Si el
 * usuario escribe más mayúsculas, se transforman automáticamente a minúscula.
 */
export function aMayusculaInicial(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/^(\s*)([a-záéíóúñü])/, (_, sep, letra) => sep + letra.toUpperCase());
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

/** Deja únicamente dígitos (0-9). */
export function soloDigitos(texto: string): string {
  return texto.replace(/\D+/g, "");
}

/** Deja únicamente letras (con acentos, ñ/ü), espacios, guion y apóstrofo. */
export function soloTexto(texto: string): string {
  return texto.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s'-]+/g, "");
}

/** Deja solo texto y aplica formato de nombre propio. */
export function aTextoLimpio(texto: string): string {
  return aNombrePropio(soloTexto(texto));
}

/** Handler onChange genérico que sanitiza el valor conservando la posición del caret. */
function onChangeSanitizado(
  setter: (valor: string) => void,
  limpiar: (v: string) => string,
): React.ChangeEventHandler<HTMLInputElement> {
  return (e) => {
    const el = e.currentTarget;
    const pos = el.selectionStart;
    const limpio = limpiar(el.value);
    const delta = el.value.length - limpio.length;
    setter(limpio);
    if (pos !== null) {
      const nuevaPos = Math.max(0, pos - delta);
      requestAnimationFrame(() => {
        try {
          el.setSelectionRange(nuevaPos, nuevaPos);
        } catch {
          /* input ya no está en el DOM */
        }
      });
    }
  };
}

/** onChange que restringe la entrada a solo dígitos. */
export function onChangeSoloDigitos(
  setter: (valor: string) => void,
): React.ChangeEventHandler<HTMLInputElement> {
  return onChangeSanitizado(setter, soloDigitos);
}

/** Deja dígitos (0-9) y guion medio, para NIT con dígito de verificación. */
export function soloNit(texto: string): string {
  return texto.replace(/[^\d-]+/g, "");
}

/** onChange que restringe la entrada a dígitos y guion (NIT/cédula). */
export function onChangeNit(
  setter: (valor: string) => void,
): React.ChangeEventHandler<HTMLInputElement> {
  return onChangeSanitizado(setter, soloNit);
}

/** onChange que deja solo texto y aplica formato de nombre propio. */
export function onChangeSoloTexto(
  setter: (valor: string) => void,
): React.ChangeEventHandler<HTMLInputElement> {
  return onChangeSanitizado(setter, aTextoLimpio);
}
