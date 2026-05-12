'use strict';
/**
 * RouterNode — Determina el flujo del grafo según el tipo de mensaje y modo del chat.
 *
 * Lee: state.messageType, state.modoChat, state.inputText, state.draft.sessionEstado,
 *      state._to (TransactionOrchestrator, inyectado por FinBotGraph)
 * Escribe: state.nextAction, state.draft.toDecision (decisión semántica del TO)
 *
 * Estrategia de routing para texto en idle:
 *   1. Comando explícito /operacion → text_flow inmediato (fast path)
 *   2. TransactionOrchestrator disponible → llamada semántica, actuar según decision.accion
 *   3. Fallback regex → isImplicitOperacion (cuando TO no disponible o falla)
 */

const { isOperacionCommand, isImplicitOperacion } = require('../../agents/parser');

async function routerNode(state) {
  const { messageType, modoChat, inputText, draft } = state;
  const sessionEstado = draft?.sessionEstado ?? state.sessionEstado ?? 'idle';
  const to            = state._to ?? null;

  // ── Callbacks (Parte 7) ───────────────────────────────────────────────────
  if (messageType === 'callback') {
    return { nextAction: 'callback_flow' };
  }

  // ── Archivos (foto / documento) ───────────────────────────────────────────
  if (messageType === 'photo' || messageType === 'document') {
    if (modoChat === 'asistente') return { nextAction: 'asistente_flow' };
    return { nextAction: 'file_flow' };
  }

  // ── Voz ───────────────────────────────────────────────────────────────────
  if (messageType === 'voice') {
    return { nextAction: modoChat === 'asistente' ? 'asistente_flow' : 'voice_flow' };
  }

  // ── Texto ─────────────────────────────────────────────────────────────────
  if (messageType !== 'text' || !inputText) return { nextAction: null };

  // Sesión activa en estado intermedio → siempre procesar (estado machine necesario aquí)
  const ACTIVE_ESTADOS = ['esperando_tipo', 'esperando_monto', 'esperando_entrega',
    'esperando_datos_bancarios', 'confirmando_operacion',
    'confirmando_comprobante', 'confirmando_factura'];
  if (ACTIVE_ESTADOS.includes(sessionEstado)) {
    return { nextAction: 'text_flow' };
  }

  // Comando explícito → fast path sin LLM
  if (isOperacionCommand(inputText)) {
    return { nextAction: 'text_flow' };
  }

  // ── Routing semántico (idle) ───────────────────────────────────────────────
  if (to && modoChat !== 'asistente') {
    try {
      const mensajesRecientes = state._mensajesRecientes ?? [];
      const saldo             = state._saldo ?? 0;
      const nombre            = state.client?.nombre ?? null;
      const compactado        = state._contextoCompactado ?? null;

      const decision = await to.rutear({
        estado:             sessionEstado,
        mensajesRecientes,
        textoUsuario:       inputText,
        saldo,
        nombre,
        contextoCompactado: compactado,
      });

      if (['iniciar_operacion', 'confirmar', 'pedir_monto', 'pedir_cuenta_bancaria'].includes(decision.accion)) {
        return {
          nextAction: 'text_flow',
          draft: { toDecision: decision },
        };
      }
      if (decision.accion === 'responder_info') {
        return {
          nextAction: 'respond_info',
          draft: { toDecision: decision },
        };
      }
      // 'ignorar' o 'cancelar'
      return { nextAction: null };
    } catch (e) {
      console.error('[RouterNode/TO]', e.message);
      // Fall through to regex fallback
    }
  }

  // Modo asistente — texto: solo si hay sesión activa o comando (ya manejado arriba)
  if (modoChat === 'asistente') {
    return { nextAction: null };
  }

  // Fallback regex (TO no disponible o falló)
  if (isImplicitOperacion(inputText)) {
    return { nextAction: 'text_flow' };
  }

  return { nextAction: null };
}

module.exports = routerNode;
