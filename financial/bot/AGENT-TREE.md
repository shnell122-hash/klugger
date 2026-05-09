# Financial-Bot — Árbol de Agentes

> **Timestamp:** 2026-05-09T00:00:00Z
> **Rama:** `migrate-llms-deepseek-gemini` (testing)
> **Versión:** Etapa 2 — DeepSeek V4 Pro + Gemini Flash

---

## Árbol de flujo

```
Mensaje Telegram
      │
      ▼
financial-bot.js  (GrammY · state machine)
      │
      ├─── [DOCUMENTO / IMAGEN]
      │         │
      │         ├── DocumentIntelligenceAgent   ← GOOGLE_API_KEY presente
      │         │         └── gemini-1.5-flash  (multimodal nativo)
      │         │               ├── procesarBuffer()           PDF · XLSX · CSV · TXT · imágenes
      │         │               ├── extraerCuentasBancarias()  tablas · fotos · capturas
      │         │               └── analizarFactura()          CFDI · comprobantes SPEI
      │         │
      │         └── [fallback — sin GOOGLE_API_KEY]
      │                   ├── InvoiceAgent      PDF · XLSX · CSV · TXT
      │                   │         └── DEEPSEEK_PRO_MODEL (deepseek-v4-pro)
      │                   └── VisionAgent       imágenes
      │                             ├── gemini-1.5-flash   ← GOOGLE_API_KEY (primario)
      │                             └── DEEPSEEK_FLASH_MODEL (deepseek-v4-flash)  ← fallback
      │
      ├─── [TEXTO AMBIGUO — fuera del state machine]
      │         │
      │         └── TransactionOrchestrator     ← DEEPSEEK_API_KEY (siempre activo)
      │                   └── DEEPSEEK_PRO_MODEL (deepseek-v4-pro)
      │                         └── rutear()  →  accion + params + confianza
      │
      ├─── [RESPUESTA NATURAL]
      │         └── ResponseGen
      │                   └── DEEPSEEK_PRO_MODEL   (~80% templates · LLM solo en casos complejos)
      │
      ├─── [VALIDACIÓN — siempre corre antes de mover dinero]
      │         └── Verifier   (rule-based · sin LLM)
      │
      └─── [DATOS / ESTADO]
                ├── BalanceManager    saldos MySQL
                ├── BankingManager    cuentas bancarias MySQL
                ├── ContextManager    historial de mensajes
                ├── Calculator        comisiones y totales
                └── Parser            extracción de montos del texto
```

---

## Resumen por agente

| Agente | Archivo | Modelo | API Key | Estado |
|--------|---------|--------|---------|--------|
| DocumentIntelligenceAgent | `agents/DocumentIntelligenceAgent.js` | `gemini-1.5-flash` | `GOOGLE_API_KEY` | Activo (preferido) |
| TransactionOrchestrator | `agents/TransactionOrchestrator.js` | `DEEPSEEK_PRO_MODEL` | `DEEPSEEK_API_KEY` | Activo — migrado de Sonnet |
| VisionAgent | `agents/vision-agent.js` | Gemini Flash → DeepSeek Flash | `GOOGLE_API_KEY` / `DEEPSEEK_API_KEY` | Fallback imágenes — migrado de Haiku |
| InvoiceAgent | `agents/invoice-agent.js` | `DEEPSEEK_PRO_MODEL` | `DEEPSEEK_API_KEY` | Fallback docs |
| ContextReader | `agents/context-reader.js` | `DEEPSEEK_PRO_MODEL` | `DEEPSEEK_API_KEY` | Fallback routing |
| ResponseGen | `agents/response-gen.js` | `DEEPSEEK_PRO_MODEL` | `DEEPSEEK_API_KEY` | Activo |
| Verifier | `agents/verifier.js` | rule-based | — | Activo (siempre) |
| BalanceManager | `agents/balance-manager.js` | — | — | Activo |
| BankingManager | `agents/banking-manager.js` | — | — | Activo |
| ContextManager | `agents/context-manager.js` | — | — | Activo |
| Calculator | `agents/calculator.js` | — | — | Activo |
| Parser | `agents/parser.js` | — | — | Activo |

---

## Activación por API Key

```
DEEPSEEK_API_KEY    →  TransactionOrchestrator + InvoiceAgent + ContextReader + ResponseGen + VisionAgent(fallback)
GOOGLE_API_KEY      →  DocumentIntelligenceAgent (imágenes + docs) + VisionAgent (primario)
ANTHROPIC_API_KEY   →  no requerida en este branch
```

## Variables de entorno requeridas

```
DEEPSEEK_API_KEY=...
DEEPSEEK_PRO_MODEL=deepseek-v4-pro    # TransactionOrchestrator · InvoiceAgent · ContextReader · ResponseGen
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash # VisionAgent (fallback sin Google)
GOOGLE_API_KEY=...                     # DocumentIntelligenceAgent + VisionAgent primario
```
