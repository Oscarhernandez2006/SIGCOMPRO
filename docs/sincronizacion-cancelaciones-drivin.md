# Sincronización Automática de Cancelaciones con Drivin

## Problema Resuelto
Cuando se cancelaba un pedido en SIGCOMPRO (ej: PDV San Felipe), el estado **NO se actualizaba en Drivin**, causando inconsistencia en el sistema de entregas.

## Solución Implementada

### 1. **Cancelación Automática SIGCOMPRO → Drivin**
Cuando un pedido se marca como **"Cancelado"** en SIGCOMPRO:
1. El pedido se guarda en la BD local con `anulado = true` y `estado = 'Cancelado'`
2. **Automáticamente** (en background, sin bloquear la respuesta):
   - Se intenta **eliminar** la orden en Drivin via `DELETE /orders/{comanda}?token=...`
   - Si eso falla, se intenta **marcar como cancelada** via `PUT /orders/{comanda}` con `status: 'cancelled'`
   - Se limpian los metadatos locales (domiciliario, estado de Drivin, etc)
   - Se registra en los logs la operación

**Flujo:**
```
Usuario cancela pedido en SIGCOMPRO
    ↓
guardar() detecta transición a "Cancelado"
    ↓
cancelarEnDrivin() ejecuta en background
    ↓
Intenta DELETE, luego PUT
    ↓
Limpia metadata
    ↓
Registra en logs
```

### 2. **Sincronización Inversa Drivin → SIGCOMPRO**
Cuando Drivin **rechaza o cancela una orden** (status = `rejected`/`cancelled`):
- Se puede ejecutar manualmente el endpoint `POST /pedidos/drivin/sincronizar-cancelaciones`
- O se puede programar un **job/cron** que ejecute cada cierto tiempo

**Flujo:**
```
Job sincronizarCancelacionesDrivin()
    ↓
Consulta GET /scenarios?date=hoy de Drivin
    ↓
Lee todas las órdenes de cada escenario
    ↓
Detecta órdenes con status = rejected/cancelled
    ↓
Busca los pedidos SIGCOMPRO correspondientes
    ↓
Marca como "Cancelado" con motivo "Cancelado por Drivin"
    ↓
Registra en logs y trazabilidad
```

## Endpoints Nuevos

### Sincronizar Cancelaciones desde Drivin
```http
POST /pedidos/drivin/sincronizar-cancelaciones
Authorization: Bearer <token>
```

**Respuesta:**
```json
{
  "actualizados": 2
}
```

**Uso:**
- Ejecutar manualmente si se detecta inconsistencia
- Ejecutar por un job programado cada 5-10 minutos durante el día
- Ejecutar después de cambios manuales en Drivin

## Códigos Modificados

### Backend - `src/pedidos/pedidos.service.ts`

#### Nuevo Método: `cancelarEnDrivin()`
- **Visibilidad:** Privado
- **Ejecución:** Asíncrona (no-bloqueante)
- **Ubicación:** Línea ~1770
- **Responsabilidad:**
  1. Obtener comanda y validar
  2. Resolver schema_code de Drivin por punto
  3. Obtener token del escenario
  4. Intentar DELETE
  5. Si falla, intentar PUT con `status: cancelled`
  6. Limpiar metadata
  7. Registrar en logs

#### Nuevo Método: `sincronizarCancelacionesDrivin()`
- **Visibilidad:** Público
- **Ejecución:** Síncrona
- **Ubicación:** Línea ~1680
- **Responsabilidad:**
  1. Obtener escenarios de hoy en Drivin
  2. Leer todas las órdenes de cada escenario
  3. Detectar órdenes con status final (rejected/cancelled)
  4. Buscar pedidos SIGCOMPRO correspondientes
  5. Actualizar a "Cancelado"
  6. Retornar cantidad actualizada

#### Modificación: `guardar()`
- **Ubicación:** Línea ~745 (después de INSERT)
- **Cambio:** Detecta transición a estado "Cancelado"
- **Acción:** Dispara `cancelarEnDrivin()` en background

### Backend - `src/pedidos/pedidos.controller.ts`

#### Nuevo Endpoint
```typescript
@Post('drivin/sincronizar-cancelaciones')
@Permisos('despacho')
sincronizarCancelaciones() {
  return this.pedidos.sincronizarCancelacionesDrivin();
}
```

## Logs Generados

Todos los eventos se registran en los logs de la aplicación:

```
[Pedidos] Drivin orden 7CS00000123 cancelada: DELETE /api/external/v2/orders/7CS00000123 → 200
[Pedidos] Pedido abc123def (7CS00000123) sincronizado: cancelado por Drivin
[Pedidos] No se pudo cancelar 7CS00000124 en Drivin (PUT): timeout
```

## Mantenimiento

### Recomendaciones

1. **Ejecutar sincronización periódica:**
   - Job/cron cada 5 minutos durante 06:00 - 22:00 (horario de operación)
   - Utiliza POST `/pedidos/drivin/sincronizar-cancelaciones`

2. **Monitoreo:**
   - Revisar logs regularmente
   - Alertar si hay muchos errores en `cancelarEnDrivin()`
   - Alertar si `sincronizarCancelacionesDrivin()` detecta desincronizaciones

3. **Fallback Manual:**
   - Si hay inconsistencias, ejecutar manualmente:
     ```bash
     curl -X POST http://localhost:3000/pedidos/drivin/sincronizar-cancelaciones \
       -H "Authorization: Bearer <token>"
     ```

## Casos Manejados

### ✅ Cancelación Normal
- Pedido creado → Enviado a Drivin → Cancelado en SIGCOMPRO → Eliminado de Drivin

### ✅ Cancelación de Pedido Sin Enviar a Drivin
- Pedido creado → Cancelado en SIGCOMPRO → (sin operación en Drivin porque nunca se envió)

### ✅ Cancelación de Pedido en Tránsito
- Pedido en Drivin → Cancelado en SIGCOMPRO → Se intenta DELETE, falla → Se intenta PUT

### ✅ Drivin Rechaza Pedido
- Pedido enviado a Drivin → Drivin lo rechaza → Sincronización inversa marca como Cancelado

### ⚠️ Errores Controlados
- API Drivin no disponible → Log de error, no falla la cancelación en SIGCOMPRO
- Comanda no existe en Drivin → No hay error, log INFO
- DNS intermitente → Reintenta hasta 3 veces con backoff

## Testing

### Test Manual - Cancelación SIGCOMPRO → Drivin
```bash
# 1. Obtener pedido existente
GET /pedidos

# 2. Cancelarlo
PUT /pedidos/{id}
{
  "id": "...",
  "estado": "Cancelado",
  "anulado": true,
  "motivo": "Cliente solicitó cancelación"
}

# 3. Verificar logs para "Drivin orden ... cancelada"
# 4. Verificar en Drivin que la orden fue eliminada/cancelada
```

### Test Manual - Sincronización Drivin → SIGCOMPRO
```bash
# 1. Marcar una orden como rejected en Drivin (manualmente o por API)

# 2. Ejecutar sincronización
POST /pedidos/drivin/sincronizar-cancelaciones

# 3. Verificar respuesta: { "actualizados": N }

# 4. Verificar que el pedido en SIGCOMPRO ahora tiene estado "Cancelado"
GET /pedidos/{id} → estado === "Cancelado"
```

## Notas de Implementación

1. **No-bloqueante:** La cancelación en Drivin se ejecuta en background para no ralentizar la API
2. **Idempotente:** Ejecutar varias veces el endpoint de sincronización no causa problemas
3. **Tolerante a fallos:** Si Drivin no responde, el pedido igual se cancela en SIGCOMPRO
4. **Auditable:** Todo se registra en la trazabilidad del pedido
5. **Configurable:** Las reintentos y timeouts se pueden ajustar en el código

## Próximos Pasos (Opcional)

1. Crear job automático en el scheduler de NestJS
2. Agregar webhook listener para eventos de Drivin (si es soportado)
3. Crear UI para ver estado de sincronización
4. Crear alertas en caso de desincronización
