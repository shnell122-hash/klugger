# Financial-Bot — Agent Reference

> Updated: 2026-04-27

## Agent Map

```
Telegram message
      │
      ▼
financial-bot.js  (GrammY bot, state machine)
      │
      ├─── DocumentIntelligenceAgent  (images, PDFs, XLSX)
      │         └── Gemini 2.5 Flash  [GEMINI_API_KEY]
      │         └── fallback: InvoiceAgent + VisionAgent
      │
      ├─── TransactionOrchestrator    (ambiguous text routing)
      │         └── Claude Sonnet 4.6  [ANTHROPIC_API_KEY]
      │         └── fallback: ContextReader (DeepSeek)
      │
      ├─── ResponseGen                (natural language replies)
      │         └── DeepSeek deepseek-chat  [DEEPSEEK_API_KEY]
      │
      ├─── Verifier                   (fraud / sanity checks)
      │         └── rule-based (no LLM)
      │
      ├─── BalanceManager             (saldos MySQL)
      ├─── BankingManager             (cuentas bancarias MySQL)
      ├─── ContextManager             (historial de mensajes)
      ├─── Calculator                 (comisiones y totales)
      └─── Parser                     (extracción de montos del texto)
```

---

## DocumentIntelligenceAgent

**File:** `agents/DocumentIntelligenceAgent.js`
**Model:** `gemini-2.5-flash-preview-04-17`
**Activated by:** `GEMINI_API_KEY` in `.env`
**Replaces:** InvoiceAgent (para imágenes) + VisionAgent

### Purpose
Unified multimodal document analysis. Handles images natively (OCR + understanding) and text-based files (PDF, XLSX, CSV, TXT).

### Methods

```js
// Detect invoice/receipt from any document format
await docAgent.procesarBuffer(buffer, mimeType, fileName)
// → { tipo: 'factura'|'comprobante'|'otro', monto_total, tipo_operacion,
//     confianza, datos_bancarios, emisor, emisor_rfc }

// Extract bank accounts from image (tables, screenshots, photos)
await docAgent.extraerCuentasBancarias(imageBuffer, mimeType)
// → { cuentas: [{ tipo, numero, titular, banco, monto, confianza }], notas }

// Analyze invoice/receipt image
await docAgent.analizarFactura(imageBuffer, mimeType)
// → { tipo, monto_total, emisor_nombre, emisor_rfc, datos_bancarios, ... }
```

### Fallback
If `GEMINI_API_KEY` is not set, `financial-bot.js` uses the original `InvoiceAgent` + `VisionAgent` path unchanged.

---

## TransactionOrchestrator

**File:** `agents/TransactionOrchestrator.js`
**Model:** `claude-sonnet-4-6`
**Activated by:** `ANTHROPIC_API_KEY` in `.env`
**Replaces:** ContextReader in the fallback routing path

### Purpose
Decides what action to take when a user message doesn't match any explicit state machine condition. Uses structured tool use for reliable JSON output.

### Method

```js
await orchestrator.rutear({ estado, mensajesRecientes, textoUsuario, saldo, nombre })
// → {
//     accion: 'iniciar_operacion' | 'confirmar' | 'cancelar' |
//             'pedir_monto' | 'pedir_cuenta_bancaria' |
//             'responder_info' | 'ignorar',
//     params: { tipo_operacion, monto, tipo_monto, mensaje_respuesta },
//     confianza: 'alta' | 'media' | 'baja',
//     razon: string
//   }
```

### Fallback
If `ANTHROPIC_API_KEY` is not set, uses `ContextReader` (DeepSeek) instead.

---

## InvoiceAgent (legacy / fallback)

**File:** `agents/invoice-agent.js`
**Model:** `deepseek-chat` via OpenAI-compatible API
**Status:** Active as fallback when `GEMINI_API_KEY` is not available

Handles PDF, XLSX, CSV, TXT. Returns `{ tipo: 'imagen_sin_ocr' }` for images (cannot do OCR).

---

## VisionAgent (legacy / fallback)

**File:** `agents/vision-agent.js`
**Model:** `claude-haiku-4-5-20251001`
**Status:** Active as fallback when `GEMINI_API_KEY` is not available

Handles images only. Two methods: `extraerCuentasBancarias` and `analizarFactura`.

---

## ContextReader (legacy / fallback)

**File:** `agents/context-reader.js`
**Model:** `deepseek-chat`
**Status:** Active as fallback when `ANTHROPIC_API_KEY` is not available

Analyzes conversation history and returns `{ responder, mensaje, accion }`.

---

## ResponseGen

**File:** `agents/response-gen.js`
**Model:** `deepseek-chat`
**Status:** Active (no replacement planned)

Generates natural language responses. ~80% of replies use templates; LLM only for complex cases.

---

## Verifier

**File:** `agents/verifier.js`
**Model:** rule-based (no LLM)
**Status:** Active — always runs before any money-moving operation

Validates: amounts in range, account number format, session state consistency.

---

## Environment Variables

| Variable | Used by | Required for |
|----------|---------|-------------|
| `GEMINI_API_KEY` | DocumentIntelligenceAgent | New document/image processing |
| `ANTHROPIC_API_KEY` | TransactionOrchestrator, VisionAgent (fallback) | Orchestration + image OCR fallback |
| `DEEPSEEK_API_KEY` | InvoiceAgent, ContextReader, ResponseGen | All legacy LLM calls |
| `FIN_TELEGRAM_BOT_TOKEN` | Bot | Required |
| `DB_*` | MySQL | Required |
