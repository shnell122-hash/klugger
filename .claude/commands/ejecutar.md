# /ejecutar — Continuación autónoma del roadmap

Lee el estado real del sistema, determina el siguiente ítem de mayor impacto y lo ejecuta completamente.

---

## PASO 1 — Leer estado actual del roadmap y sprints

```bash
# Variables de entorno para toda la sesión
EXEC_TOKEN="cb5871c0aa6ccd67997237c5238017753c0b35bdd7167b56e226aff25bcbf67a"
EXEC_URL="https://ia.vilarkptl.com/exec-lite"
REPO="/home/user/agentic-repo"

exec_s() {
  local CMD="$1" CWD="${2:-/var/www/html/vilarkptl.com/ai-monitor}"
  local BODY
  BODY=$(python3 -c "import sys,json; print(json.dumps({'cmd':sys.argv[1],'cwd':sys.argv[2]}))" "$CMD" "$CWD")
  curl -s --max-time 30 -X POST "$EXEC_URL" \
    -H "Content-Type: application/json" -H "x-exec-token: $EXEC_TOKEN" -d "$BODY" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output') or d.get('error','(sin output)'))"
}

db() {
  exec_s "mysql -u root -pxGRP4XiFROfcF5tn9N71 ai_monitoring -N -e \"$1\" 2>/dev/null"
}
```

Lee estos archivos para entender el contexto completo:
- `ROADMAP.md` — fases y estado general
- `docs/TEST-REPORT-2026-05-29.md` — plan de 4 sprints con impacto medido

---

## PASO 2 — Detectar qué está hecho y qué no

Ejecuta estas verificaciones para determinar el estado real (no asumas nada del roadmap):

```bash
# ── Estado de commits recientes ──
git -C "$REPO" log --oneline -10

# ── Sprint 1 (ya hecho si el commit existe) ──
git -C "$REPO" log --oneline | grep -c "sprint1"

# ── Índices SQL (Sprint 2 Fix 4) — ¿existen ya? ──
exec_s "mysql -u root -pxGRP4XiFROfcF5tn9N71 ai_monitoring -N -e \"SHOW INDEX FROM dispatch_tasks\" 2>/dev/null | grep -E 'status_created|project_created'"

# ── agent_events size ──
db "SELECT ROUND(data_length/1024/1024,1) AS mb FROM information_schema.tables WHERE table_schema='ai_monitoring' AND table_name='agent_events'"

# ── Swap actual ──
exec_s "free -h | grep Swap"

# ── PM2 errored processes ──
exec_s "pm2 status 2>&1 | grep 'errored'"

# ── Session resume tracking ──
grep -n "SESSION_MAX_AGE_MS" "$REPO/relay/master.js" | head -3

# ── Token cache tracking ──
grep -n "cache_read_tokens.*stream\|total_cache_read\|cache.*post\|accumulate.*cache" "$REPO/relay/master.js" | head -5

# ── P2.2 A/B panel ──
grep -rn "ab.*panel\|comparison.*panel\|a.b.*comparison" "$REPO/frontend/js/dashboard.js" | head -3

# ── migrate-v19 ──
ls "$REPO/backend/db/migrate-v19.sql" 2>/dev/null || echo "no existe"

# ── Playwright visual-check ──
grep -n "playwright.chromium.launch\|chromium.launch" "$REPO/relay/visual-check.js" 2>/dev/null | head -3

# ── plan_items tracked ──
db "SELECT COUNT(*) FROM dispatch_tasks WHERE plan_items IS NOT NULL AND plan_items != '' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# ── Success rate actual (7 días) ──
db "SELECT ROUND(100.0*SUM(status='completed')/COUNT(*),1) AS rate, COUNT(*) AS total FROM dispatch_tasks WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
```

---

## PASO 3 — Decidir qué ejecutar

Con base en lo que detectaste, selecciona el ítem de **mayor impacto** que NO esté hecho todavía.
Sigue estrictamente este orden de prioridad:

### Prioridad 1 — Sprint 2 Fix 4: Índices SQL en dispatch_tasks
**Condición de pendiente**: los índices `idx_dispatch_status_created` y `idx_dispatch_project_created` no existen en la tabla.
**Impacto en score**: D3 Backend +2 (latencia /api/relay/dispatch de 637ms → <200ms)

Crear `backend/db/migrate-v19.sql` con:
```sql
-- migrate-v19.sql — Índices para mejorar latencia de /api/relay/dispatch
CREATE INDEX IF NOT EXISTS idx_dispatch_status_created  ON dispatch_tasks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_project_created ON dispatch_tasks(project, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_completed       ON dispatch_tasks(completed_at DESC);
```

Aplicar en producción:
```bash
exec_s "mysql -u root -pxGRP4XiFROfcF5tn9N71 ai_monitoring < /var/www/html/vilarkptl.com/ai-monitor/backend/db/migrate-v19.sql 2>&1"
```

Verificar latencia después:
```bash
time curl -s -o /dev/null "https://ia.vilarkptl.com/api/relay/dispatch"
```

---

### Prioridad 2 — Sprint 2 Fix 5: Limpiar procesos PM2 errored + `--max-memory-restart`
**Condición de pendiente**: hay procesos en estado `errored` (finbot-engine-ciclo3, analisis-wp, conversation-engine, financial-bot).
**Impacto en score**: D4 Stability +1-2 (swap baja de 87% → ~80%)

Acciones:
1. Detener `finbot-engine-ciclo3` (593+ restarts, stopped — consumía swap)
2. Verificar logs de `financial-bot` y `conversation-engine` antes de tocarlos (solo detener, no delete)
3. Agregar `--max-memory-restart 400M` en `ecosystem.config.js` para `relay-master` y `ai-monitor`

En `deploy/ecosystem.config.js`:
```javascript
// Agregar a las entradas de relay-master y ai-monitor:
max_memory_restart: '400M',
```

Aplicar sin restart brusco:
```bash
exec_s "pm2 delete finbot-engine-ciclo3 2>&1"
exec_s "pm2 reload /var/www/html/vilarkptl.com/ai-monitor/deploy/ecosystem.config.js 2>&1"
```

---

### Prioridad 3 — Sprint 2 Fix 6: Limpiar agent_events (>30 días)
**Condición de pendiente**: `agent_events` > 30 MB y no hay job de limpieza.
**Impacto en score**: D3 Backend latencia, espacio en disco

Crear job de limpieza en `backend/server.js` — ejecutar diariamente:
```javascript
// Agregar en backend/server.js, después de la inicialización del servidor:
setInterval(async () => {
  try {
    await db.query("DELETE FROM agent_events WHERE timestamp < DATE_SUB(NOW(), INTERVAL 30 DAY)");
  } catch (_) {}
}, 24 * 60 * 60 * 1000); // cada 24h
```

Ejecutar limpieza inicial en producción:
```bash
db "DELETE FROM agent_events WHERE timestamp < DATE_SUB(NOW(), INTERVAL 30 DAY)"
```

---

### Prioridad 4 — Sprint 3 Fix 8: SESSION_MAX_AGE_MS para --resume
**Condición de pendiente**: la función `getResumeSession()` no tiene check de edad (no existe `SESSION_MAX_AGE_MS`).
**Impacto en score**: D15 Memory/Resume +2

En `relay/master.js`, modificar la función `getResumeSession()`:
```javascript
const SESSION_MAX_AGE_MS = 20 * 60 * 60 * 1000; // 20 horas

function getResumeSession(projectId) {
  const s = PROJECT_SESSIONS[projectId];
  if (!s) return null;
  if (Date.now() - s.ts > SESSION_MAX_AGE_MS) {
    delete PROJECT_SESSIONS[projectId];
    saveProjectSessions();
    return null;
  }
  return s.id;
}
```

---

### Prioridad 5 — Sprint 3 Fix 9: Token cache tracking desde CC
**Condición de pendiente**: `total_cache_read_tokens` y `total_cache_write_tokens` siempre 0 en agent_sessions.
**Impacto en score**: D18 Token Caching +3 (permite medir el ahorro real)

En `relay/master.js`, dentro del `processLine()` de `runClaude()`, capturar los tokens de caché del evento `result`:
```javascript
if (evt.type === 'result') {
  // ... código existente ...
  // Capturar métricas de caché si están disponibles
  if (evt.usage) {
    taskCacheReadTokens  = (evt.usage.cache_read_input_tokens  || 0);
    taskCacheWriteTokens = (evt.usage.cache_creation_input_tokens || 0);
    taskInputTokens      = (evt.usage.input_tokens  || 0);
    taskOutputTokens     = (evt.usage.output_tokens || 0);
  }
}
```

Y reportar al backend en el `postSession()` final incluyendo estos valores.

---

### Prioridad 6 — P2.2: A/B Comparison Panel en dashboard
**Condición de pendiente**: no existe sección de A/B en `frontend/js/dashboard.js` ni en `frontend/index.html`.
**Impacto en score**: D2 Frontend +0.5, visibilidad para toma de decisiones

Agregar tab "A/B" en el dashboard que muestre la misma tarea ejecutada por relay vs Claude Code directo. Por ahora, mostrar datos de la última semana: promedio de tool calls, duración y cost por proyecto.

---

### Prioridad 7 — Sprint 4 Fix 10: Activar plan_items en DeepSeek planning
**Condición de pendiente**: 0 tareas con `plan_items` en 7 días.
**Impacto en score**: D14 Batch Processing +2

Verificar que el endpoint `POST /api/relay/dispatch/:id/plan` existe y que `master.js` lo llama. Si falta, añadirlo.

---

## PASO 4 — Ejecutar el ítem seleccionado

Una vez elegido el ítem:

1. **Lee los archivos relevantes** antes de editar (nunca edites sin leer primero)
2. **Implementa el cambio** en el repo local
3. **Verifica la sintaxis** con `node --check` o validación equivalente
4. **Commitea** con mensaje descriptivo
5. **Pusheα** a `main` Y a `claude/agent-monitoring-dashboard-4v8iq`
6. **Deploya en producción**:
   - Para cambios en `backend/`: `exec_s "pm2 restart ai-monitor"`
   - Para cambios en `relay/master.js`: `exec_s "git pull && git reset --hard origin/main"` — relay-master se auto-recarga vía `checkSelfReload`
   - Para migraciones SQL: aplicar directamente con `exec_s`
7. **Verifica** que el cambio tuvo efecto en producción

---

## PASO 5 — Verificar impacto y actualizar estado

Después de ejecutar, mide el impacto:

```bash
# Latencia post-índices
time curl -s -o /dev/null "https://ia.vilarkptl.com/api/relay/dispatch"

# Swap después de limpiar procesos
exec_s "free -h"

# Success rate actual
db "SELECT ROUND(100.0*SUM(status='completed')/COUNT(*),1) AS rate FROM dispatch_tasks WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"

# result_summary ahora no-null
db "SELECT COUNT(*) AS con_summary FROM dispatch_tasks WHERE status='completed' AND result_summary IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)"
```

Actualiza `relay/AGENT-STATUS.md` con los archivos modificados y estado de la sesión.

---

## PASO 6 — Reportar

Al terminar, produce un bloque de resumen:

```
## Ítem ejecutado: [nombre del ítem]
- Archivos modificados: [lista]
- Commit: [hash]
- Impacto esperado: [dimensión] [score anterior] → [score proyectado]
- Verificación en producción: [resultado de la prueba]
- Próximo ítem en cola: [nombre del siguiente según prioridad]
```

---

## Notas importantes

- **Nunca** omitas el PASO 2 — siempre detecta el estado real antes de decidir
- **Nunca** ejecutes dos ítems en la misma sesión si el primero requiere restart del servidor (espera a que el servidor se estabilice)
- **Nunca** `git add .` — solo los archivos específicos del cambio
- Si el ítem de Prioridad 1 ya está hecho, pasa al 2, y así sucesivamente
- Si **todos los ítems del sprint están completos**, ejecuta `/test` para obtener el nuevo score y actualizar `docs/TEST-REPORT-YYYY-MM-DD.md`
- Branch de trabajo: siempre commitear a `main` Y hacer push también a `claude/agent-monitoring-dashboard-4v8iq`
