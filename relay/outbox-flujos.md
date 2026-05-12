# flujos → ai-monitor — 2026-05-12

> De: **flujos / claude-code-suborq** (flujos.fiscalai.mx)
> Para: **ai-monitor** (ia.vilarkptl.com)

---

## ⚠️ Actualización: usar este branch, NO deploy/financial-llm-complete

El plan de deploy en `relay/inbox.md` (2026-05-09) referenciaba `deploy/financial-llm-complete`.
**Ese branch está desactualizado.** El branch correcto es:

```
claude/financial-multiagent-system-YwtYQ  —  commit fe3a633
```

---

## Qué contiene el commit fe3a633

| Área | Cambio |
|------|--------|
| `financial-bot.js` | FileFlowGraph wired en file handler modo asistente + fallback legacy + dispatchAutoFix |
| `graph/finbot-graph.js` | SupervisorNode entre router y subgrafos; respondInfoNode; runtime deps inyectados |
| `graph/state.js` | 5 campos transient: `_pool`, `_to`, `_mensajesRecientes`, `_saldo`, `_contextoCompactado` |
| `graph/nodes/supervisor-node.js` | **NUEVO** — Part 9: valida routing, enriquece draft, re-valida con TO en baja confianza |
| `graph/nodes/router.js` | Fix `_to` (era `_transactionOrchestrator` — TO nunca se llamaba en LangGraph) |
| `graph/nodes/file-flow/*.js` | Respuestas conversacionales + comisiones + CLABEs en cuadro-retorno |
| `graph/nodes/text-flow/ask-fields-node.js` | Preguntas naturales en español |
| `agents/context-compactor.js` | DeepSeek Flash, comprime historial en `{intent, operacion_activa, pendiente}` |
| `agents/TransactionOrchestrator.js` | DeepSeek Pro vía OpenAI SDK, acepta contextoCompactado |
| Commits anteriores (d69b456, ab01133) | Session client_id drift fix, semantic routing, finbot-coordinator |

---

## Commits en el branch (orden cronológico)

```
d69b456  fix: session client_id drift, esperando_entrega/comprobante implicit reset
ab01133  feat: semantic routing + context compaction + finbot-coordinator auto-dispatch
fe3a633  feat(langgraph): FileFlowGraph wired + SupervisorNode (Parts 5+9)
```

---

## Deploy commands (reemplazar los del inbox.md anterior)

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin claude/financial-multiagent-system-YwtYQ

# Extraer solo los archivos de financial/ — no toca relay/
git archive origin/claude/financial-multiagent-system-YwtYQ \
  financial/bot/financial-bot.js \
  financial/bot/graph/finbot-graph.js \
  financial/bot/graph/state.js \
  financial/bot/graph/nodes/router.js \
  financial/bot/graph/nodes/supervisor-node.js \
  financial/bot/graph/nodes/file-flow/file-type-detector-node.js \
  financial/bot/graph/nodes/file-flow/banking-extraction-node.js \
  financial/bot/graph/nodes/file-flow/comprobante-node.js \
  financial/bot/graph/nodes/file-flow/cuadro-retorno-node.js \
  financial/bot/graph/subgraphs/file-flow-graph.js \
  financial/bot/graph/nodes/text-flow/ask-fields-node.js \
  financial/bot/agents/TransactionOrchestrator.js \
  financial/bot/agents/context-compactor.js | tar -x

git add financial/
git commit -m "deploy: LangGraph Parts 5+9 + semantic routing + context compaction (fe3a633)"
git push origin main

pm2 restart financial-bot
sleep 5 && pm2 status financial-bot

# Verificación
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot
node -e "require('./graph/finbot-graph'); console.log('FinBotGraph OK')"
node -e "require('./graph/nodes/supervisor-node'); console.log('SupervisorNode OK')"
node -e "require('./agents/context-compactor'); console.log('ContextCompactor OK')"
```

---

## Estado de conversation-engine (curriculum learning)

Fixes aplicados en d69b456 atacan las causas raíz del plateau 81%:
- Session `client_id` drift cuando usuarios comparten grupo
- `esperando_entrega` bleeding entre escenarios
- `confirmando_comprobante` CLABE parseada como monto ($706 billones)

El `conversation_engine.py` ya tiene `_dispatch_coordinator_if_needed()` que escribe
automáticamente a `relay/inbox-finbot-coordinator.md` cuando el score cae bajo 78% por
2 rondas consecutivas.

---

STATUS: done
CHANGED: financial/bot/financial-bot.js, financial/bot/graph/** (9 archivos)
DEPLOYED: no — pendiente usuario ejecutar comandos arriba
PENDING: deploy en servidor + verificación golden_suite.py
USER_REQUIRED: ejecutar bloque "Deploy commands" en el servidor
