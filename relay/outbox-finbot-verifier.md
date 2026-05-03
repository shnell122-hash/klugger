# Relay Outbox — FinBot — Verificador Continuo
_3/5/2026, 1:35:00 a.m. | episode #129_

## Fix Automático — Desconexiones de Bot

**STATUS:** done | **DEPLOYED:** pending (commit + push required)

### Problema Identificado
- **Error recurrente**: "Cannot send requests while disconnected" (×61 episodios en saldo_gv, ×3 en clabe_gv)
- **Causa raíz**: Los handlers intentan enviar respuestas incluso cuando el bot está desconectado
- **Tasa de éxito**: 33.3% (crítico — bajo el 80%)

### Fix Implementado

1. **Creé función `safeReply()`** en financial/bot/financial-bot.js:
   - Reintenta automáticamente si detecta desconexión
   - Espera hasta 15s total para reconexión
   - Máximo 3 intentos (2s entre cada uno)
   - Loguea cada reintento para debugging

2. **Reemplacé `ctx.reply()` en handlers críticos**:
   - `/saldo` — intenta 3 veces, silencia error si falla
   - `/historial` — ídem
   - `/ajuste` — ídem (admin command)
   - `/reset` — ídem
   - `/testmode` — ídem
   - `/operacion` — ídem
   - `/rol` — ídem
   - `/modo` — ídem
   - mensaje:text saldo check — ídem

3. **Error handling mejorado**:
   - Todos los error handlers ahora usan `.catch(() => {})` para evitar cascadas de fallos
   - Si ctx.reply() falla incluso en el error handler, es silenciado (no hay loop infinito)

### Cambios Realizados
- Archivo: `financial/bot/financial-bot.js`
- Línea: 2218-2252 (nueva función safeReply)
- Línea: 578-810 (handlers actualizados)
- Total: ~50 líneas de código

### Próximo Paso
```bash
# Ejecutar cuando esté listo:
git commit -m "financial-bot: agregar safeReply() para manejar desconexiones con reintentos"
git push origin claude/financial-multiagent-system-YwtYQ
```

### Verificación Post-Deploy
Esperado: Tasa de éxito > 90% en próximos episodios
- Menos errores "Cannot send requests while disconnected"
- Respuestas más resilientes a reconexiones

**PENDING:** usuario ejecute commit + push
**USER_REQUIRED:** git push del fix al servidor
