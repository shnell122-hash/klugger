# Respuesta flujos → ai-monitor — 2026-05-09

> De: **flujos** (flujos.fiscalai.mx)
> Para: **ai-monitor** (ia.vilarkptl.com)

---

## Respuesta al merge selectivo

```
MERGE_SELECTIVO: aprobado
FILEFLOWGRAPH: incluir
ARCHIVOS_EXCLUIR: relay/master.js, relay/chat-agent.js, relay/projects.json
NOTAS: Ver sección técnica abajo
```

---

## Justificación técnica

### FileFlowGraph — sí pertenece a flujos

`file-flow-graph.js` y sus nodos (`file-type-detector-node.js`, `cuadro-retorno-node.js`,
`comprobante-node.js`, `banking-extraction-node.js`) son lógica exclusiva del financial-bot:
procesan archivos enviados por clientes por Telegram (cuadros de retorno IAS, comprobantes SPEI,
estados de cuenta). Viven en `financial/bot/graph/` y dependen de `DocumentIntelligenceAgent`,
`BalanceManager` y `BankingManager`. No fue un error de contexto — es scope de flujos.

### Bug crítico resuelto en deploy/financial-llm-complete

Confirmado: el branch `migrate-llms-deepseek-gemini` tiene el constructor roto:
- `TransactionOrchestrator.js` cambió a `constructor(llmClient, opts)` — espera objeto OpenAI
- `financial-bot.js:104` seguía pasando `process.env.ANTHROPIC_API_KEY` (string)
- Resultado: crash silencioso `TypeError: this.client.chat.completions.create is not a function`

El branch `deploy/financial-llm-complete` tiene el fix correcto:
```js
// financial-bot.js — instanciación correcta
const transactionOrchestrator = DEEPSEEK_KEY
  ? new TransactionOrchestrator(llm, { model: process.env.DEEPSEEK_PRO_MODEL ?? 'deepseek-v4-pro' })
  : null;
```
donde `llm` es el cliente `new OpenAI({ apiKey: DEEPSEEK_KEY, baseURL: DEEPSEEK_URL })` ya definido.

### Alerta: model IDs de DeepSeek

Los IDs `deepseek-v4-flash` y `deepseek-v4-pro` usados como fallback en el plan original
pueden ser inválidos según fiscalai. Los fallbacks seguros son:

| Env var | Fallback actual en código | Recomendado |
|---------|--------------------------|-------------|
| `DEEPSEEK_CHAT_MODEL` | `'deepseek-v4-flash'` | `'deepseek-chat'` |
| `DEEPSEEK_PRO_MODEL` | `'deepseek-v4-pro'` | `'deepseek-chat'` |

**Acción sugerida antes del merge**: verificar los IDs reales en el servidor con:
```bash
node -e "
const { OpenAI } = require('openai');
const c = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' });
c.models.list().then(r => r.data.forEach(m => console.log(m.id)));
"
```
o consultar `platform.deepseek.com`. Si los IDs son correctos, el deploy puede proceder.
Si no, ajustar `.env` en el servidor con los IDs válidos antes de `pm2 restart financial-bot`.

### Archivos a incluir en el merge (confirmación)

```
financial/bot/agents/TransactionOrchestrator.js   ✅
financial/bot/agents/vision-agent.js              ✅
financial/bot/agents/invoice-agent.js             ✅
financial/bot/agents/context-reader.js            ✅
financial/bot/agents/response-gen.js              ✅
financial/bot/agents/DocumentIntelligenceAgent.js ✅
financial/bot/financial-bot.js                    ✅ (con fix constructor)
financial/bot/graph/subgraphs/file-flow-graph.js  ✅ (FileFlowGraph — es scope flujos)
financial/bot/graph/nodes/file-flow/*.js          ✅ (4 nodos)
financial/bot/graph/finbot-graph.js               ✅ (conecta file_flow)
financial/bot/sims/mtproto/golden_suite.py        ✅
financial/db/migrate-financial-v19.sql            ✅
```

```
relay/master.js        ❌ (dominio ai-monitor)
relay/chat-agent.js    ❌ (dominio ai-monitor)
relay/projects.json    ❌ (cambios ya coordinados desde ai-monitor)
```

---

## Plan de deploy post-merge

```bash
cd /var/www/html/vilarkptl.com/ai-monitor

# 1. Verificar IDs DeepSeek en .env (ver sección arriba)
# 2. Merge selectivo
git fetch origin deploy/financial-llm-complete
git checkout main && git pull origin main
git checkout origin/deploy/financial-llm-complete -- \
  financial/bot/agents/ \
  financial/bot/financial-bot.js \
  financial/bot/graph/ \
  financial/bot/sims/mtproto/golden_suite.py \
  financial/db/migrate-financial-v19.sql

git add financial/
git commit -m "deploy: DeepSeek V4 + Gemini VisionAgent + FileFlowGraph + golden suite (v19)"
git push origin main

# 3. Apply migration
DB_PASS=$(grep -oP 'DB_PASS=\K.*' backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring < financial/db/migrate-financial-v19.sql

# 4. Install deps and restart
npm --prefix financial/bot install
pm2 restart financial-bot

# 5. Verificación
node -e "require('./financial/bot/agents/TransactionOrchestrator'); console.log('TO OK')"
node -e "require('./financial/bot/graph/subgraphs/file-flow-graph'); console.log('FileFlowGraph OK')"
cd financial/bot/sims/mtproto && python3 golden_suite.py
```

---

STATUS: done
PENDING: verificación IDs DeepSeek en servidor antes de pm2 restart
USER_REQUIRED: confirmar model IDs válidos en platform.deepseek.com y ajustar .env si es necesario
