/**
 * Normalizador de direcciones colombianas.
 *
 * Recibe una dirección en crudo y devuelve la dirección normalizada + la
 * "información adicional" (todo lo que no forma parte de la dirección en sí:
 * piso, apto, torre, barrio, referencias, vías cruzadas, etc.). La lógica sigue
 * la especificación acordada: limpieza, diccionario de vías, armado de hasta 3
 * grupos numéricos, expansión de abreviaturas en todo el texto y capitalización
 * tipo título.
 */

/** Diccionario de abreviaturas de vía (palabra completa, en mayúsculas). */
const VIA_MAP: Record<string, string> = {
  CRA: 'Carrera', CR: 'Carrera', KRA: 'Carrera', KR: 'Carrera', CARRERA: 'Carrera', CARR: 'Carrera', CAR: 'Carrera',
  CALLE: 'Calle', CLL: 'Calle', CL: 'Calle', CLLE: 'Calle', CALL: 'Calle', ALLE: 'Calle', KL: 'Calle',
  AV: 'Avenida', AVDA: 'Avenida', AVENIDA: 'Avenida',
  TRANSVERSAL: 'Transversal', TRANS: 'Transversal', TRAN: 'Transversal', TRA: 'Transversal', TRAV: 'Transversal', TRANSV: 'Transversal', TV: 'Transversal', TR: 'Transversal',
  DIAGONAL: 'Diagonal', DIAG: 'Diagonal', DIG: 'Diagonal', DG: 'Diagonal',
  AUTOPISTA: 'Autopista', AUT: 'Autopista',
  KM: 'Kilómetro', KLM: 'Kilómetro', KILOMETRO: 'Kilómetro', 'KILÓMETRO': 'Kilómetro',
  MZ: 'Manzana', MANZANA: 'Manzana',
  VIA: 'Vía', 'VÍA': 'Vía',
  VEREDA: 'Vereda', VDA: 'Vereda',
  CARRETERA: 'Carretera',
  TRONCAL: 'Troncal',
  CIRCULAR: 'Circular', CIR: 'Circular',
};

const quitarTildes = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Búsqueda del diccionario insensible a tildes y mayúsculas. */
const VIA_MAP_NORM: Record<string, string> = {};
for (const [clave, valor] of Object.entries(VIA_MAP)) {
  VIA_MAP_NORM[quitarTildes(clave).toUpperCase()] = valor;
}

export interface ResultadoDireccion {
  direccion: string;
  informacionAdicional: string;
}

/** Capitalización tipo título (equivalente a str.title() de Python). */
export function tituloCase(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/(^|[^\p{L}])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Expande cualquier abreviatura de vía en el texto completo (palabra a palabra). */
function expandirAbreviaturas(texto: string): string {
  return texto.replace(/\p{L}+/gu, (palabra) => {
    const clave = quitarTildes(palabra).toUpperCase();
    return VIA_MAP_NORM[clave] ?? palabra;
  });
}

/** Paso 1: limpieza del texto de la dirección. */
function limpiarTexto(raw: unknown): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  s = s.replace(/[°º]/g, '');
  // "N." / "N " / "NO." / "NO " / "NRO." / "NRO " seguido de dígito -> "#".
  s = s.replace(/\b(?:NRO|NO|N)\b[.\s]+(?=\d)/gi, ' # ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Normaliza una dirección. Si no reconoce la vía o no logra armar ningún grupo
 * numérico, deja la dirección vacía y todo el texto en "información adicional"
 * (nunca inventa ni pierde datos).
 */
export function normalizarDireccion(raw: unknown): ResultadoDireccion {
  const original = String(raw ?? '').trim();
  const limpio = limpiarTexto(raw);
  if (!limpio) return { direccion: '', informacionAdicional: '' };

  const tokens = limpio.split(' ').filter(Boolean);
  const primeraClave = quitarTildes(tokens[0].replace(/\./g, '')).toUpperCase();
  const via = VIA_MAP_NORM[primeraClave];

  // Sin vía reconocible: todo va a información adicional.
  if (!via) {
    return {
      direccion: '',
      informacionAdicional: tituloCase(expandirAbreviaturas(original)),
    };
  }

  const grupos: string[] = [];
  let i = 1;
  for (; i < tokens.length; i++) {
    if (grupos.length >= 3) break;
    const tok = tokens[i];
    const tokU = quitarTildes(tok).toUpperCase();

    if (tok === '#' || tok === '-') continue; // separadores
    if (tokU === 'BIS') {
      if (grupos.length > 0) grupos[grupos.length - 1] += ' Bis';
      else break;
      continue;
    }
    // NUM-NUM o NUM[LETRA]-NUM[LETRA] -> genera dos grupos de una vez.
    const doble = tokU.match(/^(\d+[A-Z]?)-(\d+[A-Z]?)$/);
    if (doble) {
      if (grupos.length >= 2) break; // sin espacio para dos: pasa a leftover
      grupos.push(doble[1]);
      grupos.push(doble[2]);
      continue;
    }
    // NUM[LETRA] -> un grupo nuevo.
    if (/^\d+[A-Z]?$/.test(tokU)) {
      grupos.push(tokU);
      continue;
    }
    // Letra sola -> se adjunta al último grupo; si es el 1º token, grupo atómico.
    if (/^[A-Z]$/.test(tokU)) {
      if (grupos.length > 0) grupos[grupos.length - 1] += tokU;
      else grupos.push(tokU);
      continue;
    }
    // Letra+número como 1º token sin grupo previo (ej. Manzana B5).
    if (grupos.length === 0 && /^[A-Z]\d+$/.test(tokU)) {
      grupos.push(tokU);
      continue;
    }
    break; // cualquier otro token detiene el recorrido
  }

  // Vía sola, sin ningún número: todo a información adicional.
  if (grupos.length === 0) {
    return {
      direccion: '',
      informacionAdicional: tituloCase(expandirAbreviaturas(original)),
    };
  }

  let direccion: string;
  if (grupos.length === 1) direccion = `${via} ${grupos[0]}`;
  else if (grupos.length === 2) direccion = `${via} ${grupos[0]} # ${grupos[1]}`;
  else direccion = `${via} ${grupos[0]} # ${grupos[1]}-${grupos[2]}`;

  let leftover = tokens.slice(i).join(' ');
  leftover = leftover.replace(/^[\s\-,/]+/, '').trim();

  return {
    direccion: tituloCase(expandirAbreviaturas(direccion)),
    informacionAdicional: tituloCase(expandirAbreviaturas(leftover)),
  };
}
