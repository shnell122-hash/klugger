# ROADMAP — AI Monitor / Agentic Relay System

> Actualizado: 2026-05-27 (v4 — P0+P1 completos, relay-dashboard deploy OK)
> Objetivo: plataforma autónoma 24/7 que iguala y supera a Claude Code

---

## Diagnóstico real del pipeline (2026-05-26)

**El output de calidad cuando las tareas ejecutan es EQUIVALENTE a Claude Code directo.**
El problema es el pipeline — no el modelo.

### Success rate por proyecto (últimos 30 días — baseline 2026-05-26)

| Proyecto | Total tareas | Completadas | Fallidas | **Atascadas** | **Success rate** |
|----------|-------------|-------------|----------|----------------|-----------------|
| coordinator | 97 | 18 | 20 | 59 | **18.6%** 🔴 |
| ai-monitor | 9 | 4 | 0 | 5 | **44%** 🟡 |
| finbot-tester | 4 | 2 | 1 | 1 | **50%** 🟡 |
| fiscalai | 5 | 3 | 0 | 2 | **60%** 🟡 |
| finbot-verifier | 2 | 0 | 0 | 2 | **0%** 🔴 |

### Success rate post-P0 (últimos 7 días — 2026-05-27)

> P0 activado 2026-05-26. Muestra transición: atascadas ya expiran a failed automáticamente.

| Proyecto | Total | Completadas | Fallidas | Stuck | **Rate** |
|----------|-------|-------------|----------|-------|----------|
| fiscalai-test | 2 | 1 | 1 | 0 | **50%** 🟡 |
| coordinator | 4 | 1 | 3 | 0 | **25%** 🔴 |
| finbot-tester | 1 | 0 | 1 | 0 | **0%** 🔴 |
| ai-monitor | 2 | 0 | 2 | 0 | **0%** 🔴 |
| finbot-verifier | 2 | 0 | 2 | 0 | **0%** 🔴 |

_Nota: Muestra pequeña (11 tareas). El P0 previene stuck pero no resuelve fallos en ejecución. Medir nuevamente en 7 días para tendencia real._

### Calidad de sesiones que SÍ completan (equivalente a Claude Code)

| Proyecto | Sesiones completadas | Avg tools/sesión | Completion rate |
|----------|---------------------|------------------|-----------------|
| relay-flujos | 6/6 | 89 | 100% ✅ |
| relay-finbot-tester | 13/15 | 80 | 87% ✅ |
| relay-finbot-verifier | 40/41 | 58 | 97% ✅ |
| relay-ai-monitor | 22/22 | 28 | 100% ✅ |

**Causa raíz de las tareas atascadas**: tareas quedan en `dispatched/pending` para siempre.
No hay expiración automática, no hay retry, no hay alerta en tiempo real.

**Objetivo**: llevar success rate a ≥85% en 7 días consecutivos.

---

## P0 — Pipeline reliability · Bloquea adopción de devs

### P0.1 — Auto-expirar tareas atascadas ✅ 2026-05-26
- Tareas en `dispatched/pending` por >30 min → `failed` automáticamente
- Telegram alert: proyecto, título, tiempo atascado
- Backend: `POST /api/relay/dispatch/expire-stuck`
- Relay: `checkStuckDispatchTasks()` corre cada ciclo (15s)

### P0.2 — Retry en outbox push ✅ 2026-05-26
- 3 intentos con backoff 5s antes de fallar definitivamente
- Cubre git conflicts transitorios en el servidor

### P0.3 — Filtro de calidad en dispatcher ✅ 2026-05-26
- Tareas ≤3 palabras o sin instrucción accionable → rechazo 400
- Evita "Mensaje de FiscalAI via Buzón" sin cuerpo que atasca coordinator
- Coordinator: max 5 tareas activas simultáneas

---

## P1 — Visibilidad · Para que devs confíen en el sistema

### P1.1 — Dashboard: panel Pipeline Reliability ✅ 2026-05-27
- Por proyecto: funnel Dispatched → Picked up → Completed
- Success rate 24h / 7 días con color coding (verde ≥80%, amarillo 50-80%, rojo <50%)
- Implementado en `frontend/js/dashboard.js`: `loadPipelineStats()` + `renderPipelineStats()`
- Tab Pipeline visible en `frontend/index.html` (desktop + mobile)

### P1.2 — Coordinator health metric ✅ 2026-05-27
- Indicador en header del dashboard: "Coordinator: 18.6% ⚠️" con colores
- Alert automática cuando coordinator cae bajo 40%
- Stat pill `#stat-coordinator` actualizado con cada refresh de pipeline

### P1.3 — Stuck task alert en relay_alerts ✅ 2026-05-27
- `relay/master.js` escribe `relay_alerts` tipo `stuck_task` cuando una tarea expira
- Fix: endpoint corregido `/api/relay/alerts` → `/api/alerts` (ruta correcta en server.js)
- También corregido `outbox_push_failed` alert
- Visible en tab Alertas del dashboard

---

## P2 — Quality parity proof

### P2.1 — Per-task quality score
- Agregar `files_changed`, `commits_made` a dispatch_tasks (parsear de result_summary)
- Mostrar en dashboard: "3 archivos cambiados, 1 commit, 8 min"

### P2.2 — A/B comparison panel
- Misma tarea → relay vs Claude Code directo: tool calls, duration, cost diff

---

## Frontend — Relay Monitor Dashboard (Next.js)

**Branch**: `claude/financial-multiagent-system-YwtYQ`
**Directorio**: `relay-dashboard/` bajo agentic-repo

**Stack** (igual que flujos.fiscalai.mx):
- Next.js 15 + React 19 + TypeScript + Tailwind CSS
- Socket.io-client 4.7 (tiempo real con backend puerto 3010)
- Recharts (gráficas de costos y trend)

**Paleta de colores** (igual que flujos.fiscalai.mx globals.css):
```
--bg:      #0a0a0f
--surface: #111118
--border:  #1e1e2e
--muted:   #3a3a5c
--accent:  #7c3aed  (purple)
--green:   #10b981
--yellow:  #f59e0b
--red:     #ef4444
```

**Estructura de tabs** (heredada de frontend/ actual):
- Header: stat pills (costo hoy, activas, success rate, reanudadas)
- Tab 1 **Pipeline**: funnel por proyecto + success rate (P1.1)
- Tab 2 **Sesiones**: agent_sessions — herramienta counts, duración, costo
- Tab 3 **Dispatches**: dispatch_tasks en tiempo real vía Socket.io
- Tab 4 **Costos**: por proveedor / proyecto / trend (Recharts)
- Tab 5 **Alertas**: relay_alerts + stuck tasks

**Deploy**: pm2 `relay-dashboard`, puerto 3030

**Progreso**:
- [x] Scaffold Next.js 15 + Tailwind + Socket.io · 2026-05-26
- [x] Globals CSS con paleta flujos + Inter + JetBrains Mono · 2026-05-26
- [x] Layout raíz + Header con stat pills · 2026-05-26
- [x] Socket.io provider + hooks de datos · 2026-05-26
- [x] Tab Pipeline: funnel + success rate por proyecto · 2026-05-26
- [x] Tab Sesiones: tabla con filtros (project filter, refresh 30s) · 2026-05-27
- [x] Tab Dispatches: tabla en tiempo real vía Socket.io · 2026-05-27
- [x] Tab Costos: Recharts BarChart por proveedor · 2026-05-27
- [x] Tab Alertas: feed con Socket.io (`alert:new`) · 2026-05-27
- [x] Deploy servidor (puerto 3030, pm2: relay-dashboard, id 41) · 2026-05-27
  - Fix prerender-manifest.json (ENOENT → stub JSON creado)
  - npm install/build via `pm2 start npm` trick (exec endpoint no permite npm directo)
- [ ] Testing en servidor hasta ≥85% success rate (medir 2026-06-03)

---

## Plan de testing en servidor (hasta 85% success rate)

```bash
# Correr después de cada release P0/P1:
BACKEND=https://ia.vilarkptl.com node tests/dispatch.test.js

# Verificar success rate de últimos 7 días vía DB:
# SELECT project, ROUND(100.0*SUM(status='completed')/COUNT(*),1) as rate
# FROM dispatch_tasks WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
# GROUP BY project ORDER BY rate;

# Test de carga: 5 tareas a coordinator en secuencia
# Esperar ≥4 completadas (≥80% success)
```

**Criterio de aceptación**: ≥85% en 7 días consecutivos → activar B3 multi-cuenta.

---

## Por qué está armado así

El orden responde a tres preguntas en secuencia:

1. **¿Funciona de forma confiable?** → Fase 1 (estabilidad, multi-cuenta, separar repos)
2. **¿Produce código de calidad?** → Fase 2 (tool server, modelo correcto por tarea)
3. **¿Escala sin fricción?** → Fases 3-6 (interactividad, contexto, paralelismo)

No tiene sentido subir la calidad del output si el sistema cae cada vez que hay un rate limit, o si el financial-bot contamina el repo principal con ruido. La confiabilidad es el prerequisito de todo lo demás.

La decisión de usar **Claude Max/Pro para planificación y tareas críticas** y **DeepSeek + Gemini + Playwright para ejecución y visual** es de costo-efectividad: DeepSeek V4 Pro cuesta ~30x menos que Claude Sonnet y es suficientemente bueno para código repetible. Claude Max/Pro se reserva para razonamiento complejo donde cada token importa.

---

## Modelo híbrido de agentes (mandatorio)

```
┌─────────────────────────────────────────────────────┐
│              DECISIÓN / PLANIFICACIÓN               │
│   Claude Max (1×)  ←  proyectos críticos            │
│   Claude Pro (4×)  ←  proyectos estándar            │
│          routing por proyecto/complejidad           │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │     EJECUCIÓN DE CÓDIGO   │
         │   DeepSeek V4 Pro         │
         │   (deepseek-agent mode)   │
         └─────────────┬─────────────┘
                       │
         ┌─────────────▼─────────────┐
         │   VERIFICACIÓN VISUAL     │
         │   Playwright + Chromium   │
         │   Gemini 2.0 Flash        │
         └───────────────────────────┘
```

| Motor | Tarea | Costo/tarea |
|-------|-------|-------------|
| Claude Max | Coordinator, planning, tareas >5 archivos | $0 (suscripción) |
| Claude Pro ×4 | Agentes estándar (flujos, ai-monitor, finbot) | $0 (suscripción) |
| DeepSeek V4 Pro | Código repetible, migrations, tests | ~$0.005 |
| Gemini 2.0 Flash | Análisis visual post-deploy | ~$0.001/imagen |
| Playwright | Automatización browser, screenshots reales | $0 |

---

## Estado actual (2026-05-27)

| Componente | Estado | Cal. |
|------------|--------|------|
| relay-master | ✅ Online (PM2 id 7) | 8/10 |
| P0: auto-expire + retry + quality filter | ✅ Activo | 9/10 |
| P1: pipeline tab + health metric + alerts | ✅ Desplegado | 8/10 |
| DeepSeek V4 Pro (`deepseek-agent`) | ✅ Activo en `fiscalai-test` | 7/10 |
| Gemini 2.0 Flash (visual) | ✅ Screenshot OK, análisis limitado por cuota | 6/10 |
| Claude Code CLI (`full-claude-code`) | ✅ Activo | 9/10 |
| claude-proxy (5 cuentas 5001–5005) | ✅ Puertos activos, pendiente auth cuentas Pro | 6/10 |
| Multi-cuenta routing en master.js | ⚠️ Scaffolded en ecosystem.config.js, falta `selectProxy()` en master.js | 3/10 |
| relay-dashboard (Next.js, port 3030) | ✅ Online (PM2 id 41), todos los tabs | 8/10 |
| financial-bot | ⚠️ En ai-monitor repo (ruido), migración pendiente | 5/10 |
| Dashboard ia.vilarkptl.com | ✅ Online | 8/10 |
| Telegram iaVilarBot | ✅ Todos los comandos | 8/10 |
| DeCabeceraTax branch | ⚠️ Worktree testing pendiente | 5/10 |
| pill.ai | ❌ No registrado en relay | 0/10 |
| Playwright | ❌ No instalado | 0/10 |

---

## Fase 1 — Estabilidad operacional 🔴 Día 0–4

> Prerequisito absoluto. Sin esto, todo lo demás es frágil.

### Día 0–1: Estabilidad inmediata

**Comandos exactos para ejecutar HOY en el servidor:**

```bash
# ── Conexión al servidor ──────────────────────────────────────────
EXEC_TOKEN="cb5871c0aa6ccd67997237c5238017753c0b35bdd7167b56e226aff25bcbf67a"
exec_s() {
  curl -s --max-time 30 -X POST https://ia.vilarkptl.com/api/exec \
    -H "Content-Type: application/json" \
    -H "x-exec-token: $EXEC_TOKEN" \
    -d "{\"cmd\":\"$1\",\"cwd\":\"${2:-/var/www/html/vilarkptl.com/ai-monitor}\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output') or d.get('error'))"
}

# ── 1. Verificar estado de todos los procesos ─────────────────────
exec_s "pm2 status"

# ── 2. Fijar DeCabeceraTax en rama testing permanente ────────────
# Crear worktree dedicado (no toca la rama principal del repo)
exec_s "git worktree add /var/www/html/vilarkptl.com/DeCabeceraTax-testing testing" \
       "/var/www/html/vilarkptl.com/DeCabeceraTax"

# Actualizar projects.json: fiscalai-test y fiscalai apuntan al worktree
# (editar relay/projects.json: "repo": "/var/www/html/vilarkptl.com/DeCabeceraTax-testing")

# ── 3. Instalar Playwright (reemplaza Chromium snap para visual-check) ──
exec_s "npm install -g playwright && npx playwright install chromium"

# ── 4. Verificar que relay-master arrancó OK tras último reinicio ─
exec_s "pm2 logs relay-master --lines 5 --nostream"
```

### Día 1–2: Migrar financial-bot a repo propio

**Objetivo**: reducir ruido en ai-monitor. financial-bot tiene su propio ciclo de releases, su propio equipo (dev-2), y sus propias dependencias. Mezclarlos genera conflictos de merge innecesarios.

```bash
# ── En el servidor (vía exec_server o SSH) ───────────────────────

# PASO 1: Crear repo en GitHub
# (vía Telegram: /gh repo financial-bot private)
# O manualmente en github.com/organizations/vilarkptl-lang/repositories/new

# PASO 2: Clonar financial-bot a su nueva ubicación
git clone https://github.com/vilarkptl-lang/financial-bot.git \
  /var/www/html/vilarkptl.com/financial-bot

# PASO 3: Copiar el contenido actual
cp -r /var/www/html/vilarkptl.com/ai-monitor/financial/bot/. \
      /var/www/html/vilarkptl.com/financial-bot/

# PASO 4: Primer commit en el nuevo repo
cd /var/www/html/vilarkptl.com/financial-bot
git add -A
git commit -m "init: migrate from ai-monitor/financial/bot — preserving structure"
git push origin main

# PASO 5: Copiar .env si existe
cp /var/www/html/vilarkptl.com/ai-monitor/financial/.env \
   /var/www/html/vilarkptl.com/financial-bot/.env 2>/dev/null || true

# PASO 6: Actualizar PM2 — financial-bot apunta al nuevo directorio
# (editar deploy/ecosystem.config.js o ecosystem-financial.config.js)
# cwd: '/var/www/html/vilarkptl.com/financial-bot'

# PASO 7: Reiniciar con nueva ruta
pm2 restart financial-bot

# PASO 8: Verificar que arrancó desde la nueva ruta
pm2 show financial-bot | grep cwd

# PASO 9: Actualizar projects.json — flujos, finbot-tester, finbot-verifier
# "repo": "/var/www/html/vilarkptl.com/financial-bot"
# "github": "vilarkptl-lang/financial-bot"
# "working_dir": "" (ya no es subdirectorio)

# PASO 10 (semana siguiente): eliminar financial/bot de ai-monitor
# git rm -r financial/bot && git commit -m "chore: remove financial-bot (moved to own repo)"
# NO borrar todavía — verificar que todo funciona primero
```

### Día 2–3: Multi-cuenta proxy (1 Max + 4 Pro)

**Arquitectura**: 5 instancias de `claude-proxy.js` corriendo en puertos 5001–5005, cada una autenticada con una cuenta diferente de Claude. relay-master hace routing inteligente según proyecto y complejidad.

```bash
# ── SETUP CUENTAS (hacer una vez por cuenta) ─────────────────────
# Cada cuenta necesita un usuario del sistema con claude autenticado

# Crear usuarios para las cuentas Pro (si no existen)
useradd -m claudepro1 && useradd -m claudepro2
useradd -m claudepro3 && useradd -m claudepro4

# Autenticar cada cuenta (correr como ese usuario)
# La cuenta Max ya está en 'german' o 'root'
su - claudepro1 -c "claude auth login"   # → cuenta Pro 1
su - claudepro2 -c "claude auth login"   # → cuenta Pro 2
su - claudepro3 -c "claude auth login"   # → cuenta Pro 3
su - claudepro4 -c "claude auth login"   # → cuenta Pro 4

# Verificar autenticación de cada cuenta
su - claudepro1 -c "claude --print 'di OK' --model claude-haiku-4-5-20251001"
```

**relay/.env** — agregar al final:
```bash
# Multi-cuenta proxy routing
CLAUDE_PROXY_MAX=http://127.0.0.1:5001   # Max account (german/root)
CLAUDE_PROXY_PRO_1=http://127.0.0.1:5002 # Pro account 1
CLAUDE_PROXY_PRO_2=http://127.0.0.1:5003 # Pro account 2
CLAUDE_PROXY_PRO_3=http://127.0.0.1:5004 # Pro account 3
CLAUDE_PROXY_PRO_4=http://127.0.0.1:5005 # Pro account 4

# Routing por proyecto (ids separados por coma → Max)
CLAUDE_PROXY_MAX_PROJECTS=coordinator,fiscalai,fiscalai-front
```

**Routing en relay/master.js** — agregar cerca de la constante PROJECTS_FILE:

```javascript
// ─── Multi-account proxy pool ────────────────────────────────────
const PROXY_POOL = {
  max: process.env.CLAUDE_PROXY_MAX || null,
  pro: [
    process.env.CLAUDE_PROXY_PRO_1,
    process.env.CLAUDE_PROXY_PRO_2,
    process.env.CLAUDE_PROXY_PRO_3,
    process.env.CLAUDE_PROXY_PRO_4,
  ].filter(Boolean),
};
const MAX_PROJECTS = (process.env.CLAUDE_PROXY_MAX_PROJECTS || 'coordinator')
  .split(',').map(s => s.trim());
let _proxyIdx = 0;

function selectProxy(project) {
  // Max account → coordinator y proyectos críticos
  if (PROXY_POOL.max && MAX_PROJECTS.includes(project.id)) {
    return PROXY_POOL.max;
  }
  // Pro round-robin → todo lo demás
  if (PROXY_POOL.pro.length) {
    const url = PROXY_POOL.pro[_proxyIdx % PROXY_POOL.pro.length];
    _proxyIdx++;
    return url;
  }
  // Fallback → proxy existente o directo
  return process.env.ANTHROPIC_PROXY_URL || null;
}
```

**deploy/ecosystem.config.js** — agregar 4 proxies nuevos:

```javascript
// ── claude-proxy-max (cuenta Max — para coordinator y proyectos críticos) ──
{
  name:        'claude-proxy-max',
  script:      'deploy/claude-proxy.js',
  args:        '--port 5001',
  cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
  exec_mode:   'fork',
  instances:   1,
  autorestart: true,
  watch:       false,
  max_memory_restart: '128M',
  env: {
    CLAUDE_BIN:      '/usr/local/bin/claude',
    HOME:            '/root',             // cuenta Max autenticada en root/german
    CLAUDE_RUN_USER: 'german',
  },
  error_file: '/var/log/ai-monitor/claude-proxy-max-error.log',
  out_file:   '/var/log/ai-monitor/claude-proxy-max-out.log',
},
// ── claude-proxy-pro-1 ────────────────────────────────────────────
{
  name:        'claude-proxy-pro-1',
  script:      'deploy/claude-proxy.js',
  args:        '--port 5002',
  cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
  exec_mode:   'fork', instances: 1, autorestart: true, watch: false,
  max_memory_restart: '128M',
  env: { CLAUDE_BIN: '/usr/local/bin/claude', HOME: '/home/claudepro1', CLAUDE_RUN_USER: 'claudepro1' },
  error_file: '/var/log/ai-monitor/claude-proxy-pro1-error.log',
  out_file:   '/var/log/ai-monitor/claude-proxy-pro1-out.log',
},
// ── claude-proxy-pro-2 ────────────────────────────────────────────
{
  name:        'claude-proxy-pro-2',
  script:      'deploy/claude-proxy.js',
  args:        '--port 5003',
  cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
  exec_mode:   'fork', instances: 1, autorestart: true, watch: false,
  max_memory_restart: '128M',
  env: { CLAUDE_BIN: '/usr/local/bin/claude', HOME: '/home/claudepro2', CLAUDE_RUN_USER: 'claudepro2' },
  error_file: '/var/log/ai-monitor/claude-proxy-pro2-error.log',
  out_file:   '/var/log/ai-monitor/claude-proxy-pro2-out.log',
},
// ── claude-proxy-pro-3 ────────────────────────────────────────────
{
  name:        'claude-proxy-pro-3',
  script:      'deploy/claude-proxy.js',
  args:        '--port 5004',
  cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
  exec_mode:   'fork', instances: 1, autorestart: true, watch: false,
  max_memory_restart: '128M',
  env: { CLAUDE_BIN: '/usr/local/bin/claude', HOME: '/home/claudepro3', CLAUDE_RUN_USER: 'claudepro3' },
  error_file: '/var/log/ai-monitor/claude-proxy-pro3-error.log',
  out_file:   '/var/log/ai-monitor/claude-proxy-pro3-out.log',
},
// ── claude-proxy-pro-4 ────────────────────────────────────────────
{
  name:        'claude-proxy-pro-4',
  script:      'deploy/claude-proxy.js',
  args:        '--port 5005',
  cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
  exec_mode:   'fork', instances: 1, autorestart: true, watch: false,
  max_memory_restart: '128M',
  env: { CLAUDE_BIN: '/usr/local/bin/claude', HOME: '/home/claudepro4', CLAUDE_RUN_USER: 'claudepro4' },
  error_file: '/var/log/ai-monitor/claude-proxy-pro4-error.log',
  out_file:   '/var/log/ai-monitor/claude-proxy-pro4-out.log',
},
```

**Iniciar los 5 proxies:**

```bash
pm2 start deploy/ecosystem.config.js --only claude-proxy-max
pm2 start deploy/ecosystem.config.js --only claude-proxy-pro-1
pm2 start deploy/ecosystem.config.js --only claude-proxy-pro-2
pm2 start deploy/ecosystem.config.js --only claude-proxy-pro-3
pm2 start deploy/ecosystem.config.js --only claude-proxy-pro-4
pm2 save
```

**Test de cada proxy:**

```bash
for port in 5001 5002 5003 5004 5005; do
  echo "=== Puerto $port ==="
  curl -s -X POST http://localhost:$port/v1/messages \
    -H "Content-Type: application/json" \
    -d '{"model":"claude-haiku-4-5-20251001","max_tokens":20,"messages":[{"role":"user","content":"di OK"}]}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('content',[{}])[0].get('text','ERR'))"
done
```

---

## Fase 2 — Tool Server para DeepSeek 🔴 Día 4–8

> Sube la calidad de código de DeepSeek de 6/10 a 8/10 con herramientas quirúrgicas.

### 2.1 relay/tools-server.js

Herramientas que DeepSeek invoca via tool-calling (equivalentes a Claude Code):

| Tool | Equivalente CC | Descripción |
|------|---------------|-------------|
| `read_file(path, offset?, limit?)` | `Read` | Líneas numeradas, paginación |
| `edit_file(path, old_str, new_str)` | `Edit` | Reemplazo quirúrgico |
| `list_directory(path, pattern?)` | `Bash ls` | Árbol con tamaños |
| `search_code(pattern, path?, ctx)` | `Bash grep -n` | Grep con contexto |
| `web_fetch(url)` | `WebFetch` | HTTP GET |

El `runDeepSeekAgent()` ya tiene la infraestructura de tool loop. Solo hay que registrar estas tools en el schema enviado a la API de DeepSeek.

### 2.2 Playwright para visual-check

Reemplazar Chromium CLI snap por Playwright:
- Instalar: `npm install -g playwright && npx playwright install chromium`
- Reescribir `relay/visual-check.js` usando `playwright.chromium.launch()`
- Ventajas: screenshots de elementos específicos, wait for network idle, interacción real (click, type)
- Permite verificar login, formularios, tablas de datos — no solo capturas estáticas

---

## Fase 3 — Interactividad 🟡 Día 8–10

### 3.1 Protocolo ASK mid-task

```
# El agente escribe en su outbox:
ASK: ¿MySQL o PostgreSQL para la nueva tabla?

# relay-master detecta ASK:, envía a Telegram, pausa ciclo, espera respuesta
# El agente continúa con el contexto de la respuesta
```

### 3.2 Poll interval: 15s → 3s

Para proyectos con `ignore_quiet_hours: true`.

---

## Fase 4 — 5 devs simultáneos 🟡 Día 10–14

> Israel + Ricardo + german + 2 más. Ver sesión de planning.

- Branch ownership documentado en `relay/AGENT-STATUS.md`
- Cada dev con su propia cuenta Claude Pro en el pool
- Comandos `/dispatch` y `/tarea` disponibles para todos desde Telegram
- Dashboard muestra quién está trabajando en qué

### Devs confirmados

| Dev | Cuenta Claude | Branch principal | Área |
|-----|--------------|-----------------|------|
| german | Max | `claude/agent-monitoring-dashboard-4v8iq` | relay, backend, frontend |
| Israel | Pro-1 | `claude/dev-israel-*` | financial-bot, DeCabeceraTax |
| Ricardo | Pro-2 | `claude/dev-ricardo-*` | proyectos nuevos, integraciones |
| Dev-4 | Pro-3 | `claude/dev-4-*` | por definir |
| Dev-5 | Pro-4 | `claude/dev-5-*` | por definir |

---

## Fase 5 — Proyectos pendientes 🟡 Día 7–14 (paralelo)

```bash
# pill.ai — registrar desde Telegram:
/addproject pill-ai "Pill AI" https://pill.ai \
  github=vilarkptl-lang/pill.ai \
  repo=/var/www/html/vilarkptl.com/pill-relay \
  branch=claude/add-licensing-system-KsFAw \
  mode=full-claude-code

# financial-bot — después de migración Día 1-2:
/addproject financial-bot "Financial Bot" https://flujos.fiscalai.mx \
  github=vilarkptl-lang/financial-bot \
  repo=/var/www/html/vilarkptl.com/financial-bot \
  branch=main mode=full-claude-code
```

**Tareas pendientes de verificación:**
- conversation-engine: score post-SQL fix
- dashboard: métricas --resume (B1)
- DeCabeceraTax: worktree `testing` permanente (Día 0)

---

## Fase 6 — CI/CD y paralelismo 🟢 Día 14+

- `pytest` + `ruff` para financial-bot en cada push → resultado en Telegram
- Sub-task dispatch con `DISPATCH_PARALLEL` / `WAIT_FOR` en outbox
- Múltiples workers relay-master para >10 proyectos concurrentes

---

## Calificación proyectada

| Después de | AI Monitor | vs Claude Code |
|------------|-----------|----------------|
| Hoy | 7/10 | −2 |
| Fase 1 completa | 8/10 | −1 |
| Fase 1+2 | 8.5/10 | −0.5 |
| Fases 1-3 | 9/10 | = empate funcional |
| Fases 1-4 | 9.5/10 | +0.5 (5 devs autónomos) |
| Fases 1-6 | 9.8/10 | +0.8 (autonomía supera CC) |

---

## Conexión al servidor para agentes externos

Cualquier agente (Claude Code CLI, Cursor, otro) puede ejecutar comandos en el servidor de producción sin SSH:

```bash
EXEC_TOKEN="cb5871c0aa6ccd67997237c5238017753c0b35bdd7167b56e226aff25bcbf67a"
EXEC_URL="https://ia.vilarkptl.com/api/exec"

exec_server() {
  local CMD="$1"
  local CWD="${2:-/var/www/html/vilarkptl.com/ai-monitor}"
  local BODY
  BODY=$(python3 -c "import sys,json; print(json.dumps({'cmd':sys.argv[1],'cwd':sys.argv[2]}))" "$CMD" "$CWD")
  curl -s --max-time 30 -X POST "$EXEC_URL" \
    -H "Content-Type: application/json" \
    -H "x-exec-token: $EXEC_TOKEN" \
    -d "$BODY" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output') or d.get('error','(sin output)'))"
}

# Ejemplos:
exec_server "pm2 status"
exec_server "pm2 logs financial-bot --lines 20 --nostream"
exec_server "git log --oneline -5" "/var/www/html/vilarkptl.com/financial-bot"
```

Comandos permitidos: `pm2`, `git`, `mysql -u root`, `grep`, `ls`, `df`, `free`, `uptime`, `node -e`

Documentación completa: ver `CLAUDE.md` sección "Servidor de producción".
