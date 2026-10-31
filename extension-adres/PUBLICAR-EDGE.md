# Publicar la extensión en la tienda de Microsoft Edge (gratis)

Con la extensión publicada, en Edge el botón **Instalar extensión** de
SIGCOMPRO abre la tienda: la televenta pulsa **Obtener** y queda funcionando
(SIGCOMPRO la detecta solo). Se actualiza sola. Publicar en Edge no cuesta nada.

## 1. Generar el paquete

```bash
cd frontend
npm run extension:tienda
```

Queda en `dist/extension-adres-webstore.zip` (en la raíz del proyecto).
**Cada vez que se cambie la extensión, subir `version` en `manifest.json`**
antes de generarlo.

## 2. Crear la cuenta (una sola vez, gratis)

1. Entrar a <https://partner.microsoft.com/dashboard/microsoftedge/overview>
   con una cuenta Microsoft de la empresa.
2. Registrarse en el programa **Microsoft Edge** como **Empresa** (Company).
   No pide pago. La verificación de la empresa puede tardar unos días.

## 3. Subir la extensión

En Partner Center → Microsoft Edge → **Create new extension**:

- **Package**: subir `dist/extension-adres-webstore.zip`.
- **Availability → Visibility**: **Hidden** (oculta: solo se instala con el
  enlace directo; no aparece en búsquedas). Mercados: Colombia (o todos).
- **Properties**:
  - Category: *Productivity*.
  - Privacy policy URL:
    `https://sigcompro.grupo-santacruz.com/privacidad-extension.html`
  - Website: `https://sigcompro.grupo-santacruz.com`
  - "Does your extension access, collect, or transmit personal information?":
    **Yes** (número de cédula y nombres del cliente; se usan solo para
    registrar al cliente en SIGCOMPRO, ver la política de privacidad).
- **Store listings → Español (Colombia)** (y opcionalmente English):
  - Store logo: `extension-adres/tienda/logo-300.png`.
  - Screenshots (recomendado, 1280×800 o 640×400): una captura del modal
    «Validar cédula» de SIGCOMPRO.
  - Short description:
    > Para televentas de Carnes Santacruz: valida la cédula del cliente en
    > ADRES y trae nombres y apellidos a SIGCOMPRO.
  - Description:
    > Herramienta interna de Carnes Santacruz para el personal de televentas
    > que usa SIGCOMPRO.
    >
    > Al pulsar «Validar» junto al número de cédula en el formulario de
    > cliente de SIGCOMPRO, la extensión consulta esa cédula en la página
    > pública de ADRES (consulta de afiliación) en segundo plano y devuelve el
    > nombre y los apellidos al formulario, para confirmarlos con el cliente.
    >
    > Solo funciona en SIGCOMPRO (sigcompro.grupo-santacruz.com). No envía
    > datos a servidores propios ni de terceros: el resultado solo se entrega
    > a la pestaña de SIGCOMPRO que pidió la consulta.
- **Notes for certification** (para el revisor):
  > Internal tool for the sales staff of Carnes Santacruz (Colombia). It only
  > runs when a user clicks "Validar" in our web app SIGCOMPRO
  > (sigcompro.grupo-santacruz.com, requires a company login). It fills the
  > ID number in the public ADRES (Colombian health registry) lookup form in
  > an offscreen document, submits it once on behalf of the user, and returns
  > the first and last names to the SIGCOMPRO tab. Permissions: offscreen
  > (run the lookup without opening windows), scripting (attach to already
  > open SIGCOMPRO tabs on install), storage (keep the pending lookup for up
  > to 10 minutes). No data is sent to any server by the extension.

Pulsar **Publish**. La revisión suele tardar de 1 a 7 días hábiles.

## 4. Conectar SIGCOMPRO con la tienda

Cuando quede publicada, copiar el enlace de la extensión (algo como
`https://microsoftedge.microsoft.com/addons/detail/<id>`) y pegarlo en
`URL_EXTENSION_EDGE` en `frontend/src/lib/extension-adres.ts`. Desplegar.

Desde ese momento, en Edge el botón **Instalar extensión** abre la tienda.
En Chrome/Brave sigue la descarga manual (con un aviso de que en Edge es de un
clic).

## 5. Actualizaciones

Subir `version` en `manifest.json`, generar el paquete (paso 1) y en Partner
Center → la extensión → **Update** → subir el nuevo `.zip` → **Publish**. Edge
actualiza la extensión sola en todos los equipos.

## (Opcional) Instalarla sola en todos los PC

Con la extensión publicada, quien administre los PC puede dejarla instalada
en Edge sin que la televenta haga nada (requiere permisos de administrador),
con el ID que muestra Partner Center:

```bat
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist" /v 1 /t REG_SZ /d "<ID_DE_LA_EXTENSION>;https://edge.microsoft.com/extensionwebstorebase/v1/crx" /f
```
