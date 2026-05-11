# AGENTS.md — Guía completa de agentes

> Leer al inicio de cada sesión. Actualizado: 2026-05-10.

---

## Agentes del sistema relay (Claude Code CLI via relay-master)

| ID | Modelo | Rol |
|----|--------|-----|
| `coordinator` | claude-haiku-4-5 | Orquesta dispatches. Solo escribe inbox.md. Completar <60s. No escribe código. |
| `fiscalai` | claude-sonnet-4-6 | Backend Node.js + SAT APIs + MySQL (DeCabeceraTax) |
| `fiscalai-front` | claude-sonnet-4-6 | Frontend HTML/CSS/JS vanilla |
| `ai-monitor` | claude-haiku-4-5 | Dashboard ia.vilarkptl.com + relay/master.js |
| `finbot-tester` | claude-sonnet-4-6 | Pruebas automatizadas del financial-bot |
| `finbot-verifier` | claude-haiku-4-5 | Verificación continua. Solo valida, no escribe código. |

> ⚠️ Haiku 4.5 tuvo **0 tool calls en tareas de código** (2026-04-20). Solo usar Haiku para coordinator, finbot-verifier y tareas de solo lectura.

---

## Agentes del financial-bot (`financial/bot/agents/`)

| Agente | Archivo | Modelo | Env var requerida |
|--------|---------|--------|------------------|
| TransactionOrchestrator | `TransactionOrchestrator.js` | DeepSeek Pro | `DEEPSEEK_API_KEY` |
| DocumentIntelligenceAgent | `DocumentIntelligenceAgent.js` | gemini-1.5-flash | `GOOGLE_API_KEY` |
| VisionAgent | `vision-agent.js` | Gemini Flash + DeepSeek fallback | `GOOGLE_API_KEY` + `DEEPSEEK_API_KEY` |
| InvoiceAgent | `invoice-agent.js` | deepseek-chat | `DEEPSEEK_API_KEY` |
| ContextReader | `context-reader.js` | deepseek-chat | `DEEPSEEK_API_KEY` |
| ResponseGen | `response-gen.js` | deepseek-chat | `DEEPSEEK_API_KEY` |
| Verifier | `verifier.js` | rule-based | — |

### Patrón de constructor obligatorio

```js
// ✅ CORRECTO — pasar cliente OpenAI-compatible, no string:
const llm = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' });
const agent = new AgentClass(llm, { model: process.env.DEEPSEEK_PRO_MODEL ?? 'deepseek-chat' });

// ❌ INCORRECTO — causa TypeError en runtime:
const agent = new AgentClass(process.env.DEEPSEEK_API_KEY);
```

### Variables de entorno (financial/bot)

```
ANTHROPIC_API_KEY    Claude → TransactionOrchestrator (fallback)
GOOGLE_API_KEY       Gemini → DocumentIntelligenceAgent + VisionAgent
DEEPSEEK_API_KEY     DeepSeek → todos los agentes base
DEEPSEEK_PRO_MODEL   default: 'deepseek-chat' (verificar en api.deepseek.com/v1/models)
DEEPSEEK_FLASH_MODEL default: 'deepseek-chat'
GEMINI_FLASH_MODEL   default: 'gemini-1.5-flash'
```

### Verificación de consistencia de constructores

Antes de modificar cualquier constructor en `agents/`, ejecutar:
```bash
grep -r "new TransactionOrchestrator\|new VisionAgent\|new DocumentIntelligenceAgent" financial/bot/
```
Verificar que todos los call sites pasen `(llmClient, opts)`, no `(apiKey)`.

---

## Cursor Cloud Agent (self-hosted worker)

```bash
pm2 list | grep cursor-worker   # verificar estado
pm2 restart cursor-worker       # reiniciar si es necesario
```

Dashboard: https://cursor.com/dashboard/cloud-agents

**Uso recomendado de Cursor Agents:**

| Tarea | Agente |
|-------|--------|
| Revisión de código del relay | Cursor Cloud Agent |
| Pruebas de rutas API | Cursor Cloud Agent |
| Validación seguridad | Cursor Cloud Agent |
| Deploy en servidor | cursor-worker (self-hosted) |
| Tareas en tiempo real | Claude Code CLI (relay-master) |

---

## Protocolo de comunicación entre agentes

### Canal inbox/outbox

```
A escribe relay/inbox-[B].md → commit + push main
relay-master detecta (15s) → lanza Claude CLI para B
B ejecuta → relay/outbox-[B].md → commit + push main
relay-master lee outbox → notifica Telegram
```

### Estado compartido: `relay/AGENT-STATUS.md`

**LEER AL INICIO DE SESIÓN. ACTUALIZAR AL TERMINAR.**

Formato requerido:
```markdown
## Agente: [id]
- Branch: [nombre]
- Archivos en uso: [lista]
- Estado: done | in-progress | blocked
- Último commit: [SHA]
- Timestamp: [fecha]
```

### Dispatch urgente (sin esperar ciclo 15s)

```bash
curl -X POST http://localhost:3010/api/relay/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"project":"finbot-tester","task":"<descripción>","requester":"ai-monitor"}'
```

---

## Prompts recomendados para Cursor Agents

### Revisión del relay
```
En el servidor de producción (/var/www/html/vilarkptl.com/ai-monitor).
Revisa relay/master.js y relay/projects.json. Verifica:
- Rate-limits y timeouts
- Uso correcto de process.env.*_API_KEY (nunca hardcoded)
- Memory leaks o procesos zombie
```

### Prueba de endpoint
```
Ejecuta prueba del endpoint POST /api/relay/dispatch en localhost:3010
con un mensaje JSON de prueba. Reporta latencia y respuesta.
```
