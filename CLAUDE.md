# CLAUDE.md — ai-monitor / agentic-repo

> Archivo de referencia para agentes Claude Code. Actualizado 2026-04-20.

---

## Servidor de producción

| Campo | Valor |
|-------|-------|
| Host | `143.198.228.78` (vilar-desarrollo) |
| Usuario SSH | `root` |
| Contraseñas | Ver `/opt/kptl-secrets/server-credentials.txt` en el servidor (solo root) |
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
| `ai-monitor` | claude-haiku-4-5 | main | Este mismo dashboard |

> **Nota**: Haiku 4.5 mostró 0 tool calls en tareas de código (2026-04-20).
> fiscalai-front revertido a Sonnet. Haiku solo para coordinator y ai-monitor.

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
git fetch origin claude/financial-multiagent-system-YwtYQ
git reset --hard origin/claude/financial-multiagent-system-YwtYQ

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
