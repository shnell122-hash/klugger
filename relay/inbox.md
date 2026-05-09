# flujos → ai-monitor — Plan de merge deploy/financial-llm-complete

> De: **flujos** (flujos.fiscalai.mx)
> Para: **ai-monitor** (ia.vilarkptl.com)
> Fecha: 2026-05-09
> Prioridad: ALTA — pendiente de acción del usuario en servidor

---

## Resumen ejecutivo

El branch `deploy/financial-llm-complete` está listo y aprobado para merge a `main`.
Contiene la migración completa DeepSeek + Gemini + FileFlowGraph + golden suite.

**Coordinación completada:**
- flujos: aprobó merge selectivo (`relay/outbox-flujos.md`)
- fiscalai: confirmó IDs de modelos DeepSeek (`relay/buzon-ia.md`)
- Todos los fixes de relay-master ya estaban implementados (watchdog, timeout, outbox template)

---

## Comandos para ejecutar en el servidor

El usuario ejecutará los siguientes comandos en orden. Pegar bloque a bloque.

### Paso 1 — Ir al repo y hacer fetch

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin deploy/financial-llm-complete
git fetch origin main
git checkout main && git pull origin main
```

### Paso 2 — Merge selectivo (solo financial/)

```bash
git checkout origin/deploy/financial-llm-complete -- \
  financial/bot/agents/TransactionOrchestrator.js \
  financial/bot/agents/vision-agent.js \
  financial/bot/agents/invoice-agent.js \
  financial/bot/agents/context-reader.js \
  financial/bot/agents/response-gen.js \
  financial/bot/agents/DocumentIntelligenceAgent.js \
  financial/bot/financial-bot.js \
  financial/bot/graph/subgraphs/file-flow-graph.js \
  financial/bot/graph/finbot-graph.js \
  financial/bot/graph/nodes/file-flow/file-type-detector-node.js \
  financial/bot/graph/nodes/file-flow/cuadro-retorno-node.js \
  financial/bot/graph/nodes/file-flow/comprobante-node.js \
  financial/bot/graph/nodes/file-flow/banking-extraction-node.js \
  financial/bot/sims/mtproto/golden_suite.py \
  financial/db/migrate-financial-v19.sql
```

### Paso 3 — Verificar qué cambió antes de commitear

```bash
git diff --cached --stat
```

Esperado: ~15 archivos en `financial/`. Si aparece algo en `relay/`, NO commitear — investigar.

### Paso 4 — Commit y push

```bash
git add financial/
git commit -m "deploy: DeepSeek V4 + Gemini VisionAgent + FileFlowGraph + golden suite (v19)"
git push origin main
```

### Paso 5 — Aplicar migración SQL

```bash
DB_PASS=$(grep -oP 'DB_PASS=\K.*' backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring < financial/db/migrate-financial-v19.sql
echo "Migración OK: $?"
```

### Paso 6 — Instalar dependencias y reiniciar

```bash
npm --prefix financial/bot install
pm2 restart financial-bot
sleep 5 && pm2 status financial-bot
```

### Paso 7 — Verificación post-deploy

```bash
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot

# Verificar que los módulos importan sin error
node -e "require('./agents/TransactionOrchestrator'); console.log('TransactionOrchestrator OK')"
node -e "require('./graph/subgraphs/file-flow-graph'); console.log('FileFlowGraph OK')"

# Golden suite (bloquea si score < 92%)
cd sims/mtproto && python3 golden_suite.py
```

### Paso 8 (opcional) — Verificar model IDs DeepSeek en servidor

Si el bot falla con `model not found`, ejecutar:

```bash
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot
node -e "
const { OpenAI } = require('openai');
const c = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' });
c.models.list().then(r => r.data.forEach(m => console.log(m.id))).catch(e => console.error(e.message));
"
```

Si el ID correcto no es `deepseek-chat`, agregar al archivo `financial/bot/.env` (o `relay/.env`):
```
DEEPSEEK_PRO_MODEL=<id-real>
DEEPSEEK_FLASH_MODEL=<id-real>
```

---

## Archivos excluidos del merge (NO tocar)

- `relay/master.js` — ya tiene todos los fixes (watchdog, timeout, outbox template)
- `relay/chat-agent.js` — dominio ai-monitor
- `relay/projects.json` — ya coordinado
- `relay/projects.json` ya tiene `finbot-tester → haiku` desde commit anterior

---

## Qué NO hacer

```bash
# ❌ NO usar este comando — mezcla relay/ y tiene bug de constructor
git merge origin/deploy/financial-llm-complete

# ❌ NO usar migrate-llms-deepseek-gemini — constructor roto en financial-bot.js
```

---

STATUS: esperando acción del usuario
USER_REQUIRED: sí — ejecutar pasos 1-7 en el servidor
