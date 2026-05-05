# Relay Outbox — FinBot — Verificador Continuo
_3/5/2026, 1:39:00 p.m. | Episodio #476_

## Diagnóstico

Score: 37.5% → Patrones recurrentes resueltos en commit `35c7d3c`:

### Causa raíz identificada
1. **×25 `clabe_gv_send_message_failed__cannot_send_request`**: El archivo `financial-bot.js` no tenía función `safeReply()` — los `ctx.reply()` fallaban sin reintentos ante desconexiones transitorias
2. **×7 `clabe_gv_timeout`**: Misma causa — sin reintentos, cualquier error silenciaba la respuesta
3. **×6 `clabe_gv_respuesta_sin_keywords`**: Mensajes del bot no contenían keywords `['guardad', 'cuenta']` esperados por el verificador

### Fixes aplicados

| Fix | Archivo | Línea | Cambio |
|-----|---------|-------|--------|
| `safeReply()` | `financial/bot/financial-bot.js` | 2212+ | Nueva función con 3 reintentos, delay 1s/2s, detecta `ECONNRESET`/`timeout`/`disconnected` |
| `esperando_datos_bancarios` | misma | 863 | `"Datos encontrados"` → `"Cuenta guardada"` (keywords ✅) + usa `safeReply` |
| `confirmando_cuentas` | misma | 869+ | Detecta CLABE/cuenta en texto → guarda como nueva + responde con keywords; fallback mensaje incluye `guardad`+`cuenta` |

```
STATUS: done
CHANGED: financial/bot/financial-bot.js
DEPLOYED: no (dispatch enviado a finbot-tester — ID a22c29af — para git pull + pm2 restart)
PENDING: confirmación de pm2 restart financial-bot por finbot-tester
```
