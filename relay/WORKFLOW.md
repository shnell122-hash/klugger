# WORKFLOW.md — Flujo de Trabajo para Desarrolladores
> Cómo trabajar con el sistema relay para lograr paridad con Claude Code interactivo. Última actualización: 2026-05-16.

---

## Los 3 canales de entrada de tareas

Todos son equivalentes — el agente en el servidor ejecuta con el mismo poder en cualquier canal.

### Canal 1: Buzón (inbox.md) — el más directo

```markdown
# relay/inbox-[proyecto].md

## Tarea: [título descriptivo]

[descripción detallada de lo que se necesita]

### Criterios de aceptación
- [ ] Criterio 1
- [ ] Criterio 2

### Contexto
[archivos relevantes, errores vistos, decisiones previas]

VERIFY_URLS: https://mi-app.com/pagina
BUDGET: 2.00
```

```bash
git add relay/inbox-[proyecto].md
git commit -m "dispatch: [descripción]"
git push origin main
# → relay-master detecta en ~15s, ejecuta, reporta en outbox y Telegram
```

### Canal 2: Telegram (`/chat [proyecto]`)

```
# En el bot de Telegram:
/chat fiscalai
→ Sesión interactiva con contexto del repo
→ Describir tarea en lenguaje natural
→ Bot planifica con DeepSeek, muestra plan
→ Confirmar → relay-master ejecuta
```

Usar para tareas cortas, preguntas, debugging conversacional.

### Canal 3: Claude Code chat (esta sesión) — para arquitectura compleja

```
Diseñar la solución aquí con contexto completo
Al terminar, Claude Code escribe el plan al inbox:
git add relay/inbox-[proyecto].md && git commit && git push
El agente en servidor ejecuta con el stack de producción
```

Usar cuando el diseño requiere múltiples archivos, decisiones arquitecturales, o análisis profundo.

---

## Campos especiales del inbox

```markdown
VERIFY_URLS: https://url1.com, https://url2.com/path
  → Activa visual check post-deploy con Gemini Flash
  → Si falla: auto-dispatch correctivo (hasta 3 intentos)

BUDGET: 5.00
  → Presupuesto máximo en USD para la tarea
  → Agente se detiene si excede

PRIORIDAD: alta | normal | baja
  → Afecta posición en la cola

MODO: deepseek-agent | full-claude-code | plan-execute
  → Sobrescribe el modo default del proyecto para esta tarea

NO_VISUAL_CHECK: true
  → Omite el visual check aunque haya VERIFY_URLS
```

---

## Cómo leer el outbox

Después de cada tarea, el agente escribe en su outbox:

```markdown
## Resultado — [fecha]

STATUS: done
CHANGED: relay/master.js:892-950, relay/visual-check.js
DEPLOYED: no
PENDING: pm2 restart relay-master en servidor
USER_REQUIRED: ejecutar: pm2 restart relay-master --update-env
```

También recibes notificación en Telegram con botones de acción.

---

## Visual check post-deploy

Se activa automáticamente cuando:
- El outbox contiene `DEPLOYED: yes`
- El proyecto tiene `VERIFY_URLS` configurado

Flujo:
```
1. relay-master llama visual-check.js
2. Chromium captura screenshot de la URL
3. Gemini Flash analiza: APROBADO | NECESITA_CORRECCIÓN
4. Si NECESITA_CORRECCIÓN y iteración < 3:
   → Escribe tarea correctiva en inbox del proyecto
   → Agente ejecuta corrección automáticamente
5. Screenshot guardado en DB + frontend/screenshots/
```

---

## Flujo de Telegram completo

```
Tarea iniciada:
🔧 [proyecto] Iniciando: [título]
   Agente: DeepSeek V4-Pro | Turno 1/25

Progreso (cada acción significativa):
📝 [proyecto] Turno 3: write_file relay/master.js (127 líneas)
✅ [proyecto] Turno 8: git commit a1b2c3d

Visual check:
🔍 [proyecto] Visual check: https://url.com
   Gemini: APROBADO — UI correcta

Completado:
🎉 [proyecto] Completado en 4m 32s | $0.03
   [Ver outbox] [Nueva tarea] [Ver diff]

Error:
⚠️ [proyecto] Fallo en turno 12 — watchdog activo
   [Ver logs] [Reintentar] [Escalar]
```

---

## Coordinación multi-agente

### Despachar desde coordinator
```bash
# Escribe en inbox del agente destino y push a main
# coordinator-inbox.md acepta:
DISPATCH_TO: fiscalai
TASK: implementar endpoint /api/cfdi/validate
CONTEXT: ver backend/routes/cfdi.js línea 45
```

### Verificar conflictos antes de merge
```bash
# Antes de cualquier merge a main:
git fetch origin
git log --oneline main..origin/claude/mi-branch
cat relay/AGENT-STATUS.md  # ¿otro agente tiene archivos en conflicto?
```

### Protocolo de merge seguro
```bash
# 1. Backup
git branch backup/main-$(date +%Y%m%d) HEAD

# 2. Fetch
git fetch origin

# 3. Merge sin fast-forward
git merge origin/[branch] --no-ff -m "merge: [descripción]"

# 4. Si hay conflicto en relay/master.js: TOMAR VERSIÓN DEL BRANCH
# Si hay conflicto en relay/projects.json: FUSIONAR MANUALMENTE

# 5. Push
git push origin main
```

---

## Visión objetivo: 5 devs, 100 proyectos

### Routing por cuenta Pro/Max (5 cuentas)

Cada proyecto puede tener asignada una cuenta específica:

```json
{
  "fiscalai": {
    "claude_account": "cuenta1",
    "claude_user": "claude-agent-1"
  },
  "flujos": {
    "claude_account": "cuenta2",
    "claude_user": "claude-agent-2"
  }
}
```

En master.js, `spawnClaude()` elige el usuario según `project.claude_user`:
```js
const user = project.claude_user || 'claude-agent';
const cmd = `su -s /bin/bash ${user} -c "claude --print ..."`;
```

Cada cuenta tiene límite de rate por separado → 5x más capacidad simultánea.

### Escalado a 100 proyectos

- LiteLLM como proxy central con fallback chains
- Worker processes por proyecto (P8 pendiente: refactor master.js)
- MySQL como fuente de verdad de estado (ya implementado)
- Dashboard con filtros por equipo/dev/proyecto
