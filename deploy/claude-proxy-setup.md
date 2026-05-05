# Claude CLI Proxy — Setup en servidor

> Permite que relay-master consuma la suscripción Pro/Max en vez de API de pago
> para las llamadas de `callAnthropicDirect()` (buzon bidireccional, ACKs).
> El código en master.js ya soporta routing via `ANTHROPIC_PROXY_URL`.

---

## 1. Instalar el proxy

### Opción A — npx (sin instalación global)
```bash
# En el servidor, como root o el user que corre relay-master:
npx @anthropic-ai/claude-code --proxy-mode --port 5001

# Verificar que responde:
curl -s http://localhost:5001/health
# → { "ok": true }
```

### Opción B — pm2 (recomendado para persistencia)
```bash
# Instalar globalmente:
npm install -g @anthropic-ai/claude-code

# Agregar al ecosystem.config.js:
{
  name: 'claude-proxy',
  script: 'claude',
  args: '--proxy-mode --port 5001',
  watch: false,
  autorestart: true,
  env: { HOME: '/root' }   // necesario para leer ~/.claude/credentials
}

pm2 start ecosystem.config.js --only claude-proxy
pm2 save
```

---

## 2. Verificar que el proxy funciona

```bash
# Test básico — debe responder con texto de Claude:
curl -s http://localhost:5001/v1/messages \
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

## 3. Activar shadow test (solo ai-monitor primero)

Agregar a `/var/www/html/vilarkptl.com/ai-monitor/relay/.env`:
```bash
ANTHROPIC_PROXY_URL=http://127.0.0.1:5001
ANTHROPIC_PROXY_PROJECT=ai-monitor
```

```bash
pm2 restart relay-master

# Verificar en logs que usa proxy:
pm2 logs relay-master --lines 20 | grep "anthropic-proxy"
# → [anthropic-proxy] routing via http://127.0.0.1:5001
```

---

## 4. Rollout completo (después de 48h sin incidentes)

Quitar `ANTHROPIC_PROXY_PROJECT` del `.env`:
```bash
# En .env del servidor:
ANTHROPIC_PROXY_URL=http://127.0.0.1:5001
# ANTHROPIC_PROXY_PROJECT=   ← comentar/borrar = activo para todos

pm2 restart relay-master
```

---

## 5. Rollback inmediato

Si algo falla, quitar o vaciar `ANTHROPIC_PROXY_URL`:
```bash
# En .env: ANTHROPIC_PROXY_URL=
pm2 restart relay-master
# → master.js vuelve a api.anthropic.com directamente
```

---

## Notas

- El proxy usa las credenciales de `claude auth login` en `~/.claude/`
- Si Claude CLI no está autenticado: `claude auth login` como el user que corre el proxy
- El proxy acepta `x-api-key: proxy-key` (cualquier valor — no valida la key, la ignora)
- prompt-caching funciona normalmente — el proxy pasa el header `anthropic-beta` sin modificarlo
- **No usar en producción** sin validar primero con shadow test de 48h
