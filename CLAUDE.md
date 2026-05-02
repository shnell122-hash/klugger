# CLAUDE.md — ai-monitor / agentic-repo

> Archivo de referencia para agentes Claude Code. Actualizado 2026-05-02.

---

## Servidor de producción

| Campo | Valor |
|-------|-------|
| Host | `143.198.228.78` (vilar-desarrollo) |
| Usuario SSH | `root` |
| Contraseñas | Ver `/opt/kptl-secrets/server-credentials.txt` en el servidor (solo root) |
| Contraseñas | Ver con el equipo directamente — no documentar aquí |
| OS | Ubuntu / Debian (Apache + PM2) |

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
# Conectar por SSH (contraseña en /opt/kptl-secrets/server-credentials.txt)
ssh root@143.198.228.78

# MySQL (contraseña en /opt/kptl-secrets/server-credentials.txt)
mysql -u root -p ai_monitoring

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

---

## Financial-Bot — Flujo de desarrollo (LEER ANTES DE TOCAR financial/)

### Roles

| Herramienta | Rol |
|-------------|-----|
| **Claude Code CLI** (este agente) | Desarrolla todo el código, hace commits y push |
| **Cursor Cloud Agents** (servidor) | Revisa, prueba y optimiza el código en el servidor |

Claude Code CLI **nunca** corre el código en producción — solo escribe y commitea.  
Cursor Cloud Agents **nunca** escribe código — solo ejecuta y valida lo que Claude generó.

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
