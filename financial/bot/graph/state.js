'use strict';
const { Annotation } = require('@langchain/langgraph');

// Reducer que toma el último valor no-nulo
const last = (a, b) => (b !== undefined && b !== null ? b : a);

// Reducer que fusiona objetos (para draft)
const merge = (a, b) => (b && typeof b === 'object' ? { ...(a ?? {}), ...b } : a ?? {});

const FinBotStateAnnotation = Annotation.Root({
  // ── Contexto Telegram ─────────────────────────────────────────────────────
  chatId:   Annotation({ reducer: last, default: () => null }),
  userId:   Annotation({ reducer: last, default: () => null }),
  username: Annotation({ reducer: last, default: () => null }),

  // ── Sesión ────────────────────────────────────────────────────────────────
  sessionId:     Annotation({ reducer: last, default: () => null }),
  sessionEstado: Annotation({ reducer: last, default: () => 'idle' }),
  modoChat:      Annotation({ reducer: last, default: () => 'normal' }),

  // ── Mensaje entrante ──────────────────────────────────────────────────────
  // 'text' | 'photo' | 'document' | 'voice' | 'callback' | 'unknown'
  messageType:       Annotation({ reducer: last, default: () => 'unknown' }),
  inputText:         Annotation({ reducer: last, default: () => null }),
  inputBuffer:       Annotation({ reducer: last, default: () => null }),
  inputMimeType:     Annotation({ reducer: last, default: () => null }),
  inputFileName:     Annotation({ reducer: last, default: () => null }),
  inputCallbackData: Annotation({ reducer: last, default: () => null }),
  inputCallbackMsgId:Annotation({ reducer: last, default: () => null }),

  // ── Cliente (fin_clients row) ─────────────────────────────────────────────
  client: Annotation({ reducer: last, default: () => null }),

  // ── Draft de la operación ─────────────────────────────────────────────────
  // Espejo de fin_sessions.operation_draft_json — fusionado incrementalmente
  draft: Annotation({
    reducer: merge,
    default: () => ({}),
  }),

  // ── Comisión (resultado de getCommission) ─────────────────────────────────
  commission: Annotation({ reducer: last, default: () => null }),

  // ── Cuentas bancarias ─────────────────────────────────────────────────────
  bankingAccounts: Annotation({ reducer: last, default: () => [] }),

  // ── Análisis de archivo ───────────────────────────────────────────────────
  detectedFile:  Annotation({ reducer: last, default: () => null }),
  cuadroRetorno: Annotation({ reducer: last, default: () => null }),

  // ── Audio ─────────────────────────────────────────────────────────────────
  transcripcion: Annotation({ reducer: last, default: () => null }),

  // ── Verificación ──────────────────────────────────────────────────────────
  verificationResult: Annotation({ reducer: last, default: () => null }),

  // ── Respuestas a enviar ───────────────────────────────────────────────────
  // Cada elemento: { text, opts } o { photo, opts } etc.
  replyMessages: Annotation({
    reducer: (a, b) => (Array.isArray(b) ? b : (a ?? [])),
    default: () => [],
  }),

  // ── Control de flujo ─────────────────────────────────────────────────────
  nextAction: Annotation({ reducer: last, default: () => null }),
  error:      Annotation({ reducer: last, default: () => null }),
});

module.exports = { FinBotStateAnnotation };
