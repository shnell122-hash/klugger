# AGENTS.md — FinBot Multi-Agent System

**Última actualización:** 2026-05-10  
**Rama:** `claude/financial-multiagent-system-YwtYQ`  
**Estado:** LangGraph migración en progreso (Partes 1-5 completas) + zero-Sonnet auto-fix loop

## 1. Visión General

FinBot es un **sistema multi-agente híbrido** (regla-based + LLM) para operaciones financieras en México (IAS, SPEI, dispersión masiva, facturación CFDI, cuadre de saldos). 

**Principios de diseño actuales:**
- **Costo-eficiencia máxima** sin sacrificar confiabilidad ("cero errores en producción").
- **Hybrid first**: reglas + Verifier antes de cualquier LLM.
- **LangGraph.js** como orquestador declarativo (reemplazando el monolito `financial-bot.js`).
- Dos modos de operación configurables por cliente/rol.

## 2. Modelos de IA (Stack actual de costo-optimizado)

| Agente / Componente              | Modelo                          | Uso principal                          | Justificación |
|----------------------------------|---------------------------------|----------------------------------------|-------------|
| TransactionOrchestrator          | **DeepSeek V4-Pro**             | Routing crítico y decisiones           | Razonamiento complejo con tools |
| **claude-code-suborq (auto-fix)**| **DeepSeek V4-Pro**             | Genera y commitea fixes de código      | V4-Pro directo — sin Claude CLI, zero Anthropic |
| Relay / Verifier / Coordinator   | **DeepSeek V4-Flash**           | Buzón, pre-diagnóstico, testing        | Muy barato y rápido |
| DocumentIntelligenceAgent / Vision | **Gemini 1.5 Flash**          | OCR de cuadros, PNG, PDF, facturas    | Mejor relación calidad/precio multimodal |
| ContextReader / ResponseGen      | DeepSeek V4-Flash               | Análisis de contexto y respuestas      | Bajo costo |
| InvoiceAgent                     | DeepSeek V4-Flash               | Procesamiento de CFDI y facturas       | Suficiente para texto estructurado |

**Fallbacks seguros** configurados en `.env`:
- `DEEPSEEK_CHAT_MODEL=deepseek-v4-flash`
- `DEEPSEEK_PRO_MODEL=deepseek-reasoner`

## 3. Agentes y Responsabilidades

### Agentes Core (LangGraph Nodes)

- **TransactionOrchestrator**  
  Supervisor principal. Decide acción (`iniciar_operacion`, `confirmar`, `cancelar`, `pedir_monto`, etc.) usando tool calling.

- **ParseNode + CommissionNode + CalculatorNode**  
  Parsing de texto natural + cálculo de comisiones (3%, 4%, 5.5%) y márgenes (modelo Alfa).

- **VerifierNode**  
  Validación regla-based de montos, CLABEs, consistencia y estados.

- **BankingQueryNode / BankingManager**  
  Parsing de CLABEs, guardado en `fin_banking_accounts`.

- **FileFlowGraph** (Parte 5 — implementado)  
  Subgrafo completo para manejo de archivos:
  - `FileTypeDetectorNode` (Gemini + BankingManager)
  - `CuadroRetornoNode` (IAS / PNG-XLSX)
  - `ComprobanteNode` (confirmar pago)
  - `BankingExtractionNode`

- **ContextReader + ResponseGen**  
  Análisis de historial + generación de respuestas conversacionales.

- **DocumentIntelligenceAgent / VisionAgent**  
  OCR de imágenes y documentos (Gemini 1.5 Flash).

### Agentes de Soporte

- **BalanceManager** — Gestión de saldos y pool de fondos.
- **InvoiceAgent** — Procesamiento de facturas y generación CFDI (modo Proveedor).
- **Golden Suite** — Regression tests estáticos (bloquea deploy si <92%).

## 4. Arquitectura de Orquestación

- **LangGraph.js** (principal):
  - `FinBotStateAnnotation` (state compartido)
  - `TextFlowGraph` (texto plano)
  - `FileFlowGraph` (archivos/imágenes — Parte 5)
  - Checkpointer en MySQL (`mysql-checkpointer.js`)
  - SupervisorNode en progreso

- **Máquina de Estados** extendida (`fin_sessions.estado`):
  - `idle` → `esperando_tipo` → `esperando_monto` → `esperando_datos_bancarios` → `confirmando_cuentas` → `completado`
  - Estados adicionales: `esperando_cuadro_retornos`, `esperando_ingreso`, `cuadre_saldos`, etc.

- **Loop de Auto-Fix (100% DeepSeek, zero Anthropic):**
  1. `conversation_engine.py` detecta score bajo → `dispatch_fix_if_needed()` → escribe `relay/claude-code-inbox.md`
  2. `relay/master.js:processProject('claude-code-suborq')` lee inbox
  3. **Pre-diagnóstico** con DeepSeek V4-Pro (350 tokens, identifica archivo + causa raíz)
  4. **`runDeepSeekCodeFix()`**: llama V4-Pro API → JSON `{files:[{path,search,replace}]}` → aplica patch → git commit + push
  5. Todo sin Claude CLI — costo ~$0.003/fix vs ~$0.15 con Sonnet

## 5. Dos Modos de Operación

1. **MODO_PROVEEDOR** (full execution)  
   Conecta a bancos, genera CFDI RE, ejecuta dispersión, actualiza saldos en tiempo real.

2. **MODO_ASISTENTE** (backoffice pasivo)  
   Solo registra en DB y actualiza saldos **únicamente** cuando hay comprobante PDF confirmado.

## 6. Testing y Confiabilidad

- `conversation_engine.py` (Telethon) — Testing realista con bots simulados (GV, Noela, Kevin).
- `golden_suite.py` — Suite de regresión estática (bloquea deploy si score < 92%).
- Curriculum Learning + Case-Based Reasoning (tablas `learning_episodes`, `learning_patterns`).
- Compactación semántica y semantic caching en progreso.

## 7. Próximos Pasos (Roadmap corto)

- Completar integración completa de FileFlowGraph con VisionAgent.
- Parte 6: AsistenteModeGraph + VoiceFlowGraph.
- RAG + compactación semántica agresiva.
- LiteLLM proxy (rate limiting + fallback).
- NodeCfdi para generación automática de CFDI (modo Proveedor).

---

**Objetivo del sistema:**  
Operar con **cero errores** en producción (dinero real) a un costo mínimo (< $2/semana en testing + corrección automática).

Documento mantenido por el equipo de desarrollo de FinBot.
