#!/usr/bin/env bash
# Arma el "Navegador SIGCOMPRO" para Windows: descarga Chrome for Testing
# (estable, win64), le agrega la extensión de ADRES, el lanzador y el
# instalador, y deja el resultado en dist/SIGCOMPRO-Navegador-Windows.zip.
#
# Uso: scripts/empaquetar-navegador-windows.sh [URL_SIGCOMPRO]
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
URL_SIGCOMPRO="${1:-https://sigcompro.grupo-santacruz.com}"
TRABAJO="$RAIZ/dist/navegador-windows"
SALIDA="$RAIZ/dist/SIGCOMPRO-Navegador-Windows.zip"

echo "== Consultando la última versión estable de Chrome for Testing..."
JSON_URL="https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
read -r VERSION ZIP_URL < <(node -e '
  fetch(process.argv[1]).then(r => r.json()).then(j => {
    const s = j.channels.Stable;
    const d = s.downloads.chrome.find(x => x.platform === "win64");
    console.log(s.version, d.url);
  }).catch(e => { console.error(e); process.exit(1); });
' "$JSON_URL")
echo "   Versión $VERSION"

rm -rf "$TRABAJO"
mkdir -p "$TRABAJO/paquete"
echo "== Descargando Chrome for Testing (win64)..."
node -e '
  const fs = require("fs");
  fetch(process.argv[1]).then(async r => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    fs.writeFileSync(process.argv[2], Buffer.from(await r.arrayBuffer()));
  }).catch(e => { console.error(e); process.exit(1); });
' "$ZIP_URL" "$TRABAJO/chrome.zip"

echo "== Armando el paquete..."
python3 - "$TRABAJO/chrome.zip" "$TRABAJO/paquete" <<'PY'
import sys, zipfile, os
zip_path, destino = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(zip_path) as z:
    z.extractall(destino)
# El zip trae la carpeta "chrome-win64": se renombra a "chrome".
os.rename(os.path.join(destino, "chrome-win64"), os.path.join(destino, "chrome"))
PY
cp -r "$RAIZ/extension-adres" "$TRABAJO/paquete/extension"
rm -f "$TRABAJO/paquete/extension/README.md"
cp "$RAIZ/navegador-windows/"{INSTALAR.cmd,instalar.ps1,SIGCOMPRO.cmd,LEEME.txt,sigcompro.ico} "$TRABAJO/paquete/"
printf '%s\r\n' "$URL_SIGCOMPRO" > "$TRABAJO/paquete/url.txt"
# Finales de línea de Windows en los scripts.
for f in INSTALAR.cmd SIGCOMPRO.cmd instalar.ps1 LEEME.txt; do
  sed -i 's/\r$//; s/$/\r/' "$TRABAJO/paquete/$f"
done

echo "== Comprimiendo..."
rm -f "$SALIDA"
python3 - "$TRABAJO/paquete" "$SALIDA" <<'PY'
import sys, os, zipfile
origen, salida = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for raiz, _, archivos in os.walk(origen):
        for a in archivos:
            ruta = os.path.join(raiz, a)
            z.write(ruta, os.path.join("SIGCOMPRO-Navegador", os.path.relpath(ruta, origen)))
PY
rm -rf "$TRABAJO"
echo "== Listo: $SALIDA ($(du -h "$SALIDA" | cut -f1)) · Chrome for Testing $VERSION"
