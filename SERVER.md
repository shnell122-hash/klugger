# SERVER.md — Conexión al servidor para agentes vilarkptl-lang

> Referencia universal para cualquier agente Claude Code en cualquier repositorio de `vilarkptl-lang`.
> Copia este archivo o referencia la URL para conectar un agente nuevo al servidor de producción.

---

## Datos del servidor

| Campo | Valor |
|-------|-------|
| IP | `143.198.228.78` |
| Dominio | `ia.vilarkptl.com` |
| OS | Ubuntu/Debian |
| Usuario SSH | `german` |
| Contraseña SSH | `romanos12_2` |

---

## Método 1 — Exec endpoint HTTP (recomendado, siempre funciona)

El método principal. Funciona desde Claude Code web, CLI, y cualquier entorno que tenga acceso a internet.

```bash
EXEC_TOKEN="cb5871c0aa6ccd67997237c5238017753c0b35bdd7167b56e226aff25bcbf67a"
EXEC_URL="https://ia.vilarkptl.com/api/exec"

exec_server() {
  local CMD="$1"
  local CWD="${2:-/var/www/html/vilarkptl.com/ai-monitor}"
  local BODY
  BODY=$(python3 -c "import sys,json; print(json.dumps({'cmd':sys.argv[1],'cwd':sys.argv[2]}))" "$CMD" "$CWD")
  curl -s --max-time 20 -X POST "$EXEC_URL" \
    -H "Content-Type: application/json" \
    -H "x-exec-token: $EXEC_TOKEN" \
    -d "$BODY" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output') or d.get('error','(sin output)'))"
}
```

### Ejemplos de uso

```bash
exec_server "pm2 status"
exec_server "pm2 restart financial-bot"
exec_server "pm2 logs relay-master --lines 30 --nostream"
exec_server "git log --oneline -5" "/var/www/html/vilarkptl.com/ai-monitor"
exec_server "git pull origin main"  "/var/www/html/vilarkptl.com/ai-monitor"
```

### Comandos permitidos por el endpoint

| Categoría | Comandos |
|-----------|----------|
| PM2 | `status`, `logs`, `restart`, `stop`, `start`, `reload`, `list` |
| Git | `status`, `log`, `diff`, `fetch`, `pull`, `merge`, `push`, `checkout`, `branch`, `add`, `commit`, `reset`, `stash` |
| MySQL | `mysql -u root ...` (contraseña en `.env`) |
| Archivos | `cat` (solo rutas de ai-monitor/relay), `grep`, `ls` |
| Sistema | `df`, `free`, `uptime` |

> Los comandos destructivos (`rm -rf`, `kill -9`, `shutdown`) están bloqueados salvo confirmación explícita.

---

## Método 2 — SSH directo

Usar cuando el Método 1 no está disponible o para sesiones interactivas.

```bash
# Instalar sshpass si no está disponible
apt-get install -y sshpass 2>/dev/null

# Ejecutar comando remoto
sshpass -p 'romanos12_2' ssh -o StrictHostKeyChecking=no german@143.198.228.78 "pm2 status"

# Alias útil para la sesión
srv() { sshpass -p 'romanos12_2' ssh -o StrictHostKeyChecking=no german@143.198.228.78 "$@"; }
srv "pm2 restart ai-monitor"
srv "cd /var/www/html/vilarkptl.com/ai-monitor && git log --oneline -3"
```

---

## Árbol de directorios del servidor

```
/var/www/html/vilarkptl.com/
└── ai-monitor/                  ← Repo principal (este repo)
    ├── backend/
    │   ├── server.js            ← Express + Socket.io, puerto 3010
    │   ├── .env                 ← DB_HOST, DB_USER, DB_PASS, DB_NAME=ai_monitoring
    │   └── routes/
    ├── frontend/                ← Dashboard estático en ia.vilarkptl.com
    ├── relay/
    │   ├── master.js            ← Orquestador PM2: relay-master
    │   ├── projects.json        ← Config de proyectos/agentes
    │   ├── agents/              ← Prompts por agente (*.md)
    │   ├── .env                 ← TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, etc.
    │   └── workspaces/          ← Repos clonados por agente
    │       ├── fiscalai/
    │       ├── fiscalai-front/
    │       ├── coordinator/
    │       └── ai-monitor/
    └── deploy/
        └── ecosystem.config.js  ← PM2 config

/var/www/html/vilarkptl.com/pill-relay/   ← Proyecto pill.ai
/var/www/html/cpanel-repo/credit-agents/  ← Proyecto credit-agents
```

---

## Procesos PM2 activos

| Proceso | Puerto | Descripción |
|---------|--------|-------------|
| `ai-monitor` | 3010 | Backend Express + Socket.io — dashboard ia.vilarkptl.com |
| `relay-master` | interno | Orquestador de agentes Claude Code |
| `financial-bot` | interno | Bot financiero Telegram |
| `financial-dashboard` | 3020 | Dashboard financiero Next.js |
| `claude-chat-bot` | interno | Bot Telegram directo |
| `code-reviewer` | interno | Auto-review DeepSeek V3 |
| `cursor-worker` | interno | Cursor Cloud Agent worker |
| `litellm` | 4000 | LLM proxy con fallback chains |

```bash
# Ver todos los procesos
exec_server "pm2 status"

# Reiniciar un proceso
exec_server "pm2 restart ai-monitor"
exec_server "pm2 restart relay-master"
exec_server "pm2 restart financial-bot"
exec_server "pm2 restart financial-dashboard"
```

---

## Base de datos MySQL

| Campo | Valor |
|-------|-------|
| Motor | MySQL / MariaDB |
| DB name | `ai_monitoring` |
| Credenciales | `/var/www/html/vilarkptl.com/ai-monitor/backend/.env` |

```bash
# Leer contraseña del .env (SIEMPRE usar esta forma — nunca -p interactivo)
exec_server "grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env"

# Ejecutar query
exec_server "DB_PASS=\$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env) && mysql -u root -p\"\$DB_PASS\" ai_monitoring -e 'SHOW TABLES'"

# Aplicar migración SQL
exec_server "DB_PASS=\$(grep -oP 'DB_PASS=\K.*' backend/.env) && mysql -u root -p\"\$DB_PASS\" ai_monitoring < backend/db/migrate-vN.sql"
```

---

## Deploy por subsistema

```bash
# ── Actualizar repo desde main ────────────────────────────────────────────────
exec_server "git fetch origin main && git reset --hard origin/main"

# ── Solo backend (cambios en backend/**) ──────────────────────────────────────
exec_server "pm2 restart ai-monitor"

# ── Solo relay-master (cambios en relay/master.js) ────────────────────────────
exec_server "pm2 restart relay-master"

# ── Solo financial-bot (cambios en financial/bot/**) ──────────────────────────
exec_server "pm2 restart financial-bot"

# ── Solo dashboard-financial (cambios en dashboard-financial/**) ──────────────
exec_server "cd dashboard-financial && npm run build && pm2 restart financial-dashboard" \
  "/var/www/html/vilarkptl.com/ai-monitor"
```

---

## Registrar un proyecto nuevo en el relay

Para que el relay-master despache tareas a un agente nuevo, agrégalo en `relay/projects.json`:

```json
{
  "id": "mi-proyecto",
  "name": "Mi Proyecto",
  "active": true,
  "inbox": true,
  "claude_model": "claude-sonnet-4-6",
  "url": "https://mi-proyecto.com",
  "github": "vilarkptl-lang/mi-repo",
  "branch": "main",
  "workspace": "/var/www/html/vilarkptl.com/ai-monitor/relay/workspaces/mi-proyecto"
}
```

Luego committea y pushea a `main`:
```bash
git add relay/projects.json
git commit -m "relay: agregar proyecto mi-proyecto"
git push origin main
```

El relay-master detecta el cambio en el próximo ciclo (≤15 segundos).

---

## Despachar tareas vía API

```bash
# Desde cualquier agente o script — despacha una tarea inmediatamente
curl -s -X POST https://ia.vilarkptl.com/api/relay/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"project":"fiscalai","task":"Descripción detallada de la tarea","requester":"mi-agente"}'

# Desde bash (función exec_server)
exec_server "curl -s -X POST http://localhost:3010/api/relay/dispatch \
  -H 'Content-Type: application/json' \
  -d '{\"project\":\"coordinator\",\"task\":\"Tarea de coordinación\",\"requester\":\"mi-agente\"}'"
```

### Proyectos disponibles para despacho

| ID | Modelo | Descripción |
|----|--------|-------------|
| `coordinator` | claude-haiku-4-5 | Coordina entre agentes |
| `fiscalai` | claude-sonnet-4-6 | Backend FiscalAI + SAT |
| `fiscalai-front` | claude-sonnet-4-6 | Frontend FiscalAI |
| `ai-monitor` | claude-haiku-4-5 | Dashboard de monitoreo |
| `finbot-tester` | claude-sonnet-4-6 | Tester financial-bot |
| `finbot-verifier` | claude-haiku-4-5 | Verificador financial-bot |

---

## pill.ai — Servidor alternativo (HTTP API)

```bash
PILLAI_SECRET="fcdeee3a67f637f57c7a55df56c5fa0d40ccb89053002ce715efc541cb31ff77"
PILLAI_BASE="http://143.198.228.78:8181"

# Ejecutar comando
curl -s -X POST "$PILLAI_BASE/admin/exec" \
  -H "x-deploy-secret: $PILLAI_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"command": "pm2 status", "cwd": "/var/www/html/vilarkptl.com/pill-relay"}'

# Deploy (git pull + restart)
curl -s -X POST "$PILLAI_BASE/admin/deploy" \
  -H "x-deploy-secret: $PILLAI_SECRET" \
  -H "Content-Type: application/json"

# Ver logs
curl -s "$PILLAI_BASE/admin/logs?lines=100" \
  -H "x-deploy-secret: $PILLAI_SECRET"
```

---

## LiteLLM proxy (modelos disponibles)

```
URL:        http://localhost:4000   (interno) / https://ia.vilarkptl.com/llm (externo)
Master key: sk-litellm-11b2ccee224b47d82ba9b8e3677aa915
```

| Chain | Modelos (en orden de fallback) |
|-------|-------------------------------|
| `kptl-chat` | claude-sonnet → DeepSeek V3 → GPT-4o |
| `kptl-chat-fast` | claude-haiku → GPT-4o-mini → Gemini Flash |
| `kptl-reasoning` | DeepSeek R1 → Claude Opus |

---

## Variables de entorno críticas

```bash
# Ver las variables del relay
exec_server "cat /var/www/html/vilarkptl.com/ai-monitor/relay/.env"

# Variables en relay/.env:
# ANTHROPIC_API_KEY     ← Claude Code CLI
# DEEPSEEK_API_KEY      ← DeepSeek V3 / R1
# GOOGLE_API_KEY        ← Gemini
# TELEGRAM_BOT_TOKEN    ← @iaVilarBot
# LITELLM_BASE_URL      ← http://localhost:4000
# LITELLM_MASTER_KEY    ← sk-litellm-...

# Variables en financial/bot/ (nombres exactos — no cambiar):
# process.env.ANTHROPIC_API_KEY   → TransactionOrchestrator, VisionAgent
# process.env.GOOGLE_API_KEY      → DocumentIntelligenceAgent (gemini-1.5-flash)
# process.env.DEEPSEEK_API_KEY    → InvoiceAgent, ContextReader, ResponseGen
```

---

## Verificación rápida de conexión

```bash
# ¿Está el servidor respondiendo?
curl -s https://ia.vilarkptl.com/api/health | python3 -m json.tool

# ¿Están los procesos corriendo?
exec_server "pm2 list"

# ¿Cuánto swap libre hay? (crítico — servidor tiene 3.8 GB RAM)
exec_server "free -h"

# ¿Últimos commits en producción?
exec_server "git log --oneline -5"
```

---

## Solución de problemas comunes

| Problema | Diagnóstico | Fix |
|----------|-------------|-----|
| Dashboard no carga | `exec_server "pm2 logs ai-monitor --lines 20 --nostream"` | `exec_server "pm2 restart ai-monitor"` |
| Relay no despacha | `exec_server "pm2 logs relay-master --lines 30 --nostream"` | `exec_server "pm2 restart relay-master"` |
| OOM / swap lleno | `exec_server "free -h"` | `exec_server "fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 && swapon /swapfile2"` |
| Financial dashboard roto | Build log: `exec_server "pm2 logs financial-dashboard --lines 20 --nostream"` | `exec_server "cd dashboard-financial && npm run build && pm2 restart financial-dashboard" "/var/www/html/vilarkptl.com/ai-monitor"` |
| SSH bloqueado (port 22) | — | Usar Método 1 (exec endpoint HTTPS) |

---

*Última actualización: 2026-05-26 · Repositorio: `vilarkptl-lang/agentic-repo`*
