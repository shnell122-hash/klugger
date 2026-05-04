# Plan: Reducción de Costos DeepSeek + LangGraph Parte 5

> Actualizado 2026-05-04 — Prioridad: reducir gasto Claude Sonnet + FileFlowGraph

---

## Contexto

El kill-switch se activó a $15.80 porque el relay y los agentes internos del bot usan Claude Sonnet 4.6 de forma excesiva. Los cambios de DeepSeek atacan tres fuentes de costo independientes:

1. **TransactionOrchestrator** (interno al bot): claude-sonnet-4-6 → DeepSeek — se invoca en CADA mensaje ambiguo
2. **relay/projects.json** (relay-master): finbot-tester usa sonnet-4-6 para análisis de logs; bajar a haiku
3. **conversation_engine.py**: 10 rondas cada ~80s quema créditos innecesarios cuando el score está estancado

LangGraph Parte 5 (FileFlowGraph) se prioriza porque los tests de cuadro PNG/XLSX y comprobantes son los que más fallan ahora (razón directa del score 73.3%).

---

## Cambio 1 — TransactionOrchestrator → DeepSeek

**Archivo**: `financial/bot/agents/TransactionOrchestrator.js`

Estado actual (línea 4): `const MODEL = 'claude-sonnet-4-6'` + `@anthropic-ai/sdk`.

Cambios requeridos:
- Reemplazar `@anthropic-ai/sdk` por cliente OpenAI-compatible (mismo patrón que `response-gen.js` ya usa con DeepSeek)
- Model string: usar `process.env.DEEPSEEK_CHAT_MODEL ?? 'deepseek-chat'` para facilitar switch sin redeploy
- Adaptar formato de tool: Claude usa `input_schema`, OpenAI/DeepSeek usa `parameters` (JSON Schema idéntico, solo renombrar la key)
- Adaptar parsing de respuesta: Claude devuelve `content[0].type === 'tool_use'`, DeepSeek devuelve `choices[0].message.tool_calls[0]`
- `tool_choice: { type: 'tool', name: 'decidir_accion' }` → `tool_choice: 'required'`
- API key: `process.env.DEEPSEEK_API_KEY` (ya en servidor)

Riesgo: Bajo — la lógica de negocio no cambia, solo el adaptador de API.

---

## Cambio 2 — relay/projects.json: finbot-tester → haiku

**Archivo**: `relay/projects.json` (línea ~55)

`finbot-tester`: `claude-sonnet-4-6` → `claude-haiku-4-5-20251001`

Justificación: finbot-tester solo ejecuta bash, lee logs y evalúa JSON. Haiku es ~8x más barato que Sonnet.

---

## Cambio 3 — conversation_engine.py: reducir frecuencia

**Archivo**: `financial/bot/sims/mtproto/conversation_engine.py`

| Constante | Línea | Antes | Después |
|-----------|-------|-------|---------|
| `DELAY_BETWEEN_SCENARIOS` | 43 | `8` | `15` |
| `ROUNDS_PER_REPORT` | 45 | `10` | `5` |

---

## Cambio 4 — LangGraph Parte 5: FileFlowGraph

**Archivos nuevos**:
```
financial/bot/graph/
├── subgraphs/file-flow-graph.js          ← NUEVO
└── nodes/file-flow/
    ├── file-type-detector-node.js        ← NUEVO
    ├── cuadro-retorno-node.js            ← NUEVO
    ├── comprobante-node.js               ← NUEVO
    └── banking-extraction-node.js        ← NUEVO
```

**Archivo modificado**: `financial/bot/graph/finbot-graph.js` — conectar `file_flow` al subgrafo (actualmente termina en `__end__`)

### Nodos y reutilización

**FileTypeDetectorNode**:
- `docAgent.procesarBuffer(buffer, mimeType, fileName)` — DocIntelligenceAgent:24
- `docAgent.analizarCuadroRetorno(buffer, mimeType)` — DocIntelligenceAgent:199 para PNG de cuadros retorno
- Router: `cuadro_retorno | comprobante | banking_extraction | __end__`

**CuadroRetornoNode**:
- Extrae lógica de `handleCuadroRetorno()` — financial-bot.js:146-191
- `pool.query INSERT fin_operations (IAS)` + `balanceManager.ajusteManual({ monto: -totalBruto })`
- Output: `replyMessages`, `sessionEstado: 'completado'`

**ComprobanteNode**:
- Lógica de `handleAsistenteModo()` sección comprobante — financial-bot.js:269-344
- `balanceManager.confirmarPago()`
- Output: `replyMessages`, `sessionEstado: 'completado'`

**BankingExtractionNode**:
- `docAgent.extraerCuentasBancarias()` — DocIntelligenceAgent:150
- `filtrarCuentasAjenas()` — financial-bot.js:366
- `bankingManager.guardarCuentas()`

**FileFlowGraph** (subgraph):
```
__start__ → file_type_detector
file_type_detector →(conditional)→ cuadro_retorno | comprobante | banking_extraction | __end__
cada nodo → __end__
```

**finbot-graph.js**: añadir `.addNode('file_flow', fileFlowGraph)` y conectar desde router. La línea ~30 actualmente devuelve `'__end__'` para `file_flow`.

---

## Orden de ejecución

1. Cambio 3 (2 líneas, inmediato)
2. Cambio 2 (1 línea JSON)
3. Cambio 1 (TransactionOrchestrator adapter, ~50 líneas)
4. Cambio 4 (Parte 5, ~200 líneas, 5 archivos nuevos)

---

## Verificación

```bash
# Cambio 1: sin errores de import
node -e "require('./financial/bot/agents/TransactionOrchestrator.js'); console.log('ok')"

# Cambio 4: subgrafo sin errores
node -e "require('./financial/bot/graph/subgraphs/file-flow-graph.js'); console.log('ok')"

# End-to-end Parte 5: enviar PNG de cuadro retorno → fin_operations nueva con tipo=IAS
```

**Nota model ID**: Usar `process.env.DEEPSEEK_CHAT_MODEL ?? 'deepseek-chat'` en el código para que el usuario pueda poner `DEEPSEEK_CHAT_MODEL=deepseek-v4-flash` en `.env` si el ID de V4 es diferente al default.

---

## Estimación de ahorro

| Cambio | Costo actual | Costo después | Ahorro estimado |
|--------|-------------|---------------|-----------------|
| TransactionOrchestrator → DeepSeek | ~$0.015/llamada (Sonnet) | ~$0.0001/llamada (DeepSeek) | ~99% por llamada |
| finbot-tester → Haiku | Sonnet pricing | Haiku pricing | ~87% por tarea |
| conversation_engine delays | 10 rondas/~80s | 5 rondas/~130s | ~60% menos frecuencia |
| **Total estimado** | ~$15/semana (actual) | ~$2-3/semana | **~80-85% reducción** |
