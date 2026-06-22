# Diagnóstico — Financial Bot: tabla_pagos se pierde al re-ingresar operación

**Fecha:** 2026-04-26  
**Rama:** `claude/financial-multiagent-system-YwtYQ`  
**Commit activo en prod:** `638306e`  
**Solicitado:** revisión externa (Grok / xAI)

---

## Síntoma observable

1. Usuario envía imagen de tabla Excel con **8 cuentas bancarias** (Banco Azteca, montos individuales).
2. Bot detecta las 8 cuentas correctamente y muestra:
   ```
   📊 Encontré 8 cuenta(s): …
   ✅ Cuentas listas. ¿Qué operación es?
   Escribe tipo y monto. Ejemplo: IAS 9,836.10
   ```
3. Usuario escribe: `IAS 9,836.1`
4. Bot responde:
   ```
   💳 ¿A qué cuenta se realizará el pago de $9,836.10?
   Puedes enviarme: CLABE …
   ```
   — **Las 8 cuentas ya detectadas se pierden.**

**Comportamiento esperado:** al escribir `IAS 9,836.1`, el bot debería recuperar las cuentas de la sesión, verificar saldo y mostrar el flujo de pago previo (comprobante).

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js 18 · PM2 (fork mode) |
| Bot framework | Grammy.js (Telegram) |
| LLM primario | DeepSeek Chat (`deepseek-chat`) vía cliente OpenAI-compatible |
| Vision / OCR | Anthropic Claude Haiku `claude-haiku-4-5-20251001` |
| Base de datos | MySQL 5.7 / MariaDB (pool mysql2) |
| Servidor | Ubuntu · `143.198.228.78` · proceso PM2 id 24 |
| Repo | `vilarkptl-lang/agentic-repo` |

---

## Árbol de archivos relevantes

```
financial/
├── bot/
│   ├── financial-bot.js          ← orquestador principal (~1 420 líneas)
│   ├── agents/
│   │   ├── balance-manager.js    ← saldo y operaciones fin_balance / fin_operations
│   │   ├── banking-manager.js    ← CLABE/tarjeta parser, XLSX, guardar en DB
│   │   ├── calculator.js         ← calcularMontos, proyectarSaldo, fmt
│   │   ├── context-manager.js    ← historial de mensajes (fin_messages)
│   │   ├── context-reader.js     ← LLM para respuestas contextuales (DeepSeek)
│   │   ├── invoice-agent.js      ← detecta facturas y comprobantes (PDF/imagen)
│   │   ├── parser.js             ← parseCommand / parseNaturalText (sin LLM)
│   │   ├── poll-handler.js       ← encuesta Telegram para confirmar operación
│   │   ├── response-gen.js       ← templates y LLM para mensajes al usuario
│   │   ├── verifier.js           ← verificarConsistencia / verificarSaldo
│   │   └── vision-agent.js       ← Claude Haiku OCR (extraerCuentasBancarias, analizarFactura)
│   ├── config/
│   │   └── commissions.js        ← tipos: IAS 5.5%, SPEI 3%, SINDICATO 5.5%…
│   └── tools/
│       └── file-handler.js       ← descarga y almacena archivos en DB
├── db/
│   ├── migrate-financial-v1…v8.sql
│   └── financial-queries.js
└── docs/
    └── DIAGNOSTICO-GROK.md       ← este archivo
```

---

## Árbol de agentes (flujo interno)

```
Usuario (Telegram)
      │
      ▼
financial-bot.js  ← Grammy handlers: message:text, message:document/photo, callback_query, poll_answer
      │
      ├── parser.js              parseCommand("IAS 9,836.1") → {tipo:'IAS', monto:9836.1}
      ├── calculator.js          calcularMontos → monto_neto, monto_bruto, comision_pct
      ├── balance-manager.js     getSaldo, aplicarOperacion (fin_balance)
      ├── verifier.js            verificarSaldo, verificarConsistencia
      │
      ├── vision-agent.js        extraerCuentasBancarias(imageBuffer) → [{tipo,numero,monto,…}×8]
      │     └── Anthropic API    claude-haiku-4-5-20251001  max_tokens=2048
      │
      ├── banking-manager.js     parsearTexto, parsearXlsx, guardarCuentas, formatearCuentas
      ├── invoice-agent.js       procesarBuffer → detecta facturas/comprobantes
      │
      ├── response-gen.js        formatOperationSummary, formatConfirmed (templates + DeepSeek fallback)
      │     └── DeepSeek API     deepseek-chat  parseFreeText / generateNaturalResponse
      │
      ├── poll-handler.js        sendConfirmationPoll, processPollAnswer
      └── context-reader.js      analizar(mensajes, ctx, texto) → {responder, mensaje}
```

---

## Máquina de estados de sesión (`fin_sessions.estado`)

```
idle
  → esperando_tipo         (guard: imagen sin tipo/monto en draft)
  → esperando_monto
  → esperando_datos_bancarios   ← imagen de tabla aterriza aquí
  → confirmando_cuentas         (cuentas guardadas en DB, mostrar opciones)
  → esperando_entrega           (solo EFECTIVO)
  → esperando_confirmacion      (poll Telegram activo)
  → confirmando_comprobante     (saldo insuficiente, esperar comprobante)
  → confirmando_factura
  → completado
```

---

## Flujo roto (paso a paso)

### Lo que debería pasar

```
[imagen Excel]
      │
      ▼ (estado = esperando_datos_bancarios, draft = {})
banking-handler
  detecta 8 cuentas
  draft.cuentas_bancarias = cuentas      ← ✓ seteado
  draft.tabla_pagos       = cuentas      ← ✓ seteado
  draft.tabla_total       = 9836.10      ← ✓ seteado
  !draft.tipo_operacion → true
  updateSession('esperando_tipo', draft)  ← draft CON tabla_pagos
  reply: "✅ Cuentas listas. ¿Qué operación es?"

[usuario escribe "IAS 9,836.1"]
      │
      ▼ text-handler → session.estado === 'esperando_tipo'
procesarOperacion(ctx, "IAS 9,836.1", client, session)
  parsed = parseCommand → {tipo:'IAS', monto:9836.1}   ✓
  calcularMontos → monto_neto=9836.1, monto_bruto≈10408
  draft = { tipo:'IAS', monto_neto:9836.1, … }

  // PASO 4.5 (commit 1321ea4)
  prevDraft = parseDraft(session.operation_draft_json)
  prevDraft.tabla_pagos.length === 8   ← DEBERÍA ser 8
  draft.cuentas_bancarias = prevDraft.cuentas_bancarias   ← merge

  // PASO 7
  !draft.cuentas_bancarias?.length → FALSE  ← skip pregunta bancaria
  saldo < 9836.10 → mostrar pago previo     ← ✓ flujo correcto
```

### Lo que realmente pasa

El bot llega al **paso 7 con `draft.cuentas_bancarias` vacío**, entra al `else` branch y muestra "¿A qué cuenta se realizará el pago?". El paso 4.5 **no está surtiendo efecto**.

---

## Hipótesis ordenadas por probabilidad

### H1 — `session.operation_draft_json` es null en el text-handler (más probable)

El text-handler llama `getOrCreateSession(chatId, client.id)`. Si en ese momento la sesión en DB tiene `operation_draft_json = NULL` (por alguna razón el `updateSession` del banking-handler guardó null), `parseDraft(null)` devuelve `{}` y el merge falla silenciosamente.

**Cómo verificar:**
```sql
SELECT id, estado, LEFT(operation_draft_json, 200), updated_at
FROM fin_sessions
WHERE chat_id = <CHAT_ID>
ORDER BY updated_at DESC LIMIT 5;
```

### H2 — `updateSession` en el banking-handler guarda `null` en vez del draft

Si `JSON.stringify(draft)` lanza una excepción (circular reference, BigInt, etc.) dentro de `updateSession`, la promesa rechaza pero el error se absorbe silenciosamente si hay un try/catch externo.

**Cómo verificar:**
```bash
pm2 logs financial-bot --lines 200 | grep -E 'error|Error|draft|tabla'
```

### H3 — `verifier.verificarConsistencia(draft)` sobreescribe `cuentas_bancarias`

`Object.assign(draft, verification.correcciones)` (paso 5) podría incluir `cuentas_bancarias: []` si el verifier detecta alguna inconsistencia. Este agente no fue inspeccionado durante el diagnóstico.

**Cómo verificar:** auditar `financial/bot/agents/verifier.js` — buscar si `correcciones` puede incluir la key `cuentas_bancarias`.

### H4 — Dos sesiones activas para el mismo chat_id

Si `getOrCreateSession` devuelve una sesión diferente a la que actualizó el banking-handler (p. ej. porque existe una segunda sesión no-`completado` más reciente), el merge lee un `operation_draft_json` diferente. 

**Cómo verificar:**
```sql
SELECT id, estado, updated_at FROM fin_sessions
WHERE chat_id = <CHAT_ID> AND estado != 'completado'
ORDER BY updated_at DESC LIMIT 10;
```

---

## Curl para abrir issue en GitHub (requiere PAT)

Reemplaza `$GITHUB_PAT` con tu Personal Access Token (scopes requeridos: `repo`).

```bash
GITHUB_PAT="ghp_xxxxxxxxxxxxxxxxxxxx"

curl -X POST \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Content-Type: application/json" \
  https://api.github.com/repos/vilarkptl-lang/agentic-repo/issues \
  -d '{
    "title": "Bug: tabla_pagos se pierde al re-ingresar operación en esperando_tipo",
    "body": "## Síntoma\nCuando el bot detecta cuentas de una imagen (8 cuentas, tabla Azteca) y pide tipo/monto al usuario, al escribir `IAS 9836` el paso 4.5 de `procesarOperacion` no recupera `tabla_pagos` de `session.operation_draft_json` y el bot vuelve a pedir datos bancarios.\n\n## Archivos clave\n- `financial/bot/financial-bot.js` linea ~1276 (paso 4.5)\n- `financial/bot/financial-bot.js` linea ~836 (banking-handler guard)\n\n## Hipótesis\nVer `financial/docs/DIAGNOSTICO-GROK.md` en rama `claude/financial-multiagent-system-YwtYQ`.\n\n## Logs necesarios\n```\npm2 logs financial-bot --lines 200\nSELECT id, estado, LEFT(operation_draft_json,200), updated_at FROM fin_sessions WHERE chat_id=X ORDER BY updated_at DESC LIMIT 5;\n```",
    "labels": ["bug", "financial-bot"]
  }'
```

---

## Solicitud de ayuda a Grok (xAI)

Reemplaza `$XAI_API_KEY` con tu clave de la API de xAI.

```bash
XAI_API_KEY="xai-xxxxxxxxxxxxxxxxxxxx"

curl -X POST https://api.x.ai/v1/chat/completions \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-3",
    "messages": [
      {
        "role": "system",
        "content": "Eres un experto en Node.js, Grammy.js y arquitectura de bots de Telegram con base de datos MySQL."
      },
      {
        "role": "user",
        "content": "Tengo un bot de Telegram (Grammy.js, Node.js 18) con este flujo roto:\n\n1. Handler de archivos detecta imagen con 8 cuentas bancarias.\n   Estado sesión: `esperando_datos_bancarios`, draft vacío (sin tipo_operacion ni monto_bruto).\n   El handler hace:\n   ```js\n   draft.cuentas_bancarias = cuentas;  // array de 8\n   draft.tabla_pagos       = cuentas;\n   draft.tabla_total       = 9836.10;\n   await updateSession(session.id, \"esperando_tipo\", draft);\n   await ctx.reply(\"Cuentas listas. ¿Qué operación?\");\n   ```\n\n2. Usuario escribe `IAS 9,836.1` → text handler llama:\n   ```js\n   const session = await getOrCreateSession(chatId, client.id);\n   // session.estado === \"esperando_tipo\"\n   await procesarOperacion(ctx, text, client, session);\n   ```\n\n3. Dentro de `procesarOperacion`, después de calcular monto (paso 4), ejecuto:\n   ```js\n   const prevDraft = session.operation_draft_json\n     ? parseDraft(session.operation_draft_json) : {};\n   if (prevDraft.tabla_pagos?.length && !draft.cuentas_bancarias?.length) {\n     draft.cuentas_bancarias = prevDraft.cuentas_bancarias ?? prevDraft.tabla_pagos;\n     draft.tabla_pagos       = prevDraft.tabla_pagos;\n     draft.tabla_total       = prevDraft.tabla_total ?? null;\n   }\n   ```\n\n4. Sin embargo, el bot sigue preguntando \"¿A qué cuenta se realizará el pago?\" lo que significa que `draft.cuentas_bancarias` está vacío en el paso 7, justo después.\n\nLas funciones relevantes:\n- `getOrCreateSession`: SELECT con WHERE chat_id=? AND estado != completado AND updated_at > NOW() - 4h, ORDER BY updated_at DESC LIMIT 1.\n- `updateSession`: UPDATE fin_sessions SET estado=?, operation_draft_json=JSON.stringify(draft) WHERE id=?.\n- `parseDraft`: JSON.parse con try/catch que devuelve {} si falla.\n\nPosibles causas que ya descartamos: el parser SÍ extrae monto=9836.1 de la cadena (la coma como separador de miles se stripea). La función no retorna antes del paso 4.5.\n\nPregunta: ¿Qué condición o race condition podría hacer que `prevDraft.tabla_pagos` sea undefined/vacío a pesar de que `updateSession` con el draft completo se llamó segundos antes? ¿Puede haber un problema de encoding/serialización en MySQL al guardar y releer el JSON con arrays de objetos anidados? ¿Algún problema con `parseDraft` y caracteres especiales en nombres (acentos, paréntesis)?"
      }
    ],
    "temperature": 0.2,
    "max_tokens": 2000
  }'
```

---

## Logs requeridos para cerrar el diagnóstico

En el servidor de producción, ejecutar inmediatamente después de reproducir el bug:

```bash
# 1. Últimas líneas del bot
pm2 logs financial-bot --lines 100 --nostream

# 2. Estado de la sesión en DB
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /ruta/al/financial/.env)
mysql -u root -p"$DB_PASS" financial_db -e "
  SELECT id, chat_id, estado, client_id,
         LEFT(operation_draft_json, 500) AS draft_preview,
         updated_at
  FROM fin_sessions
  WHERE chat_id = <CHAT_ID_DEL_USUARIO>
  ORDER BY updated_at DESC
  LIMIT 10;
"

# 3. Verificar que el JSON es válido en DB
mysql -u root -p"$DB_PASS" financial_db -e "
  SELECT id, JSON_VALID(operation_draft_json) AS valido,
         JSON_LENGTH(operation_draft_json, '$.tabla_pagos') AS n_cuentas
  FROM fin_sessions
  WHERE chat_id = <CHAT_ID_DEL_USUARIO>
  ORDER BY updated_at DESC LIMIT 5;
"
```
