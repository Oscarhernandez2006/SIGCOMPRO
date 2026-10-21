# Actualizaciones de operacion

## Listas por punto

La lista General conserva `menu_config` y su enlace `/tienda/<punto>`.
Las listas adicionales se guardan en `menu_listas`, se crean desde General y
se comparten mediante `/tienda/<punto>/<codigo>`. El servidor valida el punto
asignado en todas las operaciones privadas. Una lista adicional vacia no usa
como respaldo el catalogo general.

## Compras a credito

`/pedidos-credito` y `/admin/pedidos-credito` muestran pendientes de entrega;
los entregados solo aparecen al seleccionarlos en el filtro. Se conserva el
comprobante obligatorio para entregar. Cada compra tiene una comanda estable
`1CSE` seguida del consecutivo de PostgreSQL. La entrega nueva es recogida en
punto de venta.

El registro de compras permanece en Compras Empleados como historico. La
consulta personal Mi credito redirige al registro. La nomina se consulta por
mes y quincena (13 y 27); los periodos sin compras devuelven cero. El contador
de pendientes se consulta por separado, sin el limite del listado.

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
