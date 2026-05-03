## [URGENTE] Fijar sesiones colgadas y endpoint /operations

### Problema 1: Sesiones colgadas
10 sesiones en estados esperando_* o confirmando_* sin actualización desde 2-9 días atrás:
- 3 en `esperando_datos_bancarios`
- 5 en `confirmando_comprobante`
- Máximo antigüedad: 24/4/2026 (9 días)

**Fix**: Revisar `financial/bot/financial-bot.js` → timeout handler. Implementar auto-reset para sesiones > 8 horas sin update.

### Problema 2: Dashboard /operations retorna 0
Endpoint `GET /api/financial/operations?limit=10` retorna array vacío aunque KPIs reporta 54 ops hoy.

**Revisar**:
1. `dashboard-financial/api-handler.js` → función /operations
2. Query debe filtrar por fecha/estado correctamente
3. Ordenar por id DESC LIMIT 10

### Saldo crítico
VILAR KPTL: -7,113,903.17 (aumentó desde -3.6M en último check)

Termina con bloque outbox.

---
## Outbox — [Rellenar después de completar]
**Status**: ⏳ En progreso | ✅ Completo | ⚠️ Parcial | ❌ Error
**Archivos modificados**: [listar rutas]
**Commit**: [hash o "Sin cambios"]
**Deploy PROD**: [OK, pendiente, error]
**Usuario requerido**: [Sí/No]

Detalles: [describir qué se hizo]
