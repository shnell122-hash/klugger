'use strict';
/**
 * Poll Handler Agent — Crea y gestiona polls de confirmación en Telegram.
 */

const CONFIRM_OPTIONS = ['✅ Confirmar', '✏️ Solicitar cambios', '❌ Cancelar'];
const CONFIRM_IDX     = { CONFIRMAR: 0, EDITAR: 1, CANCELAR: 2 };

const EDITABLE_FIELDS = {
  tipo_operacion:    { label: 'Tipo de operación', ejemplo: 'IAS, SPEI, EFECTIVO...' },
  monto_bruto:       { label: 'Monto bruto',       ejemplo: '103092.78' },
  tipo_monto:        { label: 'Neto o bruto',       ejemplo: 'neto / bruto' },
  tipo_entrega:      { label: 'Tipo de entrega',    ejemplo: 'efectivo, tarjeta, spei' },
  instrucciones_pago:{ label: 'Instrucciones/datos bancarios', ejemplo: 'CLABE, banco...' },
  direccion_entrega: { label: 'Dirección de entrega', ejemplo: 'Calle, colonia...' },
  notas:             { label: 'Notas adicionales',  ejemplo: 'Cualquier comentario' },
  cancelar_todo:     { label: '❌ Cancelar toda la operación', ejemplo: '' },
};

class PollHandler {
  constructor(bot) {
    this.bot = bot;
    this._pendingPolls = new Map();
    this._pendingEdits = new Map();
  }

  async sendConfirmationPoll(chatId, operationDraft, summaryText) {
    await this.bot.api.sendMessage(chatId, summaryText, { parse_mode: 'HTML' });

    const pollMsg = await this.bot.api.sendPoll(
      chatId,
      '¿Deseas proceder con esta operación?',
      CONFIRM_OPTIONS,
      { is_anonymous: false, allows_multiple_answers: false }
    );

    this._pendingPolls.set(pollMsg.poll.id, {
      chatId,
      operationDraft,
      messageId: pollMsg.message_id,
    });

    return { pollMessageId: pollMsg.message_id, pollId: pollMsg.poll.id };
  }

  processPollAnswer(pollAnswer) {
    const pending = this._pendingPolls.get(pollAnswer.poll_id);
    if (!pending) return { action: 'unknown', operationDraft: null };

    const optionIdx = pollAnswer.option_ids[0];

    if (optionIdx === CONFIRM_IDX.CONFIRMAR) {
      this._pendingPolls.delete(pollAnswer.poll_id);
      return { action: 'confirm', operationDraft: pending.operationDraft, chatId: pending.chatId };
    }
    if (optionIdx === CONFIRM_IDX.EDITAR) {
      this._pendingPolls.delete(pollAnswer.poll_id);
      return { action: 'edit', operationDraft: pending.operationDraft, chatId: pending.chatId };
    }
    if (optionIdx === CONFIRM_IDX.CANCELAR) {
      this._pendingPolls.delete(pollAnswer.poll_id);
      return { action: 'cancel', operationDraft: pending.operationDraft, chatId: pending.chatId };
    }

    return { action: 'unknown', operationDraft: null };
  }

  async sendEditMenu(chatId, operationDraft, summaryMessageId = null) {
    const buttons = Object.entries(EDITABLE_FIELDS).map(([field, { label }]) => ([
      { text: label, callback_data: `edit_field:${field}` },
    ]));

    await this.bot.api.sendMessage(
      chatId,
      '¿Qué deseas cambiar?',
      { reply_markup: { inline_keyboard: buttons } }
    );

    this._pendingEdits.set(chatId, { field: null, operationDraft, summaryMessageId });
  }

  async processEditFieldSelection(chatId, field, callbackQueryId) {
    const pending = this._pendingEdits.get(chatId);
    if (!pending) return null;

    if (field === 'cancelar_todo') {
      this._pendingEdits.delete(chatId);
      return { action: 'cancel' };
    }

    const fieldInfo = EDITABLE_FIELDS[field];
    if (!fieldInfo) return null;

    pending.field = field;
    this._pendingEdits.set(chatId, pending);

    await this.bot.api.answerCallbackQuery(callbackQueryId, { text: `Editando: ${fieldInfo.label}` });

    const currentVal = pending.operationDraft[field] ?? '(no definido)';
    await this.bot.api.sendMessage(
      chatId,
      `Valor actual de <b>${fieldInfo.label}</b>: <code>${currentVal}</code>\n` +
      `Envía el nuevo valor. Ejemplo: <i>${fieldInfo.ejemplo}</i>`,
      { parse_mode: 'HTML' }
    );

    return { action: 'awaiting_value', field, fieldInfo };
  }

  applyEditValue(chatId, rawValue) {
    const pending = this._pendingEdits.get(chatId);
    if (!pending || !pending.field) return { ok: false, error: 'Sin edición pendiente' };

    const field = pending.field;
    let value = rawValue.trim();
    let error = null;

    if (field === 'monto_bruto') {
      const n = parseFloat(value.replace(/,/g, ''));
      if (isNaN(n) || n <= 0) error = 'El monto debe ser un número positivo';
      else value = n;
    }
    if (field === 'tipo_monto' && !['neto', 'bruto'].includes(value.toLowerCase())) {
      error = 'Debe ser "neto" o "bruto"';
    }
    if (field === 'tipo_entrega' && !['efectivo', 'tarjeta', 'spei', 'otro'].includes(value.toLowerCase())) {
      error = 'Debe ser: efectivo, tarjeta, spei u otro';
    }

    if (error) return { ok: false, error };

    pending.operationDraft[field] = value;
    pending.field = null;
    this._pendingEdits.set(chatId, pending);

    return { ok: true, operationDraft: pending.operationDraft };
  }

  hasPendingEdit(chatId) {
    const p = this._pendingEdits.get(chatId);
    return p && p.field !== null;
  }

  hasPendingEditMenu(chatId) {
    const p = this._pendingEdits.get(chatId);
    return p && p.field === null;
  }

  clearEdit(chatId) {
    this._pendingEdits.delete(chatId);
  }

  async closePoll(chatId, messageId) {
    try {
      await this.bot.api.stopPoll(chatId, messageId);
    } catch (_) { /* ya cerrado */ }
  }
}

module.exports = { PollHandler, CONFIRM_OPTIONS, EDITABLE_FIELDS };
