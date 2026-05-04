# Relay Outbox — FinBot — Verificador Continuo
_3/5/2026, 6:27:35 p.m. | 176s | exit:0_

RELAY_DIAG user=claude-agent home=/home/claude-agent task=ok
Entendido. Soy **FinBot Verifier** — iniciando diagnóstico del Episodio #588.

**Contexto**: Score 37.5% (crítico), patrón recurrente de desconexiones Telegram (`Cannot send requests while disconnected`). Voy a revisar logs, identificar la causa raíz y aplicar el fix.Identificado el problema raíz: **race condition en reintentos de desconexión**. 

El bot entra en un ciclo de desconexiones porque:
1. `safeReply()` reintenta 4 veces cuando ve "Cannot send requests while disconnected"
2. Solo marca `botStarted = false` pero sigue reintentando (que fallarán)
3. Múltiples health checks simultáneos pueden lanzar múltiples `startBotWithRetry()` sin sincronización
4. No hay guard que prevenga race conditions

Voy a aplicar el fix:---

## ✅ **Fix completado: Episodio #588 — Race Condition en Desconexión Telegram**

### **Diagnóstico** 
- **Score crítico**: 37.5% (umbral: 80%)
- **Patrón recurrente**: `Cannot send requests while disconnected` (×58 episodios)
- **Causa raíz**: Race condition en reintentos de desconexión sin sincronización

### **Problema**
1. Cuando Telegram desconecta, `safeReply()` reintentaba **4 veces inútilmente** (~3.2s)
2. Múltiples health checks podían lanzar `startBotWithRetry()` en paralelo **sin guard**
3. Resultado: Ciclo de desconexión sin recuperación efectiva (~10s vs. potencial <1s)

### **Fix Aplicado** ✅

**Commit**: `e68d26b3da7da1c072a782284ac55d3e379183fa`

**Cambios en `financial/bot/financial-bot.js`**:

| Línea | Cambio | Propósito |
|-------|--------|----------|
| ~2303 | Agregado flag `botIsRestarting = false` | Guard para múltiples reintentos simultáneos |
| ~2310 | Guard check en `startBotWithRetry()` | Prevenir múltiples inicios en paralelo |
| ~2324, 2365, 2377 | Reset de `botIsRestarting = false` | Sincronización en todos los puntos de transición |
| **~2246-2265** | **Modificado `safeReply()`** | **Crítico**: cuando detecta "Cannot send requests while disconnected": NO reintenta, dispara reinicio rápido (500ms), lanza error inmediatamente |

### **Impacto Esperado**
- **Tiempo de recuperación**: ~500ms (vs. ~10s antes)
- **Score esperado**: 80%+ (desde 37.5%)
- **Eliminados**: Reintentos fallidos, race conditions

### **Deploy Status**
| Fase | Status |
|------|--------|
| Commit & Push | ✅ Completado |
| Git Pull (servidor) | ✅ Completado |
| **PM2 Restart** | ⚠️ **Pendiente** (requiere permisos root) |

**Acción requerida en servidor** (143.198.228.78):
```bash
pm2 restart financial-bot
```

El código ya está en el repo; el bot actual en memoria usa la versión anterior.

---

## Outbox

```
STATUS: partial
CHANGED: financial/bot/financial-bot.js (fix de race condition)
DEPLOYED: no (requiere reinicio PM2 en producción)
PENDING: pm2 restart financial-bot + verificar score
USER_REQUIRED: Ejecutar reinicio en servidor producción
```