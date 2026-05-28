# CLAUDE.md — ai-monitor / agentic-repo

> Archivo de referencia para agentes Claude Code. Actualizado 2026-05-02.

---

## Servidor de producción

| Campo | Valor |
|-------|-------|
| Host | `143.198.228.78` (vilar-desarrollo) |
| Usuario SSH | `german` (también `root`) |
| Contraseña SSH | `romanos12_2` |
| OS | Ubuntu / Debian (Apache + PM2) |

**Conexión desde agentes Claude Code (CLI web):**
```bash
# Instalar sshpass si no está disponible
apt-get install -y sshpass 2>/dev/null

# Ejecutar comando remoto
sshpass -p 'romanos12_2' ssh -o StrictHostKeyChecking=no german@143.198.228.78 "comando"

# Alias útil para sesión
srv() { sshpass -p 'romanos12_2' ssh -o StrictHostKeyChecking=no german@143.198.228.78 "$@"; }
# Uso: srv "pm2 status"
#      srv "pm2 restart financial-bot"
#      srv "grep CLAUDE_EXEC_TOKEN /var/www/html/vilarkptl.com/ai-monitor/backend/.env"
```

**Si SSH no responde (el sandbox web bloquea el puerto 22), usar HTTPS:**
```bash
EXEC_TOKEN="cb5871c0aa6ccd67997237c5238017753c0b35bdd7167b56e226aff25bcbf67a"
# Usar exec-lite (systemd, siempre up) como URL principal:
EXEC_URL="https://ia.vilarkptl.com/exec-lite"
# Fallback si exec-lite no responde: /api/exec (depende de ai-monitor)
# EXEC_URL="https://ia.vilarkptl.com/api/exec"

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

# Ejemplos:
exec_server "pm2 status"
exec_server "pm2 restart financial-bot"
exec_server "pm2 logs financial-bot --lines 20 --nostream"
exec_server "git log --oneline -5"
```

> **IMPORTANTE**: `https://ia.vilarkptl.com/api/exec` funciona desde cualquier entorno
> (Claude Code web, CLI, agentes del relay). Usar SIEMPRE esta URL como método principal.
> SSH es alternativo cuando hay acceso directo al puerto 22.

### Árbol del servidor (rutas críticas)

```
/var/www/html/vilarkptl.com/
└── ai-monitor/                  ← Raíz del repo en producción
    ├── backend/
    │   ├── server.js            ← Express + Socket.io, puerto 3010
    │   ├── .env                 ← DB_HOST, DB_USER, DB_PASS, DB_NAME=ai_monitoring
    │   ├── db/
    │   │   ├── migrate-v*.sql   ← Migraciones acumulativas
    │   │   └── schema.sql
    │   └── routes/
    ├── frontend/                ← Servido estático por Express desde /
    │   ├── index.html
    │   ├── css/dashboard.css
    │   ├── js/dashboard.js
    │   └── screenshots/
    ├── relay/
    │   ├── master.js            ← Orquestador principal (PM2: relay-master)
    │   ├── projects.json        ← Config de proyectos/agentes
    │   ├── agents/              ← Prompts por agente (*.md)
    │   ├── .env                 ← TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, etc.
    │   └── workspaces/          ← Repos clonados por agente
    │       ├── fiscalai/
    │       ├── fiscalai-front/
    │       ├── coordinator/
    │       └── ai-monitor/
    └── deploy/
        └── ecosystem.config.js  ← PM2 config (watch: false)

/var/www/html/cpanel-repo/
└── credit-agents/               ← Proyecto separado (no parte de ai-monitor)

/var/www/catalogos/OCR/
└── v59-repo/agentic-repo/       ← Fork OCR (no parte de ai-monitor)
```

### Acceso al servidor para agentes (exec endpoint)

Los agentes Claude Code corren como `claude-agent` (no root). Para comandos privilegiados
(`pm2`, `mysql -u root`, `git` fuera del workspace), se usa el endpoint `/api/exec`
que corre en el mismo servidor como root:

```
URL pública:  https://ia.vilarkptl.com/api/exec        ← usar desde Claude Code web/CLI externo
URL local:    http://localhost:3010/api/exec            ← usar desde agentes que corren en el servidor
Auth:         header x-exec-token: cb5871c0aa6ccd67997237c5238017753c0b35bdd7167b56e226aff25bcbf67a
Body:         { "cmd": "pm2 restart financial-bot", "cwd": "/var/www/html/vilarkptl.com/ai-monitor" }
```

**Activar el endpoint (ejecutar en el servidor como root — una sola vez):**
```bash
# 1. Generar token y agregarlo al .env del backend
echo "CLAUDE_EXEC_TOKEN=$(openssl rand -hex 32)" \
  >> /var/www/html/vilarkptl.com/ai-monitor/backend/.env

# 2. Reiniciar el backend para que lo tome
pm2 restart ai-monitor

# 3. Verificar que funciona
EXEC_TOKEN=$(grep -oP 'CLAUDE_EXEC_TOKEN=\K\S+' \
  /var/www/html/vilarkptl.com/ai-monitor/backend/.env | tail -1)
curl -s -X POST https://ia.vilarkptl.com/api/exec \
  -H "Content-Type: application/json" \
  -H "x-exec-token: $EXEC_TOKEN" \
  -d '{"cmd":"pm2 status","cwd":"/var/www/html/vilarkptl.com/ai-monitor"}' \
  | python3 -m json.tool
```

**Función bash que usan los agentes:**
```bash
EXEC_TOKEN="cb5871c0aa6ccd67997237c5238017753c0b35bdd7167b56e226aff25bcbf67a"
EXEC_URL="https://ia.vilarkptl.com/api/exec"  # URL pública (Claude Code web)
# EXEC_URL="http://localhost:3010/api/exec"   # URL local (agentes en el servidor)

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

Comandos permitidos: `pm2 status|logs|restart|stop|start|reload|list`,
`git status|log|diff|fetch|pull|merge|push|checkout|branch|add|commit|reset|stash`,
`mysql -u root ...`, `cat` (solo rutas de ai-monitor/relay), `grep`, `ls`, `df`, `free`, `uptime`

### Comandos de administración en producción

```bash
# Ver logs del relay-master
pm2 logs relay-master

# Reiniciar relay-master (graceful vía checkSelfReload es preferible)
pm2 restart relay-master

# Aplicar cambios en ecosystem.config.js
pm2 reload /var/www/html/vilarkptl.com/ai-monitor/deploy/ecosystem.config.js

# Correr migración SQL (leer contraseña del .env — usar siempre esta forma)
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring < /var/www/html/vilarkptl.com/ai-monitor/backend/db/migrate-v6.sql

# Ver status
pm2 status

# Ver qué puerto usa el backend
pm2 show relay-master | grep -i port
```

### Base de datos

| Campo | Valor |
|-------|-------|
| Motor | MySQL / MariaDB |
| DB name | `ai_monitoring` |
| Credenciales | En `/var/www/html/vilarkptl.com/ai-monitor/backend/.env` |

Tablas principales:
- `events` — tool calls de agentes
- `sessions` — sesiones por agente/proyecto
- `costs` — costos por token
- `providers` — API keys (últimos 6 chars)
- `projects` — proyectos registrados
- `screenshots` — capturas
- `relay_alerts` — alertas del sistema (desde migrate-v6.sql)

### Apache

- `mod_proxy` y `mod_proxy_wstunnel` habilitados (necesario para WebSocket Socket.io)
- Reverse proxy: `ia.vilarkptl.com` → `localhost:3010`

```bash
# Conectar por SSH
sshpass -p 'romanos12_2' ssh -o StrictHostKeyChecking=no german@143.198.228.78

# MySQL (contraseña en backend/.env)
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring

# Verificar módulos
apache2ctl -M | grep proxy

# Habilitar si falta
sudo a2enmod proxy proxy_wstunnel && sudo systemctl reload apache2
```

---

## Arquitectura del sistema

```
Telegram Bot
    │
    ▼
relay/master.js  (Node.js, PM2)
    │  polls inbox.md cada 15s por proyecto
    │  spawns Claude Code CLI por tarea
    │  lee stream-json output
    │
    ├──▶ Claude Code CLI --model <claude_model>
    │         └── edita archivos, hace commits, push
    │         └── puede ejecutar pm2/mysql vía SSH o /api/exec
    │
    ├──▶ DeepSeek V3 API (planning /tarea, resúmenes memoria)
    │
    └──▶ POST /api/events, /api/sessions, /api/alerts  →  backend/server.js
                                                              │
                                                        Socket.io broadcast
                                                              │
                                                        frontend dashboard
                                                        ia.vilarkptl.com
```

### Proyectos / Agentes (relay/projects.json)

| id | Modelo | Rama git | Descripción |
|----|--------|----------|-------------|
| `coordinator` | claude-haiku-4-5 | main | Orquesta dispatches, no escribe código |
| `fiscalai` | claude-sonnet-4-6 | main | Backend Node.js + SAT APIs + MySQL |
| `fiscalai-front` | claude-sonnet-4-6 | main | Frontend HTML/CSS/JS vanilla |
| `ai-monitor` | claude-haiku-4-5 | main | Dashboard de monitoreo — redesign + audit |
| `finbot-tester` | claude-sonnet-4-6 | main | Tester automatizado de financial-bot |
| `finbot-verifier` | claude-haiku-4-5 | main | Verificador continuo de financial-bot |

> **Nota**: Haiku 4.5 mostró 0 tool calls en tareas de código (2026-04-20).
> fiscalai-front revertido a Sonnet. Haiku solo para coordinator, ai-monitor y finbot-verifier.

---

## Auto-deploy

El relay-master hace `gitPull` en cada proyecto cada ciclo. Si detecta cambio
en `relay/master.js` (hash SHA256), ejecuta `checkSelfReload()`:

1. Espera a que `ACTIVE_TASKS.size === 0` (hasta 20 min)
2. `process.exit(0)` → PM2 reinicia automáticamente con el nuevo código

**Para que funcione**: `watch: false` en ecosystem.config.js (no usar PM2 watch).

---

## Formato de outbox estructurado (obligatorio para agentes)

```
STATUS: done | partial | failed
CHANGED: archivo1.js, archivo2.css
DEPLOYED: yes | no
PENDING: descripción de lo que falta
USER_REQUIRED: acción que necesita el usuario
```

---

## Alertas del sistema (relay_alerts)

Tipos generados automáticamente por relay-master:
- `commit_quality` — >50 archivos en commit o .env detectado
- `session_low_yield` — sesión ≥800s sin cambios (posible agente atascado)
- `deploy_verify_fail` — HTTP check post-deploy devolvió no-2xx

Visibles en dashboard → tab **Alertas**.

---

## Estado del sistema (actualizado 2026-05-02)

### Procesos PM2 activos

| Proceso | Puerto | Notas |
|---------|--------|-------|
| `ai-monitor` | 3010 | Express + Socket.io — dashboard ia.vilarkptl.com |
| `relay-master` | interno | Orquestador agentes |
| `claude-chat-bot` | interno | Telegram bot directo |
| `code-reviewer` | interno | DeepSeek V3 auto-review |
| `cursor-worker` | interno | Cursor Cloud Agent worker |
| `litellm` | 4000 | LLM proxy con fallback chains |

### LiteLLM proxy

Instalado en `/opt/litellm/`. Variables en `relay/.env`:
```
LITELLM_BASE_URL=http://localhost:4000
LITELLM_MASTER_KEY=sk-litellm-11b2ccee224b47d82ba9b8e3677aa915
```
Chains: `kptl-chat` (Sonnet→DeepSeek→GPT4o), `kptl-chat-fast` (Haiku→GPT4o-mini→Gemini), `kptl-reasoning` (DeepSeek R1→Opus)

### Auth dashboard (ia.vilarkptl.com)

Login activado. Hash bcrypt en `/opt/kptl-secrets/api-keys.env`:
```
DASHBOARD_PASSWORD_HASH=$2a$10$D83YfbFBaxu0yCFtiOtPvuHFjcBisfep2xY9tAAMdSVLgUKdllGXu
```
Branch con el código de auth: `claude/onboard-ai-monitor-subproject-zXvki`

Si el dashboard no carga o muestra "Cannot GET /login":
```bash
pm2 restart ai-monitor
# Hard refresh en el browser (cerrar y reabrir pestaña)
```

### Swap crítico

RAM: 3.8 GB total | Swap: ~96% usado. Si hay OOM:
```bash
# Agregar 1 GB swap temporal:
fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 && swapon /swapfile2
```

---

## pill.ai — Acceso al servidor para agentes

| Campo | Valor |
|-------|-------|
| Host | `143.198.228.78` |
| Puerto HTTP | `8181` |
| Usuario SSH | `german` |
| Dir producción | `/var/www/html/vilarkptl.com/pill-relay` |
| Servicio | `pillai-relay` (systemd) |
| Repo código | `vilarkptl-lang/pill.ai` · branch `claude/add-licensing-system-KsFAw` |
| Referencia completa | https://github.com/vilarkptl-lang/pillai-secrets/blob/main/README.md |

### Opción 1 — HTTP API (recomendada, no requiere SSH)

Header obligatorio en todos los endpoints: `x-deploy-secret: <PILLAI_DEPLOY_SECRET>`

```bash
PILLAI_SECRET="fcdeee3a67f637f57c7a55df56c5fa0d40ccb89053002ce715efc541cb31ff77"
PILLAI_BASE="http://143.198.228.78:8181"

# Ejecutar cualquier comando bash
curl -s -X POST "$PILLAI_BASE/admin/exec" \
  -H "x-deploy-secret: $PILLAI_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"command": "pm2 status", "cwd": "/var/www/html/vilarkptl.com/pill-relay"}'

# Deploy (git pull + restart)
curl -s -X POST "$PILLAI_BASE/admin/deploy" \
  -H "x-deploy-secret: $PILLAI_SECRET" \
  -H "Content-Type: application/json"

# Ver logs
curl -s "$PILLAI_BASE/admin/logs?service=pillai-relay&lines=100" \
  -H "x-deploy-secret: $PILLAI_SECRET"
```

> **Seguridad**: comandos peligrosos (`rm -rf`, `kill -9`, `shutdown`, `dd`, `mkfs`) devuelven
> `{"requires_confirmation": true}`. Reenviar con `"confirmed": true` **solo tras aprobación
> explícita del usuario**.

**En Python:**
```python
import requests
S = "fcdeee3a67f637f57c7a55df56c5fa0d40ccb89053002ce715efc541cb31ff77"
B = "http://143.198.228.78:8181"
H = {"x-deploy-secret": S, "Content-Type": "application/json"}
requests.post(f"{B}/admin/deploy", headers=H)
requests.post(f"{B}/admin/exec", headers=H, json={"command": "pm2 list"})
requests.get(f"{B}/admin/logs", headers=H, params={"lines": 200})
```

### Opción 2 — SSH con llave privada

La llave privada está en `ssh/pillai_agents.pem` de este repo.

```bash
# Setup al inicio de sesión (leer llave del repo vía GitHub MCP o git)
mkdir -p ~/.ssh && chmod 700 ~/.ssh
# Copiar contenido de ssh/pillai_agents.pem a ~/.ssh/pillai_agents
chmod 600 ~/.ssh/pillai_agents
ssh-keyscan -H 143.198.228.78 >> ~/.ssh/known_hosts 2>/dev/null

# Conectar
ssh -i ~/.ssh/pillai_agents german@143.198.228.78
```

---

## Financial System — Rutas y procesos PM2

| Directorio (repo) | Ruta en servidor | Proceso PM2 | Puerto |
|-------------------|-----------------|-------------|--------|
| `financial/bot/` | `/var/www/html/vilarkptl.com/ai-monitor/financial/bot/` | `financial-bot` | — |
| `dashboard-financial/` | `/var/www/html/vilarkptl.com/ai-monitor/dashboard-financial/` | `financial-dashboard` | 3020 |

### Comandos de deploy por subsistema

```bash
# ── Raíz común ────────────────────────────────────────────────────────────────
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin main
git reset --hard origin/main

# ── Solo financial-bot (cambios en financial/bot/**) ─────────────────────────
pm2 restart financial-bot

# ── Solo dashboard-financial (cambios en dashboard-financial/**) ─────────────
cd dashboard-financial && npm run build && pm2 restart financial-dashboard

# ── Ambos subsistemas ─────────────────────────────────────────────────────────
pm2 restart financial-bot
cd dashboard-financial && npm run build && pm2 restart financial-dashboard
```

---

## Reglas para agentes en este repo

1. **Máximo 3 objetivos por sesión**
2. **Deploy siempre como tarea separada** (no combinar con cambios de código)
3. **Nunca `git add .`** — usar `git add <archivos específicos>`
4. **Nunca commitear**: `node_modules/`, `.env`, `nohup.out`, `FETCH_HEAD`
5. **Siempre terminar con bloque outbox estructurado**
6. **Coordinator**: si solo escribe inbox.md, completar en <60s
7. **Migraciones SQL con contraseña del .env**: nunca usar `mysql -u root -p` interactivo; leer siempre la contraseña con:
   ```bash
   DB_PASS=$(grep -oP 'DB_PASS=\K.*' /ruta/al/.env)
   mysql -u root -p"$DB_PASS" nombre_db < migrate.sql
   ```
8. **Deploy al terminar cada commit**: incluir bloque `DEPLOY` con los comandos exactos según los archivos modificados (ver sección *Financial System — Rutas y procesos PM2*). Copiar y pegar sin editar.
9. **Branch de ai-monitor en projects.json es `main`** — no cambiar a branches de desarrollo

---

## ⛔ Prohibido en el servidor — reglas anti-catástrofe

> Estas reglas nacieron de incidentes reales. Violarlas puede tumbar Apache o todos los servicios.

### Archivos de configuración Apache

**NUNCA** escribir configs de Apache con `node -e "require('fs').writeFileSync(..., contenido)"` cuando el contenido viene como argumento CLI.
Los argumentos CLI no interpretan `\n` — el archivo queda en una sola línea y Apache no arranca.

```bash
# ❌ MAL — genera archivo con \n literales, Apache no arranca
node -e "require('fs').writeFileSync('/etc/apache2/sites-enabled/foo.conf', '<VirtualHost *:443>\n    ServerName...')"

# ✅ BIEN — usar el archivo del repo como fuente de verdad
cp deploy/apache-foo.conf /etc/apache2/sites-enabled/foo.conf
apache2ctl configtest && systemctl reload apache2
```

**Siempre** verificar con `apache2ctl configtest` antes de recargar Apache. Si hay error de sintaxis, Apache cae al hacer reload/restart.

### git reset --hard en el servidor

**NUNCA** hacer `git reset --hard origin/main` en el servidor sin antes verificar branches activos:

```bash
# Verificar antes de reset:
git log --oneline HEAD..origin/main   # qué falta del remoto
git log --oneline origin/main..HEAD   # qué tiene el servidor que no está en remoto
# Si hay commits locales no pusheados → mergear o pushar ANTES del reset
```

### Configs de Apache — flujo correcto

1. El archivo fuente de verdad vive en `deploy/apache-*.conf` del repo
2. Modificar ahí, commitear, pushear
3. En el servidor: `git pull` + `cp deploy/apache-X.conf /etc/apache2/sites-enabled/X.conf`
4. `apache2ctl configtest && systemctl reload apache2`
5. **Nunca** editar directamente `/etc/apache2/sites-enabled/` sin actualizar el repo

### No sobreescribir servicios systemd activos sin reload

Después de modificar `deploy/exec-lite.js` y hacer git pull en el servidor, el proceso systemd sigue corriendo el código viejo hasta que se reinicie:

```bash
# Después de git pull con cambios en deploy/exec-lite.js:
systemctl restart exec-lite
```

---

## Financial-Bot — Flujo de desarrollo (LEER ANTES DE TOCAR financial/)

### Roles

| Herramienta | Rol |
|-------------|-----|
| **Claude Code CLI** (este agente) | Desarrolla todo el código, hace commits y push |
| **Cursor Cloud Agents** (servidor) | Revisa, prueba y optimiza el código en el servidor |

Claude Code CLI escribe código, commitea, y puede ejecutar comandos en producción vía SSH o `/api/exec` (pm2, mysql, git).
Cursor Cloud Agents también ejecuta y valida el código en el servidor.

### Variables de entorno obligatorias en financial/bot

Siempre usar exactamente estos nombres (están en el servidor y en Cursor Cloud Agents):

```js
process.env.ANTHROPIC_API_KEY   // Claude Sonnet → TransactionOrchestrator + VisionAgent (fallback)
process.env.GOOGLE_API_KEY      // gemini-1.5-flash → DocumentIntelligenceAgent
process.env.DEEPSEEK_API_KEY    // DeepSeek → InvoiceAgent, ContextReader, ResponseGen
```

**Nunca hardcodear claves. Nunca usar otros nombres de variables.**

### Archivos de contexto para Cursor Agents (mantener actualizados)

- `financial/bot/AGENTS.md` — roles, modelos, métodos, fallback de cada agente
- `financial/bot/AGENT-TREE.md` — árbol visual del flujo de agentes
- `financial/bot/.cursor/rules/core-rules.mdc` — reglas de desarrollo para Cursor Agents

Actualizar estos archivos cada vez que se agregue o modifique un agente.

### Agentes activos (2026-04-30)

| Agente | Archivo | Modelo | Env var |
|--------|---------|--------|---------|
| DocumentIntelligenceAgent | `agents/DocumentIntelligenceAgent.js` | `gemini-1.5-flash` | `GOOGLE_API_KEY` |
| TransactionOrchestrator | `agents/TransactionOrchestrator.js` | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| VisionAgent (fallback OCR) | `agents/vision-agent.js` | `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` |
| InvoiceAgent (fallback docs) | `agents/invoice-agent.js` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| ContextReader (fallback routing) | `agents/context-reader.js` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| ResponseGen | `agents/response-gen.js` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| Verifier | `agents/verifier.js` | rule-based | — |

### Cursor Cloud Agents — Self-Hosted Worker

El servidor (`143.198.228.78`) debe tener el worker de Cursor corriendo para que Cursor Cloud Agents pueda ejecutar tareas remotamente.

```bash
# Instalar CLI de Cursor (una sola vez)
curl https://cursor.com/install -fsS | bash

# Iniciar worker (pide login en el navegador la primera vez)
agent worker start

# Verificar que está corriendo
ps aux | grep -E 'agent worker|cursor-agent'
```

- Dashboard para ver el servidor conectado: https://cursor.com/dashboard/cloud-agents
- Aparece como **My Machines → Connected / Idle** cuando está activo
- Los Secrets (`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`) se configuran en el dashboard de Cursor, no en el `.env` local del worker
- Claude Code CLI **nunca** inicia ni detiene el worker — eso lo hace el usuario desde el servidor
- Worker registrado como proceso PM2: `cursor-worker` (id 26) — ya configurado y persistente

---

## Comunicación Multi-Agente vía GitHub

> Regla fundamental: **ningún agente empieza a trabajar sin leer `relay/AGENT-STATUS.md`**.
> Ningún agente termina sin actualizarlo.

### Archivo de estado compartido: `relay/AGENT-STATUS.md`

Cada agente lee este archivo al inicio de su sesión para saber:
- Qué archivos están siendo modificados por otros agentes
- Qué branches existen y qué contienen
- Qué está pendiente de merge a main

Al terminar su sesión, cada agente actualiza su sección con:
- Archivos modificados (ruta exacta)
- Branch usado
- Estado: `done | in-progress | blocked`
- SHA del último commit

### Flujo de comunicación bidireccional

```
Agente A (escribe tarea) ──► relay/inbox-B.md (commit + push a main)
                                      │
                               relay-master detecta (15s)
                                      │
                              Agente B ejecuta tarea
                                      │
                         relay/outbox-B.md (commit + push a main)
                                      │
                               relay-master lee outbox
                                      │
                         Telegram notifica + si necesita respuesta:
                         relay-master escribe en relay/inbox-A.md
```

**Para que Agente A dispache a Agente B directamente:**
1. Editar `relay/inbox-[id-de-B].md` con la tarea
2. `git add relay/inbox-[id-de-B].md && git commit -m "dispatch: A→B <descripción>" && git push origin main`
3. El relay-master lo detecta en el próximo ciclo y lanza la tarea

**Para urgencia** (sin esperar ciclo de 15s): POST al endpoint del relay-master:
```bash
curl -X POST http://localhost:3010/api/relay/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"project":"finbot-tester","task":"<descripción>","requester":"ai-monitor"}'
```

### Convención de branches por agente

| Branch | Agente | Archivos "propios" |
|--------|--------|-------------------|
| `claude/agent-monitoring-dashboard-4v8iq` | ai-monitor | `frontend/`, `backend/`, `relay/master.js`, `deploy/` |
| `claude/financial-multiagent-system-YwtYQ` | finbot-tester/verifier | `financial/`, `relay/inbox-finbot-*.md` |
| `cursor/financial-bot-env-review-8da7` | Cursor agent | `financial/bot/AGENTS.md`, `AGENT-TREE.md` |

**Reglas de branch para evitar conflictos:**
1. Cada agente trabaja en SU branch para cambios de código sustanciales
2. Los cambios de relay (inbox/outbox/projects.json) van directo a `main`
3. **Antes de mergear a main**: leer `relay/AGENT-STATUS.md` para ver si otro agente tiene archivos en conflicto
4. Si hay conflicto potencial: despachar tarea de coordinación al `coordinator` vía inbox

### Proceso de merge seguro a main

```bash
# 1. Leer AGENT-STATUS.md para conocer el estado actual
cat relay/AGENT-STATUS.md

# 2. Verificar qué branches tienen trabajo pendiente
git fetch origin
git log --oneline main..origin/<branch>

# 3. Mergear en orden: primero el branch más antiguo
git merge origin/<branch> --no-ff

# 4. Si hay conflictos en frontend/: tomar la versión del branch de redesign
# Si hay conflictos en relay/projects.json: fusionar manualmente (ambos pueden tener entradas válidas)

# 5. Actualizar AGENT-STATUS.md tras el merge
# 6. Push a main
```

### Reglas anti-degradación

- **Nunca** hacer `git reset --hard origin/main` en el servidor sin antes mergear todos los branches activos
- **Siempre** verificar `git log --oneline main..HEAD` antes de reset — si hay commits, mergearlos primero
- Si el servidor tiene divergencia: `git fetch origin && git log --oneline HEAD..origin/main` para ver qué falta

---

## Instrucciones de compactación de contexto

Cuando el contexto se compacte automáticamente, el resumen debe seguir estas reglas para minimizar tokens:

### Incluir (forma compacta)
- Archivos modificados: solo `ruta/archivo.js:línea — qué cambió` (una línea por archivo)
- Errores resueltos: causa raíz + fix en una oración
- PRs mergeados: número + título + sha corto
- Estado de tareas pendientes: lista bulleted, sin contexto extra
- Variables de entorno críticas solo si cambiaron

### NO incluir en el resumen
- Bloques de código completos (solo snippets de 1-3 líneas si son esenciales)
- Logs literales del servidor (solo el mensaje de error, no el stack trace completo)
- Contenido completo de archivos SQL o de configuración
- Historial de intentos fallidos (solo el fix final)
- Contexto de arquitectura general (ya está en CLAUDE.md)

### Formato objetivo del resumen
```
## Estado actual
- Rama: <nombre> | Último PR: #N mergeado a main
- Bot: online | Dashboard: online | DB: migración vN aplicada

## Archivos modificados (esta sesión)
- ruta/archivo.js — descripción de cambio
...

## Pendiente
- [ ] tarea pendiente 1
...
```

**Objetivo: resumen ≤ 400 palabras. Si supera 600 palabras, está incluyendo demasiado.**

---

## Flujo multi-dev (3 desarrolladores simultáneos)

> Leer esta sección COMPLETA al inicio de cada sesión antes de tocar cualquier archivo.

### Identidad y branch por dev

| Dev | Branch de trabajo | Ownership principal |
|-----|-------------------|---------------------|
| german | `claude/agent-monitoring-dashboard-4v8iq` | `relay/master.js`, `backend/`, `frontend/`, `deploy/` |
| dev-2 | `claude/dev-[nombre]-[fecha]` | `financial/bot/`, DeCabeceraTax workspace |
| dev-3 | `claude/dev-[nombre]-[fecha]` | proyectos nuevos (`pill.ai`, integraciones externas) |

**Al iniciar sesión**, declara tu identidad:
```
Soy [nombre]. Mi branch es [branch]. Voy a trabajar en [área].
```

### Checklist de inicio de sesión

```bash
# 1. Verificar estado de otros devs
cat relay/AGENT-STATUS.md

# 2. Actualizar tu branch
git fetch origin
git rebase origin/main   # o merge, según prefieras

# 3. Verificar que no hay conflictos pendientes
git status --short
```

Si un archivo que necesitas está marcado como "in-progress" por otro dev en `relay/AGENT-STATUS.md`, coordina antes de tocarlo — despacha al coordinator:
```
/dispatch coordinator Necesito coordinar con [dev] sobre [archivo] — [qué quiero hacer]
```

### Workflow por sesión

1. **Trabaja en tu branch** — nunca commitees directo a `main`
2. **Commits frecuentes y específicos** — cada bloque lógico de cambios
3. **Al terminar**: actualiza `relay/AGENT-STATUS.md` con archivos modificados y estado
4. **Para mergear a main**: crea PR, otro dev revisa (o usa `/tarea coordinator revisar PR #N`)
5. **El relay-master** hace `gitPull` de `main` cada 15s — mergea solo cuando el código es estable

### Cómo despachar tareas al sistema multi-agente

**Desde Claude Code** (slash command):
```
/dispatch fiscalai Agrega validación de RFC en el formulario de alta
/dispatch coordinator Revisa conflictos en relay/master.js antes del merge
/dispatch ai-monitor Actualiza el dashboard con nueva métrica de latencia
```

**Desde Telegram** (iavilarBot):
```
/dispatch [proyecto] [descripción]   ← despacha directo, sin plan
/tarea [proyecto] [descripción]      ← genera plan DeepSeek + aprobación
```

**Proyectos disponibles para despacho:**

| ID | Descripción | Rama git |
|----|-------------|----------|
| `fiscalai` | Backend FiscalAI + SAT APIs | main (DeCabeceraTax) |
| `fiscalai-front` | Frontend FiscalAI — producción | main (DeCabeceraTax) |
| `fiscalai-test` | Frontend FiscalAI — testing.fiscalai.mx | testing (DeCabeceraTax) |
| `coordinator` | Coordinación entre agentes | main |
| `ai-monitor` | Dashboard de monitoreo | main |
| `finbot-tester` | Tester automatizado financial-bot | main |
| `finbot-verifier` | Verificador continuo financial-bot | main |

### Para probar cambios en producción

```bash
# Ver logs de un proceso en tiempo real
sshpass -p 'romanos12_2' ssh -o StrictHostKeyChecking=no german@143.198.228.78 "pm2 logs [proceso] --lines 30"

# Dashboard con métricas de agentes
# → ia.vilarkptl.com

# Verificar que tu PR llegó a producción
sshpass -p 'romanos12_2' ssh -o StrictHostKeyChecking=no german@143.198.228.78 "cd /var/www/html/vilarkptl.com/ai-monitor && git log --oneline -3"
```

### Asignación del roadmap pendiente

| Tarea | Dev asignado | Prioridad |
|-------|-------------|----------|
| B3: multi-cuenta routing (5 cuentas Pro/Max en master.js) | german | Alta |
| Fix permanente DeCabeceraTax gitPull | dev-2 | Alta |
| conversation-engine: confirmar score post-SQL fix | dev-2 | Alta |
| pill.ai: deploy Fly.io + Stripe webhook | dev-3 | Media |
| Agregar pill.ai a projects.json del relay | dev-3 | Media |
| Tests: `/dispatch` en iavilarBot + Claude Code | german | Media |
| Dashboard: métricas de sesiones B1 (--resume) | german | Baja |
| CI: pytest + ruff para financial/bot | dev-2 | Baja |

### Reglas anti-conflicto

- **`relay/master.js`** — ownership exclusivo de german. Otros devs no tocan sin coordinación previa.
- **`relay/projects.json`** — cambios siempre en `main` directo (no en branches de código). Formato: `git add relay/projects.json && git commit -m "relay: [descripción]" && git push origin main`
- **`financial/bot/`** — ownership de dev-2. Cambios de arquitectura requieren actualizar `financial/bot/AGENTS.md` y `AGENT-TREE.md`.
- **`relay/inbox-*.md` y `relay/outbox-*.md`** — NO commitear en branches de código. Solo relay-master y `/dispatch` los tocan.
- Si hay duda sobre ownership: preguntar en `relay/AGENT-STATUS.md` o despachar al coordinator.
