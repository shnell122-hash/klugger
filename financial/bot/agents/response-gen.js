'use strict';
/**
 * Response Generator Agent — Genera mensajes para el cliente.
 * Usa DeepSeek para respuestas en lenguaje natural solo cuando es necesario.
 * El 80% de las respuestas son templates (costo cero).
 */

const { fmt, pctStr } = require('./calculator');

class ResponseGen {
  /**
   * @param {import('openai').OpenAI} llmClient - cliente DeepSeek/OpenAI compatible
   * @param {object} opts
   * @param {string} opts.model
   * @param {Function} [opts.logUsage] - callback para registrar uso de tokens
   */
  constructor(llmClient, opts = {}) {
    this.llm   = llmClient;
    this.model = opts.model ?? 'deepseek-chat';
    this.logUsage = opts.logUsage ?? null;
  }

  // ── Templates (sin LLM) ───────────────────────────────────────────────────

  /**
   * Resumen de la operación calculada para mostrar antes del poll.
   */
  formatOperationSummary({
    tipo_operacion,
    tipo_monto,
    monto_solicitado,
    monto_bruto,
    monto_neto,
    comision_pct,
    es_entrada,
    saldo_actual,
    saldo_nuevo,
    tiene_saldo,
    instrucciones_pago,
    tipo_entrega,
    direccion_entrega,
    cuentas_bancarias,
  }) {
    const partes = [];

    if (tipo_monto === 'neto') {
      partes.push(
        `Correcto, el monto bruto a operar es de ` +
        `$${fmt(monto_solicitado)}/(1-${pctStr(comision_pct)})=` +
        `<b>$${fmt(monto_bruto)}</b>.`
      );
    } else {
      partes.push(
        `Correcto, el monto neto es de ` +
        `$${fmt(monto_solicitado)}×(1-${pctStr(comision_pct)})=` +
        `<b>$${fmt(monto_neto)}</b>.`
      );
    }

    if (es_entrada) {
      if (saldo_actual !== undefined) {
        partes.push(
          `Su saldo anterior es <b>$${fmt(saldo_actual)}</b> y su saldo nuevo ` +
          `$${fmt(saldo_actual)}+$${fmt(monto_neto)}=<b>$${fmt(saldo_nuevo)}</b>.`
        );
      }
    } else {
      if (tiene_saldo && saldo_actual !== undefined) {
        partes.push(
          `Su saldo anterior es <b>$${fmt(saldo_actual)}</b> y su saldo nuevo ` +
          `$${fmt(saldo_actual)}-$${fmt(monto_bruto)}=<b>$${fmt(saldo_nuevo)}</b>.`
        );
      } else if (instrucciones_pago) {
        partes.push(`\n📤 <b>Datos bancarios para el pago:</b>\n<code>${instrucciones_pago}</code>`);
      }
    }

    if (tipo_entrega === 'efectivo' && direccion_entrega) {
      partes.push(`📍 <b>Dirección de entrega:</b> ${direccion_entrega}`);
    }

    if (cuentas_bancarias?.length) {
      const maskNum = (num, tipo) => {
        if (tipo === 'CLABE')   return `${num.slice(0,3)}···${num.slice(-4)}`;
        if (tipo === 'tarjeta') return `●●●● ●●●● ●●●● ${num.slice(-4)}`;
        return `···${num.slice(-4)}`;
      };
      const lineas = cuentas_bancarias.map(c => {
        const banco   = c.banco   ? ` · ${c.banco}`   : '';
        const titular = c.titular ? ` · ${c.titular}` : '';
        return `💳 ${c.tipo} <code>${maskNum(c.numero, c.tipo)}</code>${banco}${titular}`;
      });
      partes.push(`\n📤 <b>Pago a:</b>\n${lineas.join('\n')}`);
    }

    // Tabla resumen
    partes.push(
      `\n<b>━━━━ Resumen ━━━━</b>\n` +
      `Operación: <b>${tipo_operacion}</b>\n` +
      `Monto bruto: $${fmt(monto_bruto)}\n` +
      `Comisión (${pctStr(comision_pct)}): -$${fmt(monto_bruto - monto_neto)}\n` +
      `<b>Monto neto: $${fmt(monto_neto)}</b>`
    );

    return partes.join('\n');
  }

  /**
   * Mensaje de operación confirmada.
   */
  formatConfirmed({ tipo_operacion, monto_neto, saldo_nuevo }) {
    return (
      `✅ <b>Operación confirmada</b>\n` +
      `Tipo: ${tipo_operacion} | Neto: $${fmt(monto_neto)}\n` +
      `Saldo actualizado: <b>$${fmt(saldo_nuevo)}</b>`
    );
  }

  /**
   * Mensaje de operación cancelada.
   */
  formatCancelled() {
    return '❌ Operación cancelada.';
  }

  /**
   * Mensaje cuando se inicia edición.
   */
  formatEditStart(field, label) {
    return `✏️ Editando <b>${label}</b>. Envía el nuevo valor:`;
  }

  /**
   * Mensaje cuando el cliente no tiene saldo suficiente y debe pagar.
   */
  formatInsuficiente({ saldo_actual, monto_bruto, faltante, instrucciones_pago }) {
    const partes = [
      `⚠️ Su saldo actual es <b>$${fmt(saldo_actual)}</b>, ` +
      `insuficiente para cubrir $${fmt(monto_bruto)}.`,
      `Monto a depositar: <b>$${fmt(faltante)}</b>`,
    ];
    if (instrucciones_pago) {
      partes.push(`\n📤 <b>Datos para su depósito:</b>\n<code>${instrucciones_pago}</code>`);
    }
    return partes.join('\n');
  }

  /**
   * Respuesta cuando el bot pide el tipo de operación.
   */
  formatAskTipo(tipos) {
    const lista = tipos.map(t => `• ${t.codigo} — ${t.nombre} (${pctStr(t.pct)})`).join('\n');
    return `¿Qué tipo de operación deseas realizar?\n\n${lista}\n\nResponde con el código o usa:\n/operacion [tipo] [neto|bruto] [monto]`;
  }

  /**
   * Respuesta cuando el bot pide el monto.
   */
  formatAskMonto(tipo_operacion, comision_pct) {
    return (
      `Operación <b>${tipo_operacion}</b> (comisión ${pctStr(comision_pct)}).\n` +
      `¿Cuánto deseas operar? Indica si es neto o bruto.\n` +
      `Ej: <code>neto 100000</code> o <code>bruto 103092</code>`
    );
  }

  /**
   * Respuesta cuando el bot pide dirección de entrega (efectivo).
   */
  formatAskDireccion() {
    return '📍 ¿Cuál es la dirección de entrega?';
  }

  // ── Respuestas LLM (solo para casos ambiguos) ─────────────────────────────

  /**
   * Genera una respuesta en lenguaje natural cuando el parser no pudo extraer
   * la operación con suficiente confianza.
   * Prompt ultra-corto para minimizar costo.
   */
  async generateNaturalResponse(userMessage, context = {}) {
    const systemPrompt =
      `Eres un asistente financiero profesional. Responde en español, breve y directo.
Contexto del cliente: saldo=${fmt(context.saldo ?? 0)}, cliente=${context.nombre ?? 'desconocido'}
Si falta información para procesar la operación, pide SOLO lo que falta (tipo, monto o entrega).`;

    const start = Date.now();
    const response = await this.llm.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      max_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
    });

    const usage = response.usage ?? {};
    if (this.logUsage) {
      this.logUsage({
        agent_name: 'response_gen',
        model: this.model,
        tokens_in: usage.prompt_tokens ?? 0,
        tokens_out: usage.completion_tokens ?? 0,
        duration_ms: Date.now() - start,
      });
    }

    return response.choices[0]?.message?.content ?? 'No pude procesar tu solicitud.';
  }

  /**
   * Usa LLM para parsear una operación de texto libre compleja.
   * Solo cuando el parser rule-based falla.
   */
  async parseFreeText(userMessage, context = {}) {
    const prompt =
      `Extrae datos de la operación financiera. Solo JSON, sin explicaciones.
Tipos: IAS(5.5%), TARJETAS(5.5%), SPEI(3%), EFECTIVO(3%), SINDICATO(5.5%)
Saldo cliente: $${fmt(context.saldo ?? 0)}
Mensaje: "${userMessage}"
JSON: {"tipo":"","tipo_monto":"neto|bruto","monto":0,"es_entrada":true,"tipo_entrega":"","confianza":"alta|media|baja"}`;

    const start = Date.now();
    const response = await this.llm.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    });

    const usage = response.usage ?? {};
    if (this.logUsage) {
      this.logUsage({
        agent_name: 'response_gen_parse',
        model: this.model,
        tokens_in: usage.prompt_tokens ?? 0,
        tokens_out: usage.completion_tokens ?? 0,
        duration_ms: Date.now() - start,
      });
    }

    try {
      const raw = response.choices[0]?.message?.content ?? '{}';
      return JSON.parse(raw.replace(/```json?\n?|```/g, '').trim());
    } catch {
      return null;
    }
  }
}

module.exports = ResponseGen;
