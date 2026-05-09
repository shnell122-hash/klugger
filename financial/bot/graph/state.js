'use strict';
const { Annotation } = require('@langchain/langgraph');

const last  = (a, b) => (b !== undefined && b !== null ? b : a);
const merge = (a, b) => (b && typeof b === 'object' ? { ...(a ?? {}), ...b } : a ?? {});

const FinBotStateAnnotation = Annotation.Root({
  chatId:   Annotation({ reducer: last, default: () => null }),
  userId:   Annotation({ reducer: last, default: () => null }),
  username: Annotation({ reducer: last, default: () => null }),

  sessionId:     Annotation({ reducer: last, default: () => null }),
  sessionEstado: Annotation({ reducer: last, default: () => 'idle' }),
  modoChat:      Annotation({ reducer: last, default: () => 'normal' }),

  messageType:       Annotation({ reducer: last, default: () => 'unknown' }),
  inputText:         Annotation({ reducer: last, default: () => null }),
  inputFileId:       Annotation({ reducer: last, default: () => null }),
  inputBuffer:       Annotation({ reducer: last, default: () => null }),
  inputMimeType:     Annotation({ reducer: last, default: () => null }),
  inputFileName:     Annotation({ reducer: last, default: () => null }),
  inputCallbackData: Annotation({ reducer: last, default: () => null }),
  inputCallbackMsgId:Annotation({ reducer: last, default: () => null }),

  client: Annotation({ reducer: last, default: () => null }),

  draft: Annotation({
    reducer: merge,
    default: () => ({}),
  }),

  commission: Annotation({ reducer: last, default: () => null }),

  bankingAccounts: Annotation({ reducer: last, default: () => [] }),

  detectedFile:  Annotation({ reducer: last, default: () => null }),
  cuadroRetorno: Annotation({ reducer: last, default: () => null }),

  transcripcion: Annotation({ reducer: last, default: () => null }),

  verificationResult: Annotation({ reducer: last, default: () => null }),

  replyMessages: Annotation({
    reducer: (a, b) => (Array.isArray(b) ? b : (a ?? [])),
    default: () => [],
  }),

  nextAction: Annotation({ reducer: last, default: () => null }),
  error:      Annotation({ reducer: last, default: () => null }),
});

module.exports = { FinBotStateAnnotation };
