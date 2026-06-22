# Diagnóstico — Financial Bot · 2026-05-18

> Score actual: **40%** (ep. #1674) — Score objetivo: **≥90%**

---

## Stack actual

| Componente | Tecnología | Proceso PM2 |
|---|---|---|
| Financial Bot | Grammy + Node.js | `financial-bot` |
| Conversation Engine | Python + Telethon MTProto | `conversation-engine` |
| Dashboard | Next.js | `financial-dashboard` |
| Relay / Orquestador | Node.js (`relay/master.js`) | `relay-master` |
| DB | MySQL · base `ai_monitoring` | — |
| LLM Orquestador | DeepSeek Chat (OpenAI-compat) | TransactionOrchestrator |
| LLM Documentos | Gemini 2.0 Flash | DocumentIntelligenceAgent |
| LLM Visión fallback | Claude Haiku 4.5 | VisionAgent |
| Agente código | Claude Code CLI | relay → inbox/outbox |

---

## Problemas activos

### P1 — `modo=asistente` persiste tras restart del engine 🔴 CRÍTICO

**Síntoma:** Todas las operaciones IAS/SPEI/saldo responden `✅ Guardado · 1 cuenta(s)` en vez del flujo normal. Timeouts en saldo/monto/efectivo.

**Causa raíz:** `conversation_engine.py` llamaba `set_asistente_mode(chat_id)` una sola vez al inicializar (línea 1332). Cuando el engine se reinicia (PM2 restart, crash) resetea `fin_chats.modo = 'asistente'` para el chat de prueba. Los 45 tests del episodio corren en modo silencioso.

**Fix disponible:** Commit `28208b9` — modo per-escenario en `run_scenario`. **Pendiente deploy.**

**Fix inmediato en servidor:**
```bash
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring -e "UPDATE fin_chats SET modo='normal' WHERE modo='asistente';"
```

---

### P2 — Deploy lag: 40–100 episodios entre fix y producción 🟠 ALTO

**Síntoma:** Fixes commitados esperan 40–100 episodios (varias horas) antes de llegar a producción. El score sigue cayendo mientras el fix existe pero no está activo.

**Causa raíz:** Deploy 100% manual. No hay agente que ejecute `git checkout origin/branch -- file && pm2 restart` cuando el outbox marca "DEPLOYED: pendiente".

**Impacto cuantificado:** P1 activo desde ep. #1634. Fix disponible desde ep. #1619. 40+ episodios × 45 tests = 1,800 tests perdidos innecesariamente.

**Propuesta:** Ver R1 abajo.

---

### P3 — `esperando_datos_bancarios` session contamination 🟡 MEDIO

**Síntoma:** `saldogv`, `saldokevin`, `saldonoela` → `✅ Cuenta guardada:\n\n\n\n¿Es correcto?` (CLABE vacía guardada silenciosamente).

**Causa raíz:** El handler de `esperando_datos_bancarios` llamaba `filtrarCuentasAjenas([])` incluso cuando `parsearTexto` devolvía vacío, guardaba una cuenta vacía y hacía `return` bloqueando el fall-through a procesamiento normal.

**Fix:** Commit `0bd49af` — `else` block. Deployado, enmascarado por P1. Se verificará al resolver P1.

---

### P4 — Imágenes comprobante ilegibles (score residual ~5%) 🟡 MEDIO

**Síntoma:** `comprobantekevin`, `reintegrofactura`, `cuadropnggv` → `📷 No pude leer los números en la imagen.`

**Causa raíz:** DocumentIntelligenceAgent (Gemini 2.0 Flash) no puede extraer montos de imágenes JPG generadas sintéticamente por `assets.py`. Posible incompatibilidad de formato, DPI insuficiente, o falta de contexto visual que Gemini espera en comprobantes reales.

**Sin fix aún.**

---

### P5 — Patrón `saldogvtimeout` acumulado (×70 episodios) 🟢 BAJO

**Síntoma:** `saldogv` → timeout 18s durante muchos episodios.

**Causa raíz:** En modo asistente, el bot silencia todo texto sin CLABE. El timeout es el comportamiento correcto en ese modo. Se resuelve al resolver P1.

---

## Propuestas de mejora

### R1 — Auto-deploy desde outbox (PRIORITARIO)

El `relay-master`, `finbot-verifier`, o un nuevo proceso puede leer el outbox del agente y ejecutar deploys automáticamente cuando detecta `DEPLOYED: pendiente`.

**Lógica propuesta:**
```bash
# Al leer outbox-flujos.md y encontrar "DEPLOYED: pendiente":
FILES=$(grep -oP 'financial/bot/\S+\.(?:js|py)' relay/outbox-flujos.md)
BRANCH="claude/financial-multiagent-system-YwtYQ"
git fetch origin $BRANCH
for f in $FILES; do
  git checkout origin/$BRANCH -- $f
done
pm2 restart financial-bot
pm2 restart conversation-engine
```

**Beneficio:** Elimina el deploy lag. Fixes llegarían en el siguiente episodio (~2 min), no en 40+ episodios.

**Riesgo:** Deploy automático puede aplicar código con bugs no detectados. Mitigación: solo deployar cuando el outbox tiene `STATUS: done` + firma de commit verificada.

---

### R2 — Session cleanup timer en financial-bot

Agregar reset automático de sesiones con más de N minutos en estados intermedios. El conversation engine espera ~15s entre escenarios, pero una sesión contaminada puede persistir entre episodios completos.

```js
// Al inicio del handler de texto, después de getOrCreateSession:
if (['esperando_datos_bancarios', 'esperando_monto', 'esperando_entrega'].includes(session.estado)) {
  const staleMs = Date.now() - new Date(session.updated_at).getTime();
  if (staleMs > 5 * 60 * 1000) { // 5 minutos
    await updateSession(session.id, 'idle', null);
    session.estado = 'idle';
    session.operation_draft_json = null;
  }
}
```

**Beneficio:** Previene que una sesión contaminada afecte todos los tests subsecuentes del episodio.

---

### R3 — Chat ID separado para escenarios asistente

`sim-gv.js` ya usa `ASISTENTE_CHAT_ID` (env `SIM_ASISTENTE_CHAT_ID`) correctamente. Migrar los escenarios `"mode": "asistente"` de `conversation_engine.py` a ese chat separado, que ya está en modo asistente de forma permanente.

Esto elimina completamente la necesidad de alternar `fin_chats.modo` en el chat principal y hace los tests asistente/normal completamente independientes.

```python
# En run_scenario, en vez de cambiar el modo del chat principal:
target_chat_id = ASISTENTE_CHAT_ID if is_asistente else chat_id
```

**Beneficio:** Cero interferencia entre escenarios. No se necesita lógica de mode-switching.

---

### R4 — Mejorar detección de imágenes comprobante

Las imágenes de `assets.py` son sintéticas (generadas en Python con PIL). Gemini Flash puede tener problemas con formato, DPI o elementos que comprobantes reales tienen y los sintéticos no.

Opciones en orden de prioridad:
1. **Aumentar DPI/calidad** en `assets.py` al generar comprobantes PNG
2. **Agregar texto OCR explícito** en el caption de Telegram al enviar la imagen (context hint para el LLM)
3. **GPT-4o Vision como segundo fallback** después de Gemini, antes de Haiku
4. **pytesseract** en el servidor para OCR directo en imágenes sintéticas

---

## Estado de deploys pendientes

| Commit | Archivo | Descripción | Estado servidor |
|---|---|---|---|
| `0bd49af` | `financial/bot/financial-bot.js` | Fix `esperando_datos_bancarios` else block | ✅ Deployado (enmascarado por P1) |
| `28208b9` | `financial/bot/sims/mtproto/conversation_engine.py` | Fix modo per-escenario | ❌ Pendiente deploy |

---

## Comandos de recuperación inmediata

```bash
cd /var/www/html/vilarkptl.com/ai-monitor

# Paso 1 — Reset DB (efecto inmediato en siguiente episodio)
DB_PASS=$(grep -oP 'DB_PASS=\K.*' backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring \
  -e "UPDATE fin_chats SET modo='normal' WHERE modo='asistente';"

# Paso 2 — Deploy fix del engine (previene recurrencia)
git fetch origin claude/financial-multiagent-system-YwtYQ
git checkout origin/claude/financial-multiagent-system-YwtYQ \
  -- financial/bot/sims/mtproto/conversation_engine.py
pm2 restart conversation-engine

# Paso 3 — Verificar
pm2 logs conversation-engine --lines 15 --nostream
# Buscar: "[engine] Modo 'normal' activado en fin_chats"
```

**Score esperado post-deploy:** ~88–93%
**Score residual:** ~5–7% por imágenes sintéticas no legibles (P4, sin fix aún)

---

## Por qué los agentes en servidor no logran este nivel de diagnóstico

Los agentes de servidor (Cursor, finbot-verifier) tienen visibilidad de **síntomas** pero no de **causas**. Ven que `saldogv` falla 125 veces pero no pueden trazar:

```
saldo falla
  → sesión en esperando_datos_bancarios (P3)
  → pero también timeout (modo asistente, P1)
  → modo asistente porque engine se reinició
  → engine llama set_asistente_mode() al init (línea 1332)
  → fix: per-scenario mode switching (commit 28208b9)
```

Ese análisis requiere:
- Historial de scores de 100+ episodios
- Lectura de conversation_engine.py + financial-bot.js en contexto
- Correlación entre timestamp de pm2 restart y cambio de score
- Contexto acumulado de sesiones anteriores

**El gap real no es diagnóstico — es ejecución de deploys.** Si el finbot-verifier pudiera leer el outbox y ejecutar `git checkout + pm2 restart` cuando el agente marca deploy pendiente, los fixes llegarían en minutos. Eso es R1.
