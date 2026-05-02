'use strict';
/**
 * RouterNode — Determina el flujo del grafo según el tipo de mensaje y modo del chat.
 *
 * Lee: state.messageType, state.modoChat, state.inputText, state.draft.sessionEstado
 * Escribe: state.nextAction
 *
 * nextAction posibles:
 *   'text_flow'      — Flujo de texto (ParseNode → CommissionNode → ...)
 *   'file_flow'      — Flujo de archivos (Parte 5)
 *   'voice_flow'     — Flujo de voz (Parte 6)
 *   'asistente_flow' — Modo asistente silencioso (Parte 6)
 *   'callback_flow'  — Callbacks InlineKeyboard (Parte 7)
 *   null → '__end__' — Ignorar mensaje
 */

const { isOperacionCommand, isImplicitOperacion } = require('../../agents/parser');

async function routerNode(state) {
  const { messageType, modoChat, inputText, draft } = state;
  const sessionEstado = draft?.sessionEstado ?? state.sessionEstado ?? 'idle';

  // ── Callbacks (Parte 7) ───────────────────────────────────────────────────
  if (messageType === 'callback') {
    return { nextAction: 'callback_flow' };
  }

  // ── Modo asistente (Parte 6) ──────────────────────────────────────────────
  if (modoChat === 'asistente') {
    if (messageType === 'photo' || messageType === 'document') {
      return { nextAction: 'asistente_flow' };
    }
    if (messageType === 'voice') {
      return { nextAction: 'asistente_flow' };
    }
    // Texto en modo asistente: solo si hay sesión activa o es comando
    if (messageType === 'text' && inputText) {
      if (isOperacionCommand(inputText) || sessionEstado !== 'idle') {
        return { nextAction: 'text_flow' };
      }
    }
    return { nextAction: null };
  }

  // ── Voz ───────────────────────────────────────────────────────────────────
  if (messageType === 'voice') {
    return { nextAction: 'voice_flow' };
  }

  // ── Archivos (foto / documento) ───────────────────────────────────────────
  if (messageType === 'photo' || messageType === 'document') {
    return { nextAction: 'file_flow' };
  }

  // ── Texto (modo normal) ───────────────────────────────────────────────────
  if (messageType === 'text' && inputText) {
    // Hay sesión activa → siempre procesar
    if (sessionEstado && sessionEstado !== 'idle' && sessionEstado !== 'completado') {
      return { nextAction: 'text_flow' };
    }
    // Comando /operacion explícito
    if (isOperacionCommand(inputText)) {
      return { nextAction: 'text_flow' };
    }
    // Texto implícito que parece operación
    if (isImplicitOperacion(inputText)) {
      return { nextAction: 'text_flow' };
    }
    // Texto ignorado
    return { nextAction: null };
  }

  return { nextAction: null };
}

module.exports = routerNode;
