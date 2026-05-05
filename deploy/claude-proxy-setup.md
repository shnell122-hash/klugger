# Claude CLI Proxy — Setup en servidor

> Permite que relay-master y claude-chat-bot consuman la suscripción Pro/Max
> en vez de la API de pago para llamadas directas (buzón bidireccional, chat Telegram).
> El proxy es un script Node.js puro (`deploy/claude-proxy.js`) — sin dependencias npm.

---

## 1. Requisitos previos

```bash
# Claude CLI instalado y autenticado como root (o el user que corre el proxy):
which claude          # debe imprimir /usr/local/bin/claude o similar
claude auth login     # si no está autenticado — abre browser para login
claude --version      # verificar versión
```

---

## 2. Arrancar el proxy con pm2

```bash
# El script ya está en el repo: deploy/claude-proxy.js
# Registrarlo en pm2 vía ecosystem.config.js:
pm2 start /var/www/html/vilarkptl.com/ai-monitor/deploy/ecosystem.config.js \
  --only claude-proxy

pm2 save

# Verificar que responde:
curl -s http://127.0.0.1:5001/health
# → {"ok":true}
```

### O arrancar directamente (debug):
```bash
node /var/www/html/vilarkptl.com/ai-monitor/deploy/claude-proxy.js --port 5001
```

---

## 3. Verificar que el proxy funciona

```bash
curl -s http://127.0.0.1:5001/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: proxy-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 20,
    "messages": [{"role": "user", "content": "di hola"}]
  }' | jq '.content[0].text'
```

Si devuelve texto → proxy funcionando.

---

## 4. Activar shadow test (solo ai-monitor primero)

Agregar a `/var/www/html/vilarkptl.com/ai-monitor/relay/.env`:
```bash
ANTHROPIC_PROXY_URL=http://127.0.0.1:5001
ANTHROPIC_PROXY_PROJECT=ai-monitor
```

```bash
pm2 restart relay-master claude-chat-bot

# Verificar en logs que usa proxy:
pm2 logs relay-master --lines 20 | grep "anthropic-proxy"
# → [anthropic-proxy] routing via http://127.0.0.1:5001

# En Telegram: usar /claude o /model → "Claude Pro (Proxy - $0)"
```

---

## 5. Rollout completo (después de 48h sin incidentes)

Quitar `ANTHROPIC_PROXY_PROJECT` del `.env`:
```bash
# En relay/.env del servidor:
ANTHROPIC_PROXY_URL=http://127.0.0.1:5001
# ANTHROPIC_PROXY_PROJECT=   ← comentar/borrar = activo para todos

pm2 restart relay-master claude-chat-bot
```

---

## 6. Rollback inmediato

Si algo falla, vaciar `ANTHROPIC_PROXY_URL`:
```bash
# En relay/.env: ANTHROPIC_PROXY_URL=
pm2 restart relay-master claude-chat-bot
# → vuelven a usar api.anthropic.com directamente
```

---

## Notas

- El proxy usa las credenciales de `claude auth login` guardadas en `~/.claude/`
- `HOME=/root` está configurado en ecosystem.config.js para que el proxy encuentre las credenciales
- El proxy acepta `x-api-key: proxy-key` (cualquier valor — lo ignora)
- Prompt caching funciona si el modelo lo soporta (system prompt pasa `cache_control`)
- **No usar en producción** sin validar primero con shadow test de 48h
- Si `claude --print` no existe en tu versión, verifica con `claude --help | grep print`
