# /test — Evaluación integral del sistema relay

Ejecuta una evaluación completa del relay vs Claude Code directo en **19 dimensiones**.
Cada dimensión recibe una calificación de **0 a 10**. Al final se produce un reporte
comparativo con puntuación total y diagnóstico de brechas.

---

## Preparación: variables de entorno para toda la sesión

```bash
EXEC_TOKEN="cb5871c0aa6ccd67997237c5238017753c0b35bdd7167b56e226aff25bcbf67a"
EXEC_URL="https://ia.vilarkptl.com/exec-lite"
DASH_URL="https://ia.vilarkptl.com"
REPO="/home/user/agentic-repo"

exec_s() {
  local CMD="$1" CWD="${2:-/var/www/html/vilarkptl.com/ai-monitor}"
  BODY=$(python3 -c "import sys,json; print(json.dumps({'cmd':sys.argv[1],'cwd':sys.argv[2]}))" "$CMD" "$CWD")
  curl -s --max-time 30 -X POST "$EXEC_URL" \
    -H "Content-Type: application/json" -H "x-exec-token: $EXEC_TOKEN" -d "$BODY" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output') or d.get('error','(sin output)'))"
}

db() {
  local Q="$1"
  exec_s "mysql -u root -pxGRP4XiFROfcF5tn9N71 ai_monitoring -N -e \"$Q\" 2>/dev/null"
}
```

---

## Ejecución — 19 dimensiones en orden

Ejecuta cada bloque, registra el output, asigna la puntuación según la rúbrica.

---

### D1 · Seguridad

**¿Qué mide:** Protección del exec endpoint, denegación de comandos peligrosos,
no-exposición de secretos, HTTPS obligatorio, validación de tokens.

```bash
# 1. Exec endpoint sin token → debe devolver 401/403
curl -s -o /dev/null -w "%{http_code}" -X POST "$EXEC_URL" \
  -H "Content-Type: application/json" -d '{"cmd":"pm2 status"}'
# Esperado: 401 o 403

# 2. Exec con token correcto → debe funcionar
exec_s "echo OK"

# 3. Comandos peligrosos bloqueados (BASH_DENY en tools-server.js)
exec_s "rm -rf /etc"
exec_s "git push --force origin main"
# Esperado: "command not allowed" o error controlado

# 4. .env no commiteado en git
git -C "$REPO" log --all --full-history -- "**/.env" | head -3
# Esperado: ningún commit con .env

# 5. Revisar que BASH_DENY en tools-server.js cubre DROP TABLE / git reset --hard origin
grep -n "BASH_DENY" "$REPO/relay/tools-server.js"

# 6. HTTPS en dashboard
curl -s -o /dev/null -w "%{http_code}" "$DASH_URL"
# Esperado: 200 (redirige HTTP→HTTPS via Apache)
```

**Rúbrica:**
- 10: exec sin token = 401, todos los peligrosos bloqueados, HTTPS OK, sin .env en git
- 8: 1 bypass menor (ej: comando peligroso no cubierto pero no catastrófico)
- 5: exec endpoint accesible sin auth parcialmente
- 0: token hardcodeado público o .env en git

**Brecha vs Claude Code:** Claude Code no tiene exec remoto — puntuación de superficie
de ataque siempre mayor en relay; la comparación es relay_seguridad vs claude_no_expone_superficie.

---

### D2 · Frontend

**¿Qué mide:** Carga del dashboard, tabs funcionales, actualizaciones en tiempo real,
responsividad, calidad visual.

```bash
# 1. Tiempo de carga del dashboard
time curl -s -o /dev/null "$DASH_URL"

# 2. Login endpoint responde
curl -s -o /dev/null -w "%{http_code}" "$DASH_URL/login"

# 3. API de dispatch responde con datos
curl -s "$DASH_URL/api/relay/dispatch" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Dispatches: {len(d)} | Últimos status: {[x[\"status\"] for x in d[:5]]}')
"

# 4. API pipeline stats
curl -s "$DASH_URL/api/relay/dispatch/stats?days=7" | python3 -c "
import sys,json
rows=json.load(sys.stdin)
for r in rows: print(f'{r[\"project\"]}: {r[\"success_rate_pct\"]}% ({r[\"completed\"]}/{r[\"total\"]})')
"

# 5. Socket.io endpoint disponible
curl -s -o /dev/null -w "%{http_code}" "$DASH_URL/socket.io/"

# 6. Archivos estáticos (CSS/JS)
curl -s -o /dev/null -w "%{http_code}" "$DASH_URL/css/dashboard.css"
curl -s -o /dev/null -w "%{http_code}" "$DASH_URL/js/dashboard.js"
```

**Rúbrica:**
- 10: carga <1s, todos los endpoints 200, Socket.io OK, todas las APIs con datos
- 7: carga <3s, algún endpoint lento pero funcional
- 4: dashboard carga pero sin datos en tiempo real
- 0: dashboard caído o sin auth

**Brecha vs Claude Code:** Claude Code no tiene dashboard. Relay +10 pts en visibilidad.

---

### D3 · Backend

**¿Qué mide:** Latencia de APIs, throughput de DB, manejo de errores, WebSocket, logs limpios.

```bash
# 1. Latencia de los endpoints clave (3 muestras)
for ep in "/api/relay/dispatch" "/api/relay/agents" "/api/relay/dispatch/stats"; do
  T=$(curl -s -o /dev/null -w "%{time_total}" "$DASH_URL$ep")
  echo "$ep → ${T}s"
done

# 2. DB: queries activas y tamaño de tabla
db "SELECT COUNT(*) AS total_dispatches, SUM(status='completed') AS done, SUM(status='failed') AS fail FROM dispatch_tasks"
db "SELECT table_name, ROUND(data_length/1024/1024,2) AS mb FROM information_schema.tables WHERE table_schema='ai_monitoring' ORDER BY data_length DESC LIMIT 6"

# 3. Logs de error del backend (últimas 2 horas)
exec_s "pm2 logs ai-monitor --lines 30 --nostream 2>&1 | grep -i 'error\|ERR\|unhandled' | tail -10"

# 4. PM2 proceso backend — restarts y memoria
exec_s "pm2 show ai-monitor 2>&1 | grep -E 'restarts|memory|status|uptime'"

# 5. Relay-master errores
exec_s "pm2 logs relay-master --lines 30 --nostream 2>&1 | grep -i 'error\|ERROR' | tail -10"
```

**Rúbrica:**
- 10: endpoints <200ms, 0 errores en logs, DB <5MB, relay sin errores críticos
- 7: endpoints <500ms, errores no-fatales ocasionales
- 4: latencia >1s o errores repetidos en logs
- 0: backend caído o DB corrompida

---

### D4 · Estabilidad

**¿Qué mide:** Uptime, restart rate, uso de memoria/swap, crash loops, STUCK_TASK expiry.

```bash
# 1. PM2 status completo
exec_s "pm2 status 2>&1"

# 2. Memoria y swap
exec_s "free -h"

# 3. Historial de reinicios relay-master (¿cuántos en últimos 7 días?)
db "SELECT COUNT(*) FROM dispatch_tasks WHERE status='failed' AND LOWER(result_items) LIKE '%timeout%' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 4. Tasks expiradas por stuck en 7 días
db "SELECT project, COUNT(*) AS expiradas FROM dispatch_tasks WHERE status='failed' AND result_items LIKE '%atascada%' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY project"

# 5. Uptime del servidor
exec_s "uptime"

# 6. Procesos en crash loop (>100 restarts)
exec_s "pm2 status 2>&1 | awk '\$10+0 > 100 {print \$2, \"restarts:\", \$10}'"
```

**Rúbrica:**
- 10: relay-master 0 restarts/semana, swap <70%, 0 crash loops, stuck <5%
- 7: 1-3 restarts/semana, swap <90%, stuck <15%
- 4: reinicios frecuentes o swap >90%
- 0: sistema caído o OOM frecuente

---

### D5 · Escalabilidad

**¿Qué mide:** Concurrencia máxima, rate limiting, profundidad de cola, throughput por hora.

```bash
# 1. Máximo de tareas simultáneas activas observadas (7 días)
db "SELECT MAX(concurrent) FROM (SELECT DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') AS minute, COUNT(*) AS concurrent FROM dispatch_tasks WHERE status IN ('dispatched','pending') AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY minute) t"

# 2. Throughput: tareas completadas por hora (promedio)
db "SELECT ROUND(COUNT(*) / (TIMESTAMPDIFF(HOUR, MIN(created_at), NOW())), 2) AS tasks_per_hour FROM dispatch_tasks WHERE status='completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 3. Proyectos activos con inbox
grep -c '"active": true' "$REPO/relay/projects.json" 2>/dev/null || echo "N/A"

# 4. DISPATCH_RATE_LIMIT actual
grep "DISPATCH_RATE_LIMIT\b" "$REPO/relay/master.js" | head -2

# 5. Coordinator concurrencia máxima (P0.3 = 5)
grep "active_count.*>=.*5\|>= 5" "$REPO/backend/routes/dispatch.js" | head -2

# 6. Rate limit de exec endpoint
grep "rateLimit\|rate_limit\|RATE" "$REPO/deploy/exec-lite.js" 2>/dev/null | head -3
```

**Rúbrica:**
- 10: >5 tareas concurrentes sin degradación, >20 tasks/hora, rate limit funcional
- 7: 3-5 concurrentes, 10-20 tasks/hora
- 4: <3 concurrentes o rate limit ausente
- 0: un solo proyecto activo o sin queue management

---

### D6 · Tasa de éxito (Success Rate)

**¿Qué mide:** Porcentaje de tareas completadas vs total, por proyecto, últimos 7 días.
Es la métrica más importante del roadmap — objetivo 85%.

```bash
# 1. Success rate global últimos 7 días
db "SELECT project, total, completed, failed, CONCAT(success_rate_pct,'%') AS rate FROM (SELECT project, COUNT(*) AS total, SUM(status='completed') AS completed, SUM(status='failed') AS failed, ROUND(100.0*SUM(status='completed')/COUNT(*),1) AS success_rate_pct FROM dispatch_tasks WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY project) t ORDER BY total DESC"

# 2. Tasa global combinada
db "SELECT ROUND(100.0*SUM(status='completed')/COUNT(*),1) AS global_rate, COUNT(*) AS total FROM dispatch_tasks WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 3. Evolución diaria (¿mejorando?)
db "SELECT DATE(created_at) AS dia, ROUND(100.0*SUM(status='completed')/COUNT(*),1) AS rate, COUNT(*) AS total FROM dispatch_tasks WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY dia ORDER BY dia"

# 4. Stuck tasks actuales
db "SELECT project, title, status, TIMESTAMPDIFF(MINUTE, created_at, NOW()) AS age_min FROM dispatch_tasks WHERE status IN ('pending','dispatched','waiting_for_input') ORDER BY created_at ASC LIMIT 10"
```

**Rúbrica:**
- 10: ≥90% global
- 8: 80-89%
- 6: 65-79%
- 4: 50-64%
- 2: 30-49%
- 0: <30%

**Brecha vs Claude Code:** Claude Code interactivo = ~98% (usuario supervisa). Relay autónomo: objetivo 85%.

---

### D7 · Desempeño multi-agente

**¿Qué mide:** Efectividad del coordinator, latencia de dispatch cross-project,
uso de @coordinator auto-dispatch, ASK: protocol, DISPATCH_PARALLEL.

```bash
# 1. Coordinator success rate
db "SELECT ROUND(100.0*SUM(status='completed')/COUNT(*),1) AS rate, COUNT(*) AS total FROM dispatch_tasks WHERE project='coordinator' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 2. Dispatches de coordinator a otros agentes (depth > 0)
db "SELECT project, COUNT(*) AS sub_tasks, AVG(depth) AS avg_depth FROM dispatch_tasks WHERE depth > 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY project"

# 3. Cadenas de tareas (parent_id) activas últimos 7 días
db "SELECT COUNT(*) AS chained_tasks FROM dispatch_tasks WHERE parent_id IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 4. ASK: protocol — waiting_for_input tasks (feature nueva)
db "SELECT COUNT(*) AS asks_total, SUM(ask_question IS NOT NULL) AS with_question FROM dispatch_tasks WHERE status IN ('waiting_for_input','answered') AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 5. Latencia median dispatch→complete
db "SELECT project, ROUND(AVG(TIMESTAMPDIFF(SECOND, dispatched_at, completed_at))/60,1) AS avg_min FROM dispatch_tasks WHERE status='completed' AND dispatched_at IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY project ORDER BY avg_min"

# 6. Verificar DISPATCH_PARALLEL en código
grep -c "DISPATCH_PARALLEL" "$REPO/relay/master.js"
```

**Rúbrica:**
- 10: coordinator >70% rate, sub-tasks frecuentes, latencia <10min, ASK funcional
- 7: coordinator 50-70%, cadenas simples funcionando
- 4: coordinator <50% o sin sub-tasks reales
- 0: coordinator caído o sin dispatches cross-project

**Brecha vs Claude Code:** Claude Code no coordina múltiples agentes autónomos.
Relay +10 en paralelismo, −3 en confiabilidad del coordinator.

---

### D8 · Costo-eficiencia

**¿Qué mide:** Costo por tarea completada, ratio Claude/DeepSeek, ahorro por
cuentas Pro/Max ($0 marginal), budget adherence.

```bash
# 1. Costo por modelo (últimos 7 días)
db "SELECT api_provider, ROUND(SUM(cost_usd),4) AS total_usd, COUNT(*) AS sessions, ROUND(SUM(cost_usd)/NULLIF(COUNT(*),0),4) AS usd_per_session FROM agent_sessions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY api_provider ORDER BY total_usd DESC"

# 2. Costo por tarea completada
db "SELECT dt.project, ROUND(SUM(s.cost_usd),4) AS total_cost, COUNT(DISTINCT dt.id) AS completed_tasks, ROUND(SUM(s.cost_usd)/NULLIF(COUNT(DISTINCT dt.id),0),4) AS cost_per_task FROM dispatch_tasks dt LEFT JOIN agent_sessions s ON s.project_name=dt.project AND s.started_at >= dt.created_at AND s.started_at <= IFNULL(dt.completed_at, NOW()) WHERE dt.status='completed' AND dt.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY dt.project"

# 3. Proporción Claude vs DeepSeek (uso real)
db "SELECT api_provider, COUNT(*) AS sessions, ROUND(100.0*COUNT(*)/SUM(COUNT(*)) OVER(),1) AS pct FROM agent_sessions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY api_provider"

# 4. Proyectos con budget kill-switch activo
db "SELECT project_name, budget_usd_month, spent_usd_month, ROUND(100*spent_usd_month/budget_usd_month,0) AS pct_usado FROM platform_budget WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY pct_usado DESC LIMIT 5" 2>/dev/null || echo "tabla platform_budget no disponible"

# 5. Claude Max = $0 marginal — estimar valor vs API directa
# (cuenta las sesiones Claude que habrían costado $ si fueran API)
db "SELECT COUNT(*) AS claude_sessions, ROUND(SUM(total_input_tokens)*3/1000000 + SUM(total_output_tokens)*15/1000000, 2) AS api_equivalent_usd FROM agent_sessions WHERE api_provider='anthropic' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
```

**Rúbrica:**
- 10: costo API real <$0.01/tarea (Claude Max) o <$0.05 (DeepSeek), 0 budget overruns
- 7: $0.05-$0.20/tarea, sin overruns
- 4: $0.50+/tarea o overruns frecuentes
- 0: sin tracking de costo o gastos descontrolados

**Brecha vs Claude Code:** Claude Code Max = $0 por sesión (suscripción).
API directa equivalente sería $0.50-$5 por sesión compleja.

---

### D9 · Calidad del código generado

**¿Qué mide:** Archivos cambiados por tarea, commits realizados, sintaxis válida,
test pass rate, code review score.

```bash
# 1. Promedio files_changed y commits_made por tarea completada
db "SELECT project, ROUND(AVG(files_changed),1) AS avg_files, ROUND(AVG(commits_made),1) AS avg_commits, COUNT(*) AS tasks FROM dispatch_tasks WHERE status='completed' AND files_changed > 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY project"

# 2. Tareas con 0 commits (completadas sin evidencia de cambio)
db "SELECT ROUND(100.0*SUM(files_changed=0 AND commits_made=0)/COUNT(*),1) AS pct_sin_cambios FROM dispatch_tasks WHERE status='completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 3. Validar sintaxis de archivos JS clave generados en este repo
node --check "$REPO/relay/master.js" 2>&1 && echo "master.js: OK" || echo "master.js: ERROR"
node --check "$REPO/relay/tools-server.js" 2>&1 && echo "tools-server.js: OK"
node --check "$REPO/backend/routes/dispatch.js" 2>&1 && echo "dispatch.js: OK"
node --check "$REPO/backend/server.js" 2>&1 && echo "server.js: OK"

# 4. Commits peligrosos detectados en los últimos 7 días (relay_alerts)
db "SELECT COUNT(*) AS dangerous_commits FROM relay_alerts WHERE alert_type IN ('commit_quality','commit_dangerous') AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 5. Tests del sistema (si existen)
cd "$REPO" && BACKEND=https://ia.vilarkptl.com node tests/dispatch.test.js 2>&1 | tail -5
```

**Rúbrica:**
- 10: avg >1 commit/tarea, 0% sin cambios, sintaxis OK, 0 commits peligrosos, tests pass
- 7: avg >0.5 commits, <20% sin cambios, sintaxis OK
- 4: >40% tareas sin evidencia de cambio o errores de sintaxis frecuentes
- 0: código roto, commits peligrosos frecuentes

---

### D10 · Calidad de respuestas (Outbox)

**¿Qué mide:** Completitud del outbox estructurado (STATUS/CHANGED/DEPLOYED/PENDING),
coherencia con la tarea solicitada, USER_REQUIRED bien usado.

```bash
# 1. Tasa de outbox estructurado completo
db "SELECT ROUND(100.0*SUM(result_summary LIKE '%STATUS:%')/COUNT(*),1) AS pct_con_status, ROUND(100.0*SUM(result_summary LIKE '%CHANGED:%')/COUNT(*),1) AS pct_con_changed, ROUND(100.0*SUM(result_summary LIKE '%DEPLOYED:%')/COUNT(*),1) AS pct_con_deployed FROM dispatch_tasks WHERE status='completed' AND result_summary IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 2. Distribution de STATUS: done vs partial vs failed en completadas
db "SELECT CASE WHEN result_summary LIKE '%STATUS: done%' THEN 'done' WHEN result_summary LIKE '%STATUS: partial%' THEN 'partial' WHEN result_summary LIKE '%STATUS: failed%' THEN 'failed' ELSE 'sin status' END AS outbox_status, COUNT(*) AS n FROM dispatch_tasks WHERE status='completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY 1"

# 3. USER_REQUIRED = sí (agente pidió intervención humana)
db "SELECT COUNT(*) AS requirio_humano FROM dispatch_tasks WHERE result_summary LIKE '%USER_REQUIRED: s%' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 4. Longitud media del result_summary (indicador de respuesta elaborada vs vacía)
db "SELECT project, ROUND(AVG(LENGTH(result_summary)),0) AS avg_chars FROM dispatch_tasks WHERE status='completed' AND result_summary IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY project"

# 5. Revisar muestra de outboxes recientes
db "SELECT project, title, LEFT(result_summary,200) FROM dispatch_tasks WHERE status='completed' AND result_summary IS NOT NULL ORDER BY completed_at DESC LIMIT 3" | head -30
```

**Rúbrica:**
- 10: >90% con STATUS:, >80% con CHANGED:, STATUS siempre coherente con exit_code
- 7: >70% con STATUS:, respuestas elaboradas (>200 chars avg)
- 4: <50% con campos estructurados
- 0: outbox vacío o sin formato

**Brecha vs Claude Code:** Claude Code responde en lenguaje natural sin formato estructurado.
Relay tiene outbox estándar parseable. Relay +2 en parseable, −1 en naturalidad.

---

### D11 · Calidad de tool calling

**¿Qué mide:** Distribución de tool calls por sesión, tasa de error en herramientas,
diversidad de herramientas usadas, eficiencia (goal per tool ratio).

```bash
# 1. Tool calls por sesión (promedio)
db "SELECT project_name, ROUND(AVG(tool_call_count),1) AS avg_tools, MAX(tool_call_count) AS max_tools, COUNT(*) AS sessions FROM agent_sessions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY project_name ORDER BY avg_tools DESC"

# 2. Herramientas más usadas
db "SELECT tool_name, COUNT(*) AS uses FROM events WHERE event_type='pre_tool' AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY tool_name ORDER BY uses DESC LIMIT 15"

# 3. Tool error rate (post_tool con error en respuesta)
db "SELECT ROUND(100.0*SUM(tool_response_summary LIKE '%error%' OR tool_response_summary LIKE '%Error%')/COUNT(*),1) AS pct_error FROM events WHERE event_type='post_tool' AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 4. Tool diversity: cuántas herramientas distintas se usan por sesión
db "SELECT project_name, COUNT(DISTINCT tool_name) AS unique_tools FROM events WHERE event_type='pre_tool' AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY project_name"

# 5. Herramientas disponibles en relay vs Claude Code
echo "=== relay/tools-server.js AGENT_TOOLS ==="
grep -c '"name":' "$REPO/relay/tools-server.js"
grep '"name":' "$REPO/relay/tools-server.js" | sed 's/.*"name": "\([^"]*\)".*/\1/'

echo ""
echo "=== Claude Code built-in tools ==="
echo "Bash, Read, Write, Edit, Glob, Grep, LS, WebFetch, WebSearch, Agent, TodoRead, TodoWrite, NotebookRead, NotebookEdit, mcp__* (extensible)"
echo "Total CC built-ins: ~15+ core + MCP extensible"
```

**Rúbrica:**
- 10: >20 avg tools/sesión, <5% error rate, >6 tool types usados, tools equivalen a CC
- 7: 10-20 avg, <15% error, >4 tipos
- 4: <10 avg o >25% error
- 0: <5 avg o sin diversidad

---

### D12 · Herramientas disponibles (Available tools)

**¿Qué mide:** Cobertura de herramientas del relay vs Claude Code built-ins.
Evalúa si el relay puede ejecutar las mismas categorías de trabajo.

```bash
# Herramientas relay (tools-server.js)
echo "=== RELAY TOOLS (tools-server.js) ==="
grep -A2 '"name":' "$REPO/relay/tools-server.js" | grep '"name"\|"description"' | paste - - | \
  sed 's/.*"name": "\([^"]*\)".*"description": "\([^"]*\)".*/\1: \2/' | head -20

# Claude Code usa estas herramientas (listado oficial)
cat << 'EOF'
=== CLAUDE CODE BUILT-IN TOOLS ===
Bash          → bash (relay ✅)
Read          → read_file (relay ✅)
Write         → write_file (relay ✅)
Edit          → edit_file (relay ✅)
Glob          → list_directory con pattern (relay ✅ parcial)
Grep          → search_code (relay ✅)
LS            → list_directory (relay ✅)
WebFetch      → http_get (relay ✅ solo GET)
WebSearch     → ❌ relay NO TIENE
Agent         → DISPATCH_PARALLEL (relay ✅ parcial)
TodoRead/Write → ❌ relay NO TIENE (usa agent-memory.md como proxy)
NotebookEdit  → ❌ relay NO TIENE
mcp__github   → ❌ relay NO TIENE (puede hacer git push)
mcp__* (otros)→ ❌ relay NO TIENE extensión MCP
EOF

# Herramientas que relay tiene y CC no tiene built-in
echo ""
echo "=== HERRAMIENTAS RELAY-ONLY ==="
echo "git_commit → staged add + commit + push (CC usa Bash para esto)"
echo "exec_server → ejecutar en producción remota (CC no tiene remote exec)"
echo "ASK: protocol → pausa interactiva mid-task (CC interrumpe sesión)"
```

**Rúbrica (cobertura 0-10):**
- 10: cubre todas las categorías core de CC (file, bash, web, search)
- 7: cubre file + bash + search, falta WebSearch y MCP
- 4: herramientas básicas pero sin búsqueda web ni extensiones
- 0: solo bash sin herramientas especializadas

**Gap crítico:** WebSearch, MCP servers, Todo, Notebooks. Agregar a backlog si se activa B3.

---

### D13 · Calidad de herramientas (Tool quality)

**¿Qué mide:** Precisión de bash (éxito vs fallo), exactitud de edit_file,
read_file sin truncado, search_code con contexto útil.

```bash
# 1. bash tool: tasa de éxito en servidor
db "SELECT ROUND(100.0*SUM(tool_response_summary NOT LIKE '%error%' AND tool_response_summary NOT LIKE '%Error%')/COUNT(*),1) AS bash_success_pct FROM events WHERE tool_name='bash' AND event_type='post_tool' AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# 2. Revisar BASH_DENY coverage (qué bloquea)
grep -A1 "BASH_DENY" "$REPO/relay/tools-server.js"

# 3. Límites de herramientas (truncado vs CC)
echo "=== Límites relay tools-server.js ==="
grep "slice(0,\|\.slice(0," "$REPO/relay/tools-server.js" | grep -v "//" | head -8
echo ""
echo "=== Límites Claude Code ==="
echo "Bash: sin límite de output (streamed)"
echo "Read: sin límite (paginado con offset/limit)"
echo "WebFetch: sin límite (streaming)"

# 4. Timeout de herramientas
grep "TOOL_TIMEOUT\|timeout.*45\|timeout.*15" "$REPO/relay/tools-server.js" | head -5

# 5. Herramienta edit_file — prueba de precisión (en local)
TEST_FILE="/tmp/test_edit_$(date +%s).txt"
echo "linea uno\nlinea dos\nlinea tres" > "$TEST_FILE"
node -e "
const {executeTool} = require('$REPO/relay/tools-server');
executeTool('edit_file', {path:'$TEST_FILE', old_string:'linea dos', new_string:'LINEA DOS EDITADA'}, {repoBase:'/'})
  .then(r => console.log('edit_file result:', r));
" 2>&1
cat "$TEST_FILE" && rm -f "$TEST_FILE"
```

**Rúbrica:**
- 10: bash >90% éxito, edit_file preciso, sin truncado crítico, timeouts razonables
- 7: bash >75%, edit_file funcional, truncado no afecta tareas normales
- 4: bash <60% éxito o edit_file con falsos negativos frecuentes
- 0: herramientas fallando en casos básicos

---

### D14 · Batch processing

**¿Qué mide:** Ejecución paralela de tareas, uso de DISPATCH_PARALLEL,
throughput bajo carga, queue drain time.

```bash
# 1. Tareas procesadas en paralelo (mismo minuto, distinto proyecto)
db "SELECT DATE_FORMAT(dispatched_at,'%Y-%m-%d %H:%i') AS minuto, COUNT(*) AS tareas_paralelas FROM dispatch_tasks WHERE dispatched_at IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY minuto HAVING tareas_paralelas > 1 ORDER BY tareas_paralelas DESC LIMIT 5"

# 2. DISPATCH_PARALLEL en código — cuántos proyectos lo usan
grep -rn "DISPATCH_PARALLEL" "$REPO/relay/" | grep -v "master.js:" | head -5

# 3. Tiempo promedio en cola (pending → dispatched)
db "SELECT project, ROUND(AVG(TIMESTAMPDIFF(SECOND, created_at, dispatched_at)),0) AS avg_queue_sec FROM dispatch_tasks WHERE dispatched_at IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY project"

# 4. Rate limit actual y configuración
grep "DISPATCH_RATE_LIMIT\|DISPATCH_WINDOW" "$REPO/relay/master.js" | head -5

# 5. Proyectos con fast-poll (3s) vs normal (15s)
python3 -c "
import json
with open('$REPO/relay/projects.json') as f: ps = json.load(f)
fast = [p['id'] for p in ps if p.get('ignore_quiet_hours') and p.get('active')]
slow = [p['id'] for p in ps if not p.get('ignore_quiet_hours') and p.get('active')]
print(f'Fast poll (3s): {fast}')
print(f'Normal poll (15s): {slow}')
"
```

**Rúbrica:**
- 10: múltiples proyectos paralelos confirmados, queue drain <30s, DISPATCH_PARALLEL activo
- 7: paralelo entre 2-3 proyectos, queue <60s
- 4: ejecución serial efectiva (1 tarea a la vez)
- 0: sin paralelismo o tareas bloqueando la cola

**Brecha vs Claude Code:** CC es single-threaded (1 sesión). Relay puede correr 6+ proyectos en paralelo. Relay +4 en batch.

---

### D15 · Memoria semántica (Semantic memory compaction)

**¿Qué mide:** Calidad de agent-memory.md, tasa de actualización, relevancia del
contenido, gestión del tamaño para evitar context overflow.

```bash
# 1. agent-memory.md existe y tiene contenido
exec_s "find /var/www/html/vilarkptl.com/ai-monitor/relay/workspaces -name 'agent-memory.md' -exec wc -l {} \\;" 2>/dev/null

# 2. Número de entradas de memoria por proyecto
exec_s "for f in /var/www/html/vilarkptl.com/ai-monitor/relay/workspaces/*/relay/agent-memory.md; do echo \"\$f:\"; grep -c '^## ' \"\$f\" 2>/dev/null || echo 0; done"

# 3. Últimas entradas de memoria (¿son relevantes?)
exec_s "tail -20 /var/www/html/vilarkptl.com/ai-monitor/relay/workspaces/ai-monitor/relay/agent-memory.md 2>/dev/null || echo 'no existe'"

# 4. Tamaño de agent-memory.md (riesgo de context overflow si >50KB)
exec_s "find /var/www/html/vilarkptl.com -name 'agent-memory.md' -exec ls -lh {} \\;"

# 5. loadAgentMemory — cap de entradas en código
grep "maxEntries\|slice.*maxEntries\|last.*15\|last.*maxEnt" "$REPO/relay/master.js" | head -3

# 6. Prompt de memoria en runClaude
grep -A3 "agentMem\|agent_mem\|loadAgentMemory" "$REPO/relay/master.js" | head -10
```

**Rúbrica:**
- 10: memoria existe y se actualiza en cada tarea, cap ≤15 entradas (evita overflow),
  entradas relevantes y concisas (< 200 chars/línea)
- 7: memoria existe, actualización frecuente pero sin cap
- 4: memoria existe pero sin actualización automática
- 0: sin memoria persistente entre sesiones

**Brecha vs Claude Code:** CC tiene `--resume` con historial completo (mejor).
Relay tiene memoria estructurada + compactada (más eficiente en tokens).

---

### D16 · Inyección de contexto (Context injection)

**¿Qué mide:** Calidad y completitud de los archivos agents/*.md, plan.md,
inyección de budget, inyección de inbox template, correctness del sistema prompt.

```bash
# 1. Archivos agents/*.md existentes
ls -la "$REPO/relay/agents/" 2>/dev/null

# 2. Tamaño y calidad de cada agent context
wc -l "$REPO/relay/agents/"*.md 2>/dev/null | sort -rn | head -10

# 3. Proyectos SIN archivo de contexto
python3 -c "
import json, os
with open('$REPO/relay/projects.json') as f: ps = json.load(f)
agents_dir = '$REPO/relay/agents'
for p in ps:
    if not p.get('active'): continue
    has_ctx = os.path.exists(f'{agents_dir}/{p[\"id\"]}.md')
    print(f'{p[\"id\"]}: {\"✅\" if has_ctx else \"❌ SIN CONTEXTO\"}')"

# 4. Inyección del outbox template en dispatches
grep -c "OUTBOX_TEMPLATE\|ASK: " "$REPO/relay/master.js"

# 5. Inyección de budget en sub-tareas (coordinador)
grep "budget_usd_max\|BUDGET_SUB_FRACTION" "$REPO/relay/master.js" | head -4

# 6. Inyección de memoria en runClaude
grep -n "agentMem\|agentCtx\|agentPlan" "$REPO/relay/master.js" | grep -v "function\|const " | head -6
```

**Rúbrica:**
- 10: todos los proyectos con agents/*.md, plan.md dinámico, budget inyectado,
  outbox template en cada dispatch, memoria en prompt
- 7: >70% proyectos con contexto, outbox template presente
- 4: contexto estático solo para algunos proyectos
- 0: sin contexto especializado por agente

**Brecha vs Claude Code:** CC usa CLAUDE.md global. Relay tiene per-agent context.
Relay +2 en especialización, CC +1 en actualización automática del contexto.

---

### D17 · RAG (Retrieval-Augmented Generation)

**¿Qué mide:** Capacidad de recuperar información relevante del codebase para
contexto de tareas. Incluye búsqueda de código, documentos, historial de errores.

```bash
# 1. search_code tool — capacidad de grep contextual
node -e "
const {executeTool} = require('$REPO/relay/tools-server');
executeTool('search_code', {pattern:'extractQualityMetrics', context_lines:2}, {repoBase:'$REPO'})
  .then(r => console.log(r.slice(0,300)));
" 2>&1

# 2. list_directory — exploración de estructura
node -e "
const {executeTool} = require('$REPO/relay/tools-server');
executeTool('list_directory', {path:'relay'}, {repoBase:'$REPO'})
  .then(r => console.log(r.slice(0,300)));
" 2>&1

# 3. Historial de errores en agent-memory (RAG proxy)
exec_s "grep -i 'error\|falló\|fix\|arreglé' /var/www/html/vilarkptl.com/ai-monitor/relay/workspaces/ai-monitor/relay/agent-memory.md 2>/dev/null | head -10"

# 4. Claude Code MCP integrations (vector DB, RAG nativo) — comparar
echo "=== RAG disponible en Claude Code ==="
echo "- search_code (Grep built-in) con regex"
echo "- WebFetch para documentación externa"
echo "- mcp__github__search_code (semántico en GitHub)"
echo "- Agent tool para sub-búsquedas paralelas"
echo "- Sin vector DB nativo (RAG requiere MCP externo)"
echo ""
echo "=== RAG disponible en relay ==="
echo "- search_code (grep -rn) ← equivalente"
echo "- http_get para documentación"
echo "- agent-memory.md como memoria episódica"
echo "- Sin vector DB, sin embeddings"
```

**Rúbrica:**
- 10: búsqueda semántica en codebase, vector DB con embeddings, historial de errores indexado
- 7: grep efectivo + memoria episódica + documentación fetcheable
- 4: solo grep sin contexto semántico
- 0: sin capacidad de búsqueda en el codebase

**Gap crítico:** Sin embeddings ni vector DB. Ambos (CC y relay) dependen de grep.
CC tiene ventaja por MCP servers opcionales (Pinecone, Chroma).

---

### D18 · Token caching por modelo

**¿Qué mide:** Tasa de cache hit por proveedor, ahorro real en tokens,
estructura del prompt para maximizar caching.

```bash
# 1. Datos de cache de la DB
db "SELECT api_provider, SUM(total_input_tokens) AS input_tok, SUM(total_output_tokens) AS output_tok, COUNT(*) AS sessions FROM agent_sessions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY api_provider"

# 2. Revisión de cache headers en runClaude (Anthropic prompt caching)
grep -n "cache_control\|cache_type\|ephemeral\|prompt_caching\|beta.*cache" "$REPO/relay/master.js" | head -10
grep -n "cache_control\|cache_type\|ephemeral" "$REPO/relay/tools-server.js" | head -5

# 3. Estructura de prompt para caching (system prompt fijo = cacheable)
echo "=== Longitud del system prompt en runClaude ==="
node -e "
const fs = require('fs');
const m = fs.readFileSync('$REPO/relay/master.js','utf8');
const match = m.match(/systemPrompt\s*=\s*\`([^\`]{200,})/);
if (match) console.log('System prompt chars:', match[1].length, '(>1024 = cacheable en Anthropic)');
" 2>&1

# 4. Modelos y sus políticas de caché
echo "=== Soporte de caché por modelo ==="
echo "claude-sonnet-4-6:     ✅ prompt caching (>1024 tokens de system)"
echo "claude-haiku-4-5:      ✅ prompt caching"
echo "deepseek-chat:         ❌ sin prompt caching nativo"
echo "gemini-1.5-flash:      ✅ context caching (>32k tokens)"
echo ""
echo "Estado actual: ¿relay usa cache_control en headers de API?"
grep -c "cache_control" "$REPO/relay/master.js"
```

**Rúbrica:**
- 10: `cache_control: ephemeral` en todos los mensajes Anthropic, cache hit >60%, análogos en Gemini
- 7: caching activado en Anthropic, sin Gemini
- 4: sin caching activo pero system prompt estructurado para cachearlo
- 0: sin caching, regenerando contexto completo cada llamada

**Gap:** Si `cache_control` = 0 en master.js → es una optimización pendiente de alto impacto
(reduce costo Anthropic ~90% en tokens de entrada repetidos).

---

### D19 · Comparación integral vs Claude Code

Tabla de puntos de comparación directos. Usar los scores de D1-D18 para calcular.

```bash
# Recuento final — llenar con los scores obtenidos arriba
python3 << 'EOF'
dimensiones = [
    ("D1  Seguridad",                  0, 0),   # (nombre, score_relay, score_cc)
    ("D2  Frontend",                   0, 0),
    ("D3  Backend",                    0, 0),
    ("D4  Estabilidad",                0, 0),
    ("D5  Escalabilidad",              0, 0),
    ("D6  Tasa de éxito",              0, 0),
    ("D7  Multi-agente",               0, 0),
    ("D8  Costo-eficiencia",           0, 0),
    ("D9  Calidad del código",         0, 0),
    ("D10 Calidad de respuestas",      0, 0),
    ("D11 Tool calling quality",       0, 0),
    ("D12 Available tools",            0, 0),
    ("D13 Tool quality",               0, 0),
    ("D14 Batch processing",           0, 0),
    ("D15 Semantic memory",            0, 0),
    ("D16 Context injection",          0, 0),
    ("D17 RAG",                        0, 0),
    ("D18 Token caching",              0, 0),
]

# Pesos de cada dimensión (total = 1.0)
pesos = {
    "D6  Tasa de éxito":         0.12,
    "D11 Tool calling quality":  0.08,
    "D4  Estabilidad":           0.08,
    "D3  Backend":               0.07,
    "D9  Calidad del código":    0.07,
    "D7  Multi-agente":          0.07,
    "D8  Costo-eficiencia":      0.06,
    "D12 Available tools":       0.06,
    "D13 Tool quality":          0.06,
    "D1  Seguridad":             0.05,
    "D2  Frontend":              0.05,
    "D5  Escalabilidad":         0.05,
    "D10 Calidad de respuestas": 0.05,
    "D14 Batch processing":      0.04,
    "D15 Semantic memory":       0.04,
    "D16 Context injection":     0.04,
    "D17 RAG":                   0.03,
    "D18 Token caching":         0.02,
}

print(f"{'Dimensión':<32} {'Relay':>6} {'CC':>6} {'Brecha':>8} {'Peso':>6}")
print("─" * 65)
relay_total = cc_total = 0
for nombre, relay, cc in dimensiones:
    peso = pesos.get(nombre, 0.05)
    brecha = relay - cc
    relay_total += relay * peso
    cc_total    += cc * peso
    bar = "▲" if brecha > 0 else ("▼" if brecha < 0 else "=")
    print(f"{nombre:<32} {relay:>6.1f} {cc:>6.1f} {bar}{abs(brecha):>6.1f}  {peso*100:>4.0f}%")

print("─" * 65)
print(f"{'SCORE PONDERADO':<32} {relay_total:>6.1f} {cc_total:>6.1f} {'▲' if relay_total > cc_total else '▼'}{abs(relay_total-cc_total):>6.1f}")
print()
print("Interpretación:")
print("  ≥8.5: Sistema supera a Claude Code en este dominio")
print("  7-8.4: A la par — diferencias menores de workflow")
print("  5-6.9: Brecha manejable — mejoras claras disponibles")
print("  <5:    Brecha crítica — requiere trabajo inmediato")
EOF
```

**Referencia — Claude Code scores esperados:**

| Dimensión | CC Score | Justificación |
|-----------|----------|---------------|
| Seguridad | 8 | sin exec remoto, pero sin auth dashboard |
| Frontend | N/A | no tiene dashboard |
| Backend | 9 | proceso local, sin latencia de red |
| Estabilidad | 9 | sesión interactiva, usuario supervisa |
| Escalabilidad | 4 | single-thread, 1 sesión a la vez |
| Tasa de éxito | 9.5 | usuario supervisa y corrige en tiempo real |
| Multi-agente | 3 | sin coordinación autónoma |
| Costo-eficiencia | 7 | Max = $0 marginal, sin overhead relay |
| Calidad código | 8.5 | herramientas precisas, usuario revisa |
| Calidad respuestas | 7 | natural language, no structured |
| Tool calling | 9 | herramientas nativas optimizadas |
| Available tools | 9 | 15+ built-ins + MCP extensible |
| Tool quality | 9 | sin límite de output, paginación nativa |
| Batch processing | 3 | single-session, no parallel agents |
| Semantic memory | 7 | `--resume` con historial completo |
| Context injection | 8 | CLAUDE.md global, per-project settings |
| RAG | 6 | Grep + WebSearch + MCP opcionales |
| Token caching | 7 | CC maneja caching automáticamente |

---

## Reporte final

Al terminar todas las mediciones, generar un reporte con este formato:

```
═══════════════════════════════════════════════════════
  EVALUACIÓN RELAY SYSTEM — [fecha]
═══════════════════════════════════════════════════════

SCORE GLOBAL RELAY:    X.X / 10
SCORE GLOBAL CC REF:   X.X / 10
DIFERENCIA:            ±X.X (relay [supera/está por debajo] X%)

TOP 3 FORTALEZAS RELAY:
  1. [dimensión] — X/10 (vs CC X/10) ▲+X
  2. ...
  3. ...

TOP 3 BRECHAS CRÍTICAS:
  1. [dimensión] — X/10 (vs CC X/10) ▼-X
     Acción: [qué implementar]
  2. ...
  3. ...

DIMENSIONES ≥8 (relay supera o iguala a CC):
  [lista]

DIMENSIONES <6 (requieren atención):
  [lista con acción propuesta]

PRÓXIMO HITO PARA SUPERAR A CC:
  [la dimensión de mayor impacto ponderado con menor score]
═══════════════════════════════════════════════════════
```

---

## Notas de ejecución

- **Tiempo estimado:** 25-40 min para evaluación completa
- **Puede ejecutarse parcialmente:** cada sección D1-D19 es independiente
- **Datos mínimos requeridos:** al menos 7 días de dispatch_tasks en DB
- **Periodicidad recomendada:** cada sprint (2 semanas) o tras cambios mayores
- **Argumento opcional:** `/test D6` para evaluar solo una dimensión por nombre
