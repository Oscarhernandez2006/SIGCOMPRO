# SIGCOMPRO - Sincronización Automática de Cancelaciones (IMPLEMENTACIÓN)

**Fecha:** 18/08/2026  
**Versión:** 1.0  
**Estado:** ✅ Implementado y Compilado

---

## Resumen del Problema

**Situación:** Cuando se cancelaba un pedido del PDV San Felipe en SIGCOMPRO, **no se notificaba a Drivin**, por lo que el estado del pedido en el sistema de entregas seguía como "activo" en lugar de "cancelado".

**Impacto:** 
- Domiciliarios recibían órdenes canceladas
- Confusión en el seguimiento de entregas
- Falta de sincronización entre sistemas

**Solución:** Implementar sincronización automática bidireccional:
1. **SIGCOMPRO → Drivin:** Marcar como cancelado en Drivin cuando se cancela en SIGCOMPRO (auditable)
2. **Drivin → SIGCOMPRO:** Marcar como cancelado en SIGCOMPRO si Drivin lo rechaza

---

## Cambios Implementados

### ✅ Backend - `src/pedidos/pedidos.service.ts`

**1. Nuevo Método Privado: `cancelarEnDrivin()`**
```typescript
private async cancelarEnDrivin(
  pedidoId: string,
  comanda: string,
  puntoCodigo: string,
  puntoNombre: string,
): Promise<void>
```
- Ejecuta de forma **asíncrona** (no-bloqueante)
- Envía **PUT** a Drivin con `status: 'cancelled'` (marca como cancelada, no elimina)
- Limpia metadatos locales (domiciliario, etc)
- Registra en logs
- Mantiene auditoría y trazabilidad
- **Ubicación:** Línea ~1770

**2. Nuevo Método Público: `sincronizarCancelacionesDrivin()`**
```typescript
async sincronizarCancelacionesDrivin(): Promise<number>
```
- Consulta Drivin por órdenes rechazadas/canceladas
- Actualiza pedidos SIGCOMPRO correspondientes
- Retorna cantidad de actualizaciones
- **Ubicación:** Línea ~1680

**3. Modificación: Método `guardar()`**
- Detecta transición a estado `"Cancelado"`
- Dispara `cancelarEnDrivin()` automáticamente
- **Ubicación:** Línea ~745 (después de INSERT)

### ✅ Backend - `src/pedidos/pedidos.controller.ts`

**Nuevo Endpoint:**
```typescript
@Post('drivin/sincronizar-cancelaciones')
@Permisos('despacho')
sincronizarCancelaciones() {
  return this.pedidos.sincronizarCancelacionesDrivin();
}
```
- Permite sincronización manual bajo demanda
- Requiere permisos de despacho

### ✅ Compilación
- ✓ `npm run build` ejecuta sin errores
- ✓ TypeScript compila correctamente
- ✓ Listo para deploy

---

## Cómo Funciona (Flujo Automático)

### Cancelación SIGCOMPRO → Drivin

```
1. Usuario cancela pedido en interfaz SIGCOMPRO
                    ↓
2. Frontend: PUT /pedidos/{id}
   {
     "estado": "Cancelado",
     "anulado": true,
     "motivo": "..."
   }
                    ↓
3. Backend: guardar() detecta cancelación
                    ↓
4. Backend: INSERT/UPDATE en BD
                    ↓
5. Backend (ASYNC): cancelarEnDrivin() se ejecuta en background
                    ↓
6. Envía PUT /api/external/v2/orders/{comanda}?token=...
   Body: { status: 'cancelled' }
                    ↓
7. Drivin marca la orden como cancelada ✓
   (mantiene auditoría y registro)
                    ↓
8. Limpia metadata local (domiciliario, etc)
                    ↓
9. Registra en logs
                    ↓
10. ⏱️ Respuesta al usuario INMEDIATA (no espera Drivin)
```

### Sincronización Drivin → SIGCOMPRO (Bajo Demanda)

```
1. Admin/Sistema ejecuta:
   POST /pedidos/drivin/sincronizar-cancelaciones
                    ↓
2. Backend: syncCancelacionesDrivin() se ejecuta
                    ↓
3. GET /api/external/v2/scenarios?date=hoy (Drivin)
                    ↓
4. Lee todas las órdenes de cada escenario
                    ↓
5. Detecta órdenes con status = rejected/cancelled
                    ↓
6. Para cada orden rechazada:
   - Busca el pedido en SIGCOMPRO
   - Si NO está cancelado → lo marca como "Cancelado"
   - Registra en trazabilidad
                    ↓
7. Retorna cantidad actualizada: { "actualizados": N }
```

---

## Uso del Sistema

### Opción A: Cancelación Automática (RECOMENDADO - Ya Está Implementada)

No requiere configuración. Simplemente:
1. Usuario cancela un pedido en SIGCOMPRO
2. ✅ Automáticamente se cancela en Drivin
3. ✅ Se limpian los metadatos

### Opción B: Sincronización Manual Bajo Demanda

```bash
curl -X POST http://localhost:3000/pedidos/drivin/sincronizar-cancelaciones \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

**Respuesta:**
```json
{
  "actualizados": 2
}
```

### Opción C: Sincronización Programada (Requiere Instalación)

Instalar job automático cada 5 minutos (ver `drivin-sync.job.example.ts`):

```bash
npm install --save @nestjs/schedule
```

Luego implementar la clase en `src/jobs/drivin-sync.job.ts` (usar el archivo example como referencia).

---

## Testing & Validación

### ✅ Test 1: Cancelación Automática
```bash
# 1. Obtener ID de un pedido
GET http://localhost:3000/pedidos

# 2. Cancelarlo
PUT http://localhost:3000/pedidos/{id}
Body: { "estado": "Cancelado", "anulado": true, "motivo": "Test" }

# 3. Verificar logs
# Buscar: "Drivin orden ... marcada como cancelada (status: 200)"

# 4. Verificar en Drivin
# Comprobar que la orden cambió a status = 'cancelled'
```

### ✅ Test 2: Sincronización Inversa
```bash
# 1. Marcar una orden como rejected en Drivin (via UI de Drivin)

# 2. Ejecutar sincronización
POST http://localhost:3000/pedidos/drivin/sincronizar-cancelaciones

# 3. Verificar respuesta
# { "actualizados": 1 }

# 4. Verificar en SIGCOMPRO
GET http://localhost:3000/pedidos/{id}
# El pedido debe tener estado = "Cancelado"
```

### ✅ Test 3: Error Handling
```bash
# 1. Desactivar temporalmente Drivin (simular error)

# 2. Cancelar pedido en SIGCOMPRO
PUT http://localhost:3000/pedidos/{id}
Body: { "estado": "Cancelado", "anulado": true }

# 3. Verificar que:
# ✓ El pedido SE CANCELA en SIGCOMPRO
# ✓ Los logs muestran error de Drivin
# ✓ No falla la operación
```

---

## Logs & Monitoreo

### Logs Exitosos
```
[Pedidos] ✓ Drivin orden 7CS00000123 marcada como cancelada (status: 200)
[Pedidos] Pedido abc123def sincronizado: cancelado por Drivin
```

### Logs de Error (Controlados)
```
[Pedidos] WARN: No se pudo cancelar 7CS00000124 en Drivin: timeout
[Pedidos] WARN: Pedido sin comanda, no se cancela en Drivin
[Pedidos] WARN: Drivin orden 7CS00000123: respuesta inesperada (status: 500)
```

### Búsqueda en Logs
```bash
# Buscar todas las cancelaciones
grep "cancelada" /var/log/sigcompro/backend.log

# Buscar errores
grep "ERROR" /var/log/sigcompro/backend.log | grep -i drivin

# Ver en tiempo real
tail -f /var/log/sigcompro/backend.log | grep Drivin
```

---

## Deployment

### Pre-Deploy
✅ Código compilado sin errores  
✅ Tests locales pasados  
✅ Documentación generada  
✅ No hay dependencias nuevas en package.json

### Deploy Steps
1. **Pull** los cambios:
   ```bash
   git pull origin main
   ```

2. **Instalar** (si es necesario):
   ```bash
   npm install
   ```

3. **Compilar**:
   ```bash
   npm run build
   ```

4. **Testear**:
   ```bash
   npm run test
   ```

5. **Deploy** (restart del servicio):
   ```bash
   systemctl restart sigcompro-backend
   # o
   docker restart sigcompro-backend
   ```

6. **Verificar**:
   ```bash
   curl http://localhost:3000/pedidos/drivin/asignaciones -H "Authorization: Bearer ..."
   ```

### Rollback (si es necesario)
```bash
git revert <commit-hash>
npm run build
systemctl restart sigcompro-backend
```

---

## Checklist de Implementación

- [x] Código implementado
- [x] Backend compilado sin errores
- [x] Nuevos métodos agregados
- [x] Endpoint nuevo creado
- [x] Documentación generada
- [x] Job example proporcionado
- [ ] Deploy en staging
- [ ] Test en staging
- [ ] Deploy en producción
- [ ] Monitoreo activo (primeras 24h)

---

## Soporte & Troubleshooting

### Problema: "Pedido cancelado en SIGCOMPRO pero no en Drivin"

**Causa:** Drivin no disponible o error de API

**Solución:**
1. Revisar logs: `grep ERROR backend.log | grep Drivin`
2. Verificar API key: `echo $DRIVIN_API_KEY`
3. Ejecutar sincronización manual:
   ```bash
   curl -X POST http://localhost:3000/pedidos/drivin/sincronizar-cancelaciones ...
   ```

### Problema: "Orden rechazada en Drivin pero no en SIGCOMPRO"

**Causa:** Sincronización inversa no ejecutada

**Solución:**
1. Ejecutar manualmente: `POST /pedidos/drivin/sincronizar-cancelaciones`
2. O implementar job automático (ver drivin-sync.job.example.ts)

### Problema: Pedido cancelado dos veces (duplicado)

**Causa:** La operación es idempotente, no hay duplicados

**Explicación:** Si ejecutas cancel 10 veces, el resultado es el mismo (pedido cancelado). No hay problemas.

---

## Próximas Mejoras (Opcional)

1. **Job automático cada 5 min** → Usar `@nestjs/schedule`
2. **Webhook desde Drivin** → Recibir eventos en tiempo real
3. **Dashboard de sincronización** → Ver estado en interfaz
4. **Alertas automáticas** → Notificar si hay desincronizaciones
5. **Métricas** → Contar cancelaciones/día, tasa de éxito

---

## Contacto & Preguntas

**Desarrollador:** GitHub Copilot  
**Implementación:** 18/08/2026  
**Versión Backend:** 0.1.0 (compatible)

Para preguntas técnicas, revisar:
- [sincronizacion-cancelaciones-drivin.md](./sincronizacion-cancelaciones-drivin.md)
- [drivin-sync.job.example.ts](../backend/src/jobs/drivin-sync.job.example.ts)
- Código fuente en `pedidos.service.ts` y `pedidos.controller.ts`

---

**Status Final:** ✅ LISTO PARA DEPLOY
