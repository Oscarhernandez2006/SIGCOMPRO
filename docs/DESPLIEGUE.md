# Despliegue de SIGCOMPRO

Produccion usa la aplicacion de Dokploy `sigcompro-sigcompro-jej3vi`, con el
Dockerfile de la raiz (Caddy :80, NestJS y Next.js en un contenedor).
El compose de dos servicios no interviene en este flujo.

Desde PowerShell, en la raiz del proyecto:

```powershell
# Primero revisar y confirmar en Git los archivos que se quieren publicar.
./deploy.ps1 -Push

# Redesplegar un commit que ya esta publicado en origin/main.
./deploy.ps1

# Reparar solamente los labels, sin publicar ni reconstruir.
./deploy.ps1 -LabelsOnly
```

El script lee el destino SSH de
`C:\CRENDENCIALES-SERVIDORES\CREDENCIALES.txt` y usa la llave
`C:\CRENDENCIALES-SERVIDORES\CLAVE.pem`. Se pueden sustituir mediante
`-Server`, `-CredentialsPath` e `-IdentityFile`. Nunca versionar esos archivos.

El usuario SSH debe poder ejecutar Docker y acceder a los contenedores
`dokploy` y `dokploy-postgres`. Se usa el cliente PostgreSQL incluido en
Dokploy y su `DATABASE_URL`, sin copiar credenciales al equipo local.

El script verifica repositorio, rama, tipo de build y ausencia de despliegues
activos; solicita el despliegue mediante el webhook interno de Dokploy y
espera su resultado (30 minutos por defecto, configurable con
`-TimeoutSeconds`). El token del webhook nunca sale del servidor.
Si la compilacion falla, se detiene antes de reaplicar labels.

Al finalizar, ejecuta `deploy.sh` sobre el servicio existente, sin crear
otro stack ni tocar PostgreSQL, y comprueba HTTPS y `/api/health`.
Los labels manuales deben reaplicarse tras futuros despliegues hechos desde
el panel: usar este script para el flujo completo, o `-LabelsOnly` despues.