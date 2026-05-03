'use strict';
/**
 * AskFieldsNode — Quinto nodo del TextFlowGraph.
 *
 * Construye el mensaje de respuesta pidiendo al usuario el campo faltante
 * o explicando los errores de validación detectados por VerifierNode.
 * Sin llamadas externas: pura lógica de construcción de mensajes.
 *
 * Lee:   state.nextAction, state.draft, state.verificationResult
 * Escribe: state.replyMessages, state.nextAction (→ null, conversación pausada)
 */

function askFieldsNode(state) {
  const { nextAction, draft, verificationResult } = state;

  let replyMessages = [];

  switch (nextAction) {
    case 'ask_tipo':
      replyMessages = [
        { text: '¿Qué tipo de operación? IAS / SPEI / SINDICATO / EFECTIVO / TARJETAS' },
      ];
      break;

    case 'ask_monto':
      replyMessages = [
        { text: '¿Cuál es el monto? Indícame si es neto o bruto.' },
      ];
      break;

    case 'ask_entrega':
      replyMessages = [
        {
          text: `¿A qué dirección o cuenta entregamos? (${draft?.tipo_operacion ?? ''} ${draft?.tipo_entrega ?? ''})`,
        },
      ];
      break;

    case 'ask_fields': {
      const errors = verificationResult?.errors ?? [];
      if (errors.length > 0) {
        const errorLines = errors.map(e => `• ${e}`).join('\n');
        replyMessages = [
          {
            text: `Por favor confirma o corrige los siguientes puntos:\n${errorLines}`,
          },
        ];
      } else {
        replyMessages = [];
      }
      break;
    }

    default:
      replyMessages = [];
      break;
  }

  return {
    replyMessages,
    nextAction: null,
  };
}

module.exports = askFieldsNode;
