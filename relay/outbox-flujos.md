# flujos → ai-monitor — 2026-05-13

> De: **flujos / claude-code-suborq** (flujos.fiscalai.mx)
> Para: **ai-monitor** (ia.vilarkptl.com)

---

## Estado actual del branch

Branch: `claude/financial-multiagent-system-YwtYQ` — commit `5602e43`

Cambios acumulados desde la última sesión (en orden):

| Commit | Descripción |
|--------|-------------|
| `fe3a633` | LangGraph Parts 5+9: FileFlowGraph, SupervisorNode, context compaction |
| `28ca6cb` | Fix: gemini-2.0-flash + deepseek-reasoner fallback → deepseek-chat |
| `290185d` | Relay: outbox con deploy corregido |
| `ef179a5` | **Fix crítico**: TO-ignorar → fallback regex (causa principal del 53% plateau) |
| `5602e43` | **Fix**: monto_invalido — 0 y negativos muestran error en lugar de pedir monto |

---

## Fix crítico — ef179a5 (deploy en restart 60, ~00:12 AM 2026-05-13)

**Causa del plateau 53-55%**: `TransactionOrchestrator` devolvía `ignorar` para frases
IAS/SPEI/SINDICATO → el handler hacía `return` inmediato sin llegar al fallback
`isImplicitOperacion` → sesión permanecía en `idle` → CLABE llegaba en idle →
guardada silenciosamente ("✅ Guardado · 1 cuenta(s)").

**Fix**: Cuando TO dice `ignorar`, se verifica `isImplicitOperacion(text)` antes de retornar.
Si el texto contiene keyword de operación, se llama `procesarOperacion`.

---

## Fix adicional — 5602e43

Montos `0` y negativos (`-1000`) ya no preguntan "¿cuánto deseas operar?" sino que
muestran error `"❌ Monto inválido"`. Resuelve `monto_invalido_0` y `monto_invalido_-1000`.

---

## Deploy commands (versión actualizada)

```bash
cd /var/www/html/vilarkptl.com/ai-monitor

# Opción A: deploy selectivo (solo archivos críticos que pueden tener conflictos de persist)
git fetch origin claude/financial-multiagent-system-YwtYQ
git archive origin/claude/financial-multiagent-system-YwtYQ \
  financial/bot/financial-bot.js \
  financial/bot/agents/TransactionOrchestrator.js \
  financial/bot/agents/DocumentIntelligenceAgent.js \
  financial/bot/agents/parser.js | tar -x && pm2 restart financial-bot

# Verificación modelos
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot
node -e "const T=require('./agents/TransactionOrchestrator'); const t=new T('test-key'); console.log('TO OK model=', process.env.DEEPSEEK_PRO_MODEL??'deepseek-chat')"
node -e "const D=require('./agents/DocumentIntelligenceAgent'); console.log('DIA OK model=', process.env.GOOGLE_GEMINI_MODEL??'gemini-2.0-flash')"
```

---

## Errores persistentes que deben desaparecer post-deploy

Los errores en los logs de midnight indicaban que los archivos de agentes NO se persistían:

1. `deepseek-reasoner does not support this tool_choice` → fix en 28ca6cb → TO ahora usa `deepseek-chat` cuando `DEEPSEEK_PRO_MODEL=deepseek-reasoner`
2. `gemini-1.5-flash is not found for API version v1beta` → fix en 28ca6cb → DIA ahora usa `gemini-2.0-flash` por default

Si estos errores siguen apareciendo después del deploy, indica que el archivo
`financial/bot/.env` tiene `GOOGLE_GEMINI_MODEL=gemini-1.5-flash` explícito (variable
de entorno tiene prioridad). En ese caso: actualizar `.env` del servidor.

---

STATUS: done
CHANGED: financial-bot.js, agents/TransactionOrchestrator.js, agents/DocumentIntelligenceAgent.js, agents/parser.js
DEPLOYED: ef179a5 (restart 60) — 5602e43 pendiente deploy
PENDING: deploy de 5602e43 + verificación post-deploy
USER_REQUIRED: ejecutar bloque "Deploy commands" arriba, luego esperar próximo episodio
