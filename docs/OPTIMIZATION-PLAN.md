# Plan: Optimización de costos y eficiencia — Sistema multi-agente relay

> 2026-05-04 — Reemplaza plan anterior (kill-switch + API Admin ya implementados).

---

## Context

El sistema gastó ~$28-30 en el spike del 3 mayo, $34.15 total histórico sobre $250 de recarga ($98.04 créditos restantes). Causas raíz identificadas en AUTODIAGNOSTICO.md:
- `callDeepSeekDirect()` usa DeepSeek V3 (`deepseek-chat`) sin caching — DeepSeek V4 es 4-6x más barato
- `master.js` no tiene LiteLLM → no puede enrutar hacia Pro/Max subscription
- Sub-dispatches reciben $1.50 flat en vez de heredar proporcionalmente del presupuesto padre
- `project_killed_*` flag existe en DB (migrate-v12) pero relay-master no lo consulta
- Sin quiet hours → agentes pueden ejecutar de noche sin supervisión
- Sin rate limiting por proyecto
- `vilar-legal-os-v59` tiene 146k+ restarts consumiendo RAM/swap

**Objetivo**: bajar de ~$46-66/mes estimados a $25-40/mes manteniendo (o mejorando) productividad. Implementar en orden de ROI y riesgo, con shadow testing primero.

### Modelo operativo: Híbrido 5 devs
- Cada dev con **Claude Pro** ($20/mes × 5 = $100 total) para trabajo diario en terminal
- **relay-master** sigue siendo el cerebro central (coordinator, kill-switches, budgets, Telegram, LiteLLM)
- Claude CLI proxy drop-in → relay usa límites de suscripción Pro/Max para tareas background
- **Tareas individuales/coding rápido** → Claude Code CLI directo (Pro personal)
- **Tareas complejas/multi-agente/background/fiscalai** → `/tarea` por Telegram → relay (enruta a CLI proxy cuando conviene)

---

## Archivos críticos

| Archivo | Función | Líneas clave |
|---------|---------|-------------|
| `relay/master.js` | Orquestador principal (~3000 líneas) | constants:55, GLOBAL_KILLED:67, callAnthropicDirect:719, callDeepSeekDirect:765-808, parseBudgetMax:1227, model routing:1323-1325, budget injection:1812-1816, processDispatchQueue:1791, processProject:1922, kill poller:2447-2490 |
| `relay/chat-agent.js` | LiteLLM reference implementation | LITELLM_BASE_URL:57-63, model registry:15-22, calcCostCached:521 |
| `relay/projects.json` | Config por proyecto | claude_model field, agregar claude_model_fast |
| `backend/routes/apiAdmin.js` | projectBudgets + spendingSummary | GET /api/apiAdmin/projectBudgets (verificar shape del response para cache) |
| `backend/server.js` | project_killed poller | emite project_budget_exceeded vía Socket.io |

---

## Modelo de costos objetivo

| Uso en sistema | Modelo actual | Recomendado V4 | Ahorro estimado |
|----------------|---------------|----------------|-----------------|
| Coordinator + ai-monitor | Haiku 4.5 | V4-Flash | 5-10× |
| Planning + code-reviewer | DeepSeek V3 | V4-Flash → V4-Pro | 3-5× |
| Fiscalai + fiscalai-front | Sonnet 4.6 | V4-Pro (probar primero) | 4-6× |
| Tareas muy complejas | Sonnet/Opus | V4-Pro → Sonnet solo si falla | 3-5× |
| ACKs / buzón Anthropic | Haiku 4.5 (callAnthropicDirect) | V4-Flash vía LiteLLM | 5-10× |

---

## Prioridad 1 — DeepSeek V4 + caching (🔴 hoy, máximo ROI)

### Cambio en `relay/master.js`

**`callDeepSeekDirect()` (línea ~770):** cambiar model ID y añadir caching:

```js
// ANTES:
model: 'deepseek-chat',

// DESPUÉS (V4-Pro para planeación, verificar ID exacto en api.deepseek.com):
model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',  // V4: 'deepseek-v4' o 'deepseek-pro'
```

Añadir prefix caching al llamado (DeepSeek soporta `cache_control` igual que Anthropic):
```js
// En el messages array, antes del user message:
{ role: 'system', content: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }] },
```

Y añadir el header beta:
```js
'anthropic-beta': 'prompt-caching-2024-07-31',  // para DeepSeek: verificar header equivalente
```

**NOTA**: Los IDs de modelo DeepSeek V4 deben verificarse en `api.deepseek.com/docs` antes de implementar. Posibles valores: `deepseek-v4`, `deepseek-v4-pro`, `deepseek-v4-flash`. Usar env var `DEEPSEEK_MODEL` y `DEEPSEEK_MODEL_FAST` para no hardcodear.

**`relay/.env` — añadir:**
```
DEEPSEEK_FLASH_MODEL=deepseek-chat-flash   # V4-Flash — verificar ID en api.deepseek.com/models
DEEPSEEK_PRO_MODEL=deepseek-chat-pro       # V4-Pro   — verificar ID en api.deepseek.com/models
```

En `callDeepSeekDirect()` (línea 770), cambiar model selection:
```js
// Segundo parámetro: useComplex=true para planeación compleja
function callDeepSeekDirect(systemPrompt, userMessage, maxTokens = 512, useComplex = false) {
  const model = useComplex
    ? (process.env.DEEPSEEK_PRO_MODEL   || 'deepseek-chat')
    : (process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-chat');
  ...
}
```

**Ahorro esperado**: 75-83% en llamadas DeepSeek (planeación /tarea, resúmenes memoria).

### Actualizar cadenas LiteLLM (`/opt/litellm/config.yaml` en servidor)

```yaml
model_list:
  # kptl-chat: V4-Pro como primario (4-6× más barato que Sonnet), fallback a Sonnet → GPT-4o
  - model_name: kptl-chat
    litellm_params:
      model: deepseek/deepseek-v4-pro   # verificar ID
      fallbacks: ["anthropic/claude-sonnet-4-6", "openai/gpt-4o"]

  # kptl-chat-fast: V4-Flash como primario, fallback a Haiku → GPT-4o-mini
  - model_name: kptl-chat-fast
    litellm_params:
      model: deepseek/deepseek-v4-flash   # verificar ID
      fallbacks: ["anthropic/claude-haiku-4-5-20251001", "openai/gpt-4o-mini"]

  # kptl-reasoning: V4-Pro → V4-Flash (eliminamos dependencia de R1/Opus para routing interno)
  - model_name: kptl-reasoning
    litellm_params:
      model: deepseek/deepseek-v4-pro
      fallbacks: ["deepseek/deepseek-v4-flash"]

litellm_settings:
  enable_prompt_caching: true   # activa cache_control en DeepSeek V4 + Anthropic automáticamente
  cache_params:
    type: "local"
```

**Nota**: Antes de actualizar el config, verificar IDs exactos:
```bash
curl https://api.deepseek.com/v1/models -H "Authorization: Bearer $DEEPSEEK_API_KEY" | jq '.data[].id'
```

---

## Prioridad 2 — project_killed enforcement (🔴 hoy, 2-line fix)

El flag `system_state.project_killed_<project>='1'` se escribe en server.js pero relay-master nunca lo lee.

### Approach: in-memory cache actualizada desde /api/apiAdmin/projectBudgets

```js
// Agregar después de línea 711 (postAlert function), antes de callAnthropicDirect:
const PROJECT_KILLED_CACHE = {};  // { projectId: { killed: bool, ts: number } }
const PROJECT_KILLED_TTL   = 5 * 60 * 1000;  // 5 min cache

function getProjectKilled(projectId) {
  const cached = PROJECT_KILLED_CACHE[projectId];
  if (cached && (Date.now() - cached.ts) < PROJECT_KILLED_TTL) return cached.killed;
  return false;  // default safe; async refresh via kill-switch poller
}
```

En el kill-switch poller (línea ~2447), añadir fetch de budgets para poblar el cache:
```js
const budgets = await httpGet(`${MONITOR_API}/api/apiAdmin/projectBudgets`);
if (budgets?.projects) {
  const now = Date.now();
  for (const b of budgets.projects) {
    PROJECT_KILLED_CACHE[b.project_name] = { killed: !!b.killed, ts: now };
  }
}
```

En `processProject()` (línea 1922), después del check `GLOBAL_KILLED`:
```js
if (getProjectKilled(project.id)) {
  log(project.id, `project_killed flag activo — saltando`);
  return;
}
```

**Test:** `INSERT INTO system_state (key,value) VALUES ('project_killed_ai-monitor','1') ON DUPLICATE KEY UPDATE value='1';` → verificar logs que ai-monitor se salta. Limpiar: `UPDATE system_state SET value='0' WHERE key='project_killed_ai-monitor';`

---

## Prioridad 3 — Budget inheritance proporcional + max depth (🔴 hoy)

### Cambio en `relay/master.js` — inyección de presupuesto (~línea 1815)

```js
// ANTES (flat $1.50):
const subBudget = 1.5;

// DESPUÉS (proporcional):
const parentBudget = parseBudgetMax(parentTask?.description || '');
const subBudget = Math.max(0.50, Math.min(parentBudget * 0.4, 5.0));
// min $0.50, max $5, proporción 40% del padre
```

### Max depth (añadir cerca del mismo bloque):
```js
const taskDepth = parseInt(task.depth || 0);
if (taskDepth >= 3) {
  log(project.id, `Dispatch bloqueado: profundidad ${taskDepth} >= 3 (max)`);
  tg(`⚠️ Dispatch bloqueado por max depth en ${project.id}: ${task.description?.slice(0,80)}`);
  return;
}
```

---

## Prioridad 4 — LiteLLM en master.js (🟠 esta semana)

Copiar patrón de `relay/chat-agent.js` líneas 57-63. Añadir función:

```js
// Al inicio de master.js, junto a las otras constantes:
const LITELLM_URL = process.env.LITELLM_BASE_URL;
const LITELLM_KEY = process.env.LITELLM_MASTER_KEY;

// Nueva función (reemplaza callAnthropicDirect para haiku/buzón si USE_LITELLM=true):
async function callLiteLLM(messages, opts = {}) {
  if (!LITELLM_URL) return null;  // fallback a directo si no configurado
  const model = opts.model || 'kptl-chat-fast';
  const resp = await fetch(`${LITELLM_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LITELLM_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: opts.max_tokens || 512 }),
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || null;
}
```

**`relay/.env` — variables ya existen** (configuradas en sesión anterior):
```
LITELLM_BASE_URL=http://localhost:4000
LITELLM_MASTER_KEY=sk-litellm-11b2ccee224b47d82ba9b8e3677aa915
```

**Actualizar cadenas LiteLLM** (`/opt/litellm/config.yaml` en servidor) para usar DeepSeek V4:
- `kptl-chat`: Sonnet → **DeepSeek V4-Pro** → GPT-4o
- `kptl-chat-fast`: Haiku → **DeepSeek V4-Flash** → GPT-4o-mini

---

## Prioridad 5 — Quiet hours + Rate limiting (🟠 esta semana)

### Quiet hours — añadir en `main()` del relay/master.js

```js
// Zona horaria México: UTC-6
function isQuietHour() {
  const mxHour = (new Date().getUTCHours() - 6 + 24) % 24;
  return mxHour >= 23 || mxHour < 8;  // 11pm-8am MX
}

// En processProject() y processDispatchQueue(), antes de ejecutar:
if (isQuietHour() && !task.user_triggered) {
  log(project.id, 'Quiet hours (11pm-8am MX) — tarea diferida');
  return;  // o re-encolar para más tarde
}
```

### Rate limiting por proyecto

```js
// Map global: projectId → array de timestamps de dispatch
const DISPATCH_TIMESTAMPS = new Map();
const DISPATCH_RATE_LIMIT = 3;  // max dispatches por hora por proyecto
const DISPATCH_WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(projectId) {
  const now = Date.now();
  const timestamps = (DISPATCH_TIMESTAMPS.get(projectId) || [])
    .filter(t => now - t < DISPATCH_WINDOW_MS);
  DISPATCH_TIMESTAMPS.set(projectId, timestamps);
  if (timestamps.length >= DISPATCH_RATE_LIMIT) return true;
  timestamps.push(now);
  return false;
}
```

---

## Prioridad 6 — Intelligent model routing (🟠 esta semana)

### `relay/projects.json` — añadir campo `claude_model_fast`

```json
{
  "id": "fiscalai",
  "claude_model": "claude-sonnet-4-6",
  "claude_model_fast": "claude-haiku-4-5-20251001",
  ...
}
```

### `relay/master.js` — routing por complejidad de tarea

```js
// En processProject(), al determinar el modelo:
function selectModel(project, task) {
  const taskText = task.description || '';
  const isSimple = taskText.length < 200 
    || /^(verifica|confirma|check|status|ping|list)/i.test(taskText);
  
  if (isSimple && project.claude_model_fast) {
    return project.claude_model_fast;
  }
  return project.claude_model || process.env.CLAUDE_DEFAULT_MODEL || 'claude-sonnet-4-6';
}
```

---

## Prioridad 7 — Claude CLI proxy / shadow test (🟡 próximo mes)

### Opción: npow/claude-relay o Wei-Shaw/claude-relay-service

Rutar llamadas Anthropic a través de la suscripción Pro/Max en vez de API de pago.

**Shadow test approach** (ai-monitor project primero):
1. Instalar claude-relay-service en servidor
2. Configurar `ANTHROPIC_BASE_URL_AI_MONITOR=http://localhost:8080` solo para ai-monitor
3. En master.js: `const baseUrl = project.id === 'ai-monitor' ? process.env.ANTHROPIC_BASE_URL_AI_MONITOR : 'https://api.anthropic.com'`
4. Monitorear por 1 semana, comparar calidad y costos
5. Si funciona: rollout a todos los proyectos

**Riesgo**: viola ToS de Anthropic — confirmar con usuario antes de implementar.

---

## Prioridad 8 — Auto-compaction mejorada (🟡 próximo mes)

### Actualmente: solo cap de 15 entradas en `loadAgentMemory()`

### Mejora: summarización con LLM al 60% del contexto o >800s en sesión

```js
// En processProject(), aproximadamente cada 800s o cuando estimated_tokens > threshold:
async function maybeCompactContext(sessionId, messages, projectId) {
  const elapsed = (Date.now() - sessionStartTime) / 1000;
  const tokenEstimate = messages.reduce((s, m) => s + (m.content?.length || 0) / 4, 0);
  
  if (elapsed < 800 && tokenEstimate < 50000) return messages;
  
  // Resumir con DeepSeek (barato)
  const summary = await callDeepSeekDirect(
    `Summarize this agent conversation concisely, preserving all technical decisions and file changes:\n\n${JSON.stringify(messages.slice(0,-4))}`,
    { max_tokens: 1000 }
  );
  
  if (!summary) return messages;  // fallback: keep all
  
  return [
    { role: 'user', content: `[Context compacted at ${elapsed}s] ${summary}` },
    ...messages.slice(-4)  // keep last 2 exchanges
  ];
}
```

---

## Prioridad 9 — Operational cleanup (🔴 urgente en servidor)

### vilar-legal-os-v59 (146k+ restarts — CRÍTICO)
```bash
# En servidor:
pm2 stop vilar-legal-os-v59
pm2 delete vilar-legal-os-v59
# Libera ~200-400MB RAM, reduce swap pressure
```

### 1GB swap adicional
```bash
fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 && swapon /swapfile2
echo '/swapfile2 none swap sw 0 0' >> /etc/fstab
```

### pm2-logrotate
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 5
pm2 set pm2-logrotate:compress true
```

### Mergear branches a main
```bash
# En servidor o via GitHub PR:
# 1. claude/agent-monitoring-dashboard-4v8iq → main (multi-account, project budgets)
# 2. claude/onboard-ai-monitor-subproject-zXvki → main (auth + LiteLLM)
```

### Fix login password pattern (branch onboard-ai-monitor)
En el HTML del login (branch `claude/onboard-ai-monitor-subproject-zXvki`):
```html
<!-- Remover el atributo pattern del input de contraseña -->
<!-- ANTES: <input type="password" pattern="..." -->
<!-- DESPUÉS: -->
<input type="password" id="password" name="password" required>
```

### Keys pendientes en relay/.env del servidor
```bash
ANTHROPIC_ADMIN_KEY_GVA=sk-ant-admin01-...       # cuenta gva.server@gmail.com
ANTHROPIC_ADMIN_KEY_LEASINGAGATA=sk-ant-admin01-... # cuenta leasingagata@gmail.com
```

---

## Deploy sequence (PRs separados)

```
PR 1: project_killed enforcement (línea 1922 solo) — safety fix
PR 2: DeepSeek V4 model IDs + caching               — verify IDs first
PR 3: Budget inheritance proporcional + max depth    — lines 1812-1816
PR 4: Quiet hours + rate limiting                    — new constants + checkDispatchRate()
PR 5: claude_model_fast routing en projects.json     — projects.json + selectClaudeModel()
PR 6: LiteLLM en master.js (callViaLiteLLM)         — optional, guarded by env var
PR 7: Auto-compaction                                — least invasive path
PR 8: Claude CLI proxy shadow test                   — experimental, solo ai-monitor
```

---

## Orden de implementación

| # | Tarea | Archivo | Riesgo | Ahorro esperado |
|---|-------|---------|--------|-----------------|
| 1 | Verificar IDs DeepSeek V4 en docs | — | 0 | — |
| 2 | DeepSeek V4 model ID + env var | master.js:770 | Bajo | 75-83% en DeepSeek |
| 3 | DeepSeek caching | master.js:765-808 | Bajo | ~30% adicional |
| 4 | project_killed enforcement | master.js:1791,1922 | Bajo | Cumplimiento $100/mes |
| 5 | Budget inheritance proporcional | master.js:1815 | Bajo | Previene loops costosos |
| 6 | Max depth block (depth >= 3) | master.js:1809 | Bajo | Previene recursión |
| 7 | Quiet hours (11pm-8am MX) | master.js:main() | Medio | Reduce uso nocturno |
| 8 | Rate limit 3 dispatches/h | master.js:global | Medio | Previene rafagas |
| 9 | claude_model_fast en projects.json | projects.json | Bajo | 3x en tareas simples |
| 10 | LiteLLM en master.js (callLiteLLM) | master.js:~50 | Medio | Fallback cadenas |
| 11 | vilar-legal-os-v59 → stop | servidor | Bajo | ~300MB RAM libre |
| 12 | 1GB swap | servidor | Bajo | Estabilidad |
| 13 | pm2-logrotate | servidor | Bajo | Evita disk full |
| 14 | Auto-compaction LLM | master.js | Alto | Reduce tokens/sesión |
| 15 | Claude CLI proxy shadow test | master.js + servidor | Alto | $0 API si funciona |

---

## Verificación end-to-end

```bash
# 1. Verificar DeepSeek V4 IDs (fuera del repo):
curl https://api.deepseek.com/models -H "Authorization: Bearer $DEEPSEEK_API_KEY" | jq '.data[].id'

# 2. Después de deploy a servidor:
pm2 restart relay-master

# 3. Verificar que project_killed se respeta:
# En MySQL: INSERT INTO system_state(`key`,`value`) VALUES('project_killed_ai-monitor','1')
# Luego encolar tarea para ai-monitor y verificar que master.js la salta con log

# 4. Verificar quiet hours:
# Temporal: cambiar hora de quiet hours a ahora mismo y verificar que se saltean tareas

# 5. Verificar rate limiting:
# Encolar >3 dispatches/h para un proyecto y verificar bloqueo

# 6. Verificar budget inheritance:
# Crear tarea con budget_usd_max=$10 → sub-dispatch debe recibir max $4

# 7. DeepSeek V4 + caching:
# Ver logs del relay: "[deepseek] cache_hit: true" en respuestas subsecuentes
# Comparar costo en dashboard API Admin antes/después

# 8. LiteLLM:
curl http://localhost:3010/api/health  # confirmar backend up
curl http://localhost:4000/health      # confirmar LiteLLM up
```

---

## Shadow testing — protocolo barato y sin riesgo

Validar proxy CLI + V4 + caching sin quemar dinero:

1. **Fork shadow** en directorio separado (copia de ai-monitor o fiscalai)
2. **Segundo relay-master** en modo dry-run: `budget_usd_max: 0.10/día`, solo genera plan + diff propuesto (sin commits reales)
3. Correr en paralelo durante 3-5 días; comparar resultados en el dashboard
4. Si ahorro >30-40% y calidad se mantiene → rollout completo

```bash
# Crear fork shadow en servidor:
cp -r /var/www/html/vilarkptl.com/ai-monitor /tmp/ai-monitor-shadow
# Editar relay/.env del shadow: RELAY_DRY_RUN=true, DAILY_BUDGET_USD=0.10
# pm2 start /tmp/ai-monitor-shadow/relay/master.js --name relay-shadow
```

---

## Shadow test — Claude CLI proxy (Prioridad 7 detalle)

Si el usuario quiere probar la ruta Pro/Max subscription:

```bash
# 1. Instalar en servidor:
npx @anthropic-ai/claude-code-relay --port 8080 &

# 2. Probar con curl:
curl http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: dummy" \
  -d '{"model":"claude-haiku-4-5","messages":[{"role":"user","content":"ping"}],"max_tokens":10}'

# 3. Si responde: añadir a relay/.env:
ANTHROPIC_BASE_URL_TEST=http://localhost:8080

# 4. En master.js — routing condicional solo para ai-monitor:
# (ver sección Prioridad 7 arriba)
```

**⚠️ Confirmar con usuario antes de implementar** — puede violar ToS de Anthropic.
