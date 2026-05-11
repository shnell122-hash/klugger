# SYSTEM.md — Relay AI Monitor

> Documentación completa del sistema multi-agente. Actualizado 2026-05-01.

---

## Índice

1. [Stack técnico](#1-stack-técnico)
2. [Árbol de agentes](#2-árbol-de-agentes)
3. [Árbol de archivos](#3-árbol-de-archivos)
4. [Arquitectura y flujo](#4-arquitectura-y-flujo)
5. [Autodiagnóstico del sistema](#5-autodiagnóstico-del-sistema)
6. [Integración de sistemas nuevos](#6-integración-de-sistemas-nuevos)

---

## 1. Stack técnico

| Capa | Tecnología | Versión / Notas |
|------|-----------|-----------------|
| **Orquestador** | Node.js + PM2 | relay/master.js — proceso único |
| **Backend API** | Express 4 + Socket.io | Puerto 3010 |
| **Base de datos** | MySQL / MariaDB | DB: `ai_monitoring` |
| **Frontend** | HTML/CSS/JS vanilla | Chart.js 4, Inter font |
| **LLM principal** | Claude Code CLI | Anthropic (`claude-sonnet-4-6`, `claude-haiku-4-5`) |
| **LLM auxiliar** | DeepSeek V3 API | Planificación, code-review |
| **Notificaciones** | Telegram Bot API | HTML parse mode |
| **Servidor** | Ubuntu/Debian, Apache 2 | mod_proxy + mod_proxy_wstunnel |
| **Proceso manager** | PM2 | watch: false, autorestart: true |
| **Reverse proxy** | Apache 2 | ia.vilarkptl.com → localhost:3010 |
| **Agentes AI extra** | Cursor Cloud Agents | Self-hosted worker (cursor-worker) |

### Variables de entorno principales (`relay/.env`)

```env
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
GITHUB_TOKEN=ghp_...
MONITOR_API_URL=http://127.0.0.1:3010
RELAY_DISPATCH_URL=http://127.0.0.1:3010/api/relay/dispatch
CLAUDE_BIN=/usr/local/bin/claude
POLL_MS=15000
CLAUDE_TIMEOUT_MS=1500000
OUTBOX_TIMEOUT_MS=2100000
```

---

## 2. Árbol de agentes

```
relay-master (Node.js, PM2)
│
├─── coordinator              claude-haiku-4-5-20251001
│    ├── Rol: Orquesta dispatches, no escribe código
│    ├── Inbox:  DeCabeceraTax/relay/coordinator-inbox.md
│    ├── Outbox: DeCabeceraTax/relay/coordinator-outbox.md
│    └── Despacha a: fiscalai, fiscalai-front
│
├─── fiscalai                 claude-sonnet-4-6
│    ├── Rol: Backend Node.js + SAT APIs + MySQL
│    ├── Repo: /var/www/html/vilarkptl.com/DeCabeceraTax
│    ├── Inbox:  DeCabeceraTax/relay/inbox.md
│    └── Outbox: DeCabeceraTax/relay/outbox.md
│
├─── fiscalai-front           claude-sonnet-4-6
│    ├── Rol: Frontend HTML/CSS/JS vanilla
│    ├── Repo: /var/www/html/vilarkptl.com/DeCabeceraTax
│    ├── Inbox:  DeCabeceraTax/relay/inbox-front.md
│    └── Outbox: DeCabeceraTax/relay/outbox-front.md
│
└─── ai-monitor               claude-haiku-4-5-20251001
     ├── Rol: Dashboard de monitoreo (este mismo repo)
     ├── Repo: /var/www/html/vilarkptl.com/ai-monitor
     ├── Inbox:  ai-monitor/relay/inbox.md
     └── Outbox: ai-monitor/relay/outbox.md

Procesos PM2 adicionales:
├─── ai-monitor   (backend/server.js — Express + Socket.io, puerto 3010)
├─── claude-chat-bot  (relay/chat-agent.js — Telegram bot directo)
├─── code-reviewer    (relay/code-reviewer.js — DeepSeek V3, cada 5 min)
└─── cursor-worker    (Cursor Cloud Agent self-hosted worker)
```

### Modelos y costos estimados

| Agente | Modelo | Input $/1M | Output $/1M | Uso típico |
|--------|--------|-----------|------------|------------|
| coordinator | claude-haiku-4-5 | $0.80 | $4.00 | Dispatches, orquestación |
| ai-monitor | claude-haiku-4-5 | $0.80 | $4.00 | Cambios al dashboard |
| fiscalai | claude-sonnet-4-6 | $3.00 | $15.00 | Backend, MySQL, APIs |
| fiscalai-front | claude-sonnet-4-6 | $3.00 | $15.00 | HTML/CSS/JS |
| code-reviewer | deepseek-v3 | $0.27 | $1.10 | Reviews automáticos |
| buzon/planning | claude-haiku-4-5 | $0.80 | $4.00 | Planeación de tareas |

---

## 3. Árbol de archivos

```
/home/user/agentic-repo/           (GitHub: vilarkptl-lang/agentic-repo)
│
├── CLAUDE.md                       Instrucciones para agentes Claude Code
├── SYSTEM.md                       ← Este archivo
├── AGENTS.md                       Config para Cursor Cloud Agents
├── CURSOR-AGENTS-GUIA.md           Guía de uso de Cursor Agents
│
├── backend/
│   ├── server.js                   Express + Socket.io (puerto 3010)
│   ├── .env.example                Plantilla de variables de entorno
│   ├── db/
│   │   ├── schema.sql              Esquema completo
│   │   └── migrate-v*.sql          Migraciones acumulativas (v3–v11)
│   └── routes/
│       ├── events.js               POST /api/events — tool calls
│       ├── sessions.js             GET/POST /api/sessions
│       ├── costs.js                GET /api/costs — costos por token
│       ├── providers.js            CRUD /api/providers — API keys
│       ├── projects.js             CRUD /api/projects
│       ├── dispatch.js             POST /api/relay/dispatch — cola de tareas
│       ├── screenshots.js          GET/POST /api/screenshots
│       ├── alerts.js               GET/POST /api/alerts
│       ├── conversations.js        GET/POST /api/conversations
│       ├── platform.js             Anthropic Admin API + kill-switch
│       └── apiAdmin.js             API Admin dashboard (multi-provider)
│
├── frontend/
│   ├── index.html                  SPA con tabs: Feed/Agentes/Sesiones/Costos/APIs/Proyectos/Alertas/Chats
│   ├── css/dashboard.css           Glassmorphism light theme
│   └── js/dashboard.js            WebSocket client + Chart.js
│
├── relay/
│   ├── master.js                   Orquestador principal (PM2: relay-master)
│   ├── projects.json               Config de proyectos y modelos
│   ├── chat-agent.js               Telegram bot directo (grammy + Anthropic SDK)
│   ├── code-reviewer.js            DeepSeek V3 auto-reviewer
│   ├── buzon-ia.md                 Buzón de mensajes ia→fiscalai
│   ├── inbox.md                    Inbox del agente ai-monitor
│   ├── outbox.md                   Outbox del agente ai-monitor
│   ├── coordinator-inbox.md        Inbox del coordinator
│   ├── coordinator-outbox.md       Outbox del coordinator
│   ├── .env                        Variables de entorno (no commitear)
│   ├── .env.example                Plantilla
│   └── agents/                     Prompts por agente
│       ├── ai-monitor.md
│       ├── coordinator.md
│       ├── fiscalai.md
│       └── fiscalai-front.md
│
├── deploy/
│   ├── ecosystem.config.js         PM2 ecosystem (4 procesos)
│   ├── apache-ia.vilarkptl.com.conf Apache vhost config
│   └── setup-server.sh             Script de setup inicial
│
└── hooks/
    ├── hook-pre.sh                 Pre-task hook
    ├── hook-post.sh                Post-task hook
    └── hook-stop.sh                Stop hook
```

---

## 4. Arquitectura y flujo

```
Usuario / Telegram
      │
      ▼
  Telegram Bot  ──────────────────────────────▶  claude-chat-bot (relay/chat-agent.js)
      │                                              (responde en tiempo real con tool use)
      │ (tareas largas vía inbox.md)
      ▼
relay/master.js  (PM2: relay-master)
      │
      │  1. Poll inbox.md cada 15s por proyecto
      │  2. Si hay tarea nueva → encola
      │  3. Spawns Claude CLI con --model + --output-format stream-json
      │  4. Lee events del stream → POST /api/events (backend)
      │  5. Watchdog 35min → mata proceso si sin outbox
      │  6. Hace git pull + push después de cada tarea
      │
      ├──▶ Claude Code CLI (claude-sonnet-4-6 / claude-haiku-4-5)
      │         └── edita archivos, hace commits, push al branch del proyecto
      │
      ├──▶ DeepSeek V3 API (callDeepSeek)
      │         └── Planificación de tareas, resúmenes de memoria, code-review
      │
      └──▶ POST /api/events, /api/sessions, /api/alerts
                    │
              backend/server.js  (Express 3010)
                    │
              Socket.io broadcast ──▶ frontend dashboard (ia.vilarkptl.com)
                    │
              MySQL ai_monitoring
```

### Flujo de dispatch (tarea de coordinador)

```
Telegram: "@ia, haz X en fiscalai"
    │
    ▼
relay/inbox.md  (ai-monitor agent)
    │  relay-master detecta cambio
    ▼
Claude CLI (haiku) ejecuta tarea → escribe en dispatch queue
    │
    ▼
POST /api/relay/dispatch → pending-dispatches.json
    │  processDispatchQueue() cada ciclo
    ▼
DeCabeceraTax/relay/inbox.md  (fiscalai agent)
    │  relay-master detecta cambio
    ▼
Claude CLI (sonnet) ejecuta tarea → commit + push
    │
    ▼
DeCabeceraTax/relay/outbox.md → Telegram notifica resultado
```

---

## 5. Autodiagnóstico del sistema

### Fortalezas ✅

| Área | Descripción |
|------|-------------|
| **Autonomía** | Ciclo completo sin intervención humana: tarea → código → commit → push → notificación |
| **Observabilidad** | Dashboard en tiempo real (Socket.io), logs PM2, alertas Telegram |
| **Multi-modelo** | Sonnet para código complejo, Haiku para coordinación, DeepSeek para reviews — cada uno donde tiene ROI |
| **Kill-switch** | Umbral diario de gasto ($7 default) para prevenir runaway de costos |
| **Prompt caching** | `cache_control: ephemeral` en system prompts de callAnthropicDirect — reduce costo ~60% en llamadas repetidas |
| **Outbox watchdog** | Mata procesos que no producen resultado en 35 min, previene loops infinitos |
| **Auto-reload** | relay-master detecta cambios en su propio código y se reinicia solo via PM2 |
| **Dispatch queue** | Cola persistente en disco, sobrevive reinicios del proceso |
| **Code reviewer** | DeepSeek V3 revisa cada commit automáticamente, alerta en Telegram si detecta bugs |
| **Budget inheritance** | Sub-dispatches del coordinator heredan `budget_usd_max: 1.50` si no tienen presupuesto explícito |

### Debilidades ⚠️

| Área | Descripción | Severidad |
|------|-------------|-----------|
| **Single point of failure** | relay-master es un proceso único; si muere, todos los agentes paran | Alta |
| **Sin retry automático** | Si un agente falla (no-outbox), la tarea se pierde — sin reintentos | Media |
| **Anthropic Admin API** | Datos reales de costo de Anthropic no disponibles (retorna `not_found_error`) — solo estimados | Media |
| **Sin autenticación** | Dashboard público en ia.vilarkptl.com sin login — cualquiera puede ver eventos | Media |
| **Logs en disco local** | Logs de PM2 en `/var/log/ai-monitor/` — no centralizados, pueden crecer sin límite | Baja |
| **Sin tests automatizados** | No hay test suite para backend ni frontend | Baja |
| **Inbox como interface** | Escribir en archivos .md como API es frágil — race conditions posibles si dos procesos escriben | Baja |
| **Secrets en .env local** | API keys solo en archivos .env en servidor — sin vault ni rotación automática | Media |
| **Haiku para ai-monitor** | Haiku 4.5 tuvo 0 tool calls en tareas de código anteriores — solo Sonnet garantiza ejecución correcta | Alta |
| **Sin staging environment** | Cambios van directo a producción — sin validación intermedia | Media |

### Métricas de referencia (estimadas)

| Métrica | Valor | Fuente |
|---------|-------|--------|
| Costo por tarea (coordinator) | ~$0.01–0.05 | claude-haiku-4-5 |
| Costo por tarea (fiscalai) | ~$0.10–0.50 | claude-sonnet-4-6 |
| Ciclo de poll | 15 segundos | POLL_MS |
| Timeout por tarea | 25 minutos | CLAUDE_TIMEOUT_MS |
| Watchdog outbox | 35 minutos | OUTBOX_TIMEOUT_MS |
| Kill-switch diario | $7.00 USD | platform_budget.threshold_usd |

---

## 6. Integración de sistemas nuevos

### Pasos para conectar un proyecto nuevo al Relay

#### Requisito previo: repo en GitHub
El proyecto debe tener un repositorio GitHub accesible con el `GITHUB_TOKEN` del servidor.

#### Paso 1 — Crear archivos inbox/outbox en el repo

```bash
# En el repo del proyecto nuevo
mkdir -p relay
echo "# Inbox vacío" > relay/inbox.md
echo "# Outbox vacío" > relay/outbox.md
git add relay/inbox.md relay/outbox.md
git commit -m "feat(relay): add inbox/outbox for relay integration"
git push
```

#### Paso 2 — Crear el prompt del agente

Crear `relay/agents/mi-proyecto.md` en **este repo** (`agentic-repo`):

```markdown
# Agente — Mi Proyecto

Eres el agente de [descripción del proyecto].

## Stack
- [lenguaje, framework, DB, etc.]

## Entornos
- Producción: [URL]
- Repo: [ruta en servidor]

## Reglas
1. Nunca commitear .env, node_modules
2. Siempre usar git add <archivos específicos>
3. Terminar con bloque outbox estructurado

## Formato outbox (OBLIGATORIO)
STATUS: done | partial | failed
CHANGED: archivo1, archivo2
DEPLOYED: yes | no
PENDING: descripción
USER_REQUIRED: acción humana si es necesaria
```

#### Paso 3 — Agregar a projects.json

```json
{
  "id": "mi-proyecto",
  "name": "Mi Proyecto — Descripción",
  "claude_model": "claude-sonnet-4-6",
  "inbox":  "/ruta/en/servidor/relay/inbox.md",
  "outbox": "/ruta/en/servidor/relay/outbox.md",
  "repo":   "/ruta/en/servidor/mi-proyecto",
  "branch": "main",
  "github": "org/mi-repo",
  "url":    "https://mi-proyecto.com",
  "active": true
}
```

#### Paso 4 — Clonar repo en servidor (si no existe)

```bash
ssh root@143.198.228.78
cd /var/www/html/vilarkptl.com
git clone https://${GITHUB_TOKEN}@github.com/org/mi-repo.git mi-proyecto
```

#### Paso 5 — Deploy y verificación

```bash
# Commit y push de projects.json
git add relay/projects.json relay/agents/mi-proyecto.md
git commit -m "feat(relay): add mi-proyecto agent"
git push

# En servidor — relay-master detectará automáticamente el nuevo proyecto
# en el próximo ciclo (15s) y empezará a monitorear el inbox
pm2 logs relay-master --lines 20 --nostream | grep "mi-proyecto"
```

#### Paso 6 — Enviar primera tarea

```bash
# Opción A: Editar inbox directamente
echo "# Mi primera tarea

Verifica que el servidor está corriendo y responde.

budget_usd_max: 0.50" > /ruta/inbox.md

# Opción B: Dispatch via API
curl -X POST http://localhost:3010/api/relay/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"project":"mi-proyecto","task":"## Hello World\nVerifica que el proyecto está integrado correctamente.","requester":"human"}'
```

### Checklist de integración

```
- [ ] Repo GitHub accesible con GITHUB_TOKEN
- [ ] relay/inbox.md y relay/outbox.md creados en el repo del proyecto
- [ ] Prompt del agente creado en relay/agents/mi-proyecto.md
- [ ] Entrada en relay/projects.json (active: true)
- [ ] Repo clonado en servidor en la ruta correcta
- [ ] git push del projects.json actualizado
- [ ] Primera tarea enviada y outbox verificado
- [ ] Proyecto visible en dashboard (tab Proyectos)
```

### Plantilla de prompt para conectar via Telegram

```
@ia, agrega al relay el proyecto "nombre-proyecto":
- Repo GitHub: org/repo
- Ruta servidor: /var/www/html/.../nombre-proyecto
- Stack: Node.js / Python / etc.
- URL producción: https://...
- Modelo sugerido: claude-sonnet-4-6 (código) / claude-haiku-4-5 (tareas simples)
```

---

## Servidor de producción

| Campo | Valor |
|-------|-------|
| Host | `143.198.228.78` (vilar-desarrollo) |
| Usuario SSH | `root` |
| OS | Ubuntu/Debian |
| Procesos PM2 | `relay-master`, `ai-monitor`, `claude-chat-bot`, `code-reviewer`, `cursor-worker` |

### Comandos de administración frecuentes

```bash
pm2 status                                    # Ver todos los procesos
pm2 logs relay-master --lines 50 --nostream   # Últimos 50 logs del relay
pm2 restart relay-master                      # Reiniciar relay (graceful prefiere checkSelfReload)
pm2 restart ai-monitor                        # Reiniciar backend Express
mysql -u root -pVilarRoot2026! ai_monitoring  # Acceso a BD

# Migración de DB
mysql -u root -pVilarRoot2026! ai_monitoring < backend/db/migrate-v11.sql

# Ver gasto estimado del día
curl http://localhost:3010/api/platform/kill-check | python3 -m json.tool
```
