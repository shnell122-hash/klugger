'use strict';
/**
 * AskFieldsNode — Pide al usuario los datos que faltan.
 *
 * Lee:   state.nextAction, state.draft, state.verificationResult
 * Escribe: state.replyMessages, state.nextAction → null
 */

const TIPOS_DISPONIBLES = ['IAS', 'SPEI', 'SINDICATO', 'EFECTIVO', 'TARJETAS'];

function askFieldsNode(state) {
  const { nextAction, draft, verificationResult } = state;
  const tipo = draft?.tipo_operacion ?? '';

  let replyMessages = [];

  switch (nextAction) {

    case 'ask_tipo': {
      const lista = TIPOS_DISPONIBLES.map(t => `• <b>${t}</b>`).join('\n');
      replyMessages = [{
        text: `¿Qué tipo de operación quieres hacer?\n\n${lista}\n\nEscríbelo y con gusto lo proceso.`,
        opts: { parse_mode: 'HTML' },
      }];
      break;
    }

    case 'ask_monto': {
      const tipoLabel = tipo ? ` de <b>${tipo}</b>` : '';
      replyMessages = [{
        text: `¿Cuánto es el monto${tipoLabel}? Dime si es neto o bruto y te calculo todo.`,
        opts: { parse_mode: 'HTML' },
      }];
      break;
    }

    case 'ask_entrega': {
      const tipoEntrega = draft?.tipo_entrega ?? '';
      const label = tipoEntrega === 'efectivo'
        ? '¿A qué dirección te mando el efectivo?'
        : tipoEntrega === 'tarjeta'
        ? '¿A qué dirección entregamos las tarjetas?'
        : '¿Me das la dirección de entrega?';
      replyMessages = [{
        text: label,
        opts: {},
      }];
      break;
    }

    case 'ask_fields': {
      const errors = verificationResult?.errors ?? [];
      if (errors.length > 0) {
        const errorLines = errors.map(e => `• ${e}`).join('\n');
        replyMessages = [{
          text: `Antes de continuar necesito confirmar algunos datos:\n\n${errorLines}`,
          opts: {},
        }];
      }
      break;
    }

    default:
      break;
  }

  return {
    replyMessages,
    nextAction: null,
  };
}

module.exports = askFieldsNode;
