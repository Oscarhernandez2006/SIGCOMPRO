# Actualizaciones de operacion

## Listas por punto

La lista General conserva `menu_config` y su enlace `/tienda/<punto>`.
Las listas adicionales se guardan en `menu_listas`, se crean desde General y
se comparten mediante `/tienda/<punto>/<codigo>`. El servidor valida el punto
asignado en todas las operaciones privadas. Una lista adicional vacia no usa
como respaldo el catalogo general.

## Club Yo Soy Santacruz

`/pedidos-credito` y `/admin/pedidos-credito` reutilizan la pagina real de
Despacho: preparacion, alistamiento, factura, tiempos, detalle y cierre en PDV.
Las compras se enlazan de forma idempotente con `pedidos`, identificadas por
`canal=club` e id `club:<compra>`. Conservan su comanda `1CSE` y no afectan
los consecutivos, listado ni historico comercial. El pago es siempre Credito
y la entrega siempre recogida en punto de venta.

Al entregar, la compra de credito se actualiza dentro de la misma transaccion
que el despacho. Si falla cualquiera de las dos operaciones, se revierte el
cierre completo. El backend exige factura y porcionador. La compra original
conserva sus productos, colaborador e importe. El enlace anterior de tienda
redirige al despacho del club y no permite cambiar estados por la API antigua.

El panel de credito se llama Club Yo Soy Santacruz. Su registro muestra por
defecto los entregados y el detalle incluye preparacion, factura y trazabilidad.
La
consulta personal Mi credito redirige al registro. La nomina se consulta por
mes y quincena (13 y 27); los periodos sin compras devuelven cero. El contador
de pendientes se consulta por separado, sin el limite del listado.

## Orden de los menus

El lapiz junto al control de expandir activa la organizacion en vivo con
flechas de subir/bajar. Guardar confirma y Cancelar restaura el orden anterior.
Tambien funciona en movil y en los submenus administrativos.

El orden es global por panel y se guarda en `configuracion`, con claves
`sidebar:orden:administrativo`, `sidebar:orden:operativo`, `sidebar:orden:club`
y `sidebar:orden:run-errands`; no se almacena en el navegador. Cada usuario
sigue viendo unicamente las paginas autorizadas. Los menus consultan el orden
guardado al cargar y lo refrescan cada 30 segundos fuera del modo de edicion.

El permiso `sidebar.organizar` aparece en el catalogo, pero el backend limita
el guardado a administrador, administrador app y desarrollador, incluso si
otro rol recibe esa clave. Paneles invalidos, rutas externas y duplicados se
rechazan. Las paginas nuevas aparecen al final sin perder el orden guardado.

## Almuerzos

Los accesos se llaman Aprobacion almuerzo y Aprobacion extension. Reprogramar
requiere motivo; se muestra al domiciliario junto al nombre del administrador.
No se permite cancelar un almuerzo, ni mediante la API anterior.

El domiciliario confirma Ya estoy disponible desde LIQUIDACION-DRIVIN-WEB.
SIGCOMPRO verifica que sea su almuerzo, que corresponda a hoy y que haya
iniciado; guarda `disponible_en` y muestra Disponible. El fin automatico de la
hora no equivale a confirmacion de disponibilidad.

## Verificacion y puesta en marcha

```powershell
node --test SIGCOMPRO/backend/test/operacion.test.cjs
```

Los cambios de esquema son aditivos y se ejecutan en `onModuleInit`, siguiendo
el patron existente. Las filas historicas de compras reciben consecutivo al
agregar la columna identity; este numero no se recalcula al consultar.

Para el flujo completo de almuerzos deben actualizarse SIGCOMPRO y
LIQUIDACION-DRIVIN-WEB, desplegando primero el backend de SIGCOMPRO. No arrancar
el backend local con su `.env` actual para probar: apunta a produccion.
