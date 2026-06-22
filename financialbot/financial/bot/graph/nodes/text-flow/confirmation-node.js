'use strict';
/**
 * ConfirmationNode — Sexto nodo del TextFlowGraph (Parte 4).
 *
 * Genera el resumen de operación y prepara los mensajes de confirmación.
 * Establece sessionEstado = 'esperando_confirmacion' para que el grafo pause
 * y el dispatcher envíe el resumen + poll al usuario.
 *
 * Cuando el usuario responde al poll, el grafo se reanuda con:
 *   state.inputCallbackData = 'poll:confirm' | 'poll:cancel' | 'poll:edit'
 * y se enruta a ApplyOperationNode o cancelación.
 *
 * NOTA: El interrupt() nativo de LangGraph se añade en Parte 10 cuando se
 * integre el callback handler de poll_answer con el resume del grafo.
 * Por ahora, la pausa se gestiona via sessionEstado en el checkpointer.
 *
 * Lee:   state.draft, state.client
 * Escribe: state.replyMessages, state.nextAction, state.sessionEstado
 */

const ResponseGen = require('../../../agents/response-gen');

async function confirmationNode(state) {
  const { draft, client } = state;

  // Resumiendo desde poll_answer: inputCallbackData = 'poll:confirm' | 'poll:cancel' | 'poll:edit'
  const callbackData = state.inputCallbackData ?? '';
  if (callbackData.startsWith('poll:')) {
    const action = callbackData.replace('poll:', '');
    if (action === 'confirm') {
      return { nextAction: 'apply_operation', sessionEstado: 'confirmando' };
    }
    if (action === 'cancel') {
      return {
        replyMessages: [{ text: '❌ Operación cancelada.', opts: {} }],
        nextAction:    'cancel',
        sessionEstado: 'idle',
      };
    }
    if (action.startsWith('edit')) {
      const field = action.replace('edit:', '').trim() || null;
      return {
        nextAction:    'edit_field',
        sessionEstado: 'editando',
        draft:         field ? { campo_editar: field } : {},
      };
    }
  }

  // Primera llamada: preparar resumen + poll y pausar
  const responseGen = new ResponseGen(null);
  const summaryText = responseGen.formatOperationSummary({
    ...draft,
    saldo_actual: draft.saldo_actual ?? client?.saldo ?? 0,
    saldo_nuevo:  draft.saldo_nuevo  ?? 0,
    tiene_saldo:  draft.tiene_saldo_suficiente ?? true,
  });

  return {
    replyMessages: [
      { text: summaryText, opts: { parse_mode: 'HTML' } },
      {
        poll: '¿Deseas proceder con esta operación?',
        opts: {
          options: ['✅ Confirmar', '✏️ Editar', '❌ Cancelar'],
          is_anonymous:          false,
          allows_multiple_answers: false,
        },
      },
    ],
    nextAction:    'await_confirmation',
    sessionEstado: 'esperando_confirmacion',
  };
}

module.exports = confirmationNode;
