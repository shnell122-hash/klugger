# Autodiagnóstico — FinBot Sistema Multi-Agente
> Generado: 2026-05-03 | Rama: `claude/financial-multiagent-system-YwtYQ`

---

## 1. Estado General del Sistema

| Componente | Estado | PM2 ID |
|------------|--------|--------|
| financial-bot (monolito legado) | ✅ Online | 24 |
| conversation-engine (testing) | ✅ Online (pausable con `pm2 stop 27`) | 27 |
| financial-dashboard | ✅ Online | 23 |
| relay-master | ✅ Online (kill-switch activo) | 15 |
| cursor-worker | ✅ Online | 26 |
| ai-monitor backend | ✅ Online | 25 |

### Kill-switch
- **Activado**: $15.80 gastados ≥ límite $15.00
- **Causa**: finbot-verifier (Cursor agents) + coordinator + relay tasks
- **Reactivar**: `/reanudar` o `/limite total 20` en el bot de Telegram del relay
- **Nota importante**: el kill-switch NO afecta al `conversation-engine` porque este proceso NO usa el API de Claude — usa Telethon (MTProto) directamente. Para detener el testing: `pm2 stop 27` en el servidor.

---

## 2. Motor de Testing: Conversation Engine

### Arquitectura (sin LLM)

```
conversation_engine.py  (Python, PM2 27)
        │
        ├── Telethon (MTProto) → envía mensajes REALES a Telegram
        │   sin pasar por Bot API → bypasea filtros bot-to-bot
        │
        ├── 3 cuentas simuladoras: GV (admin), Noela, Kevin
        │   ↓ mensajes de texto / CLABEs / archivos / notas de voz
        │
        └── financial-bot recibe y responde en Telegram
                ↓
            BotResponseCollector captura respuesta
                ↓
            learning.py evalúa → BD ai_monitoring
```

**Los mensajes de testing son 100% determinísticos en estructura, aleatorios en contenido.**
No hay ningún LLM generando los mensajes — son templates hardcodeados (`FRASES_IAS`, `FRASES_SPEI`, `AMBIENT_CHATS`, etc.) con selección aleatoria. El único LLM involucrado es el financial-bot respondiéndoles.

### Parámetros clave

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `BOT_RESPONSE_TIMEOUT` | 18s | Tiempo máximo esperando respuesta del bot |
| `DELAY_BETWEEN_MESSAGES` | 3s | Pausa entre mensajes del mismo escenario |
| `DELAY_BETWEEN_SCENARIOS` | 8s | Pausa entre escenarios distintos |
| `ROUNDS_PER_REPORT` | 10 | Rounds antes de publicar resumen en Telegram |

### Cómo pausar/reanudar el testing

```bash
# Pausar
pm2 stop 27

# Reanudar
pm2 start 27

# Ver logs en tiempo real
pm2 logs 27 --lines 50

# Forzar tier específico para pruebas
# (editar conversation_engine.py temporalmente, arg --tier 2)
python conversation_engine.py --tier 2 --rounds 10
```

---

## 3. Modelo de Aprendizaje (Curriculum Learning + CBR)

### Esquema de BD: tablas de aprendizaje

```sql
-- Episodio = una ronda de tests completa
learning_episodes (
  id, episode_num, started_at, completed_at,
  complexity_tier,    -- 1=Básico 2=Intermedio 3=Avanzado 4=EdgeCases
  total_tests, passed_tests, skipped_tests,
  score_pct,          -- passed/total * 100
  git_sha,            -- commit desplegado al momento del episodio
  triggered_by        -- 'auto' | 'manual'
)

-- Resultado de cada test dentro del episodio
learning_test_results (
  id, episode_id, test_id, passed,
  detail,             -- mensaje de error o éxito
  duration_ms,
  db_snapshot         -- JSON del estado de BD relevante
)

-- Patrones de falla recurrentes (Case-Based Reasoning)
learning_patterns (
  id, pattern_key,    -- hash del test_id + tipo de error
  test_id, description,
  status,             -- 'active' | 'resolved'
  occurrence_count,   -- total veces detectado
  consecutive_count,  -- episodios SEGUIDOS con esta falla
  first_seen_episode, last_seen_episode, resolved_episode
)

-- Fixes aplicados (efectividad de cada corrección)
learning_fixes (
  id, pattern_id, commit_sha, commit_message,
  effectiveness,      -- 0.0-1.0 calculado post-fix
  applied_at
)
```

### Queries útiles de diagnóstico

```sql
-- Últimos 10 episodios con score
SELECT episode_num, complexity_tier, score_pct,
       passed_tests, total_tests, git_sha,
       TIMESTAMPDIFF(MINUTE, started_at, completed_at) AS duracion_min
FROM learning_episodes
ORDER BY episode_num DESC LIMIT 10;

-- Patrones activos ordenados por severidad
SELECT pattern_key, test_id, description,
       consecutive_count, occurrence_count, last_seen_episode
FROM learning_patterns
WHERE status='active'
ORDER BY consecutive_count DESC;

-- Evolución del score por episodio (para graficar)
SELECT episode_num, score_pct, complexity_tier
FROM learning_episodes
WHERE completed_at IS NOT NULL
ORDER BY episode_num;

-- Tests que más fallan
SELECT test_id,
       COUNT(*) AS total_apariciones,
       SUM(CASE WHEN passed=0 THEN 1 ELSE 0 END) AS fallos,
       ROUND(SUM(CASE WHEN passed=0 THEN 1 ELSE 0 END)/COUNT(*)*100,1) AS pct_fallo
FROM learning_test_results
GROUP BY test_id
ORDER BY pct_fallo DESC;

-- Verificar operaciones registradas en últimas pruebas
SELECT id, tipo_operacion, monto_bruto, monto_neto,
       estado, created_at
FROM fin_operations
ORDER BY id DESC LIMIT 10;
```

### Lógica de avance de tier (Curriculum Learning)

```
Tier 1 (Básico):   saldo, IAS básicos, cuadro PNG
Tier 2 (Intermedio): + SPEI, SINDICATO, cuadro XLSX, CLABEs
Tier 3 (Avanzado):   + EFECTIVO, TARJETAS, edge cases de monto, CLABE inválida
Tier 4 (Edge Cases): + ciclo de fin de mes, financiamiento Kevin, facturas

Avance: si los últimos 2 episodios tienen score >= 80% → siguiente tier
Actualmente: Tier 2 (score 73.3% → necesita llegar a 80%)
```

### Despacho automático de fixes (two-tier)

```
Score < 80% + patrones ≥ 2 episodios consecutivos
    → escribe en relay/inbox-finbot-verifier.md
    → Cursor agent verifica logs + hace fix + pm2 restart

Score < 65% + patrones ≥ 5 episodios consecutivos
    → escribe en relay/claude-code-inbox.md  (cooldown 30 min)
    → Claude Code CLI analiza + fix de código + commit + push
```

---

## 4. Estado de la Migración LangGraph

### Progreso por Parte

| Parte | Descripción | Estado | Archivos |
|-------|-------------|--------|---------|
| 1 | Skeleton: StateGraph, State, MySQLCheckpointer | ✅ Done | `graph/finbot-graph.js`, `state.js`, `mysql-checkpointer.js` |
| 2 | RouterNode + ParseNode + CommissionNode | ✅ Done | `nodes/router.js`, `nodes/text-flow/parse-node.js`, `commission-node.js` |
| 3 | CalculatorNode + VerifierNode + AskFieldsNode | ✅ Done | `calculator-node.js`, `verifier-node.js`, `ask-fields-node.js` |
| 4 | BankingQueryNode + ConfirmationNode + ApplyOperationNode | ✅ Done | `banking-query-node.js`, `confirmation-node.js`, `apply-operation-node.js` |
| 5 | FileFlowGraph (cuadro retorno, comprobante, banking extraction) | ❌ Pendiente | `subgraphs/file-flow-graph.js` |
| 6 | AsistenteModeGraph + VoiceFlowGraph | ❌ Pendiente | |
| 7 | CallbackFlowGraph + EditFieldGraph | ❌ Pendiente | |
| 8 | MySQLCheckpointer completo + migración fin_sessions | ❌ Pendiente | |
| 9 | SupervisorNode (reemplaza TransactionOrchestrator) | ❌ Pendiente | |
| 10 | financial-bot-v2.js + cutover producción | ❌ Pendiente | |

### TextFlowGraph (completo tras Parte 4)

```
[__start__]
    │
    ▼
[ParseNode] ──── ask_tipo/ask_monto ──→ [AskFieldsNode] → END
    │
    ▼ (tipo + monto detectados)
[CommissionNode]
    │
    ▼
[CalculatorNode]
    │
    ▼
[VerifierNode] ─── ask_fields ──→ [AskFieldsNode] → END
    │
    ▼ (draft válido)
[BankingQueryNode] ─── await_banking ──→ END (espera CLABE/selección)
    │ (cuentas ya en draft o no aplica)
    ▼
[ConfirmationNode] ─── await_confirmation ──→ END (espera poll)
    │ poll:confirm
    ▼
[ApplyOperationNode] → END ✅
```

### Archivos del grafo

```
financial/bot/graph/
├── finbot-graph.js          ← grafo principal (router → subgrafos)
├── state.js                 ← FinBotStateAnnotation (todos los campos)
├── mysql-checkpointer.js    ← persiste estado en fin_sessions
├── nodes/
│   ├── router.js            ← RouterNode (text/file/voice/callback)
│   └── text-flow/
│       ├── parse-node.js
│       ├── commission-node.js
│       ├── calculator-node.js
│       ├── verifier-node.js
│       ├── ask-fields-node.js
│       ├── banking-query-node.js
│       ├── confirmation-node.js
│       └── apply-operation-node.js
└── subgraphs/
    └── text-flow-graph.js   ← TextFlowGraph compilado (Partes 2-4)
```

---

## 5. Análisis de Costos y Eficiencia

### Desglose aproximado del gasto ($15.80)

| Fuente | Modelo | Estimación |
|--------|--------|-----------|
| finbot-verifier (Cursor agents) | claude-sonnet-4-6 | ~$8-10 |
| coordinator (dispatches) | claude-haiku-4-5 | ~$2-3 |
| Claude Code CLI (relay tasks) | claude-sonnet-4-6 | ~$3-4 |
| conversation-engine (Telethon) | **NINGUNO** | $0.00 |

**El testing en sí cuesta $0** — los $15.80 son de los agentes de corrección/coordinación, no del testing.

### Eficiencia por fase

| Actividad | Costo estimado | Valor entregado |
|-----------|---------------|-----------------|
| LangGraph Partes 1-4 | ~$4 | 8 nodos + grafo completo de texto |
| Relay + inbox/outbox setup | ~$2 | Comunicación bidireccional Claude Code ↔ servidor |
| BotResponseCollector cursor fix | ~$1 | Elimina falsos positivos en operacion* tests |
| learning.py two-tier dispatch | ~$1 | Auto-fixes sin intervención manual |
| finbot-verifier (3 runs fallidas) | ~$5 | ❌ Fallaron por créditos insuficientes (gasto perdido) |

### Observación clave sobre ineficiencia

Los ~$5 del finbot-verifier se gastaron en **3 intentos fallidos** por créditos de Anthropic agotados. El relay-master reintentó 3 veces (`STOP automático`). Esto es gasto quemado sin valor.

**Recomendación**: configurar alerta de créditos bajo en console.anthropic.com antes de correr sesiones largas de finbot-verifier.

---

## 6. Trayectoria de Scores por Episodio (datos reales)

> Datos completos de la sesión de testing (2026-05-03):

| Episodio | Score | Tier | Tests fallando | Patrón dominante |
|---------|-------|------|----------------|-----------------|
| **#220** | 60.0% (9/15) | 2 | `saldo_gv`, `saldo_kevin`, `saldo_noela` (timeout), `operacion_*` (keywords) | `saldo_gv_send_message_failed` ×116 |
| **#245** | 57.1% (8/14) | 2 | mismo + `operacion_*` | `saldo_gv_send_message_failed` ×130 |
| **#319** | 57.1% (8/14) | 2 | mismo | `saldo_gv_send_message_failed` ×174 |
| **#344** | 57.1% (8/14) | 2 | mismo | `saldo_gv_send_message_failed` ×190 |
| **#392** | **73.3%** (11/15) | 2 | `operacion_*` (timeout), `clabe_noela` (timeout) | `clabe_gv_send_message_failed` ×6 ← **salto** |
| **#442** | 73.3% (11/15) | 2 | `operacion_*` (timeout), `clabe_kevin` (timeout) | `clabe_gv_*` ×4-17 |
| **#496+** | Pendiente | 2 | — | **Cursor fix activo** (d090bcc) |

### Análisis de la trayectoria

**Fase 1 — Episodios #220–#344 (plateau en 57-60%)**

El sistema estuvo **bloqueado 174+ episodios** por el mismo bug: la sesión Telethon de GV se desconectaba. El patrón `saldo_gv_send_message_failed_cannot_send_request` creció de ×116 a ×190 sin resolverse. Esto demuestra que el **dispatch automático de fixes no existía aún** en esa fase — la tarea tuvo que escalarse manualmente.

Además: `operacion_*` fallaba desde el principio (ep. #220) con `respuesta sin keywords ['resumen', 'monto', 'comision']: '✅ Guardado · 1 cuenta(s)'` — esto es el bug del cursor de `BotResponseCollector`: el `wait()` devolvía la respuesta del CLABE anterior en vez de esperar la respuesta a la frase de operación. Este bug estuvo activo durante TODO el plateau.

**Fase 2 — Episodio #392 (salto a 73.3%)**

El fix de `ensure_connected(force=True)` resolvió el patrón de GV. Los tests de saldo pasaron inmediatamente. Pero `operacion_*` siguió fallando porque el cursor bug aún no estaba corregido.

**Fase 3 — Post #442 (cursor fix desplegado)**

`BotResponseCollector` ahora usa cursor tracking: `mark_consumed()` antes de cada mensaje intermedio + `drain=2.0` al final. El `operacion_*` (4 de 15 tests = 27% del score) debería recuperarse. Score esperado: **85-90%** → avance a Tier 3.

### Evolución de patrones activos (datos reales)

| Patrón | Ep. inicio | Ep. resolución | Duración | Causa raíz | Fix |
|--------|-----------|---------------|----------|-----------|-----|
| `saldo_gv_send_message_failed` | <#220 | ~#392 | **≥174 episodios** | Sesión GV Telethon stale TCP | `ensure_connected(force=True)` ✅ |
| `saldo_gv_timeout` | <#220 | ~#392 | **≥95 episodios** | mismo | mismo fix ✅ |
| `operacion_*_wrong_response` | <#220 | ~#496 | **≥276 episodios** | `BotResponseCollector.wait()` devolvía cached | cursor tracking fix ✅ |
| `clabe_gv_send_message_failed` | ~#344 | activo | ×17 | Sesión GV stale para CLABE | `ensure_connected(force=True)` ✅ |
| `clabe_gv_timeout` | ~#430 | activo | ×4 | mismo | mismo fix ✅ |

### Lección clave: costo del bug no detectado

El bug del `BotResponseCollector` estuvo activo durante **toda la sesión** (~276+ episodios) pero no se detectó porque los fallos de `operacion_*` eran enmascarados por el patrón `saldo_gv` (que era más frecuente y ruidoso). Solo cuando `saldo_gv` se resolvió en #392, quedó visible que `operacion_*` seguía fallando.

**Recomendación**: implementar alertas separadas por categoría de test (`saldo_*`, `operacion_*`, `clabe_*`, `cuadro_*`) para detectar regresiones en cada flujo de forma independiente.

---

## 7. Agentes del Financial-Bot

### Modelos por agente

| Agente | Archivo | Modelo | API Key | Cuándo se usa |
|--------|---------|--------|---------|--------------|
| TransactionOrchestrator | `agents/TransactionOrchestrator.js` | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` | Routing ambiguo, supervisión |
| DocumentIntelligenceAgent | `agents/DocumentIntelligenceAgent.js` | `gemini-1.5-flash` | `GOOGLE_API_KEY` | Cuadros, comprobantes, CLABEs en imagen |
| VisionAgent (fallback) | `agents/vision-agent.js` | `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` | OCR cuando Gemini falla |
| InvoiceAgent | `agents/invoice-agent.js` | `deepseek-chat` | `DEEPSEEK_API_KEY` | Facturas CFDI |
| ContextReader | `agents/context-reader.js` | `deepseek-chat` | `DEEPSEEK_API_KEY` | Análisis de contexto conversacional |
| ResponseGen | `agents/response-gen.js` | `deepseek-chat` | `DEEPSEEK_API_KEY` | Respuestas texto libre |
| Verifier | `agents/verifier.js` | rule-based | — | Validación matemática (sin LLM) |

### Costo por operación (estimado)

| Operación | LLM llamados | Costo por llamada |
|-----------|-------------|-------------------|
| IAS/SPEI texto claro | Ninguno (parser rule-based) | $0.00 |
| Texto ambiguo | TransactionOrchestrator (Sonnet) | ~$0.01 |
| Cuadro retorno (PNG/XLSX) | DocumentIntelligenceAgent (Gemini) | ~$0.005 |
| Nota de voz | Gemini (transcripción) | ~$0.003 |
| Factura CFDI | InvoiceAgent (DeepSeek) | ~$0.002 |

---

## 8. Sugerencias de Mejora

### Inmediatas (sin costo adicional)

1. **Pausar testing mientras se analiza**: `pm2 stop 27` — los episodios post cursor-fix aún no son visibles; conviene esperar los próximos 10 episodios para confirmar la mejora antes de continuar.

2. **Límite de créditos en Anthropic Console**: Configurar alerta en console.anthropic.com para evitar los ~$5 de intentos fallidos por créditos agotados.

3. **Reducir reintentos de finbot-verifier**: El relay-master reintenta 3 veces por defecto. Con créditos justos, esto triplica el costo de fallos. Considerar reducir a 1 reintento para el finbot-verifier.

### Corto plazo (LangGraph)

4. **Parte 5 siguiente**: FileFlowGraph (cuadro retorno + comprobante + extracción bancaria). Esto mejoraría los tests `cuadro_png_*` y `comprobante_*` que ya pasan, pero con la arquitectura correcta.

5. **Integrar LangGraph Partes 1-4 con financial-bot.js**: Actualmente los nodos existen pero no se invocan desde el bot. La integración real empieza en Parte 2 (wrapper en `bot.on('message:text')`).

### Mediano plazo

6. **Monitor de score en dashboard**: Añadir una página en `dashboard-financial` que grafique `learning_episodes.score_pct` por episodio — actualmente solo se ve en Telegram.

7. **Separar créditos de testing vs producción**: El finbot-verifier usa el mismo `ANTHROPIC_API_KEY` que el bot de producción. Un key separado para testing evitaría que el testing sature el presupuesto de producción.

8. **Tier 3 como objetivo inmediato**: Una vez confirmado el score > 80% con el cursor fix, avanzar a Tier 3 agrega EFECTIVO, TARJETAS y edge cases de montos — escenarios críticos que el bot actual maneja pero el testing no cubre.

---

## 9. AI Monitor — Panel de Control

### Acceso
- **URL**: https://ia.vilarkptl.com
- **Puerto local**: 3010 (Express + Socket.io)
- **Proceso PM2**: 25 (`ai-monitor`)

### Qué muestra
- Tool calls de todos los agentes Claude Code / relay en tiempo real
- Costos por sesión y acumulados
- Kill-switch activo/inactivo
- Tab **Alertas**: errores de commit quality, sesiones sin cambios, deploy failures

### Consultar el ai-monitor para aprendizaje

```bash
# Ver costos recientes por agente
curl http://localhost:3010/api/costs?limit=20 | jq .

# Ver últimas sesiones del relay
curl http://localhost:3010/api/sessions?project=claude-code-suborq | jq .

# Ver alertas del sistema
curl http://localhost:3010/api/alerts | jq .
```

---

## 10. Relay — Instrucciones para el Agente claude-code

### Archivos del relay

```
relay/
├── claude-code-inbox.md     ← Aquí llegan tareas para Claude Code
├── claude-code-outbox.md    ← Aquí Claude Code reporta resultados
├── episode-results.jsonl    ← Push de episodios cada 10 rounds (read via GitHub MCP)
├── projects.json            ← Config de agentes (incluyendo claude-code-suborq)
└── agents/
    └── claude-code.md       ← Prompt/contexto del agente Claude Code
```

### Flujo completo

```
1. GV en Telegram: "necesito que claude-code haga X"
2. Coordinator escribe en claude-code-inbox.md
3. relay-master detecta cambio → spawns Claude Code CLI
4. Claude Code lee inbox → ejecuta → push a rama
5. Claude Code escribe en claude-code-outbox.md
6. relay-master lee outbox → notifica en Telegram
```

### Formato del inbox (obligatorio)

```markdown
## Fix automático — Episodio #NNN
Score: XX.X% — bajo el umbral del 65%

### Patrones severos (≥5 episodios consecutivos):
- **patron_key** (×N episodios): descripción del error

### Tests fallando:
- `test_id`: detalle del fallo
  Respuesta bot: `respuesta actual`

### Instrucciones:
1. Analizar patrón + pm2 logs financial-bot --nostream --lines 50
2. Fix mínimo necesario
3. Commit + push a claude/financial-multiagent-system-YwtYQ
4. Escribir resultado en relay/claude-code-outbox.md
```

---

## 11. Checklist de Reinicio tras Kill-switch

```bash
# 1. Reactivar relay-master
# Enviar en Telegram: /reanudar  (o /limite total 20)

# 2. Verificar estado actual de episodios
mysql -u root -p"$DB_PASS" ai_monitoring -e "
SELECT episode_num, score_pct, complexity_tier
FROM learning_episodes ORDER BY id DESC LIMIT 5;"

# 3. Ver patrones activos
mysql -u root -p"$DB_PASS" ai_monitoring -e "
SELECT pattern_key, consecutive_count, status
FROM learning_patterns WHERE status='active'
ORDER BY consecutive_count DESC;"

# 4. Reanudar conversation-engine (si estaba pausado)
pm2 start 27

# 5. Verificar que financial-bot está respondiendo
pm2 logs financial-bot --nostream --lines 20

# 6. Ajustar límite de créditos
# Ir a console.anthropic.com → Billing → configurar alerta
```

---

*Rama: `claude/financial-multiagent-system-YwtYQ` | Último commit: `cd5de54`*
*Generado por Claude Code CLI — Suborquestador Financiero*
