# MEMORY.md — Gestión de Contexto y Memoria
> Cómo funciona la memoria entre sesiones y cómo maximizar continuidad de contexto. Última actualización: 2026-05-16.

---

## El problema: flag `--print` = sin estado

Cada dispatch de relay-master ejecuta:
```bash
claude --print --model claude-sonnet-4-6 "[prompt]"
```

`--print` = modo batch sin estado. Cada invocación es una sesión nueva desde cero.
No importa cuántas tareas completó antes el agente — cada dispatch parte de zero.

### Contexto que SÍ se inyecta (por despacho)

| Fuente | Contenido | Tokens est. |
|--------|-----------|-------------|
| `relay/agents/[id].md` | Descripción, stack, rutas, restricciones | 200–500 |
| `relay/agent-memory.md` | Resúmenes de últimas 15 sesiones | 800–1500 |
| `relay/[id]-plan.md` | Plan activo (si existe) | 300–800 |
| Contenido del inbox | La tarea en sí | 100–500 |
| **Total** | | **~1400–3300** |

### Contexto FALTANTE vs Claude Code interactivo

| Dimensión | Claude Code interactivo | Agente relay |
|-----------|------------------------|---------------|
| Historial de conversación | Completo (hasta 200K tokens) | Ausente |
| Memoria cross-sesión | Automática | Solo lo que el agente escribe |
| Errores previos contextuales | "Intenté X, falló por Y" | Solo si se documentó |
| Decisiones implícitas | En contexto | Perdidas |
| CLAUDE.md auto-cargado | ✅ | ❌ — debe inyectarse |

---

## Solución 1: `--resume sessionId` (mayor impacto)

Claude Code CLI puede continuar una sesión existente:
```bash
claude --print --resume abc123def456 "Nueva tarea del mismo proyecto"
```

### Implementación en master.js

```js
// En runClaude(), parsear session_id del stream-json output:
proc.stdout.on('data', (chunk) => {
  for (const line of chunk.toString().split('\n')) {
    try {
      const msg = JSON.parse(line);
      // Claude Code emite {type: 'system', session_id: 'abc123...'}
      if (msg.type === 'system' && msg.session_id) {
        project.lastSessionId = msg.session_id;
        saveProjectState(); // persistir en projects-state.json
      }
    } catch {}
  }
});

// Al siguiente dispatch, inyectar --resume:
function buildClaudeCmd(project, prompt, model) {
  const resumeFlag = project.lastSessionId
    ? `--resume ${project.lastSessionId}`
    : '';
  return `claude --print ${resumeFlag} --model ${model} "${escapeShell(prompt)}"`;
}
```

**Estado:** P-alta — pendiente implementar en feature branch  
**Limitación:** La sesión puede expirar. Necesita try/catch: si `--resume` falla, reintentar sin él.

---

## Solución 2: `agent-memory.md` estructurado

### Formato actual (lossy, genérico)
```
[2026-05-15] Tarea completada: implementar visual check
```

### Formato propuesto (rico, útil)

Cada entrada debe tener esta estructura:

```markdown
## [2026-05-16 14:32] [título de la tarea]

**SHA:** a1b2c3d
**Archivos modificados:**
- `relay/master.js:1897–2050` — función `runDeepSeekAgent()` nueva
- `relay/visual-check.js:45` — timeout aumentado a 15s

**Decisiones tomadas:**
- MAX_TURNS=25 (no 50) — DeepSeek cobra por token, 25 es suficiente para 95% de tareas
- BASH_DENY incluye `git reset --hard` — previene que agente deshaga su propio trabajo

**Errores resueltos:**
- `TypeError: toolCall.function.arguments is not object` — era string JSON, requiere `JSON.parse()`
- visual-check timeout en 5s — insuficiente para SPAs, aumentado a 15s

**Pendiente:**
- Testear runDeepSeekAgent en proyecto sandbox antes de habilitar en fiscalai
- Verificar IDs de modelos DeepSeek con curl a API
```

### Función `appendAgentMemory()` mejorada (master.js)

```js
function appendAgentMemory(project, taskTitle, result) {
  const entry = [
    `## [${new Date().toISOString().slice(0,16)}] ${taskTitle}`,
    ``,
    `**SHA:** ${result.sha || 'no commit'}`,
    `**Status:** ${result.status}`,
    result.changed?.length
      ? `**Archivos modificados:**\n${result.changed.map(f => `- \`${f}\``).join('\n')}`
      : '',
    result.decisions?.length
      ? `**Decisiones:**\n${result.decisions.map(d => `- ${d}`).join('\n')}`
      : '',
    result.errorsFixed?.length
      ? `**Errores resueltos:**\n${result.errorsFixed.map(e => `- ${e}`).join('\n')}`
      : '',
    result.pending
      ? `**Pendiente:** ${result.pending}`
      : '',
    ``,
  ].filter(Boolean).join('\n');

  // Mantener últimas 20 entradas, rotar las más viejas
  const memPath = path.join(project.repo, 'relay', 'agent-memory.md');
  const current = fs.existsSync(memPath) ? fs.readFileSync(memPath, 'utf8') : '';
  const entries = current.split('## [').filter(Boolean);
  const kept = entries.slice(-19); // mantener 19 + la nueva = 20
  fs.writeFileSync(memPath, kept.map(e => '## [' + e).join('') + entry);
}
```

---

## Solución 3: Sesiones de larga duración

En vez de `claude --print` (one-shot), mantener Claude como proceso interactivo:

```js
// Proceso persistente por proyecto
const proc = spawn('claude', ['--model', model], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, HOME: `/home/${project.claude_user || 'claude-agent'}` }
});
project.claudeProc = proc;
project.claudeProcBusy = false;

// Para cada nueva tarea:
async function sendTaskToLiveClaude(project, taskContent) {
  if (!project.claudeProc || project.claudeProc.killed) {
    project.claudeProc = spawnLiveClaude(project);
  }
  project.claudeProcBusy = true;
  project.claudeProc.stdin.write(taskContent + '\n---END-TASK---\n');
  // Leer hasta ver el marcador de fin de respuesta
}
```

**Ventaja:** Contexto completo acumulado — igual que sesión interactiva  
**Riesgo:** Gestión de proceso muerto, fill de contexto, stdin blocking  
**Estado:** P3 — requiere refactor arquitectural significativo

---

## Solución 4: deepseek-agent como proxy de continuidad

El modo `deepseek-agent` mantiene conversación de 25 turnos **dentro** de una tarea.
Al final de cada sesión, el agente DEBE escribir su resumen en `agent-memory.md`:

```js
// En runDeepSeekAgent(), forzar última acción:
if (turn === MAX_TURNS - 1 || isTaskComplete) {
  messages.push({
    role: 'user',
    content: 'Antes de terminar: escribe un resumen de esta sesión en ' +
             'relay/agent-memory.md con el formato requerido (SHA, archivos, decisiones, errores).'
  });
}
```

---

## Roadmap de implementación

```
Semana 1 (bajo riesgo, alto ROI):
  → Enriquecer appendAgentMemory() — ~50 líneas en master.js
  → Agregar campo lastSessionId a project state

Semana 2:
  → Implementar --resume en runClaude() con fallback
  → Forzar resumen en agent-memory al final de deepseek-agent

Semana 3+:
  → Evaluar sesiones de larga duración en proyecto sandbox
```
