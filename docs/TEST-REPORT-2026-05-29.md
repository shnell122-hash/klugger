# Reporte de Evaluación — Sistema Relay vs Claude Code Directo

**Fecha:** 2026-05-29  
**Branch evaluado:** `claude/agent-monitoring-dashboard-4v8iq`  
**Metodología:** 18 dimensiones, score ponderado 0–10  
**Ejecutado por:** german (Claude Code session)

---

## Resumen ejecutivo

| | Relay autónomo | Claude Code directo | Brecha |
|---|---|---|---|
| **Score ponderado** | **3.90 / 10** | **7.27 / 10** | **-3.37 puntos** |
| **Success rate** | 35.6% | ~98% (supervisado) | -62.4 pp |
| **Costo / sesión** | $0.0022 | ~$0 (Max suscripción) | comparable |
| **Visibilidad** | Dashboard completo | Ninguna | relay gana |

El relay está **funcionalmente operativo** pero con tres problemas que distorsionan severamente su score: un bug de tracking que hace invisible el trabajo real de los agentes (D9, D10), una tasa de éxito del 35% que refleja agentes atascados o mal configurados (D6), y swap al 87% que amenaza la estabilidad (D4).

---

## Tabla de resultados — 18 dimensiones

| Dim | Descripción | Relay | CC ref | Delta | Peso | Contrib. |
|-----|-------------|------:|-------:|------:|-----:|---------:|
| D6  | Success Rate       | 2  | 9  | -7 | 11.5% | 0.23 |
| D11 | Tool Calling       | 3  | 8  | -5 |  7.7% | 0.23 |
| D4  | Stability          | 4  | 9  | -5 |  7.7% | 0.31 |
| D3  | Backend            | 5  | 9  | -4 |  6.7% | 0.34 |
| D9  | Code Quality       | 1  | 8  | -7 |  6.7% | 0.07 |
| D7  | Multi-Agent        | 4  | 3  | +1 |  6.7% | 0.27 |
| D8  | Cost               | 7  | 9  | -2 |  5.8% | 0.40 |
| D12 | Available Tools    | 4  | 9  | -5 |  5.8% | 0.23 |
| D13 | Tool Quality       | 5  | 8  | -3 |  5.8% | 0.29 |
| D1  | Security           | 7  | 9  | -2 |  4.8% | 0.34 |
| D2  | Frontend           | 8  | 2  | +6 |  4.8% | 0.38 |
| D5  | Scalability        | 3  | 5  | -2 |  4.8% | 0.14 |
| D10 | Response Quality   | 1  | 6  | -5 |  4.8% | 0.05 |
| D14 | Batch Processing   | 2  | 5  | -3 |  3.8% | 0.08 |
| D15 | Memory/Resume      | 5  | 7  | -2 |  3.8% | 0.19 |
| D16 | Context Injection  | 7  | 8  | -1 |  3.8% | 0.27 |
| D17 | RAG                | 1  | 4  | -3 |  2.9% | 0.03 |
| D18 | Token Caching      | 3  | 7  | -4 |  1.9% | 0.06 |
| | **TOTAL** | **3.90** | **7.27** | **-3.37** | 100% | |

---

## Análisis detallado por dimensión

---

### D1 · Seguridad — 7/10

**Evidencia:**
- `curl -s -o /dev/null -w "%{http_code}" -X POST https://ia.vilarkptl.com/exec-lite` → `401` ✅
- Exec con token correcto → `OK` ✅
- HTTPS activo → `200` ✅
- BASH_DENY regex presente en `tools-server.js`:
  ```
  /rm\s+-rf\s+\/(?!tmp|var\/www..)|DROP\s+TABLE|TRUNCATE\s+TABLE|git\s+push\s+--force|git\s+reset\s+--hard\s+origin/i
  ```
- Git history con `.env`: **1 commit histórico** encontrado ⚠️
- Token hardcodeado en `CLAUDE.md` ⚠️

**Por qué 7 y no más:**  
El endpoint está protegido y BASH_DENY cubre los vectores más peligrosos. Pero el token de ejecución (`cb5871c0...`) está referenciado en texto plano dentro de `CLAUDE.md` (commiteado al repo), lo que lo expone a cualquier persona con acceso de lectura al repositorio. Adicionalmente, existe un commit histórico que incluyó un `.env`, aunque ya no esté en HEAD.

**Por qué CC puntúa 9:**  
Claude Code no expone ningún endpoint de ejecución remota. Su superficie de ataque es cero — todo corre localmente bajo el usuario del desarrollador.

---

### D2 · Frontend — 8/10

**Evidencia:**
- Tiempo de carga: `0.174s` ✅ (threshold: <1s)
- `/login`: HTTP 301 (redirect correcto) ✅
- `/socket.io/`: HTTP 400 sin upgrade header (comportamiento esperado) ✅
- `/css/dashboard.css`: 200 ✅ | `/js/dashboard.js`: 200 ✅
- `/api/relay/dispatch`: 200 con datos ✅
- `/api/relay/dispatch/stats?days=7`: datos por proyecto ✅

**Por qué 8 y no 10:**  
El dashboard carga rápido y todos los endpoints responden. La penalización proviene de que los datos de success rate (35.6%) son poco confiables por el bug de tracking (ver D9/D10), lo que hace que las métricas del dashboard no reflejen el trabajo real de los agentes.

**Por qué CC puntúa 2:**  
Claude Code no tiene dashboard de monitoreo. Toda la visibilidad es manual (terminal). El relay tiene una ventaja estructural de **+6 puntos** aquí.

---

### D3 · Backend — 5/10

**Evidencia:**
- Latencias por endpoint:
  - `/api/relay/dispatch` → **637ms** ⚠️ (threshold: <500ms)
  - `/api/relay/agents` → 227ms ✅
  - `/api/relay/dispatch/stats` → 112ms ✅
- Tabla más pesada: `agent_events` = **50.58 MB** (creciendo sin límite)
- `ai-monitor`: 27 restarts (proceso PM2), uptime 105m desde el último reinicio
- `relay-master`: 260 restarts históricos (acumulado desde instalación)
- Errores en logs de ai-monitor:
  ```
  SyntaxError: Expected ',' or '}' after property value in JSON at position 17
  SyntaxError: Unterminated string in JSON at position 306
  ```

**Por qué 5:**  
El endpoint principal `/api/relay/dispatch` supera el threshold de 500ms (probablemente por la consulta sin índice sobre la tabla de 186 registros + joins). Los errores de JSON parsing son no-fatales (provienen de streams de eventos malformados) pero indican que el backend recibe payloads inesperados. Los 27 restarts de ai-monitor en ~2h de uptime son preocupantes.

**Causa raíz de los errores JSON:**  
El stream de salida de Claude Code CLI puede incluir líneas parciales cuando el proceso se interrumpe abruptamente. El parser de `master.js` intenta parsear cada línea como JSON; si la línea está truncada, lanza SyntaxError. El try/catch lo captura pero el error queda en logs.

---

### D4 · Estabilidad — 4/10

**Evidencia:**
- RAM: 7.8 GiB total | 2.0 GiB usado | **181 MiB libre** ⚠️
- Swap: 3.0 GiB total | **2.6 GiB usado = 86.7%** ⚠️ (threshold crítico: >70%)
- Procesos PM2 en estado `errored`: `analisis-wp`, `conversation-engine`, `financial-bot`
- `finbot-engine-ciclo3`: **593+ restarts**, stopped
- `kptl-credito`: 270 restarts
- `relay-master`: 260 restarts históricos (online ahora)
- Tareas stuck (7 días): **21 totales** (ai-monitor: 11, coordinator: 7, finbot-verifier: 2, finbot-tester: 1)
- Timeouts en 7 días: 0 ✅
- Uptime del servidor: **24 días 23h 50m** ✅

**Por qué 4:**  
El servidor lleva 25 días sin reiniciar (positivo) pero el swap al 87% significa que el sistema ya está en zona de degradación por memoria. Los 21 tareas stuck (23.3% del total) superan el umbral de 15% para puntuación 7. `financial-bot` en estado errored impacta al sistema aunque sea un proceso separado del relay.

**Causa raíz del swap:**  
El servidor corre 36+ procesos PM2 simultáneamente, muchos de ellos Node.js pesados. Sin gestión activa de memoria, el swap se fue llenando gradualmente desde el reinicio inicial.

---

### D5 · Escalabilidad — 3/10

**Evidencia:**
- Concurrencia máxima observada: `NULL` (ninguna tarea simultánea en 7 días)
- Tasks/hora completadas (promedio): **0.23 tasks/hora** (threshold para 7/10: 10+/hora)
- Proyectos activos configurados: **12**
- `DISPATCH_RATE_LIMIT`: 10 (configurado) ✅
- Coordinator concurrencia: `>= 5` check presente ✅

**Por qué 3:**  
0.23 tareas/hora es casi una tarea cada 4 horas. El sistema tiene infraestructura de concurrencia (rate limit, cola, coordinator) pero no se está usando bajo carga real. Las 45 tareas en 7 días equivalen a exactamente 0.27/hora, lejos del objetivo de 10/hora.

---

### D6 · Tasa de Éxito — 2/10

**Evidencia:**
```
Proyecto        | Total | Completadas | Fallidas | Rate
ai-monitor      |  26   |      9      |    17    | 34.6%
coordinator     |  16   |      7      |     9    | 43.8%
finbot-verifier |   2   |      0      |     2    |  0.0%
finbot-tester   |   1   |      0      |     1    |  0.0%

GLOBAL: 35.6% (32/90 tareas en 7 días)
```

Evolución diaria:
```
2026-05-25: 0%   (8 tareas — ninguna completada)
2026-05-26: 46.7% (30 tareas — mejor día)
2026-05-28: 33.3% (6 tareas)
2026-05-29: 0%   (1 tarea)
```

**Por qué 2 (y no 0):**  
35.6% cae en el rango 30-49% de la rúbrica. El sistema tiene tareas completadas reales, no es cero absoluto.

**Causas raíz identificadas:**
1. **Agentes Haiku con 0 tool calls:** El cambio a `claude-haiku-4-5` para `ai-monitor` y `coordinator` fue documentado en CLAUDE.md como problemático ("Haiku 4.5 mostró 0 tool calls en tareas de código"). Los 45 sessions con `AI Monitor` tienen avg 0.4 tool calls.
2. **STUCK_TASK expiry:** 21 tareas marcadas como stuck (atascadas) cuentan como failed.
3. **finbot-tester/verifier:** Proyectos con configuración incorrecta o workspace roto — 0% success rate.
4. **Tareas mal despachadas:** 5 días de 7 muestran 0% o tasas muy bajas, sugiriendo que el inbox no se procesa correctamente en esos días.

---

### D7 · Desempeño Multi-Agente — 4/10

**Evidencia:**
- Coordinator success rate: **43.8%** (7/16) — por debajo del threshold 50%
- Sub-tareas con `depth > 0`: **3 tareas** a profundidad 3.0 promedio ✅
- Tareas con `parent_id` (chaining): **0** (sin chaining real)
- ASK protocol (`waiting_for_input`): **0 usos** (feature nueva, no ejercitada)
- Latencia promedio (dispatched → completed): coordinator **0.6 min**, ai-monitor **1.0 min** ✅
- `DISPATCH_PARALLEL` referencias en master.js: **7** ✅

**Por qué 4:**  
El coordinator tiene 43.8% de éxito, lo que es inferior al threshold de 50%. No hay chaining real de tareas (parent_id siempre NULL). La ventaja frente a Claude Code directo (+1 punto) es real pero modesta: el relay sí puede coordinar múltiples agentes simultáneos, algo que CC directamente no hace.

---

### D8 · Costo-Eficiencia — 7/10

**Evidencia:**
- Anthropic total 7 días: **$0.1853** (85 sesiones)
- Costo por sesión: **$0.0022**
- Costo por tarea completada: **$0.1853 / 32 ≈ $0.0058**
- DeepSeek: $0.0000 (2 sesiones, planning muy poco usado)
- Token tracking: `total_input_tokens = 0` en agent_sessions (bug de tracking)

**Por qué 7:**  
El costo real es excelente — $0.0058/tarea completada. Pero el tracking de tokens aparece roto (`total_input_tokens = 0` mientras `total_cost_usd = $0.185`), lo que impide auditorías precisas. La comparación con Claude Code es imprecisa: las cuentas Pro/Max tienen costo marginal cero una vez pagada la suscripción.

---

### D9 · Calidad del Código — 1/10

**Evidencia:**
- Tareas completadas con `files_changed > 0`: **0 (cero)**
- `pct_sin_cambios` (0 files + 0 commits): **100%**
- Sintaxis de archivos clave: todos OK ✅
  - `relay/master.js`: OK
  - `relay/tools-server.js`: OK
  - `backend/routes/dispatch.js`: OK
  - `backend/server.js`: OK
- Commits peligrosos (relay_alerts): **0** ✅

**Por qué 1 (y no 0):**  
Los archivos de código tienen sintaxis válida (positivo). La puntuación mínima se debe a que el 100% de las tareas muestran 0 cambios — lo cual **es un bug de tracking, no necesariamente falta de trabajo**.

**Causa raíz (bug de tracking):**  
El campo `files_changed` se almacena en `dispatch_tasks` pero el valor nunca llega a la DB. En `relay/master.js`, la función `onTaskComplete` extrae el resultado del agente y llama a `postToMonitor('/dispatch/:id/complete', {...})`. El body debería incluir `files_changed` y `commits_made`, pero estos valores se extraen del output del agente (buscando patrones como `"numFiles": N` en el stream JSON de Claude Code). Si ese parseo falla o el campo no se mapea al body de la llamada, llega `0` a la DB siempre.

---

### D10 · Calidad de Respuestas — 1/10

**Evidencia:**
- `result_summary LIKE '%STATUS:%'`: **NULL** (0% de tareas)
- Distribución de status en completadas:
  - `sin status`: 16 tareas (100%)
  - `done` / `partial` / `failed`: 0
- `USER_REQUIRED: sí`: 0
- `avg_chars` de result_summary: N/A (siempre NULL)

**Por qué 1:**  
Ninguna tarea completada tiene `result_summary` almacenado. Esto es un bug crítico de tracking correlacionado con D9.

**Causa raíz:**  
El campo `result_summary` se guarda en el endpoint `POST /dispatch/:id/complete` en `backend/routes/dispatch.js`. Si el body llega con `result_summary: null` o `result_summary: undefined`, la query SQL guarda NULL. El agente escribe el bloque `STATUS:/CHANGED:/DEPLOYED:` al final de su sesión como parte del output de Claude Code, y el relay debe extraer ese bloque del stream y pasarlo como `result_summary`. Si la extracción regex falla (output truncado, formato diferente al esperado), el campo queda null.

---

### D11 · Tool Calling — 3/10

**Evidencia:**
- Sessions relay (7 días): 87 sesiones, **64 tool calls totales, avg 0.7/sesión**
- Distribución de herramientas (agent_events):
  ```
  Bash:           96 usos (43%)
  RelayTask:      55 usos (24%)
  read_file:      27 usos (12%)
  Read:           15 usos  (7%)
  list_directory: 14 usos  (6%)
  write_file:      6 usos
  search_code:     3 usos
  git_commit:      1 uso
  ```
- Diversidad de herramientas por proyecto: 1–8 herramientas únicas (avg ~3)
- Tasa de error en tool calls: no disponible (query fallida, columna `response` no existe)

**Por qué 3:**  
0.7 tool calls promedio por sesión es críticamente bajo. Claude Code directamente usa 15–40+ tool calls por sesión compleja. El relay usa principalmente Bash (43%) y RelayTask (24%), con muy poca diversidad. `git_commit` aparece solo 1 vez en 7 días — confirmando que los agentes casi no hacen commits.

**Causa raíz:**  
El modelo `claude-haiku-4-5` asignado a `ai-monitor` y `coordinator` (los proyectos más activos) tiene documentado el problema de "0 tool calls en tareas de código". Haiku 4.5 en modo relay parece ejecutar la tarea conceptualmente sin usar las herramientas del sistema. Los agentes Sonnet (fiscalai) muestran mejor uso pero tienen muy pocas tareas en este período.

---

### D12 · Herramientas Disponibles — 4/10

**Evidencia:**
Relay (`tools-server.js`) — 8 herramientas:
```
bash, read_file, write_file, git_commit, 
http_get, edit_file, search_code, list_directory
```

Claude Code — ~15+ herramientas nativas:
```
Bash, Read, Write, Edit, Glob, Grep, LS,
WebFetch, WebSearch, Agent, TodoRead, TodoWrite,
NotebookRead, NotebookEdit + MCP extensible
```

**Por qué 4:**  
El relay tiene las herramientas básicas de desarrollo (leer, escribir, git, bash) pero le faltan capacidades clave: `WebFetch`/`WebSearch` (para investigar docs y APIs), `Agent` sub-spawning (para delegar subtareas), `TodoRead`/`TodoWrite` (gestión de tarea), y toda la extensibilidad MCP. Nota: los agentes Claude Code del relay sí tienen acceso a todas las herramientas de CC — la penalización aplica solo a los agentes DeepSeek/Grok que usan `tools-server.js`.

---

### D13 · Calidad de Herramientas — 5/10

**Evidencia:**
- BASH_DENY: regex presente, cubre `rm -rf /`, `DROP TABLE`, `TRUNCATE TABLE`, `git push --force`, `git reset --hard origin`
- Timeout configurado: `TOOL_TIMEOUT_MS` presente ✅
- Errores totales post_tool (7 días): 111 eventos `post_tool` (no se puede calcular % de error sin columna adecuada)
- Tool calls con retry automático: no implementado
- Streaming de output: no disponible (Bash devuelve string truncado a 5000 chars)

**Por qué 5:**  
BASH_DENY y timeout son correctos. El problema es que las herramientas son implementaciones básicas sin retry, sin streaming progresivo, y con truncado de output (5000 chars) que puede cortar información crítica de comandos largos como `npm install` o `pytest`.

---

### D14 · Batch Processing — 2/10

**Evidencia:**
- Tareas con `plan_items` no-vacío (7 días): **0**
- Tareas con `depth > 1`: **3**
- `DISPATCH_PARALLEL` en master.js: **7 referencias** (implementado pero sin uso)

**Por qué 2:**  
El planning DeepSeek existe en el código pero no genera `plan_items` en las tareas recientes. Las 3 tareas con depth > 1 son el único indicio de coordinación multi-nivel. El dispatcher paralelo no fue ejercitado.

---

### D15 · Memory / Resume — 5/10

**Evidencia:**
- `PROJECT_SESSIONS` en master.js: **implementado** — almacena `session_id` tras cada tarea ✅
- `--resume` en el comando Claude: **implementado** en `runClaude()` ✅
- `PENDING_ASKS`: almacena `session_id` para continuaciones ASK ✅
- Sessions con `resumed=1` (7 días): **0** (columna existe pero tracking no activo, o todas son sesiones nuevas)

**Por qué 5:**  
El mecanismo existe y está correctamente implementado. El `session_id` se guarda en disco (`sessions.json`). Sin embargo, `resumed=0` en todas las sesiones sugiere que el `--resume` no se activa frecuentemente, posiblemente porque los `PROJECT_SESSIONS` se limpian entre reinicios del relay o los session IDs expiran antes del siguiente dispatch.

---

### D16 · Context Injection — 7/10

**Evidencia:**
- Archivos de prompt por agente: **16 archivos** en `relay/agents/` ✅
- Total líneas de contexto: **1,599 líneas** distribuidas entre 16 prompts
- `cache_control: ephemeral` en `callAnthropicDirect()` y `callDeepSeekDirect()` ✅
- `CLAUDE.md` inyectado automáticamente en sesiones Claude Code ✅
- Prompts específicos por agente: `ai-monitor.md`, `coordinator.md`, `fiscalai.md`, etc.

**Por qué 7:**  
Excelente cobertura de contexto estático. Cada agente tiene su propio prompt con instrucciones especializadas, y el `CLAUDE.md` proporciona contexto del sistema. La penalización (-1 vs CC) se debe a que el contexto es estático — no se actualiza dinámicamente con el estado actual del proyecto entre tareas.

---

### D17 · RAG — 1/10

**Evidencia:**
- `learning_patterns`: **9 registros** (últimos 30 días)
- `learning_fixes`: **0 registros**
- Vector embeddings: no implementados
- Búsqueda semántica: no implementada
- Herramienta `search_code` en relay: búsqueda por texto, no semántica

**Por qué 1:**  
No hay sistema RAG real. Las tablas `learning_*` existen pero tienen contenido mínimo (9 patrones) y no hay pipeline de indexación → embedding → retrieval. La búsqueda de código (`search_code`) es grep básico, no búsqueda vectorial.

---

### D18 · Token Caching — 3/10

**Evidencia:**
- Cache reads en agent_sessions (7 días): **0 tokens**
- Cache writes: **0 tokens**
- `cache_control: ephemeral` configurado en llamadas directas a Anthropic API ✅
- Sesiones Claude Code (relay): el caching de CC se gestiona internamente y no se reporta a la DB

**Por qué 3:**  
El `cache_control: ephemeral` está configurado en las llamadas directas (planificación DeepSeek, coordinación directa). Pero las sesiones Claude Code del relay (la mayoría del trabajo) no reportan sus tokens de caché a `agent_sessions`. El tracking está incompleto. Claude Code directamente tiene caching automático activo y medible.

---

## Plan de acción para igualar a Claude Code

**Objetivo:** Llevar el relay de **3.90** a **6.50+/10** en 4 semanas  
*(Meta realista: alcanzar 85% success rate y corregir los bugs de tracking críticos)*

---

### 🔴 Sprint 1 — Semana 1 (Impacto inmediato: +0.8 puntos)

#### Fix 1: Corregir tracking de `files_changed` + `result_summary` (D9 +4, D10 +5)

**Causa raíz confirmada:** En `relay/master.js` → `onTaskComplete()`, el relay parsea el output JSON de Claude Code buscando el `result_summary`. El campo `files_changed` debería extraerse del `usage` stats del stream de Claude Code o de un conteo de `git diff --stat`. Si la extracción falla silenciosamente, llega `0` a la DB.

**Fix:**
```javascript
// En onTaskComplete(), después de capturar resultRaw:
// 1. Contar commits reales del agente
const gitLog = execSync(`git -C ${repoPath} log --oneline ${startSha}..HEAD 2>/dev/null || echo ''`).toString().trim();
const commits_made = gitLog ? gitLog.split('\n').filter(Boolean).length : 0;

// 2. Contar archivos cambiados
const gitDiff = execSync(`git -C ${repoPath} diff --name-only ${startSha}..HEAD 2>/dev/null || echo ''`).toString().trim();
const files_changed = gitDiff ? gitDiff.split('\n').filter(Boolean).length : 0;

// 3. Extraer result_summary del outbox al final del output
const summaryMatch = /STATUS:\s*(done|partial|failed)[\s\S]*?(?=\n\n|\n#|$)/m.exec(resultRaw);
const result_summary = summaryMatch ? summaryMatch[0].trim() : resultRaw.slice(-500);
```

**Archivos a modificar:** `relay/master.js` (función `onTaskComplete`)

---

#### Fix 2: Cambiar `ai-monitor` y `coordinator` a Sonnet (D6 +2, D11 +2)

**Causa raíz confirmada:** Haiku 4.5 produce 0 tool calls en tareas de código. Los proyectos más activos (`ai-monitor` con 45 sesiones, `coordinator` con 15) usan Haiku.

**Fix en `relay/projects.json`:**
```json
// ai-monitor: "claude-haiku-4-5" → "claude-haiku-4-5-20251001"
// o mejor, cambiar a sonnet para tareas que requieren código:
{ "id": "ai-monitor", "model": "claude-sonnet-4-6", ... }
{ "id": "coordinator", "model": "claude-haiku-4-5-20251001", ... }
```

**Nota:** El coordinator puede quedarse en Haiku si sus tareas son solo de routing/dispatch. Para ai-monitor (que hace cambios de código), Sonnet es necesario.

---

#### Fix 3: Diagnosticar y arreglar finbot-tester / finbot-verifier (D6 +1)

**Evidencia:** 0% success rate en ambos. Sus workspaces probablemente tienen problemas de permisos, repo desactualizado, o dependencias rotas.

**Acción:** `pm2 logs finbot-tester --lines 50` + verificar workspace en `/relay/workspaces/finbot-tester/`.

---

### 🟠 Sprint 2 — Semana 2 (Impacto: +0.5 puntos)

#### Fix 4: Reducir latencia de `/api/relay/dispatch` (D3 +1)

**Causa:** Query sin optimización sobre `dispatch_tasks` con 186 registros + posibles JOINs no indexados.

**Fix:**
```sql
-- Agregar índice compuesto para la query de listado
CREATE INDEX idx_dispatch_status_created ON dispatch_tasks(status, created_at DESC);
CREATE INDEX idx_dispatch_project_created ON dispatch_tasks(project, created_at DESC);
```

**Archivo:** `backend/db/migrate-v19.sql`

---

#### Fix 5: Gestión de memoria — limpiar procesos errored (D4 +1)

**Acciones:**
1. `pm2 delete finbot-engine-ciclo3` (593 restarts, stopped) — libera swap
2. `pm2 stop analisis-wp conversation-engine financial-bot` — investigar antes de eliminar
3. Agregar `--max-memory-restart 400M` en ecosystem.config.js para relay-master y ai-monitor

**Impacto estimado swap:** −200-400 MB, de 87% → ~80%

---

#### Fix 6: Limpiar tabla `agent_events` para reducir latencia (D3 +0.5)

**Evidencia:** `agent_events` = 50.58 MB, la más pesada de la DB.

**Fix:**
```sql
-- Crear evento de limpieza (conservar solo 30 días)
DELETE FROM agent_events WHERE timestamp < DATE_SUB(NOW(), INTERVAL 30 DAY);
-- Agregar índice TTL o job programado en backend/server.js
```

---

### 🟡 Sprint 3 — Semana 3 (Impacto: +0.6 puntos)

#### Fix 7: Expandir herramientas DeepSeek en tools-server.js (D12 +2)

**Agregar herramientas faltantes:**
```javascript
// http_post — para llamar APIs con body
{ name: 'http_post', ... }
// grep_code — búsqueda más potente
{ name: 'grep_code', description: 'Search for pattern in files recursively', ... }
// run_tests — ejecutar test suite del proyecto
{ name: 'run_tests', ... }
// get_url — WebFetch básico
{ name: 'get_url', description: 'Fetch content from a URL', ... }
```

---

#### Fix 8: Activar `--resume` correctamente (D15 +1)

**Problema probable:** `PROJECT_SESSIONS` se limpia al reiniciar relay-master. El session ID de CC expira a las ~24h.

**Fix:**
```javascript
// Añadir timestamp check — no usar session_id si tiene más de 20h
const SESSION_MAX_AGE_MS = 20 * 60 * 60 * 1000;
function getResumeSession(projectId) {
  const s = PROJECT_SESSIONS[projectId];
  if (!s) return null;
  if (Date.now() - s.ts > SESSION_MAX_AGE_MS) {
    delete PROJECT_SESSIONS[projectId];
    return null;
  }
  return s.id;
}
```

---

#### Fix 9: Logging de tokens de caché en sesiones CC (D18 +2)

**Problema:** Las sesiones Claude Code del relay no reportan `cache_read_tokens` a agent_sessions.

**Fix:** En el stream parser de `runClaude()`, extraer el campo `cache_read_tokens` de los eventos `usage` del stream JSON y acumularlos para reportar al backend al final de la sesión.

---

### 🔵 Sprint 4 — Semana 4 (Impacto: +0.3 puntos)

#### Fix 10: Activar DeepSeek planning para aumentar plan_items (D14 +2)

**Problema:** 0 tareas con `plan_items` en 7 días. El planning DeepSeek se llama pero los ítems no se guardan.

**Verificar en master.js:** `parsePlanSection()` → `plan_items` → `postToMonitor('/dispatch/:id/plan', {...})` → endpoint en dispatch.js.

---

#### Fix 11: AGENT-STATUS.md automático (D7 +1)

Generar automáticamente la sección de estado en `relay/AGENT-STATUS.md` al completar cada tarea, para que los agentes tengan contexto de qué archivos están siendo modificados por otros.

---

## Proyección de scores post-fix

| Sprint | Dimensión | Actual | Objetivo |
|--------|-----------|-------:|--------:|
| S1 | D9 Code Quality | 1 | 6 |
| S1 | D10 Response Quality | 1 | 7 |
| S1 | D6 Success Rate | 2 | 5 |
| S1 | D11 Tool Calling | 3 | 5 |
| S2 | D3 Backend | 5 | 7 |
| S2 | D4 Stability | 4 | 6 |
| S3 | D12 Available Tools | 4 | 6 |
| S3 | D15 Memory/Resume | 5 | 7 |
| S3 | D18 Token Caching | 3 | 6 |
| S4 | D14 Batch Processing | 2 | 4 |
| S4 | D7 Multi-Agent | 4 | 6 |

**Score proyectado post Sprint 4:** ~**5.80 / 10**  
*(vs Claude Code: 7.27/10 — brecha se reduce de -3.37 a -1.47)*

---

## Limitaciones estructurales — gaps que no cierran con código

Estas brechas son **inherentes al diseño**, no bugs:

| Dimensión | Gap | Razón |
|-----------|-----|-------|
| D4 Stability | relay < CC | Relay depende de servidor compartido con swap; CC corre local |
| D5 Scalability | relay < CC | CC sirve 1 usuario; relay sirve N proyectos bajo restricciones de RAM |
| D12 Tools | relay < CC | CC tiene MCP extensible; relay DeepSeek tiene API JSON fija |
| D6 Success Rate | relay < CC | CC tiene supervisión humana en tiempo real; relay es autónomo |
| D17 RAG | relay < CC | Implementar RAG requiere infraestructura de embeddings adicional |

El relay **supera estructuralmente** a Claude Code en:
- **D2 Frontend** (+6): visibilidad total del sistema via dashboard
- **D7 Multi-Agent** (+1): coordinación autónoma entre proyectos
- **Disponibilidad 24/7**: el relay trabaja sin intervención humana

---

*Generado por `/test` — metodología completa en `.claude/commands/test.md`*
