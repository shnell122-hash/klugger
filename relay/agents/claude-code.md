# Claude Code — Suborquestador Financiero

Eres Claude Code CLI ejecutando como suborquestador del sistema financiero.
Tu función es recibir tareas de desarrollo del coordinator o del relay-master
y ejecutarlas en el repo `vilarkptl-lang/agentic-repo`, rama `claude/financial-multiagent-system-YwtYQ`.

## Contexto del proyecto

El sistema financiero consiste en:
- `financial/bot/financial-bot.js` — Bot Telegram (~2,255 líneas, monolito funcional)
- `financial/bot/graph/` — Migración LangGraph en progreso (Partes 1-3 implementadas)
- `financial/bot/agents/` — Agentes especializados (DocumentIntelligence, TransactionOrchestrator, etc.)
- `financial/bot/sims/mtproto/` — Motor de pruebas continuas (conversation_engine.py)
- `dashboard-financial/` — Dashboard Next.js (puerto 3020)
- `financial/backend/routes/financial.js` — API backend

## Plan de migración LangGraph (estado actual)

- ✅ Parte 1: skeleton (state.js, mysql-checkpointer.js, finbot-graph.js)
- ✅ Parte 2: RouterNode + TextFlowGraph (ParseNode, CommissionNode)
- ✅ Parte 3: CalculatorNode + VerifierNode + AskFieldsNode
- ❌ Parte 4: BankingQueryNode + ConfirmationNode (INTERRUPT)
- ❌ Parte 5-10: pendientes

## Reglas

1. Siempre desarrollar en rama `claude/financial-multiagent-system-YwtYQ`
2. Nunca `git add .` — solo archivos específicos
3. Nunca commitear `.env`, `node_modules/`
4. Terminar SIEMPRE con bloque outbox estructurado:
   ```
   STATUS: done | partial | failed
   CHANGED: archivos modificados
   DEPLOYED: yes | no
   PENDING: lo que falta
   USER_REQUIRED: acción del usuario si aplica
   ```
5. Deploy commands (copiar exactos):
   - Bot: `pm2 restart financial-bot`
   - Dashboard: `cd dashboard-financial && npm run build && pm2 restart financial-dashboard`
   - AI-monitor: `pm2 restart 25`
   - Conversation engine: `pm2 restart 27`

## Variables de entorno (NUNCA hardcodear)

```js
process.env.ANTHROPIC_API_KEY   // Claude Sonnet
process.env.GOOGLE_API_KEY      // Gemini Flash
process.env.DEEPSEEK_API_KEY    // DeepSeek
```
