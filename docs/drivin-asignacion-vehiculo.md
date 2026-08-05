# API External v2 — Asignación inmediata de pedido a vehículo/ruta existente

> **ASUNTO:** API External v2 — asignación inmediata de pedido a vehículo/ruta existente

Hola equipo de soporte de Drivin.

Estamos integrando la API External v2 para Sameday Delivery.

Nuestro requerimiento operativo es el siguiente:

1. El usuario selecciona un domiciliario/vehículo en nuestro sistema.
2. Se crea un nuevo pedido.
3. El pedido debe quedar asignado inmediatamente al vehículo seleccionado.
4. El vehículo ya puede tener una ruta iniciada (estado `Started`).
5. NO queremos reoptimizar todo el escenario, porque las rutas del día ya están siendo ejecutadas.

Actualmente tenemos el siguiente problema.

## 1. Creación del pedido
```
POST /api/external/v2/orders?token={scenario_token}&schema_code=01&autoassign=1
```
Dentro de `orders[]` enviamos:
```json
{
  "code": "PEDIDO-PRUEBA-001",
  "category": "Delivery",
  "delivery_date": "2026-08-05",
  "vehicle_code": "MUL18G - Arturo Goez",
  "force_vehicle_assignation": true
}
```
El `vehicle_code` corresponde exactamente al `code` obtenido mediante
`GET /api/external/v2/vehicles` (ej. `"MUL18G - Arturo Goez"`).

## 2. Respuesta del POST
```
HTTP 200 OK
success: true
added: ["PEDIDO-PRUEBA-001"]
addresses_count: 0
```

## 3. Consulta posterior de la orden
`GET /api/external/v2/orders?token={scenario_token}` → la orden aparece, pero:
```
vehicle_code: null
```
Aunque enviamos `vehicle_code` + `force_vehicle_assignation: true`, la asignación no
queda aplicada.

## 4. Geocodificación
La dirección aparece luego en `GET /orders` (`address_1`), pero **no geocodificada**.
Probamos `"lat"/"lng"` y `"latitude"/"longitude"` con coordenadas válidas
(`11.0023043 / -74.8277215`) y en ambos casos `addresses_count = 0`.

Preguntas:
- **A.** ¿Cuáles son los campos EXACTOS que acepta `POST /orders` para las coordenadas?
- **B.** ¿Qué significa exactamente `addresses_count: 0`?
- **C.** ¿La geocodificación es asíncrona?
- **D.** ¿Hay endpoint para consultar cuándo una dirección ya fue geocodificada?
- **E.** ¿Hay endpoint para validar una dirección y obtener sus coordenadas antes de agregarla?
- **F.** ¿Qué condiciones debe cumplir una dirección para ser válida para planificación?

## 5. vehicle_code
Enviamos exactamente el `code` de `GET /vehicles` (ej. `"MUL18G - Arturo Goez"`).
- **A.** ¿Es este el identificador correcto?
- **B.** ¿Existe otro identificador interno para asignar una orden?
- **C.** ¿La asignación por `vehicle_code` se realiza durante `POST /orders` o posteriormente?

## 6. force_vehicle_assignation
Enviamos `"vehicle_code": "...", "force_vehicle_assignation": true`.
- **A.** ¿Qué condiciones debe cumplir el schema/escenario para que se aplique?
- **B.** ¿Garantiza que la orden quede en ese vehículo?
- **C.** ¿La asignación ocurre inmediatamente?
- **D.** ¿O requiere una planificación/optimización posterior?
- **E.** ¿Hay configuración del schema que habilite/deshabilite este comportamiento?

## 7. Escenario `Started` — caso real (principal)
Los escenarios del día están `status = Started` y las rutas ya se están ejecutando.
Durante el día llegan nuevos pedidos. Necesitamos:
```
USUARIO → selecciona domiciliario → crea pedido → asignación inmediata → ruta existente del domiciliario
```
SIN: reoptimizar todo el escenario, modificar las rutas de los demás vehículos, ni
reiniciar la planificación del día.

## 8. Asignación directa a una ruta
¿Existe en External v2 un endpoint para `PEDIDO → RUTA → VEHÍCULO` sin optimización
completa del escenario? Por ejemplo algo equivalente a:
```
POST /orders/{order_code}/assign
PUT  /orders/{order_code}
POST /routes/{route_code}/orders
```
Por favor indicar el endpoint REAL y documentado.

## 9. Ruta ya iniciada
Si el vehículo ya tiene una ruta `Started`, ¿podemos agregar una nueva orden
directamente a esa ruta? Si sí, necesitamos: 1) Endpoint, 2) Método HTTP,
3) Query params, 4) Body JSON completo, 5) Ejemplo de respuesta, 6) Restricciones
para rutas `Started`.

## 10. PUT /routes/{vehicle_code}
Vimos `PUT /routes/{vehicle_code}?token={scenario_token}` para actualizar una ruta
no finalizada. ¿Permite **agregar una nueva orden/parada** a la ruta? Si no, ¿cuál
es el endpoint específico para incorporar una orden a una ruta existente?

## 11. Optimización
Probamos `PUT /scenarios/{scenario_token}/optimize` → responde `200`, pero el
escenario queda en estado `Error` y la orden sigue con `vehicle_code: null`. No lo
encontramos documentado. Sí encontramos `PUT /routes/{vehicle_code}/optimize?token={scenario_token}`.
- **A.** ¿Existe realmente `/scenarios/{scenario_token}/optimize` en External v2?
- **B.** Si existe, ¿qué función cumple?
- **C.** Si no, ¿cuál es el endpoint correcto para optimizar?
- **D.** Para nuestro caso, ¿debemos optimizar una RUTA específica en vez de todo el escenario?

## 12. Detalle del error de optimización
Cuando optimizamos, el escenario termina en `Error`. ¿Hay endpoint para obtener el
**detalle técnico** del error? (dirección no geocodificada, coordenadas, ventana
horaria, vehículo, capacidad, config del schema, incompatibilidad de la orden, etc.)

## 13. Flujo oficial recomendado
Nuestro flujo deseado:
```
GET /scenarios → scenario_token → GET /vehicles → usuario elige vehicle_code
→ POST /orders → asignación inmediata → ruta existente del vehículo
```
con el escenario en `Started` y sin reoptimizar. Por favor responder con:
1) Endpoints exactos, 2) Método HTTP, 3) Query params, 4) Headers, 5) Body JSON,
6) Ejemplo completo de request, 7) Ejemplo completo de response, 8) Restricciones
según estado del escenario/ruta.

## 14. Lo que principalmente necesitamos confirmar
1. ¿Cómo hacer que una orden nueva quede **inmediatamente** asignada al `vehicle_code` seleccionado?
2. ¿Cómo **incorporar esa orden a la ruta existente** de ese vehículo cuando la ruta ya está `Started`?
3. ¿Cómo hacerlo **sin reoptimizar** todo el escenario?

> **Pregunta más importante:** ¿existe una operación de **“insertar/agregar parada”
> a una ruta ya existente**? Si existe, esa es probablemente la solución para nuestro
> caso: trabajar sobre la **ruta del vehículo**, no sobre el escenario completo.

Objetivo final:
```
PEDIDO NUEVO → VEHÍCULO SELECCIONADO POR EL USUARIO → RUTA EXISTENTE DEL VEHÍCULO → ASIGNACIÓN INMEDIATA
```
Agradecemos indicarnos el procedimiento oficialmente soportado por la API External v2.
