# ROADMAP — AI Relay & Agent Orchestration
> Actualizado 2026-05-16 | Calificación actual del sistema: **8.0 / 10**
>
> Objetivo: paridad o superioridad a Claude.ai para 5 desarrolladores, escalable a 100 proyectos.
> Stack objetivo: **Claude Max/Pro ($0) + DeepSeek V4-Pro (coding) + Gemini Flash + Playwright (visual)**.

---

## Semana 1 — Estabilidad operacional (bloqueante)

> Sin resolver esto, todo lo demás es riesgo. Un OOM o un reset incorrecto puede destruir trabajo.

### C1 — Swap +1 GB
```bash
fallocate -l 1G /swapfile2
chmod 600 /swapfile2
mkswap /swapfile2
swapon /swapfile2
echo '/swapfile2 none swap sw 0 0' >> /etc/fstab
free -h  # debe mostrar ~3 GB swap total
```
**Por qué:** Swap al 94% (1.9/2.0 GB). Un proceso que crece mínimamente mata relay-master con OOM.

---

### C2 — Eliminar crash loop `vilar-legal-os-v59`
```bash
pm2 stop vilar-legal-os-v59
pm2 delete vilar-legal-os-v59
pm2 save
```
**Por qué:** 146k+ reinicios. Consume ~50 MB RAM y llena logs sin ningún beneficio.

---

### C3 — Resolver divergencia Git en servidor
```bash
cd /var/www/html/vilarkptl.com/ai-monitor

# 1. Verificar estado
git log origin/main..HEAD --oneline | wc -l  # commits locales sin push
git log HEAD..origin/main --oneline | wc -l  # commits remotos sin pull

# 2. Backup del estado local
git branch backup/server-main-$(date +%Y%m%d) HEAD

# 3. Fetch y merge
git fetch origin
git merge origin/main --no-ff -m "merge: resolver divergencia servidor $(date +%Y-%m-%d)"
# Si hay conflictos en relay/master.js: tomar versión local (tiene más features)
# Si hay conflictos en relay/projects.json: fusionar manualmente

# 4. Push
git push origin main
```
**Por qué:** 93 commits locales + 54 remotos. Un `git reset --hard` accidental destruye semanas de trabajo.

---

### C4 — pm2-logrotate
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 save
```
**Por qué:** Sin rotación, los logs crecen indefinidamente hasta llenar el disco.

---

### M1 — Merge `claude/agent-monitoring-dashboard-4v8iq` → main

> ⚠️ Esperar respuesta de flujos en `relay/outbox-flujos.md` confirmando sin conflictos en `relay/master.js`.

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin
git merge origin/claude/agent-monitoring-dashboard-4v8iq --no-ff \
  -m "merge: visual check loop + deepseek-agent mode + chat-agent tools"
git push origin main
pm2 restart relay-master --update-env
```

**Contiene:**
- `runDeepSeekAgent()` — DeepSeek V4-Pro tool loop (bash/read_file/write_file/git_commit, 25 turnos)
- `callDeepSeekWithTools()` — function calling compatible con OpenAI API
- `runVisualCheckOnce()` — Gemini Flash post-deploy con auto-dispatch correctivo (hasta 3 iteraciones)
- `onTaskComplete` refactor — dispatch por modo (deepseek-agent vs claude)
- `chat-agent.js` — tools: `visual_check`, `pm2_action`, `github_create_repo` + inline keyboard confirmación
- `relay/visual-check.js` — Chromium headless → Gemini Flash → JSON verdict
- `relay/agents/fiscalai-test.md` — prompt con visual check integrado

---

### M2 — Merge selectivo `deploy/financial-llm-complete` → main

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin deploy/financial-llm-complete
git checkout origin/deploy/financial-llm-complete -- financial/bot/
git commit -m "merge: DeepSeek V4 + Gemini en financial-bot (selectivo)"
git push origin main
npm --prefix financial/bot install
pm2 restart financial-bot

# Verificación post-deploy:
node -e "require('./financial/bot/agents/TransactionOrchestrator.js'); console.log('TO OK')"
```

**Excluir deliberadamente:** `relay/master.js`, `relay/chat-agent.js`, `relay/projects.json`, FileFlowGraph.

---

### M3 — Crear PR `claude/onboard-ai-monitor-subproject-zXvki` → main

Contiene: auth/login con bcrypt, LiteLLM integración frontend. Pendiente revisión y merge.

---

### M4 — Limpiar objetos Git sueltos
```bash
git -C /var/www/html/vilarkptl.com/ai-monitor prune
git -C /var/www/html/vilarkptl.com/ai-monitor gc --auto
```

---

## Semana 2 — Contexto y Dispatch

> Objetivo: que los agentes relay tengan paridad de contexto con Claude Code interactivo,
> y que los devs puedan despachar tareas desde Telegram en <5 segundos.

### P-alta — `--resume sessionId` en `runClaude()`

Capturar el `session_id` del stream-json output de Claude CLI y pasarlo en el siguiente dispatch del mismo proyecto. El agente "recuerda" todo lo que hizo en sesiones anteriores.

```js
// En runClaude() — parsear session_id:
proc.stdout.on('data', (chunk) => {
  for (const line of chunk.toString().split('\n')) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'system' && msg.session_id) {
        project.lastSessionId = msg.session_id;
        saveProjectState();
      }
    } catch {}
  }
});

// En buildClaudeCmd() — inyectar --resume:
const resumeFlag = project.lastSessionId ? `--resume ${project.lastSessionId}` : '';
const cmd = `claude --print ${resumeFlag} --model ${model} "${escapeShell(prompt)}"`;
// Fallback: si --resume falla, reintentar sin él
```

**Archivos:** `relay/master.js` (~40 líneas), nuevo `relay/projects-state.json` para persistir sessionIds.

---

### P-alta — `agent-memory.md` enriquecido

Cambiar de resúmenes genéricos a entradas estructuradas con SHA, archivos:línea, decisiones y errores.

```markdown
## [2026-05-16 14:32] Implementar runDeepSeekAgent

**SHA:** 72fdf6a
**Archivos modificados:**
- `relay/master.js:1897–2050` — función nueva `runDeepSeekAgent()`
**Decisiones:** MAX_TURNS=25, BASH_DENY incluye `git reset --hard`
**Errores resueltos:** `toolCall.function.arguments` era string JSON, requiere `JSON.parse()`
**Pendiente:** testear en sandbox antes de habilitar en fiscalai
```

**Archivos:** `relay/master.js` — reescribir `appendAgentMemory()` (~50 líneas).

---

### P-alta — `/dispatch` command en `chat-agent.js`

Comando Telegram que escribe directo al inbox del proyecto y hace push a main sin intervención manual.

```
/dispatch fiscalai fix endpoint /api/cfdi que retorna 500
→ [✅ Enviar] [❌ Cancelar]
→ Detección en ~15s → Claude ejecuta → notificación de resultado
```

Ver implementación completa en `relay/DISPATCH.md`.

**Archivos:** `relay/chat-agent.js` (~80 líneas nuevas).

---

### P-alta — Routing multi-cuenta (5 cuentas Max/Pro)

Asignar cada proyecto a una cuenta Claude específica, con load balancing por carga activa.

```js
// projects.json:
{ "fiscalai": { "claude_user": "claude-agent-1" } }

// master.js — selectClaudeUser():
function selectClaudeUser(project) {
  if (project.claude_user) return project.claude_user;
  return CLAUDE_ACCOUNTS
    .filter(a => a.active)
    .reduce((min, a) =>
      (loads[a.user] || 0) < (loads[min.user] || 0) ? a : min
    ).user;
}
```

5 cuentas Max/Pro = 5× capacidad paralela, $0 por API.

**Archivos:** `relay/master.js` (~30 líneas), `relay/projects.json` (campo `claude_user`).

---

### E3 — Playwright reemplaza Chromium headless

```bash
npm install playwright
npx playwright install chromium
```

Cambio en `relay/visual-check.js`: reemplazar `puppeteer.launch()` con `playwright.chromium.launch()`.

**Ventaja:** SPAs con Vue/React Router funcionan correctamente. Espera a hydration antes de capturar. Mejor manejo de auth (cookies, sessionStorage).

---

## Semana 3 — Resiliencia LLM

### F2/P5 — `callViaLiteLLM()` en `master.js`

LiteLLM está instalado (puerto 4000) con chains de fallback pero NO se usa en el flujo principal. Si Claude Max o DeepSeek tienen downtime, no hay fallback automático.

```js
async function callViaLiteLLM(messages, model = 'kptl-chat') {
  const res = await fetch(`${process.env.LITELLM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, max_tokens: 4096 }),
  });
  return res.json();
}

// Chains disponibles:
// kptl-chat:       Sonnet → DeepSeek → GPT4o
// kptl-chat-fast:  Haiku  → GPT4o-mini → Gemini
// kptl-reasoning:  DeepSeek R1 → Opus
```

**Archivos:** `relay/master.js` (~50 líneas).

---

### F1/P4 — `selectClaudeModel()` — routing inteligente

Usar `claude_model_fast` (Haiku) para tareas de orquestación/status y `claude_model` (Sonnet) para código real.

```js
function selectClaudeModel(project, taskContent) {
  const isSimple = /status|listar|verificar|reportar/i.test(taskContent)
    && taskContent.length < 500;
  return isSimple
    ? (project.claude_model_fast || project.claude_model)
    : project.claude_model;
}
```

**Impacto:** Haiku es 5× más barato y 2× más rápido para tareas simples.

---

### F3 — Verificar IDs reales de modelos DeepSeek

```bash
curl https://api.deepseek.com/v1/models \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" | jq '.data[].id'

# Actualizar relay/.env con IDs exactos:
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash  # o el ID real confirmado
DEEPSEEK_PRO_MODEL=deepseek-v4-pro      # o el ID real confirmado
```

**Por qué:** Un ID incorrecto falla silenciosamente — el agente cae a un modelo default sin avisarlo.

---

### F4 — Admin API keys para monitoring de cuentas

```bash
# Agregar a relay/.env:
ANTHROPIC_ADMIN_KEY_GVA=sk-ant-admin-...
ANTHROPIC_ADMIN_KEY_LEASINGAGATA=sk-ant-admin-...
```

Permite monitorear uso de cada cuenta Max vía Anthropic Admin API y alertar si alguna se acerca al límite de rate.

---

### E1 — Quiet hours exceptions + rate limiting tuning

Actualmente 11pm–8am MX bloquea todos los despachos. Agregar:
- `ignore_quiet_hours: true` por proyecto (ya existe en coordinator)
- `URGENCY: critical` en inbox para bypass
- Rate limiting configurable por proyecto (actualmente hardcoded 3/hora)

---

### E4 — `TELEGRAM_EXTRA_CHAT_IDS`

```bash
# relay/.env:
TELEGRAM_EXTRA_CHAT_IDS=123456789,987654321
```

Broadcast de notificaciones a todos los IDs adicionales. Soporta hasta 5 devs recibiendo alertas simultáneas.

---

### E6 — Testing `deepseek-agent` en proyecto sandbox

Antes de habilitar `mode: "deepseek-agent"` en proyectos críticos:

```bash
# 1. Crear proyecto sandbox en projects.json:
{
  "id": "sandbox",
  "mode": "deepseek-agent",
  "inbox": "/tmp/sandbox-inbox.md",
  "repo": "/tmp/sandbox-repo"
}

# 2. Correr tareas de prueba de complejidad creciente:
# - Tarea simple: crear un archivo con contenido dado
# - Tarea media: refactorizar una función existente
# - Tarea compleja: implementar endpoint con tests

# 3. Verificar: BASH_DENY funciona, watchdog funciona, cost tracking correcto
```

---

## Semana 4 — Escala (5 devs / 100 proyectos)

### P3 — Sesiones de larga duración

Mantener Claude como proceso interactivo persistente por proyecto, eliminando completamente el problema del flag `--print`.

```js
// Proceso vivo por proyecto:
const proc = spawn('claude', ['--model', model], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, HOME: `/home/${claudeUser}` }
});
project.claudeProc = proc;

// Para cada tarea nueva: escribir al stdin del proceso existente
project.claudeProc.stdin.write(taskContent + '\n---END-TASK---\n');
```

**Ventaja:** Contexto completo acumulado indefinidamente por proyecto. Paridad real con sesión interactiva.
**Riesgo:** Gestión de proceso muerto, fill de ventana de contexto, stdin blocking. Requiere arquitectura de supervisión adicional.

---

### P8 — Worker processes por proyecto (refactor `master.js`)

`relay/master.js` (3,296 líneas) gobierna todos los proyectos en un solo proceso. Si se cuelga, todo se detiene.

Arquitectura objetivo:
```
master.js (supervisor, ~300 líneas)
  ├── worker-fiscalai.js    (fork, aislado)
  ├── worker-flujos.js      (fork, aislado)
  ├── worker-ai-monitor.js  (fork, aislado)
  └── worker-[N].js         (fork, aislado)
```

Cada worker tiene su propio PM2 process, su propio límite de memoria, y puede reiniciarse sin afectar los demás.

**Estimación de esfuerzo:** 2–3 sesiones de Claude Code. Alta complejidad, alto impacto.

---

### E5 — Onboarding proyectos inactivos

| Proyecto | URL | Acción necesaria |
|----------|-----|------------------|
| `credito` | credito.vilarkptl.com | Asignar repo, crear inbox/outbox, clonar workspace |
| `voltic` | voltic.mx | Ídem |
| `ocr` | ocr.ryby.lease | Ídem |
| `tareas` | tareas.ryby.lease | Ídem |
| `noticias` | noticias.ryby.lease | Ídem |
| `telegram-inversiones` | — | Definir repo y URL primero |

Proceso: ver `relay/WORKFLOW.md` — sección "Proceso de Nuevo Proyecto".

---

### Dashboard por equipo

```js
// Nuevas rutas en backend/server.js:
GET /api/projects?dev=gva       // filtrar por cuenta
GET /api/sessions?project=fiscalai&from=2026-05-01
GET /api/costs/summary?group_by=dev

// Nuevas vistas en frontend:
// - Tab "Equipo": mapa de calor de actividad por dev
// - Tab "Proyectos": estado en tiempo real de todos los proyectos
// - Filtros por dev, proyecto, estado, costo
```

---

### Métricas longitudinales de calidad

Actualmente el sistema mide costos y eventos, pero no calidad de output.

```sql
-- Nueva tabla:
CREATE TABLE task_outcomes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64),
  project_id VARCHAR(32),
  task_title TEXT,
  visual_check_result ENUM('aprobado','necesita_correccion','no_check'),
  correction_iterations INT DEFAULT 0,
  deploy_verified BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Métricas objetivo: tasa de éxito en primer intento, iteraciones promedio de visual check, tasa de regresión por proyecto.

---

### Bidireccionalidad mid-task

Actualmente el dev no puede intervenir mientras un agente ejecuta.

```js
// Nuevo comando Telegram:
// /clarify [proyecto] "aclaración"
// → inyecta mensaje en el thread activo de deepseek-agent antes del siguiente turno
// → para Claude CLI: encola como contexto adicional en el próximo dispatch

// Botones inline pre-push:
// [✅ Aprobar push] [❌ Rechazar y revertir]
// → El agente hace el commit pero espera confirmación antes de git push
```

---

## Sin fecha — Arquitectura futura

| Item | Descripción |
|------|-------------|
| Tests de integración `master.js` | Mocks de Claude CLI + DeepSeek API para flujos críticos (dispatch, timeout, kill-switch) |
| Validación automática de outbox | Parsear y validar formato STATUS/CHANGED/DEPLOYED en cada outbox |
| `finbot-tester` golden suite completa | Cobertura >90% de flujos del financial-bot |
| LangGraph FileFlowGraph | FileFlowGraph + SupervisorNode — pendiente decisión si va a `main` |
| API de Anthropic Admin | Monitoring de uso y rate de las 5 cuentas Max/Pro |
| LiteLLM sombra en producción | `use_cli_proxy: true` en projecto piloto — medir latencia vs directo |

---

## Estado actual del sistema

```
Calificación global:   8.0 / 10
Proyectos activos:     9
Proyectos inactivos:   6 (listos para onboarding)
Branches pendientes:   4 merges
CRÍTICOS sin resolver: 4 (C1–C4, todos operacionales en servidor)

Por qué no llega a 9/10:
  1. Swap 94% — OOM puede matar relay-master
  2. deepseek-agent sin validación en producción compleja
  3. relay/master.js como single point of failure (3,296 líneas)

Por qué supera a Claude Code nativo en este caso de uso:
  - $0 costo API (Max subscription OAuth)
  - 9 proyectos paralelos simultáneos
  - Dashboard, alertas, costos, visual check en tiempo real
  - Auto-corrección: adaptive timeout + runDeepSeekCodeFix + visual check loop
```

---

## Referencia rápida — Archivos del sistema

| Archivo | Propósito |
|---------|-----------|
| `CLAUDE.md` | Referencia maestra — leer primero |
| `relay/AGENTS.md` | Roles, rutas, zonas de propiedad por agente |
| `relay/PROJECTS.md` | Rutas completas del servidor, PM2, branches |
| `relay/CONVENTIONS.md` | Git, código, outbox format, variables de entorno |
| `relay/SYSTEM.md` | Arquitectura, stack, controles de seguridad |
| `relay/WORKFLOW.md` | 3 canales de entrada, campos inbox, coordinación |
| `relay/MEMORY.md` | Soluciones a brecha de contexto, --resume, agent-memory |
| `relay/TOOLS.md` | Herramientas por modo (claude-code, deepseek-agent, chat-agent) |
| `relay/DISPATCH.md` | Protocolo dispatch, /dispatch Telegram, routing multi-cuenta |
| `relay/SYSTEM-DIAGNOSIS.md` | Diagnóstico completo de 17 secciones |
| `relay/AGENT-STATUS.md` | Estado actual de cada agente — actualizar al terminar |

---

*ROADMAP.md — Generado 2026-05-16. Actualizar al completar cada ítem.*
