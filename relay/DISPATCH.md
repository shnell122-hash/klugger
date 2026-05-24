# DISPATCH.md — Integración Dispatch con relay-master
> Protocolo de dispatch entre agentes y desde Telegram. Guía para integrar el comando `/dispatch` con routing automático al inbox. Última actualización: 2026-05-16.

---

## Qué es el dispatch

Dispatch es el mecanismo central del relay: un agente o desarrollador envía una tarea a otro agente (o al mismo) a través de su inbox. relay-master detecta el cambio y ejecuta la tarea automáticamente.

---

## Protocolo actual (funcional)

### Dispatch manual vía Git

```bash
# El remitente escribe en el inbox del destino:
cat >> relay/inbox-[destino].md << 'EOF'
# TAREA: [título descriptivo]

[descripción de la tarea]

PRIORIDAD: alta
VERIFY_URLS: https://url.com
BUDGET: 2.00
EOF

# Commit y push a main (NO a feature branch)
git add relay/inbox-[destino].md
git commit -m "dispatch: [origen]→[destino] [descripción corta]"
git push origin main

# relay-master detecta en ≤15s y ejecuta
```

### Dispatch urgente (sin esperar ciclo de 15s)

```bash
curl -X POST http://localhost:3010/api/relay/dispatch \
  -H 'Content-Type: application/json' \
  -d '{
    "project": "fiscalai",
    "task": "fix urgente: null pointer en /api/cfdi",
    "requester": "ai-monitor",
    "priority": "high"
  }'
```

---

## Implementación: `/dispatch` en Telegram

El comando `/dispatch` en `claude-chat-bot` permite enviar tareas a cualquier agente desde Telegram sin editar archivos manualmente.

### Sintaxis

```
/dispatch [proyecto] [tarea en texto libre]

Ejemplos:
/dispatch fiscalai fix el endpoint /api/cfdi que retorna 500
/dispatch fiscalai-front actualizar colores del header a #1a1a2e
/dispatch coordinator coordina: fiscalai necesita datos de fiscalai-front
```

### Implementación en `relay/chat-agent.js`

```js
// En el handler de comandos de GrammY:
bot.command('dispatch', async (ctx) => {
  const args = ctx.message.text.replace('/dispatch', '').trim();
  const [projectId, ...taskParts] = args.split(' ');
  const task = taskParts.join(' ');

  if (!projectId || !task) {
    return ctx.reply('Uso: /dispatch [proyecto] [descripción de tarea]\n' +
      'Proyectos disponibles: ' + getActiveProjectIds().join(', '));
  }

  const project = getProjectById(projectId);
  if (!project) {
    return ctx.reply(`Proyecto "${projectId}" no encontrado.`);
  }

  // Confirmar antes de dispatch
  const preview = `📤 **Dispatch → ${project.name}**\n\n${task}\n\n¿Confirmar?`;
  await ctx.reply(preview, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Enviar', callback_data: `dispatch_confirm:${projectId}:${Date.now()}` },
        { text: '❌ Cancelar', callback_data: 'dispatch_cancel' }
      ]]
    }
  });

  // Guardar tarea pendiente de confirmación
  pendingDispatches.set(ctx.from.id, { projectId, task });
});

bot.callbackQuery(/^dispatch_confirm:/, async (ctx) => {
  const userId = ctx.from.id;
  const pending = pendingDispatches.get(userId);
  if (!pending) return ctx.answerCallbackQuery('Expirado');

  await writeToInbox(pending.projectId, pending.task, `telegram:${userId}`);
  pendingDispatches.delete(userId);
  await ctx.editMessageText(`✅ Despachado a **${pending.projectId}**\nDetección en ~15s`, 
    { parse_mode: 'Markdown' });
});

async function writeToInbox(projectId, task, requester) {
  const project = getProjectById(projectId);
  const timestamp = new Date().toISOString().slice(0, 16);
  const content = `\n---\n\n## Tarea — ${timestamp}\n> Despachado por: ${requester}\n\n${task}\n`;

  fs.appendFileSync(project.inbox, content);

  // Push a main
  const repoPath = project.repo;
  const inboxRelative = path.relative(repoPath, project.inbox);
  execSync(
    `git -C "${repoPath}" add "${inboxRelative}" && ` +
    `git -C "${repoPath}" commit -m "dispatch: telegram→${projectId} ${task.slice(0,50)}" && ` +
    `git -C "${repoPath}" push origin main`,
    { timeout: 30000 }
  );
}
```

---

## Routing inteligente: 5 cuentas Pro/Max

### Objetivo

Distribuir carga entre 5 cuentas Claude Pro/Max para 5 devs o para mayor paralelismo.
Cada proyecto puede asignarse a una cuenta específica.

### Configuración en `projects.json`

```json
{
  "fiscalai": {
    "claude_user": "claude-agent-1",
    "claude_account_id": "gva_server"
  },
  "fiscalai-front": {
    "claude_user": "claude-agent-2",
    "claude_account_id": "leasingagata"
  },
  "flujos": {
    "claude_user": "claude-agent-3",
    "claude_account_id": "cuenta3"
  }
}
```

### Implementación en `relay/master.js`

```js
// Función de selección de cuenta
function selectClaudeUser(project) {
  // 1. Si el proyecto tiene cuenta asignada, usarla
  if (project.claude_user) return project.claude_user;

  // 2. Routing por carga: elegir la cuenta con menos tareas activas
  const accountLoads = {};
  for (const [taskId, task] of ACTIVE_TASKS.entries()) {
    const user = task.claudeUser || 'claude-agent';
    accountLoads[user] = (accountLoads[user] || 0) + 1;
  }

  const available = CLAUDE_ACCOUNTS.filter(a => a.active);
  // Elegir la con menor carga
  return available.reduce((min, acc) =>
    (accountLoads[acc.user] || 0) < (accountLoads[min.user] || 0) ? acc : min
  ).user;
}

// En spawnClaude():
const claudeUser = selectClaudeUser(project);
const spawnCmd = 'su';
const spawnArgs = ['-s', '/bin/bash', claudeUser, '-c',
  `claude --print --model ${model} "${escapedPrompt}"`];
```

### Configuración de cuentas (`relay/.env`)

```bash
# 5 cuentas Max/Pro
CLAUDE_ACCOUNT_1_USER=claude-agent-1
CLAUDE_ACCOUNT_1_ID=gva-server
CLAUDE_ACCOUNT_2_USER=claude-agent-2
CLAUDE_ACCOUNT_2_ID=leasingagata
CLAUDE_ACCOUNT_3_USER=claude-agent-3
CLAUDE_ACCOUNT_3_ID=cuenta3
# ...

# En master.js, cargar:
const CLAUDE_ACCOUNTS = [
  { user: 'claude-agent-1', id: 'gva-server', active: true },
  { user: 'claude-agent-2', id: 'leasingagata', active: true },
  // ...
];
```

---

## Dispatch desde otro agente (bot a bot)

Un agente puede despachar a otro sin intervención humana:

```js
// En cualquier agente que necesite escalar o coordinar:
const dispatch = {
  to: 'coordinator',
  from: project.id,
  task: 'Necesito que fiscalai implemente endpoint /api/cfdi antes de que yo continúe',
  context: 'Estoy bloqueado esperando el backend. Branch: claude/mi-branch',
  priority: 'high'
};

// Escribir en inbox de coordinator:
fs.appendFileSync(coordinatorInboxPath,
  `\n---\n## Dispatch de ${dispatch.from}\n${dispatch.task}\n\nContexto: ${dispatch.context}\n`);
execSync(`git -C "${repoPath}" add ... && git commit ... && git push origin main`);
```

---

## Plan de acción: `/dispatch` implementación

```
Paso 1: Agregar comando /dispatch en chat-agent.js
  Archivo: relay/chat-agent.js
  Cambios:
  - bot.command('dispatch', handler)
  - bot.callbackQuery('dispatch_confirm:', handler)
  - función writeToInbox(projectId, task, requester)
  - Map pendingDispatches para confirmaciones

Paso 2: Routing de cuentas en master.js
  Archivo: relay/master.js
  Cambios:
  - Constante CLAUDE_ACCOUNTS cargada de .env
  - Función selectClaudeUser(project)
  - Integrar en spawnClaude()

Paso 3: Endpoint HTTP dispatch urgente
  Archivo: backend/server.js
  Cambios:
  - POST /api/relay/dispatch
  - Llama directamente a writeToInbox + trigger inmediato
  - Auth: TELEGRAM_BOT_TOKEN o API key en header

Paso 4: Dashboard de dispatch
  Archivo: frontend/js/dashboard.js
  Cambios:
  - Tab "Dispatch" con selector de proyecto + textarea de tarea
  - Historial de dispatches recientes
  - Estado en tiempo real vía Socket.io
```

---

## Ejemplo de flujo completo

```
Dev escribe en Telegram:
/dispatch fiscalai el formulario de CFDI no valida el RFC

Bot responde:
📤 Dispatch → FiscalAI — Backend
"el formulario de CFDI no valida el RFC"
¿Confirmar?
[✅ Enviar] [❌ Cancelar]

Dev presiona Enviar.
Bot escribe en relay/inbox.md de fiscalai.
git commit + push a main.
relay-master detecta en ≤15s.
DeepSeek planifica la tarea.
Claude CLI ejecuta el fix.
Bot notifica:
✅ Despachado a fiscalai
Detección en ~15s

[5 minutos después]
🎉 [fiscalai] Tarea completada en 3m 44s | $0.00
fix: validación RFC en formulario CFDI
SHA: a1b2c3d
[Ver diff] [Ver outbox] [Nueva tarea]
```
