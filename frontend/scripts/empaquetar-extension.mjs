// Empaqueta la extensión `extension-adres` (raíz del repo) en
// `public/extension-adres.zip` y escribe `public/extension-adres.json` con su
// versión, para que SIGCOMPRO la ofrezca para descargar. Corre solo antes de
// `next dev` y `next build` (predev / prebuild). Sin dependencias externas.
//
// Con `--tienda` genera `dist/extension-adres-webstore.zip` para subir a la
// tienda de Microsoft Edge (o la Chrome Web Store): manifest en la raíz y sin
// documentación. Guía: extension-adres/PUBLICAR-EDGE.md.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = join(aqui, "..", "..", "extension-adres");
const publico = join(aqui, "..", "public");
const tienda = process.argv.includes("--tienda");
const carpetaZip = tienda ? "" : "SIGCOMPRO-extension-adres/";
// Documentación: no va en el paquete de la tienda (y la guía de publicación tampoco en el .zip de descarga).

if (!existsSync(join(origen, "manifest.json"))) {
  console.warn(`[extension] No se encontró ${origen}; no se empaqueta la extensión.`);
  process.exit(0);
}

const TABLA = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

const ahora = new Date();
const horaDos = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
const fechaDos = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();

const locales = [];
const centrales = [];
let desplazamiento = 0;
for (const ruta of archivos(origen).sort()) {
  const relativa = relative(origen, ruta).split("\\").join("/");
  if (relativa.startsWith("tienda/") || relativa === "PUBLICAR-EDGE.md") continue;
  if (tienda && relativa.endsWith(".md")) continue;
  const nombre = Buffer.from(`${carpetaZip}${relativa}`, "utf8");
  const datos = readFileSync(ruta);
  const comprimido = deflateRawSync(datos, { level: 9 });
  const crc = crc32(datos);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(horaDos, 10);
  local.writeUInt16LE(fechaDos, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comprimido.length, 18);
  local.writeUInt32LE(datos.length, 22);
  local.writeUInt16LE(nombre.length, 26);
  locales.push(local, nombre, comprimido);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(horaDos, 12);
  central.writeUInt16LE(fechaDos, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comprimido.length, 20);
  central.writeUInt32LE(datos.length, 24);
  central.writeUInt16LE(nombre.length, 28);
  central.writeUInt32LE(desplazamiento, 42);
  centrales.push(central, nombre);

  desplazamiento += local.length + nombre.length + comprimido.length;
}

const directorio = Buffer.concat(centrales);
const fin = Buffer.alloc(22);
fin.writeUInt32LE(0x06054b50, 0);
const total = centrales.length / 2;
fin.writeUInt16LE(total, 8);
fin.writeUInt16LE(total, 10);
fin.writeUInt32LE(directorio.length, 12);
fin.writeUInt32LE(desplazamiento, 16);

const zip = Buffer.concat([...locales, directorio, fin]);
const { version } = JSON.parse(readFileSync(join(origen, "manifest.json"), "utf8"));
if (tienda) {
  const dist = join(aqui, "..", "..", "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "extension-adres-webstore.zip"), zip);
  console.log(`[extension] dist/extension-adres-webstore.zip v${version} (${total} archivos) listo para subir a la tienda de Edge`);
} else {
  mkdirSync(publico, { recursive: true });
  writeFileSync(join(publico, "extension-adres.zip"), zip);
  writeFileSync(join(publico, "extension-adres.json"), JSON.stringify({ version }) + "\n");
  console.log(`[extension] extension-adres.zip v${version} (${total} archivos)`);
}
