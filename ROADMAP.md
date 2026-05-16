# ROADMAP — AI Relay & Agent Orchestration
> Actualizado 2026-05-16 | Calificación actual: **8.0/10** | Objetivo: paridad Claude.ai para 5 devs
>
> Stack objetivo: **Claude Max/Pro (planificación, $0) + DeepSeek V4-Pro (ejecución) + Gemini Flash + Playwright (visual)**

---

## Día 0–1 — Estabilidad Operacional (BLOQUEANTE)

> Nada más se puede expandir hasta resolver estos 4 puntos.
> Ejecutar en el servidor `ssh root@143.198.228.78` en el orden indicado.

### ✅ / ⏳ C1 — Swap +1 GB

```bash
# Verificar estado actual
free -h && swapon --show

# Crear swap
fallocate -l 1G /swapfile2
chmod 600 /swapfile2
mkswap /swapfile2
swapon /swapfile2

# Hacer persistente entre reboots
echo '/swapfile2 none swap sw 0 0' >> /etc/fstab

# Verificar (debe mostrar ~3 GB swap total)
free -h && swapon --show
```

### ✅ / ⏳ C2 — Estabilizar `vilar-legal-os-v59` (analizar antes de decidir)

```bash
# PASO 1: Diagnóstico
pm2 describe vilar-legal-os-v59
pm2 logs vilar-legal-os-v59 --lines 100 --nostream

# PASO 2: Localizar el proceso
pm2 describe vilar-legal-os-v59 | grep -E 'script|cwd|pm_cwd'

# PASO 3: Ver el error exacto del crash
pm2 logs vilar-legal-os-v59 --err --lines 30 --nostream

# Basado en el diagnóstico, tomar una de estas acciones:

# OPCIÓN A: Error de dependencia faltante
cd [cwd del proceso] && npm install && pm2 restart vilar-legal-os-v59

# OPCIÓN B: Variable de entorno faltante
pm2 show vilar-legal-os-v59 | grep -i env
# Agregar la variable al ecosystem o al .env del proceso

# OPCIÓN C: Puerto en uso por otro proceso
lsof -i :[puerto] && pm2 restart vilar-legal-os-v59

# OPCIÓN D: El proceso no es necesario — pausar sin eliminar
pm2 stop vilar-legal-os-v59
pm2 save
# (NO delete — preservar config por si se necesita restaurar)
```

### ✅ / ⏳ C3 — Resolver divergencia Git en servidor

```bash
cd /var/www/html/vilarkptl.com/ai-monitor

# PASO 1: Diagnóstico exacto
git fetch origin
git log origin/main..HEAD --oneline        # commits locales sin push
git log HEAD..origin/main --oneline        # commits remotos sin pull
git status                                  # cambios sin commit

# PASO 2: Backup OBLIGATORIO (ejecutar antes de cualquier otra cosa)
git branch backup/server-main-$(date +%Y%m%d-%H%M) HEAD
git branch  # verificar que el backup aparece en la lista

# PASO 3: Si hay cambios sin commit, guardarlos
git stash

# PASO 4: Merge (NO reset --hard)
git merge origin/main --no-ff -m "merge: resolver divergencia servidor $(date +%Y-%m-%d)"

# PASO 5A: Si hay conflictos en relay/projects.json — fusionar manualmente:
git checkout --ours relay/projects.json    # tomar versión local
# editar manualmente para combinar entradas de ambas versiones
git add relay/projects.json
git commit -m "merge: fusionar projects.json resolviendo conflicto"

# PASO 5B: Si hay conflictos en relay/master.js — tomar versión local (tiene más features):
git checkout --ours relay/master.js
git add relay/master.js
git commit -m "merge: tomar master.js local (tiene deepseek-agent + visual check)"

# PASO 6: Push
git push origin main

# PASO 7: Restaurar stash si aplica
git stash pop

# Verificación final
git log --oneline -5
git status  # debe estar limpio
```

### ✅ / ⏳ C4 — pm2-logrotate

```bash
# Verificar si ya está instalado
pm2 list | grep logrotate

# Instalar si no está
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm
pm2 save

# Verificar
pm2 conf pm2-logrotate
```

---

## Día 1–2 — Merge y Consolidación

### M1 — Merge `claude/agent-monitoring-dashboard-4v8iq` → main

> ⚠️ Esperar respuesta de flujos en `relay/outbox-flujos.md` antes de mergear (confirmar sin conflictos en `relay/master.js`).

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin
git merge origin/claude/agent-monitoring-dashboard-4v8iq --no-ff \
  -m "merge: visual check loop + deepseek-agent mode + chat-agent tools"
git push origin main
pm2 restart relay-master --update-env
```

**Contiene:** `runDeepSeekAgent()`, `callDeepSeekWithTools()`, `runVisualCheckOnce()`, `onTaskComplete` refactor, `visual-check.js`, tools en chat-agent.

### M2 — Mover financial-bot a repositorio propio (recomendado)

> Actualmente `financial/bot/` vive dentro de `agentic-repo`. Tenerlo en su propio repo reduce el tamaño, acomoda mejor el ciclo de deploy, y evita conflictos de merge entre el relay y el bot.

```bash
# En servidor:
cd /var/www/html/vilarkptl.com/ai-monitor

# 1. Crear nuevo repo en GitHub: vilarkptl-lang/financial-bot
# (via /nuevo en Telegram o github.com/organizations/vilarkptl-lang/repositories/new)

# 2. Extraer historial de financial/ como repo independiente
git subtree split --prefix=financial -b financial-bot-split

# 3. Clonar nuevo destino y push
git clone /var/www/html/vilarkptl.com/ai-monitor /tmp/financial-bot-new
cd /tmp/financial-bot-new
git checkout financial-bot-split
git remote set-url origin git@github.com:vilarkptl-lang/financial-bot.git
git push origin HEAD:main

# 4. Configurar el nuevo repo en el servidor de producción
cd /var/www/html/vilarkptl.com
git clone git@github.com:vilarkptl-lang/financial-bot.git
cd financial-bot && npm install
pm2 stop financial-bot
# Actualizar ecosystem.config.js con la nueva ruta
pm2 start financial-bot
```

> Si se decide NO mover a repo separado: hacer merge selectivo como se tenía planeado.

### M3 — Merge selectivo `deploy/financial-llm-complete`

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin deploy/financial-llm-complete
git checkout origin/deploy/financial-llm-complete -- financial/bot/
git commit -m "merge: DeepSeek V4 + Gemini en financial-bot (selectivo)"
git push origin main
npm --prefix financial/bot install
pm2 restart financial-bot

# Verificar:
node -e "require('./financial/bot/agents/TransactionOrchestrator.js'); console.log('TO OK')"
```

### M4 — Limpieza Git

```bash
git prune
git gc --auto
```

---

## Día 2–3 — Contexto y Experiencia de Desarrollador

### `--resume sessionId` en `runClaude()`

```js
// relay/master.js — parsear session_id del stream output:
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

// buildClaudeCmd():
const resumeFlag = project.lastSessionId ? `--resume ${project.lastSessionId}` : '';
const cmd = `claude --print ${resumeFlag} --model ${model} "${escapeShell(prompt)}"`;
```

### `agent-memory.md` enriquecido

Formato por entrada:
```markdown
## [2026-05-16 14:32] Título de la tarea

**SHA:** a1b2c3d
**Archivos:** relay/master.js:1897–2050 (runDeepSeekAgent nueva)
**Decisiones:** MAX_TURNS=25, BASH_DENY incluye git reset --hard
**Errores resueltos:** toolCall.function.arguments requiere JSON.parse()
**Pendiente:** testear en sandbox
```

### `/dispatch` en `chat-agent.js`

Ver implementación completa en `relay/DISPATCH.md`.

```
/dispatch fiscalai fix endpoint /api/cfdi que retorna 500
→ [✅ Enviar] [❌ Cancelar] → push a main → relay detecta en ≤15s
```

### Routing multi-cuenta (5 cuentas Pro/Max)

```js
// relay/master.js:
function selectClaudeUser(project) {
  if (project.claude_user) return project.claude_user;
  return CLAUDE_ACCOUNTS
    .filter(a => a.active)
    .reduce((min, a) =>
      (loads[a.user] || 0) < (loads[min.user] || 0) ? a : min
    ).user;
}
```

### Compactación semántica + inyección automática de contexto

- Al inicio de cada despacho: inyectar `CLAUDE.md` + `relay/AGENTS.md` + `agent-memory.md` comprimidos en el system prompt
- Al final de cada sesión `deepseek-agent`: forzar escritura de resumen en `agent-memory.md` antes de terminar
- Límite de memoria: mantener últimas 20 entradas, rotar las más viejas

---

## Día 3–4 — Optimizaciones LLM y Visual

### LiteLLM en `master.js`

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
// Chains: kptl-chat (Sonnet→DS→GPT4o), kptl-chat-fast (Haiku→GPT4o-mini→Gemini)
```

### Playwright reemplaza Chromium headless

```bash
npm install playwright
npx playwright install chromium
```

Cambio en `relay/visual-check.js`: `puppeteer.launch()` → `playwright.chromium.launch()`.
Ventaja: SPAs con Vue/React Router, espera a hydration, mejor manejo de auth.

### Quiet hours exceptions

```js
// En master.js — campo ignore_quiet_hours ya existe en projects.json
// Agregar: bypass por URGENCIA en el inbox
const isUrgent = taskContent.includes('URGENCIA: critica');
if (isQuietHours && !project.ignore_quiet_hours && !isUrgent) return;
```

### Verificar IDs reales de DeepSeek

```bash
curl https://api.deepseek.com/v1/models \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" | jq '.data[].id'

# Actualizar relay/.env:
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash   # con el ID exacto confirmado
DEEPSEEK_PRO_MODEL=deepseek-v4-pro       # con el ID exacto confirmado
```

---

## Backlog (sin fecha)

| Item | Esfuerzo | Impacto |
|------|----------|---------|
| Worker processes por proyecto (refactor master.js) | Alto | Alto |
| Sesiones de larga duración (Claude como proceso persistente) | Alto | Alto |
| Tests de integración para master.js | Medio | Alto |
| Dashboard por equipo (filtros dev/proyecto) | Medio | Medio |
| Métricas longitudinales de calidad de tareas | Medio | Medio |
| Bidireccionalidad mid-task (/clarify + botones pre-push) | Medio | Alto |
| Onboarding proyectos inactivos (credito, voltic, ocr...) | Bajo | Medio |
| Admin API keys para monitoring cuentas Max | Bajo | Bajo |
| LiteLLM sombra en producción (use_cli_proxy flag) | Bajo | Bajo |
| finbot-tester golden suite >90% cobertura | Medio | Medio |

---

## Estado actual del sistema

| Dimensión | Calificación | Notas |
|-----------|:-----------:|-------|
| Costo operativo | 10/10 | $0 API (Max OAuth) + DeepSeek barato |
| Eficiencia multitarea | 9/10 | 9 proyectos paralelos |
| Seguridad / guardrails | 9/10 | Kill-switch, rate limit, watchdog |
| Observabilidad | 9/10 | Dashboard, alertas, costos, visual check |
| Escala | 8/10 | Un proceso para todo — riesgo SPOF |
| Recuperación de errores | 8/10 | Adaptive timeout, auto-retry, DS code fix |
| Latencia | 7/10 | Poll 15s + planning overhead |
| Calidad de código | 7/10 | plan-execute introduce traducción |
| Experiencia de dev | 7/10 | Telegram ayuda, pero aún más fricción que Claude.ai |
| **GLOBAL** | **8.0/10** | |

**Por qué no llega a 9:**
1. Swap 94% — OOM puede matar relay-master (C1, resoluble hoy)
2. `deepseek-agent` sin validación en producción compleja
3. `relay/master.js` como single point of failure (3,296 líneas)

---

## Documentación de referencia

| Archivo | Propósito |
|---------|-----------|
| `CLAUDE.md` | Referencia maestra |
| `ROADMAP.md` | Este archivo |
| `relay/AGENTS.md` | Roles, rutas, zonas de propiedad |
| `relay/PROJECTS.md` | Rutas completas del servidor, PM2 |
| `relay/CONVENTIONS.md` | Git, código, outbox format |
| `relay/SYSTEM.md` | Arquitectura, stack, seguridad |
| `relay/WORKFLOW.md` | 3 canales de entrada, visual check |
| `relay/MEMORY.md` | --resume, agent-memory enriquecido |
| `relay/TOOLS.md` | Herramientas por modo |
| `relay/DISPATCH.md` | /dispatch Telegram, routing multi-cuenta |
| `relay/SYSTEM-DIAGNOSIS.md` | Diagnóstico completo 17 secciones |
| `relay/AGENT-STATUS.md` | Estado de agentes — actualizar al terminar |

---

*Actualizado 2026-05-16. Próxima actualización tras completar Día 0–1.*
