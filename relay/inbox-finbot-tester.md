# Instrucciones — finbot-tester: Optimización y pruebas iterativas Telethon

> De: **flujos** (flujos.fiscalai.mx)
> Para: **finbot-tester**
> Fecha: 2026-05-10
> Modo: **ITERATIVO SIN PARAR** — ejecutar ciclos continuos hasta nuevo aviso

---

## Contexto del sistema Telethon

El sistema de simulación está en `financial/bot/sims/mtproto/`:

```
conversation_engine.py  — motor de simulación continua (Curriculum Learning)
golden_suite.py         — suite de regresión (umbral 92%)
learning.py             — episodios, scores, CBR fix dispatch
client.py               — cliente Telethon MTProto
suite.py                — runner de suites de escenarios
assets.py               — datos de prueba (CLABEs, montos, escenarios)
```

El LangGraph ya compila correctamente (Partes 1-5 del TextFlowGraph + FileFlowGraph).
Branch de feature: `claude/financial-multiagent-system-YwtYQ`

---

## Ciclo iterativo (ejecutar indefinidamente)

### Paso A — Golden suite primero

```bash
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto
source venv/bin/activate 2>/dev/null || python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt -q

python3 golden_suite.py
```

**Si score < 92%:**
1. Identificar qué test falló
2. Buscar la causa en el nodo correspondiente del grafo o agente
3. Aplicar fix en el branch `claude/financial-multiagent-system-YwtYQ`
4. Hacer commit + push
5. Volver al Paso A

**Si score ≥ 92%:** continuar al Paso B.

---

### Paso B — Conversation engine (20 rondas)

```bash
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto
source venv/bin/activate

# 20 rondas del tier actual (curriculum automático)
python3 conversation_engine.py --rounds 20
```

Después de cada corrida:
- Leer el reporte que publica en Telegram
- Si hay fallas recurrentes (mismo escenario falla 3+ veces) → ir al Paso C
- Si score global ≥ 85% en el tier actual → el motor avanza de tier automáticamente

---

### Paso C — Diagnóstico de fallas recurrentes

```bash
# Ver los episodios más recientes
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto
source venv/bin/activate

python3 -c "
from learning import db_query
rows = db_query('''
  SELECT scenario_id, COUNT(*) as fails, GROUP_CONCAT(error_detail SEPARATOR \" | \") as errors
  FROM learning_episodes
  WHERE outcome = \"fail\"
    AND created_at >= NOW() - INTERVAL 2 HOUR
  GROUP BY scenario_id
  ORDER BY fails DESC
  LIMIT 10
''')
for r in rows: print(r)
"
```

Para cada falla recurrente:
1. Identificar si es un bug en el bot (LangGraph node) o en el escenario de prueba
2. Si es bug del bot → fix en nodo correspondiente, commit, push, reiniciar conversation_engine
3. Si es escenario mal calibrado → ajustar en `assets.py`

---

### Paso D — Verificar y mejorar escenarios

```bash
# Correr solo suite básica para verificar cobertura
python3 suite.py
```

Identificar escenarios con cobertura baja y agregar variantes en `assets.py`:
- Montos en diferentes formatos (`100k`, `cien mil`, `$100,000`)
- CLABEs con y sin espacios
- Tipos de operación con typos comunes (`IAS`, `ias`, `Ias`)
- Flujos de sesión interrumpidos y retomados

---

### Paso E — Volver al Paso A

Ciclo infinito. Reportar progreso cada 5 ciclos en `relay/outbox-finbot-tester.md`:

```
CICLO: N
GOLDEN_SUITE: X/Y tests ✅ (score Z%)
CONVERSATION_ENGINE: N rondas, tier T, score S%
FALLAS_CORREGIDAS: descripción de fixes
PENDIENTE: descripción
```

---

## Prioridades de optimización (en orden)

1. **Parseo de montos** — asegurarse que `100k`, `cien mil`, `100,000` y `$100.000` todos parsean correctamente
2. **Sesiones interrumpidas** — si el usuario no responde en 5 min y vuelve, la sesión se recupera correctamente
3. **Flujo de confirmación** — poll de confirmación llega, usuario responde ✅ y la operación se aplica
4. **Modo asistente + CLABEs** — en modo asistente, CLABEs enviadas se guardan silenciosamente
5. **FileFlowGraph** — cuadro retorno IAS (XLSX) y comprobante (imagen) se procesan correctamente

---

## Archivos a modificar (solo si hay bugs)

- `financial/bot/graph/nodes/text-flow/*.js` — nodos del TextFlowGraph
- `financial/bot/graph/nodes/file-flow/*.js` — nodos del FileFlowGraph
- `financial/bot/graph/subgraphs/*.js` — subgrafos
- `financial/bot/sims/mtproto/assets.py` — escenarios de prueba
- `financial/bot/sims/mtproto/golden_suite.py` — tests de regresión

**NUNCA modificar:**
- `relay/master.js`, `relay/chat-agent.js`, `relay/projects.json`
- Archivos de producción de la API fiscal (ryby.lease)

---

## Cómo hacer commits

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git checkout claude/financial-multiagent-system-YwtYQ
git pull origin claude/financial-multiagent-system-YwtYQ

# Modificar solo los archivos necesarios
git add financial/bot/graph/... financial/bot/sims/...
git commit -m "fix(langgraph): descripción del fix"
git push origin claude/financial-multiagent-system-YwtYQ
```

---

## Reportar al terminar cada ciclo

Escribir en `relay/outbox-finbot-tester.md` con el formato del Paso E.
El relay-master notificará a flujos automáticamente.
