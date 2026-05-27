# Claude CLI Proxy — Drop-in Anthropic API via CLI

Proxy HTTP que expone la CLI de Claude como si fuera la API de Anthropic.
Sin dependencias npm. Un solo archivo.

**Código fuente:**
`https://github.com/vilarkptl-lang/agentic-repo/blob/main/deploy/claude-proxy.js`

**Descarga directa:**
```bash
curl -o claude-proxy.js \
  https://raw.githubusercontent.com/vilarkptl-lang/agentic-repo/main/deploy/claude-proxy.js
```

---

## Requisitos

- Node.js ≥ 18
- `claude` CLI instalado y autenticado (`claude auth login`)
- Si corres como root: necesitas un usuario no-root con claude autenticado

---

## Uso rápido

```bash
# Variables de entorno
CLAUDE_BIN=/usr/local/bin/claude   # path al binario (default: 'claude')
CLAUDE_RUN_USER=german             # usuario con claude autenticado (si corres como root)

node claude-proxy.js --port 5001
```

PM2:
```bash
pm2 start claude-proxy.js --name claude-proxy -- --port 5001
```

---

## Consumirlo desde otro proyecto

El proxy expone `/v1/messages` compatible con el SDK de Anthropic.
Solo cambia `base_url` — el código no cambia.

**.env del proyecto cliente:**
```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:5001
ANTHROPIC_API_KEY=any-string   # ignorada por el proxy
```

**Python:**
```python
import anthropic

client = anthropic.Anthropic(
    api_key="dummy",
    base_url="http://127.0.0.1:5001",
)

msg = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hola"}],
)
print(msg.content[0].text)
```

**Node.js:**
```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: 'dummy',
  baseURL: 'http://127.0.0.1:5001',
});

const msg = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hola' }],
});
console.log(msg.content[0].text);
```

**curl:**
```bash
curl -s http://127.0.0.1:5001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 512,
    "messages": [{"role": "user", "content": "Hola"}]
  }'
```

---

## Multi-cuenta (1 Max + N Pro)

Levanta una instancia por cuenta, cada una en un puerto distinto:

```bash
# Cuenta Max (german / root)
CLAUDE_RUN_USER=german node claude-proxy.js --port 5001

# Cuenta Pro 1
CLAUDE_RUN_USER=claudepro1 node claude-proxy.js --port 5002

# Cuenta Pro 2
CLAUDE_RUN_USER=claudepro2 node claude-proxy.js --port 5003
```

Routing: apunta `ANTHROPIC_BASE_URL` al puerto de la cuenta que quieras usar.

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/v1/messages` | Llamada a Claude (formato Anthropic) |
| `GET` | `/health` | Health check → `{"ok": true}` |

---

## Notas para agentes

- El proxy **ignora** `ANTHROPIC_API_KEY` del entorno del proceso llamante.
- El campo `model` en el request es pasado tal cual a `claude --model`.
- El conteo de tokens es estimado (longitud / 4), no exacto.
- No soporta streaming (`stream: true` es ignorado — devuelve respuesta completa).
- Tiempo de respuesta: igual que `claude --print` interactivo (5–60s según tarea).
