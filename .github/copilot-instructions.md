# VOLANDO-CARNES / SIGCOMPRO — Guía del proyecto

> Lee este archivo antes de explorar. Resume arquitectura, estructura, convenciones y comandos
> para no recorrer todo el árbol y gastar menos tokens. Mantenlo actualizado al hacer cambios grandes.

## Qué es
Software de pedidos y despacho de Carnes Santacruz (Grupo Santacruz). Monorepo `backend` (NestJS) + `frontend` (Next.js). Dominio público: `sigcompro.grupo-santacruz.com`.

## Stack
- **Backend**: NestJS 10, TypeScript. Puerto **3001**, prefijo global **`/api`**. Driver **`pg` (node-postgres) con SQL CRUDO — NO hay ORM** (ni TypeORM/Prisma/etc.). Pool en `PG_POOL` (`backend/src/database/database.module.ts`, `max: 10`, keepAlive).
- **Frontend**: Next.js 16 (App Router, Turbopack), React 19, Tailwind v4. Puerto **3000**. Lee `frontend/.env.local` (`NEXT_PUBLIC_API_URL`).
- **BD**: PostgreSQL de PRODUCCIÓN remota (Azure) `DBSIGCOM-PRO` en `20.121.178.90:5436` (DB_SSL=false). Credenciales en `backend/.env` (gitignored). El backend local apunta a esta BD prod.
- **Deploy**: 1 solo contenedor (`Dockerfile` raíz) con **Caddy** en :80 que enruta `/api/*`→backend:3001 y `/*`→frontend:3000. Traefik (ver `deploy.sh`) enruta al puerto 80. Caddyfile tiene `encode zstd gzip`.

## Estructura
```
backend/src/
  main.ts (bootstrap, prefijo /api, CORS, límite 12mb)
  app.module.ts, database/database.module.ts (PG_POOL)
  auth/ (JWT + clave-dinámica), users/ (permisos.catalog.ts), clientes/, puntos-venta/,
  productos/ (listas precio, @Cron 7:50am sync), pedidos/, despacho vía pedidos,
  cotizaciones/, congelados/, configuracion/ (personal, cortes, cuadre), motivos/, ubicaciones/
frontend/src/
  app/(panel)/  -> pedidos, despacho, cuadre-caja, cotizaciones, congelados, historicos, ubicaciones
  app/admin/    -> usuarios, configuracion (Gestión de recursos), dashboard
  app/seleccionar-panel, layout.tsx, page.tsx (login)
  components/ (AdminShell, PanelShell, DireccionInput, MapaDireccion, ReferenciaInput, ...)
  lib/ (api.ts=apiFetch, auth.ts=sesión en cookies, pedidos.ts, despacho.ts, configuracion.ts, ...)
```

## Convenciones (IMPORTANTES)
- **SQL crudo siempre parametrizado** (`$1,$2`) para evitar inyección. Sin migraciones: tablas se crean con `CREATE TABLE IF NOT EXISTS` en `onModuleInit`.
- **Pedidos/cotizaciones se guardan como blob `jsonb`** en columna `data` (+ `meta` jsonb para despacho). Agregar campos NO requiere migración.
- **NADA en localStorage/sessionStorage**. Todo persiste en la BD. La sesión (token+usuario) va en **cookies** (`lib/auth.ts`: `vc_token`/`vc_usuario`). `apiFetch` lee el token de `getToken()`.
- **Scripts temporales** para tocar BD/Excel: crear en `backend/` (`tmp-*.js`), leer `.env` a mano (no hay dotenv en preload) y **BORRARLOS tras usar**. `backend/perf-test.js` es el diagnóstico de velocidad reutilizable.
- Permisos: `puedeAccion(usuario,'clave')` granular; roles con acceso a multipunto/selector = `puedeSeleccionarPuntoVenta(rol)` = `["administrador app","desarrollador"]`. Catálogo en `backend/src/users/permisos.catalog.ts` + `frontend/src/lib/usuarios.ts`.

## Comandos
```powershell
# Dev (Windows PowerShell). Cada uno queda en watch:
npm --prefix C:\PROYECTOS\VOLANDO-CARNES\backend run start:dev    # NestJS :3001
npm --prefix C:\PROYECTOS\VOLANDO-CARNES\frontend run dev         # Next.js :3000
# Verificar:
Invoke-RestMethod http://localhost:3001/api/health               # -> { status: "ok" }
Invoke-WebRequest http://localhost:3000/<ruta> -UseBasicParsing  # -> 200
# Compilar backend sin emitir:  cd backend; npx tsc --noEmit -p tsconfig.json
```
- **Git**: repo `Oscarhernandez2006/SIGCOMPRO`, rama `main`. En PowerShell, `git push` imprime `RemoteException` en stderr aunque **el push funcione** (mira la línea `... -> main` y `EXIT=0`). No commitear `.env`/`.env.local`.

## Gotchas
- Frontend usa `output: "standalone"`. Si corres `next build` y luego `next dev`, el `.next` de producción queda stale y Turbopack DEJA DE REGISTRAR el route group `(panel)` → todas las rutas del panel dan 404. FIX: parar dev, `Remove-Item -Recurse -Force frontend\.next`, reiniciar `npm run dev`.
- Los servidores dev a veces se cierran solos entre sesiones; reinícialos con los comandos de arriba.

## Rendimiento (ya implementado en pedidos/despacho)
- `GET /api/pedidos` = `estado(desde?, rango?, fecha?)` en `pedidos.service.ts`. Devuelve `{pedidos, meta, impresos, ahora}` y OMITE `data->'trazabilidad'` (se pide aparte con `GET /api/pedidos/:id/trazabilidad`).
- **Polling incremental**: el frontend manda `?desde=<ahora previo>` cada 7s → solo lo cambiado (~KB). Guard `enVuelo` evita encaballar peticiones.
- **Alcance `rango`**: `hoy` (activos + finalizados de hoy; lo usan Pedidos/Despacho), `fecha`+`fecha=YYYY-MM-DD` (día anterior bajo demanda), `posteriores`. SIN `rango` = activos + últimos N días (lo usan Cuadre de caja, Históricos, Dashboard — NO cambiar).

## Dominio clave
- **Despacho** (`app/(panel)/despacho/page.tsx`): flujo de estados En proceso→En producción→Alistado→Facturado→Despachado (etiquetas Pendiente/Preparado en el selector). Meta jsonb: porcionador, inicio/fin (alistado), facturaNumero/facturaValor, domiciliario, despachoFin, pagoConfirmado (transferencia), replicas, despachadoPor, cuadreEfectivo/cuadreOmp. Tiempos en `lib/despacho.ts`. Selectores de porcionador/domiciliario vienen de `/configuracion/despacho` por punto (excluye inactivos).
- **Cuadre de caja** (`cuadre-caja/page.tsx`): liquida despachados por día+punto; autoguardado con aviso emergente; botón "Cerrar Caja"; bloqueo por facturador (solo quien facturó puede cuadrar).
- **Gestión de recursos** (`admin/configuracion/page.tsx`): porcionadores/domiciliarios con puntos asignados e interruptor **Activo/Inactivo** (inactivo no sale en selectores de despacho). Registro global en `configuracion` (`personal_despacho:registro`).
- **Trazabilidad**: cada pedido registra eventos (creacion/estado/anulacion/cancelacion/edicion con motivo, usuario y fecha del servidor) en `data.trazabilidad`.
- **Número del día (`numeroDia`)**: turno diario por punto. Se **congela** al asignarse: se guarda `numeroDia` + `numeroDiaFecha` (día YYYY-MM-DD al que pertenece). NUNCA se recalcula al leer/mostrar (ni backend `estado` ni frontend `numerosDelDia`, que solo usa el guardado). Al crear (`guardar`, bajo lock del punto) `renumerarYSiguiente()` primero RENUMERA los arrastrados de hoy (activos con día de entrega anterior, sin número de hoy) dándoles los primeros números por antigüedad, y el nuevo toma el siguiente. Un `@Cron 00:05` (`renumerarArrastradosDia`) hace lo mismo para todos los puntos al cambiar de día. Así un pedido no cambia ni repite su número. NO reintroducir recálculo por posición.

