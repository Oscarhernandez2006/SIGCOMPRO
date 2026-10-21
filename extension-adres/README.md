# Extensión «SIGCOMPRO · Validar cédula en ADRES»

Al pulsar **Validar** junto al NIT / Cédula en SIGCOMPRO:

La consulta corre en un **documento oculto** de la extensión (sin abrir
ventanas ni pestañas). Si el navegador no lo permite o ADRES no responde, se
usa una ventana minimizada como respaldo (que se muestra solo si ADRES pide un
reto del captcha). Para que sea rápido, al abrir el formulario de cliente la
extensión deja el formulario de ADRES **precargado**.

1. Se abre la consulta de ADRES en una ventana aparte, se llenan el tipo y el
   número de documento y se pulsa **Consultar** (una sola vez por cada
   Validar). El reCAPTCHA invisible de ADRES se ejecuta normal en el navegador
   de la persona; si ADRES pide un reto visible, lo resuelve la persona.
2. La extensión lee **Nombres** y **Apellidos** del resultado, los envía a
   SIGCOMPRO, cierra la ventana de ADRES y vuelve a SIGCOMPRO.
3. En el modal de SIGCOMPRO se confirma con el cliente y se llenan los campos.

## Instalar (Chrome o Brave)

1. Abrir `chrome://extensions` (o `brave://extensions`).
2. Activar **Modo de desarrollador**.
3. **Cargar extensión sin empaquetar** → elegir esta carpeta `extension-adres`.

Funciona en `http://localhost` (cualquier puerto) y en
`https://sigcompro.grupo-santacruz.com`. Sin la extensión, el botón Validar
sigue funcionando en modo manual (copiar cédula y pegar el resultado).
