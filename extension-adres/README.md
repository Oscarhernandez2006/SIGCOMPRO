# Extensión «SIGCOMPRO · Validar cédula en ADRES»

Al pulsar **Validar** junto al NIT / Cédula en SIGCOMPRO, la extensión consulta
la cédula en ADRES en segundo plano y devuelve nombres y apellidos al modal.

La consulta corre en un **documento oculto** de la extensión (sin abrir
ventanas ni pestañas). Si el navegador no lo permite o ADRES no responde, se
usa una ventana minimizada como respaldo (que se muestra solo si ADRES pide un
reto del captcha). Para que sea rápido, al abrir el formulario de cliente la
extensión deja el formulario de ADRES **precargado**.

## Instalar (desde SIGCOMPRO)

Junto al botón **Validar** aparece **Instalar extensión** cuando el navegador
no la tiene (o **Actualizar** si hay una versión nueva). Ese botón descarga el
`.zip` desde el mismo SIGCOMPRO y muestra los pasos para Chrome, Brave o Edge:

1. Descomprimir el `.zip` en Documentos (queda `SIGCOMPRO-extension-adres`).
2. Abrir `chrome://extensions` (o `brave://extensions` / `edge://extensions`).
3. Activar **Modo de desarrollador**.
4. **Cargar extensión sin empaquetar** → elegir la carpeta descomprimida.

SIGCOMPRO empaqueta esta carpeta en `frontend/public/extension-adres.zip` en
cada `npm run dev` / `npm run build` (script
`frontend/scripts/empaquetar-extension.mjs`), así que el botón siempre ofrece
la última versión. **Al cambiar la extensión, sube `version` en
`manifest.json`** para que SIGCOMPRO avise «Actualizar».

## Instalación en 1 clic (tienda de Microsoft Edge, gratis)

Ver **PUBLICAR-EDGE.md**. Al publicarla en la tienda de Edge (oculta) y poner su
enlace en `URL_EXTENSION_EDGE` (`frontend/src/lib/extension-adres.ts`), en Edge
el botón abre la tienda: se pulsa «Obtener» y se actualiza sola. Opcionalmente,
`URL_EXTENSION_WEBSTORE` para la Chrome Web Store (5 USD únicos).
