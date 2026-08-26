# RESUMEN: Panel Crédito Empleados + Integración Siesa/Cartera

## Estado de la implementación

**Compilación**: ✅ Backend + Frontend compilan sin errores  
**Integración Siesa**: ✅ Flujo completo de sincronización con cartera  
**Permisos**: ✅ Wiring completo de permisos y navegación  
**Status**: Listo para testing local (sin commit)

---

## Qué se implementó

### 1. Panel nuevo "Crédito Empleados" (tercero, separado de operativo/administrativo)

**Frontend:**
- Pantalla principal `/credito-empleados`: buscar trabajador por cédula → mostrar cupo/deuda/disponible → registrar compra
- Pantalla `/credito-empleados/trabajadores`: gestión de trabajadores, cupos, estado (activo/inactivo)
- Shell dedicado `CreditoShell.tsx`: navbar emerald oscuro, ícono billetera, menú contextual
- Cliente API `lib/credito-empleados.ts` con typings de Siesa
- Tabla de pedidos filtrable por estado/fecha/punto con botones de cambio de estado

**Backend:**
- Módulo `credito-empleados/` con:
  - `credito-empleados.service.ts`: lógica de CRUD trabajadores + pedidos
  - `credito-empleados.controller.ts`: 7 endpoints protegidos con JWT + `@Permisos('credito_empleados')`
  - `credito-empleados.module.ts`: wiring de dependencias
  - **`credito-empleados.siesa.client.ts`**: cliente HTTPS para integración Siesa

### 2. Integración directa con Siesa/Cartera (patrón: igual que SIGCOM)

**Flujo automático:**
- Al crear pedido crédito → registra documento **ACR** (Adelanto Crédito) en Siesa
- Al cambiar estado (pendiente/facturado/anulado) → sincroniza estado en Siesa
- Cada operación es **asincrónica** (no bloquea al usuario)
- Errores de Siesa se loguean pero NO impiden la operación local
- Referencia de Siesa se guarda en `cartera_referencia`

**Cliente Siesa:**
```typescript
// Registra documento de crédito
await siesa.registrarCredito({
  tipo_documento: 'ACR',
  numero_documento: 'CRE-{id}',
  fecha, tercero, valor, estado, sucursal, notas
})

// Actualiza estado en Siesa
await siesa.actualizarEstado(numeroDocumento, 'facturado', observacion)

// Consulta estado (preparado para scheduler futuro)
await siesa.consultarEstado(numeroDocumento)
```

### 3. Permisos y navegación

**Backend:**
- Apartado nuevo: `credito_empleados` en `permisos.catalog.ts`
- 3 módulos/acciones:
  - `credito_empleados.cupos`: gestionar trabajadores
  - `credito_empleados.pedidos`: registrar compras
  - `credito_empleados.estado`: cambiar estado pedidos

**Frontend:**
- Catálogo espejado en `lib/usuarios.ts`
- Mapeo en `lib/permisos.ts`: `RUTA_MODULO['credito_empleados'] = '/credito-empleados'`
- Nuevo panel en selector (`seleccionar-panel/page.tsx`): card con ícono billetera, color emerald
- Accessible via: **rol administrativo** O **permiso explícito `credito_empleados`**

### 4. Base de datos

Tablas creadas automáticamente en `onModuleInit`:

```sql
credito_empleados_trabajadores (
  cedula PK,
  nombre,
  cupo_asignado,
  activo,
  timestamps
)

credito_empleados_pedidos (
  id PK,
  trabajador_cedula FK,
  trabajador_nombre,
  punto_id,
  punto_nombre,
  total,
  observacion,
  estado (pendiente|facturado|anulado),
  cartera_referencia,    ← Referencia Siesa
  cartera_estado,        ← Estado en Siesa
  creado_por_id/nombre,
  timestamps
)
```

---

## Configuración necesaria

### Variables de entorno (.env backend)

```bash
# Siesa cartera integration
SIESA_BASE_URL=https://tu-siesa-api.com
SIESA_TOKEN=tu_token_aqui
SIESA_CARTERA_ENDPOINT=/api/cartera/crear-documento
SIESA_CARTERA_ENDPOINT_UPDATE=/api/cartera/actualizar-estado
SIESA_CARTERA_ENDPOINT_GET=/api/cartera/consultar-documento
SIESA_TIMEOUT_MS=10000
```

Ver documentación completa: `backend/src/credito-empleados/INTEGRACION_SIESA.md`

---

## Validaciones y reglas

✅ **Cupo empleado**: no se puede crear pedido si supera disponible (cupo − deuda vigente)  
✅ **Trabajador activo**: solo empleados activos pueden comprar a crédito  
✅ **Deuda vigente**: calcula SUM(pedidos NO anulados)  
✅ **Estado transiciones**: pendiente → facturado → anulado ↔ pendiente  
✅ **Sincronización async**: no bloquea, logs en error  
✅ **Permisos granulares**: cupos, pedidos, cambio estado separados  

---

## Cambios de archivos

### Modificados:
- `backend/src/app.module.ts` → Importa `CreditoEmpleadosModule`
- `backend/src/users/permisos.catalog.ts` → Apartado + módulos + acciones
- `frontend/src/lib/usuarios.ts` → Espejo del catálogo
- `frontend/src/lib/permisos.ts` → Mapeo de rutas + `panelesAccesibles()`
- `frontend/src/app/seleccionar-panel/page.tsx` → Card visual de panel crédito

### Nuevos archivos:
- `backend/src/credito-empleados/` (4 archivos + doc):
  - `credito-empleados.service.ts`
  - `credito-empleados.controller.ts`
  - `credito-empleados.module.ts`
  - `credito-empleados.siesa.client.ts` ← Cliente Siesa
  - `INTEGRACION_SIESA.md` ← Documentación operativa
  
- `frontend/src/lib/credito-empleados.ts` → Cliente API tipado
- `frontend/src/components/CreditoShell.tsx` → Shell/layout dedicado
- `frontend/src/app/credito-empleados/` (2 pages):
  - `page.tsx` → Compras crédito (buscar, registrar, historial)
  - `trabajadores/page.tsx` → Gestión trabajadores/cupos
  - `layout.tsx` → Wrapper con CreditoShell

---

## Flujo completo (usuario)

### Operador de cartera:
1. Entra a SCTOOLS → selecciona "Panel Crédito Empleados"
2. Accede a `/credito-empleados` → busca trabajador por cédula
3. Ve: **Cupo $1M | Deuda $200K | Disponible $800K**
4. Registra compra: $150K, punto "Santa Cruz Centro", observación "Abarrotes"
   - **Backend**: crea pedido, async registra en Siesa como ACR
5. Historial muestra pedido **pendiente**
6. Factura en Siesa → hace click en "Facturar"
   - **Backend**: cambia estado a "facturado", async sincroniza con Siesa
7. Deuda se actualiza: Deuda $350K, Disponible $650K

### Administrador de cartera:
- Accede a `/credito-empleados/trabajadores`
- Busca empleado o crea nuevo (cédula, nombre, cupo)
- Activa/desactiva para habilitar crédito
- Edita cupo bajo demanda

---

## Seguridad y autorización

✅ Todos los endpoints requieren JWT válido  
✅ `@Permisos('credito_empleados')` en controller  
✅ `PermisosGuard` valida módulo + acciones en cada request  
✅ Roles administrativos (administrador, desarrollador, gerencia) acceso total  
✅ Otros usuarios: solo si tienen `credito_empleados` en su lista de permisos  

---

## Pendiente para completar

- [ ] Scheduler para sincronizar estados periódicamente desde Siesa (cron job)
- [ ] Endpoint PUT `/credito-empleados/pedidos/:id/sincronizar` para reintento manual
- [ ] Validación de cupo en Siesa ANTES de crear (consulta opcional en cartera)
- [ ] Webhooks de Siesa para actualizaciones de estado en tiempo real
- [ ] Reportes de cartera por trabajador/punto/fecha
- [ ] Integración con cobros (payment tracking)

---

## Testing local

**Backend:**
```bash
cd backend
npm run start:dev
# En otra terminal:
curl -X POST http://localhost:3001/api/credito-empleados/trabajadores \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"cedula":"1234567890","nombre":"Juan Pérez","cupo_asignado":1000000}'
```

**Frontend:**
```bash
cd frontend
npm run dev
# Abre http://localhost:3000 → Login → Seleccionar panel → "Panel Crédito Empleados"
```

---

## Notas operativas

- **Sin commit**: cambios están en working directory, listos para revisión local
- **Siesa desactivada**: si no hay `SIESA_BASE_URL`/`SIESA_TOKEN`, sincronización se omite sin errores
- **Logs**: `npm run start:dev` muestra detalles de sincronización con Siesa
- **Independencia**: flujo de crédito empleados NO interfiere con pedidos operativos/comerciales
- **Cartera interna**: este módulo es para adelantos a empleados, NO clientes comerciales

---

## Próximos pasos recomendados

1. **Revisar en local**: npm run dev (frontend) + npm run start:dev (backend)
2. **Configurar variables Siesa** en .env backend si ya tienes acceso
3. **Validar permisos** creando usuarios con `credito_empleados` y `credito_empleados.cupos`
4. **Testing**: crear trabajador, registrar pedido, cambiar estado
5. **Feedback**: revisar logs de sincronización Siesa y ajustar según API real
