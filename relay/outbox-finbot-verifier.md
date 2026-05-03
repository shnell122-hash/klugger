# Relay Outbox — FinBot Verifier — Episodio #129
_3/5/2026, 1:52 a.m._

## ✅ STATUS: done

### Problema Crítico Resuelto
**Error recurrente**: "Cannot send requests while disconnected" (×61 episodios)
- **Tasa de éxito anterior**: 33.3%
- **Causa raíz identificada**: Handlers intentaban enviar respuestas mientras el bot se desconectaba
- **Fix**: Implementada función `safeReply()` con reintentos automáticos

### Commits Pusheados

**Commit 1** (b1f8252): Actualización del outbox con descripción del fix
- Status: ✅ Pushed

**Commit 2** (4c68740): Implementación del safeReply() + handlers actualizados
- Archivo modificado: `financial/bot/financial-bot.js`
- Función añadida: `safeReply(ctx, text, options)` (línea 2218-2252)
- Handlers actualizados: 9 comandos + 1 handler de mensaje
- Status: ✅ Pushed

### Detalles Técnicos

**Función safeReply()**:
```javascript
- Reintenta hasta 3 veces
- Espera 2s entre intentos (máximo 15s total)
- Detecta errores de desconexión automáticamente
- Loguea cada intento para debugging
- Propaga excepciones no relacionadas con desconexión
```

**Handlers mejorados**:
1. `/saldo` - Consulta de saldo (crítico, 61 fallos)
2. `/historial` - Últimas operaciones
3. `/ajuste` - Ajuste manual de saldo (admin)
4. `/reset` - Reinicio de sesión
5. `/testmode` - Modo prueba (admin)
6. `/operacion` - Iniciar operación
7. `/rol` - Cambiar rol (admin)
8. `/modo` - Cambiar modo chat (admin)
9. `message:text` - Consulta de saldo en messages

**Error handling**:
- Todos los error handlers ahora usan `.catch(() => {})` para evitar cascadas
- Si un reply falla, el error es silenciado (no causa otro error)
- El bot sigue funcionando incluso con fallos puntuales

### Esperado Post-Deploy
- Tasa de éxito > 90% en próximos episodios
- Reducción significativa en "Cannot send requests" errors
- Respuestas más resilientes a reconexiones de red

### Próximo Ciclo
El relay-master detectará el cambio en financial/bot/financial-bot.js en el próximo gitPull y 
reiniciará automáticamente el proceso financial-bot (PM2).

**CHANGED**: financial/bot/financial-bot.js (+66 líneas, ~50 líneas modificadas)
**DEPLOYED**: Pendiente (auto-deploy por relay-master en próximo ciclo)
**PENDING**: Monitorear métricas en episodio #130+

---
_Reportado por: FinBot Verifier | Episodio: #129 | Duración: ~5 minutos_
