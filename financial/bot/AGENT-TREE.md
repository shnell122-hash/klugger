# Financial-Bot — Árbol de Agentes

> **Timestamp:** 2026-04-27T00:00:00Z  
> **Rama:** `claude/financial-multiagent-system-YwtYQ`  
> **Versión:** Etapa 1 MVP

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
      │         ├── DocumentIntelligenceAgent   ← GEMINI_API_KEY presente
      │         │         └── gemini-2.5-flash-preview-04-17  (multimodal nativo)
      │         │               ├── procesarBuffer()           PDF · XLSX · CSV · TXT · imágenes
      │         │               ├── extraerCuentasBancarias()  tablas · fotos · capturas
      │         │               └── analizarFactura()          CFDI · comprobantes SPEI
      │         │
      │         └── [fallback — sin GEMINI_API_KEY]
      │                   ├── InvoiceAgent      PDF · XLSX · CSV · TXT
      │                   │         └── deepseek-chat
      │                   └── VisionAgent       imágenes
      │                             └── claude-haiku-4-5-20251001  ← ANTHROPIC_API_KEY
      │
      ├─── [TEXTO AMBIGUO — fuera del state machine]
      │         │
      │         ├── TransactionOrchestrator     ← ANTHROPIC_API_KEY presente
      │         │         └── claude-sonnet-4-6  (tool_use · prompt caching)
      │         │               └── rutear()  →  accion + params + confianza
      │         │
      │         └── [fallback — sin ANTHROPIC_API_KEY]
      │                   └── ContextReader
      │                             └── deepseek-chat
      │
      ├─── [RESPUESTA NATURAL]
      │         └── ResponseGen
      │                   └── deepseek-chat   (~80% templates · LLM solo en casos complejos)
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
| DocumentIntelligenceAgent | `agents/DocumentIntelligenceAgent.js` | `gemini-2.5-flash-preview-04-17` | `GEMINI_API_KEY` | Activo (preferido) |
| TransactionOrchestrator | `agents/TransactionOrchestrator.js` | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` | Activo (preferido) |
| VisionAgent | `agents/vision-agent.js` | `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` | Fallback imágenes |
| InvoiceAgent | `agents/invoice-agent.js` | `deepseek-chat` | `DEEPSEEK_API_KEY` | Fallback docs |
| ContextReader | `agents/context-reader.js` | `deepseek-chat` | `DEEPSEEK_API_KEY` | Fallback routing |
| ResponseGen | `agents/response-gen.js` | `deepseek-chat` | `DEEPSEEK_API_KEY` | Activo |
| Verifier | `agents/verifier.js` | rule-based | — | Activo (siempre) |
| BalanceManager | `agents/balance-manager.js` | — | — | Activo |
| BankingManager | `agents/banking-manager.js` | — | — | Activo |
| ContextManager | `agents/context-manager.js` | — | — | Activo |
| Calculator | `agents/calculator.js` | — | — | Activo |
| Parser | `agents/parser.js` | — | — | Activo |

---

## Activación por API Key

```
DEEPSEEK_API_KEY   →  InvoiceAgent + ContextReader + ResponseGen   (requerido siempre)
ANTHROPIC_API_KEY  →  TransactionOrchestrator + VisionAgent
GEMINI_API_KEY     →  DocumentIntelligenceAgent                    (reemplaza VisionAgent para imágenes)
```
