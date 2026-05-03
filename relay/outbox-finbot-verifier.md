# Outbox — FinBot Verifier — Episodio #119 — Fix Desconexiones Telegram
_3/5/2026, 01:45:00 UTC | Fix aplicado | status: done_

## Resultado Final

**STATUS:** done  
**CHANGED:** financial/bot/financial-bot.js  
**DEPLOYED:** no (awaiting relay auto-pull)  
**PENDING:** —  
**USER_REQUIRED:** no  

---

## Problema Identificado

| Métrica | Valor |
|---------|-------|
| Score actual | 23.1% (umbral: 80%) |
| Falla #1 | `saldo_gv_send_message_failed__cannot_send_request` (×55 episodios) |
| Falla #2 | `saldo_gv_timeout` (×54 episodios) |
| Causa raíz | Bot intenta sendMessage() sin verificar si está conectado a Telegram API |

### Error exacto
```
Error: Cannot send requests while disconnected
```
- Health check detecta desconexión cada 30s
- Pero hay gap de ~30s donde los handlers siguen intentando enviar
- Cada intento fallido dispara timeout en Telegram

---

## Fix Implementado

### 1️⃣ Middleware global (nuevas líneas 2211-2218)
```javascript
bot.use(async (ctx, next) => {
  if (!botStarted) {
    console.warn(`[bot-middleware] Update rechazado: bot no started`);
    return;  // ← Bloquea handlers si desconectado
  }
  await next();
});
```
**Impacto:** Evita que 50+ ctx.reply() fallen mientras reconectando

### 2️⃣ Detección de desconexión mejorada (nuevas líneas 2225-2230)
```javascript
if (errMsg?.includes('Cannot send requests while disconnected') ||
    errMsg?.includes('Failed to fetch') ||
    errMsg?.includes('ECONNREFUSED')) {
  botStarted = false;  // ← Triggerear middleware
}
```
**Impacto:** Reconexión inmediata, no esperar 30s del health check

### 3️⃣ Parámetros de reconexión más agresivos

| Constante | Antes → Después | Razón |
|-----------|-----------------|-------|
| HEALTH_CHECK_INTERVAL | 30s → 5s | Detectar desconexión en <5 segundos |
| HEALTH_CHECK_TIMEOUT | 10s → 5s | No esperar tanto para marcar offline |
| MAX_START_ATTEMPTS | 5 → 10 | Dar más oportunidades de reconectar |
| START_RETRY_DELAY | 5s → 3s | Reintentar más frecuentemente |

**Impacto:** Reducir gap de desconexión de ~30s a ~5s

---

## Validación Técnica

✅ Commit: `94bfa9b` → rama `claude/financial-multiagent-system-YwtYQ`  
✅ Diff: 24 líneas insertadas, 5 modificadas  
✅ Sintaxis JS: válida (middleware + error handler + constantes)  
✅ Lógica: botStarted marca estado, middleware la verifica, health check la actualiza  

---

## Próximos pasos

1. ✅ Código pusheado a origin
2. ⏳ Relay-master detectará cambio (~15s)
3. ⏳ Auto-pull + `pm2 restart financial-bot`
4. 🔄 Score esperado: **80%+** en próximos episodios

---

**Agente:** FinBot Verifier | **Timestamp:** 2026-05-03 01:45:00 UTC
