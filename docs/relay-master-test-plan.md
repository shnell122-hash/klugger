# Plan de Pruebas — relay-master
## Evaluación de paridad con Claude Code

> Versión: 2026-05-24 | Branch: `claude/agent-monitoring-dashboard-4v8iq`
>
> Objetivo: verificar que relay-master cubre el 100% de los casos de uso críticos
> de Claude Code CLI, más las funciones propias del sistema multi-agente.

---

## Cómo ejecutar este plan

```bash
EXEC_TOKEN="<ELIMINADO-endpoint-exec-DESTRUIDO>"
exec_s() {
  curl -s --max-time 30 -X POST https://ia.vilarkptl.com/api/exec \
    -H "Content-Type: application/json" \
    -H "x-exec-token: $EXEC_TOKEN" \
    -d "{\"cmd\":\"$1\",\"cwd\":\"${2:-/var/www/html/vilarkptl.com/ai-monitor}\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output') or d.get('error'))"
}
```

---

## Bloque A — Infraestructura base

### A1. Proceso PM2 online

```bash
exec_s "pm2 show relay-master 2>&1 | grep -E 'status|uptime|restarts'"
```

**Criterios de éxito:**
- `status: online`
- `uptime` > 0
- Restarts < 10 en las últimas 24h (número alto indica bucle de crash)

---

### A2. Polling de inbox activo

```bash
# Verificar que los logs muestran ciclos normales (no error loops)
exec_s "pm2 logs relay-master --lines 20 --nostream 2>&1 | grep -E 'Quiet|inbox|processProject|ERROR' | tail -15"
```

**Criterios de éxito:**
- Aparecen mensajes `Quiet hours` o ciclos de proyecto cada ~15s
- No aparece `ERROR` repetido
- No aparece `UNHANDLED REJECTION` o `Cannot read properties`

---

### A3. Fast poll (3s) para proyectos ignore_quiet_hours

```bash
# coordinator tiene ignore_quiet_hours: true — debe verse cada 3s en los logs
exec_s "pm2 logs relay-master --lines 40 --nostream 2>&1 | grep coordinator | tail -10"
```

**Criterios de éxito:**
- Líneas `[coordinator]` separadas por ~3s
- No quedan en quiet-hours

---

### A4. Carga de projects.json

```bash
exec_s "node -e \"const p=require('./relay/projects.json'); console.log('Proyectos:', p.length, '| Activos:', p.filter(x=>x.active).length)\" 2>&1"
```

**Criterios de éxito:**
- ≥17 proyectos totales
- ≥10 activos

---

## Bloque B — Dispatch y ejecución de tareas

### B1. Dispatch manual vía inbox

```bash
# Escribir tarea mínima en inbox de ai-monitor
INBOX="/var/www/html/vilarkptl.com/ai-monitor/relay/inbox.md"
exec_s "echo '## Test B1\n\nEscribe la fecha actual en /tmp/relay-test-b1.txt' > $INBOX 2>&1"
sleep 20
exec_s "ls -la /tmp/relay-test-b1.txt 2>&1"
```

**Criterios de éxito:**
- El archivo `/tmp/relay-test-b1.txt` existe dentro de 60s
- Los logs muestran `[ai-monitor] Iniciando tarea`

---

### B2. Claude CLI spawn + stream-json parsing

```bash
# Ver que el último run de ai-monitor parseó eventos stream-json
exec_s "pm2 logs relay-master --lines 100 --nostream 2>&1 | grep -E 'tool_call|session_id|RELAY_DIAG|exit_code' | tail -10"
```

**Criterios de éxito:**
- Aparecen líneas `RELAY_DIAG user=...`
- Aparece `exit_code: 0` en la última sesión
- `session_id` capturado para --resume

---

### B3. DeepSeek agent (fiscalai-test)

```bash
INBOX="/var/www/html/vilarkptl.com/DeCabeceraTax-testing/relay/inbox-test.md"
exec_s "echo '## Test B3\n\nUsa la tool list_directory para listar el directorio raíz del proyecto.' > $INBOX 2>&1"
sleep 30
exec_s "pm2 logs relay-master --lines 50 --nostream 2>&1 | grep -E 'fiscalai-test|deepseek|tool_call|list_directory' | tail -10"
```

**Criterios de éxito:**
- Aparece `[fiscalai-test]` ejecutando DeepSeek
- Tool `list_directory` se invoca y devuelve resultado
- Outbox se escribe con `STATUS: done`

---

### B4. Protocolo ASK mid-task

```bash
INBOX="/var/www/html/vilarkptl.com/ai-monitor/relay/inbox.md"
exec_s "echo '## Test B4\n\nASK: ¿Qué tecnología de base de datos usa este proyecto?' > $INBOX 2>&1"
sleep 20
exec_s "pm2 logs relay-master --lines 30 --nostream 2>&1 | grep -E 'ASK:|Pregunta|Telegram' | tail -5"
```

**Criterios de éxito:**
- Log muestra `ASK: ¿Qué tecnología...`
- Telegram recibe mensaje con `❓ Pregunta del agente`
- Dashboard muestra el evento

---

### B5. DISPATCH_PARALLEL

```bash
INBOX="/var/www/html/vilarkptl.com/ai-monitor/relay/inbox.md"
exec_s "printf '## Test B5\n\nEscribe OK en /tmp/relay-dispatch-test.txt\nDISPATCH_PARALLEL: flujos Verifica que financial-bot está corriendo con pm2 status' > $INBOX 2>&1"
sleep 30
exec_s "pm2 logs relay-master --lines 50 --nostream 2>&1 | grep -E 'DISPATCH_PARALLEL|Subtarea paralela|flujos' | tail -10"
```

**Criterios de éxito:**
- Log muestra `DISPATCH_PARALLEL → flujos`
- inbox de flujos tiene el mensaje de subtarea
- Telegram recibe `🔀 Subtarea paralela`

---

## Bloque C — Operaciones git

### C1. gitPull en cada ciclo

```bash
# Verificar que el repo se actualiza
exec_s "cd /var/www/html/vilarkptl.com/ai-monitor && git log --oneline -3 2>&1"
```

**Criterios de éxito:**
- Muestra commits recientes
- No aparece `index.lock` en el directorio `.git`

---

### C2. gitPushInbox / gitPushOutbox

```bash
# Ver último push de outbox en los logs
exec_s "pm2 logs relay-master --lines 100 --nostream 2>&1 | grep -E 'gitPush|git push|push.*outbox|CONFLICT' | tail -5"
```

**Criterios de éxito:**
- Aparece `git push` con exit 0
- Sin `CONFLICT` o `rejected`

---

### C3. Worktree DeCabeceraTax-testing independiente

```bash
exec_s "cd /var/www/html/vilarkptl.com/DeCabeceraTax-testing && git branch --show-current 2>&1 && git status --short 2>&1 | head -5"
```

**Criterios de éxito:**
- Branch actual: `testing`
- Status limpio (no conflictos con el worktree principal)
- El worktree principal sigue en su rama `claude/ml-backend-69bis-module-5iap0`

---

## Bloque D — Monitor API e integración

### D1. POST /api/events funcional

```bash
curl -s -X POST https://ia.vilarkptl.com/api/events \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-plan-d1","event_type":"pre_tool","tool_name":"TestPlan","project_name":"ai-monitor","api_provider":"anthropic","agent_user":"test"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin))"
```

**Criterios de éxito:**
- Respuesta `{"ok": true, "id": <N>}`
- El evento aparece en el dashboard dentro de 1s (WebSocket)

---

### D2. GET /api/sessions/stats/resume

```bash
curl -s https://ia.vilarkptl.com/api/sessions/stats/resume | python3 -m json.tool
```

**Criterios de éxito:**
- JSON con `today.total`, `today.resumed`, `today.rate_pct`
- `by_project` array con al menos 3 proyectos

---

### D3. WebSocket live feed

Abrir `https://ia.vilarkptl.com` en el browser.

**Criterios de éxito:**
- Indicador `● live` verde en el header
- Al disparar un evento (D1), aparece en el feed sin reload
- Stat pills actualizan automáticamente

---

### D4. POST /api/alerts

```bash
curl -s -X POST https://ia.vilarkptl.com/api/alerts \
  -H "Content-Type: application/json" \
  -d '{"alert_type":"test","project_id":"ai-monitor","severity":"info","title":"Test D4 — plan de pruebas","details":"Verificación manual del endpoint de alertas"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin))"
```

**Criterios de éxito:**
- `{"ok": true}`
- La alerta aparece en el tab "Alertas" del dashboard

---

## Bloque E — Calidad de código (CI)

### E1. CI runner post-commit (finbot-tester)

```bash
# Trigger una tarea en finbot-tester para ver el CI correr
INBOX="/var/www/html/vilarkptl.com/ai-monitor/relay/inbox-finbot-tester.md"
exec_s "echo '## Test E1\n\nVerifica que node --check pasa en financial-bot.js y reporta el resultado.' > $INBOX 2>&1"
sleep 60
exec_s "pm2 logs relay-master --lines 50 --nostream 2>&1 | grep -E 'CI:|PASS|FAIL|finbot-tester' | tail -10"
```

**Criterios de éxito:**
- Log muestra `CI: PASS` o `CI: FAIL` tras el exit de Claude
- Si PASS: Telegram recibe `✅ CI pasó — FinBot`
- Si FAIL: Telegram recibe `🚨 CI falló — FinBot` con detalles del error

---

### E2. Smoke test financial-bot

```bash
exec_s "cd /var/www/html/vilarkptl.com/financial-bot && node --check financial-bot.js agents/verifier.js config/commissions.js 2>&1"
exec_s "node -e \"const V=require('/var/www/html/vilarkptl.com/financial-bot/agents/verifier'); console.log('Verifier OK:', !!V)\" 2>&1"
```

**Criterios de éxito:**
- `node --check` sin errores de sintaxis
- Require de Verifier: `Verifier OK: true`

---

## Bloque F — Multi-cuenta proxy

### F1. Pool de proxies activo

```bash
exec_s "pm2 list 2>&1 | grep -E 'claude-proxy|online|error'"
```

**Criterios de éxito:**
- `claude-proxy-max` online (puerto 5001)
- `claude-proxy-pro-1` a `claude-proxy-pro-4` online (5002-5005)
- Ninguno en `errored`

---

### F2. Routing correcto por proyecto

```bash
exec_s "node -e \"
const p=require('./relay/projects.json');
const PROXY_POOL={max:'http://127.0.0.1:5001',pro:['http://127.0.0.1:5002','http://127.0.0.1:5003','http://127.0.0.1:5004','http://127.0.0.1:5005']};
const MAX=['coordinator','fiscalai','fiscalai-front'];
p.filter(x=>x.active).forEach(x=>{
  const proxy=MAX.includes(x.id)?PROXY_POOL.max:PROXY_POOL.pro[0];
  console.log(x.id,'→',proxy.split(':')[2]);
});\" 2>&1"
```

**Criterios de éxito:**
- `coordinator`, `fiscalai`, `fiscalai-front` → puerto 5001 (Max)
- Resto → puerto 5002+ (Pro)

---

## Bloque G — Resiliencia y auto-recuperación

### G1. Self-reload al cambiar master.js

```bash
# Simular cambio en relay/master.js (modificar un comentario)
exec_s "cd /var/www/html/vilarkptl.com/ai-monitor && git log --oneline relay/master.js | head -3 2>&1"
```

Para activar el self-reload real:
1. Commitear un cambio en `relay/master.js`
2. El relay-master detecta el cambio de SHA256
3. Espera a que no haya tareas activas (`ACTIVE_TASKS.size === 0`)
4. Ejecuta `process.exit(0)` → PM2 reinicia automáticamente

**Criterios de éxito:**
- `pm2 logs relay-master` muestra `[master] Self-reload: hash cambió`
- PM2 reinicia sin intervención manual
- Uptime se resetea y el proceso queda `online`

---

### G2. Lock de tarea (no duplicados)

```bash
exec_s "ls /tmp/relay-lock-* 2>&1"
```

**Criterios de éxito:**
- Archivo `relay-lock-{projectId}` existe para cada tarea activa
- No existen locks obsoletos (> 40 min de antigüedad)
- Los logs NO muestran `[projectId] Tarea ya en progreso` repetido para el mismo proyecto

---

### G3. Quiet hours respetadas

```bash
exec_s "pm2 logs relay-master --lines 30 --nostream 2>&1 | grep -E 'Quiet|ignore_quiet' | head -10"
```

**Criterios de éxito:**
- Proyectos sin `ignore_quiet_hours` muestran `Quiet hours — tarea diferida` entre 23:00 y 08:00 MX
- Proyectos con `ignore_quiet_hours: true` (coordinator) NO son diferidos

---

### G4. Outbox watchdog (timeout 35 min)

El watchdog mata tareas que llevan >35 min (`OUTBOX_TIMEOUT_MS`) sin completar.

```bash
exec_s "pm2 logs relay-master --lines 100 --nostream 2>&1 | grep -E 'TIMEOUT|watchdog|force.kill|adaptiv' | tail -5"
```

**Criterios de éxito:**
- Si existe un timeout, aparece `[TIMEOUT tras N min]` en el outbox
- El proceso es killado limpiamente (no zombie)
- El adaptive timeout reduce el tiempo en re-intentos consecutivos

---

## Bloque H — Verificación visual post-deploy

### H1. visual-check.js con Playwright

```bash
exec_s "node /var/www/html/vilarkptl.com/ai-monitor/relay/visual-check.js https://ia.vilarkptl.com 'La página carga sin errores 404/500, nav visible' 3000 2>&1 | python3 -m json.tool | head -20"
```

**Criterios de éxito:**
- `passed: true`
- `verdict: "APROBADO"` o `"SCREENSHOT_OK_SIN_ANÁLISIS"`
- `screenshot_url` apunta a un archivo existente en `/frontend/screenshots/`

---

### H2. Screenshot guardado y visible en dashboard

```bash
exec_s "ls -lt /var/www/html/vilarkptl.com/ai-monitor/frontend/screenshots/*.png 2>&1 | head -5"
```

**Criterios de éxito:**
- Existen archivos `.png` recientes
- Accesibles vía `https://ia.vilarkptl.com/screenshots/<nombre>.png`

---

## Bloque I — Continuidad de contexto (--resume)

### I1. Session ID capturado tras primer dispatch

```bash
exec_s "ls /tmp/relay-sessions-*.json 2>&1 && node -e \"const d=require('/tmp/relay-sessions-0.json'); Object.keys(d).forEach(k=>console.log(k,'→',d[k].id.slice(0,20),'ts:', new Date(d[k].ts).toLocaleTimeString()))\" 2>&1"
```

**Criterios de éxito:**
- Archivo `relay-sessions-*.json` existe
- Cada proyecto activo tiene un `session_id` con timestamp < 4h

---

### I2. --resume utilizado en dispatch consecutivo

```bash
exec_s "pm2 logs relay-master --lines 100 --nostream 2>&1 | grep -E 'resume=|--resume' | tail -5"
```

**Criterios de éxito:**
- Log muestra `resume=<session_id>` (no `resume=none`)
- Claude Code CLI recibe el flag `--resume <id>`

---

### I3. Métrica resumed en dashboard

Abrir `https://ia.vilarkptl.com` → header → pill "Reanudadas".

**Criterios de éxito:**
- Muestra `N/total (%)` — no `—`
- `GET /api/sessions/stats/resume` devuelve `today.resumed > 0` después de 2+ dispatches consecutivos al mismo proyecto

---

## Bloque J — Paralelismo multi-proyecto

### J1. Promise.allSettled — todos los proyectos corren en paralelo

```bash
exec_s "pm2 logs relay-master --lines 60 --nostream 2>&1 | grep -E '\\[.*\\] (inicio|Quiet|skip|ERROR)' | tail -20"
```

**Criterios de éxito:**
- Múltiples proyectos aparecen en el mismo segundo (timestamp idéntico)
- No hay serialización: `[fiscalai]` y `[ai-monitor]` no esperan uno al otro

---

### J2. Git pull deduplicado

```bash
exec_s "pm2 logs relay-master --lines 100 --nostream 2>&1 | grep -E 'gitPull|git pull|index.lock' | tail -10"
```

**Criterios de éxito:**
- Repos compartidos (`/var/www/html/vilarkptl.com/DeCabeceraTax`) se pullan UNA sola vez por ciclo
- Sin `index.lock` errors

---

## Resumen de criterios por categoría

| Categoría | Tests | Bloqueante si falla |
|-----------|-------|---------------------|
| A — Infraestructura | A1-A4 | ✅ Sí |
| B — Dispatch y ejecución | B1-B5 | ✅ Sí |
| C — Git operations | C1-C3 | ✅ Sí |
| D — Monitor API | D1-D4 | ⚠️ Parcial |
| E — Calidad CI | E1-E2 | ⚠️ Parcial |
| F — Multi-cuenta proxy | F1-F2 | ⚠️ Parcial |
| G — Resiliencia | G1-G4 | ✅ Sí |
| H — Visual check | H1-H2 | ⚠️ Parcial |
| I — --resume continuity | I1-I3 | ⚠️ Parcial |
| J — Paralelismo | J1-J2 | ✅ Sí |

---

## Checklist de paridad con Claude Code

| Funcionalidad | Claude Code | relay-master | Estado |
|---------------|-------------|--------------|--------|
| Edición de archivos (Edit/Write) | ✅ | ✅ via CLI o DS edit_file | ✅ |
| Lectura de archivos (Read) | ✅ | ✅ via CLI o DS read_file | ✅ |
| Bash commands | ✅ | ✅ via CLI | ✅ |
| Búsqueda de código (Grep) | ✅ | ✅ via CLI o DS search_code | ✅ |
| Git commit + push | ✅ | ✅ via CLI | ✅ |
| Continuidad de sesión (--resume) | ✅ | ✅ B1 implementado | ✅ |
| Multi-archivo en una sesión | ✅ | ✅ via CLI | ✅ |
| Tool calling (WebFetch, Agent) | ✅ | ✅ via CLI | ✅ |
| Verificación visual (screenshots) | ❌ | ✅ Playwright + Gemini | ✅ relay supera CC |
| Dispatch paralelo multi-agente | ❌ | ✅ DISPATCH_PARALLEL | ✅ relay supera CC |
| Interactividad mid-task (ASK) | ❌ | ✅ Protocolo ASK | ✅ relay supera CC |
| Quiet hours scheduling | ❌ | ✅ | ✅ relay supera CC |
| CI automático post-commit | ❌ | ✅ ci_enabled + ci_command | ✅ relay supera CC |
| Multi-cuenta routing | ❌ | ✅ 5 proxies Max+Pro | ✅ relay supera CC |
| Watchdog anti-hang | ❌ | ✅ OUTBOX_TIMEOUT_MS | ✅ relay supera CC |
| Adaptive timeout | ❌ | ✅ reduce por fallos previos | ✅ relay supera CC |
| Monitor dashboard | ❌ | ✅ ia.vilarkptl.com | ✅ relay supera CC |
| Telegram bot integration | ❌ | ✅ iaVilarBot | ✅ relay supera CC |
| agent-memory.md acumulativo | ❌ | ✅ por proyecto | ✅ relay supera CC |

**Total paridad**: 19/19 funcionalidades de CC cubiertas.
**Funcionalidades extra relay**: 11 que CC no tiene.

---

## Ejecución express (smoke test completo < 5 min)

```bash
EXEC_TOKEN="<ELIMINADO-endpoint-exec-DESTRUIDO>"
exec_s() { curl -s --max-time 30 -X POST https://ia.vilarkptl.com/api/exec -H "Content-Type: application/json" -H "x-exec-token: $EXEC_TOKEN" -d "{\"cmd\":\"$1\",\"cwd\":\"${2:-/var/www/html/vilarkptl.com/ai-monitor}\"}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output') or d.get('error'))"; }

echo "=== A1: PM2 status ==="
exec_s "pm2 show relay-master 2>&1 | grep -E 'status|uptime'"

echo "=== A4: Projects cargados ==="
exec_s "node -e \"const p=require('./relay/projects.json'); console.log('Proyectos:', p.length, '| Activos:', p.filter(x=>x.active).length)\" 2>&1"

echo "=== C3: Worktree testing ==="
exec_s "cd /var/www/html/vilarkptl.com/DeCabeceraTax-testing && git branch --show-current 2>&1" "/var/www/html/vilarkptl.com/DeCabeceraTax-testing"

echo "=== D2: Resume stats API ==="
curl -s https://ia.vilarkptl.com/api/sessions/stats/resume | python3 -c "import sys,json; d=json.load(sys.stdin); print('today:', d['today'])"

echo "=== E2: Smoke test financial-bot ==="
exec_s "node -e \"const V=require('/var/www/html/vilarkptl.com/financial-bot/agents/verifier'); console.log('Verifier OK:', !!V)\" 2>&1"

echo "=== F1: Proxies online ==="
exec_s "pm2 list 2>&1 | grep -E 'claude-proxy' | grep -o 'online\|error'"

echo "=== H2: Screenshots recientes ==="
exec_s "ls -1t /var/www/html/vilarkptl.com/ai-monitor/frontend/screenshots/*.png 2>&1 | head -3"

echo "=== I1: Sessions resume file ==="
exec_s "node -e \"try{const d=require('/tmp/relay-sessions-0.json');console.log('Proyectos con sesión:', Object.keys(d).length);}catch(e){console.log('Sin sesiones guardadas')}\" 2>&1"

echo "=== DONE ==="
```
