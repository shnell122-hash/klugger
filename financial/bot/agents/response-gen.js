'use strict';
/**
 * Response Generator Agent — Genera mensajes para el cliente.
 */

const { fmt } = require('./calculator');

class ResponseGen {
  constructor(llmClient, opts = {}) {
    this.llm   = llmClient;
    this.model = opts.model ?? process.env.DEEPSEEK_PRO_MODEL ?? 'deepseek-chat';
    this.logUsage = opts.logUsage ?? null;
  }

  formatOperationSummary({
    tipo_operacion, tipo_monto, monto_solicitado, monto_bruto, monto_neto, comision_pct,
    es_entrada, saldo_actual, saldo_nuevo, tiene_saldo, instrucciones_pago, tipo_entrega,
    direccion_entrega, cuentas_bancarias, tabla_pagos, tabla_total, monto_neto_original,
  }) {
    const partes = [];
    const esPagoTabla = tabla_total > 0 && tabla_pagos?.length > 0;

    if (esPagoTabla) {
      const restante = monto_neto_original && monto_neto_original > tabla_total
        ? Math.round((monto_neto_original - tabla_total) * 100) / 100
        : null;
      partes.push(
        `Pago parcial a <b>${tabla_pagos.length} beneficiarios</b>.\n` +
        `Total esta entrega: <b>$${fmt(tabla_total)}</b>` +
        (monto_neto_original ? ` de $${fmt(monto_neto_original)} operación total` : '') + '.'
      );
      if (restante !== null) {
        partes.push(`Saldo restante de operación tras esta entrega: <b>$${fmt(restante)}</b>.`);
      }
      if (saldo_actual !== undefined) {
        partes.push(`Saldo cliente: <b>$${fmt(saldo_actual)}</b> → <b>$${fmt(saldo_nuevo)}</b>.`);
      }
    } else {
      if (tipo_monto === 'neto') {
        partes.push(`Correcto, el monto bruto a operar es de <b>$${fmt(monto_bruto)}</b>.`);
      } else {
        partes.push(`Correcto, el monto neto es de <b>$${fmt(monto_neto)}</b>.`);
      }

      if (es_entrada) {
        if (instrucciones_pago) {
          partes.push(`\n📥 <b>Datos para tu depósito:</b>\n<code>${instrucciones_pago}</code>`);
        }
        if (saldo_actual !== undefined) {
          partes.push(`Tu saldo actual es <b>$${fmt(saldo_actual)}</b>. Al acreditarse quedará en <b>$${fmt(saldo_nuevo)}</b>.`);
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
    }

    if (tipo_entrega === 'efectivo' && direccion_entrega) {
      partes.push(`📍 <b>Dirección de entrega:</b> ${direccion_entrega}`);
    }

    if (cuentas_bancarias?.length && !esPagoTabla) {
      const lineas = cuentas_bancarias.map(c => {
        const banco   = c.banco   ? `\nBanco: ${c.banco}`     : '';
        const titular = c.titular ? `\nTitular: ${c.titular}` : '';
        return `💳 <b>${c.tipo}:</b> <code>${c.numero}</code>${banco}${titular}`;
      });
      partes.push(`\n📤 <b>Pago a:</b>\n${lineas.join('\n\n')}`);
    }

    if (esPagoTabla) {
      partes.push(
        `\n<b>━━━━ Resumen ━━━━</b>\n` +
        `Operación: <b>${tipo_operacion}</b>\n` +
        `Beneficiarios: ${tabla_pagos.length}\n` +
        `<b>Total neto pagado: $${fmt(tabla_total)}</b>` +
        (monto_neto_original ? `\nRestante operación: $${fmt(Math.round((monto_neto_original - tabla_total) * 100) / 100)}` : '')
      );
    } else {
      partes.push(
        `\n<b>━━━━ Resumen ━━━━</b>\n` +
        `Operación: <b>${tipo_operacion}</b>\n` +
        `Monto bruto: $${fmt(monto_bruto)}\n` +
        `<b>Monto neto: $${fmt(monto_neto)}</b>`
      );
    }

    return partes.join('\n');
  }

  formatConfirmed({ tipo_operacion, monto_neto, monto_bruto, saldo_nuevo, tabla_total, monto_neto_original, es_entrada, instrucciones_pago }) {
    const esPagoTabla = tabla_total > 0;
    const restante = (esPagoTabla && monto_neto_original && monto_neto_original > tabla_total)
      ? Math.round((monto_neto_original - tabla_total) * 100) / 100
      : null;

    let msg = `✅ <b>Operación confirmada</b>\n`;
    if (esPagoTabla) {
      msg += `Tipo: ${tipo_operacion} | Entrega: $${fmt(tabla_total)}\n`;
      if (restante !== null) msg += `Restante operación: <b>$${fmt(restante)}</b>\n`;
    } else {
      msg += `Tipo: ${tipo_operacion} | Neto: $${fmt(monto_neto)}\n`;
    }
    msg += `Saldo actualizado: <b>$${fmt(saldo_nuevo)}</b>`;

    if (es_entrada && instrucciones_pago) {
      msg += `\n\n📥 <b>Realiza tu transferencia de $${fmt(monto_bruto)} a:</b>\n<code>${instrucciones_pago}</code>`;
      msg += `\n\nCompartenos el comprobante para acreditar tu saldo.`;
    }

    return msg;
  }

  formatCancelled() { return '❌ Operación cancelada.'; }
  formatEditStart(field, label) { return `✏️ Editando <b>${label}</b>. Envía el nuevo valor:`; }

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

  formatAskTipo(tipos) {
    const lista = tipos.map(t => `• ${t.codigo} — ${t.nombre}`).join('\n');
    return `¿Qué tipo de operación deseas realizar?\n\n${lista}\n\nResponde con el código o usa:\n/operacion [tipo] [neto|bruto] [monto]`;
  }

  formatAskMonto(tipo_operacion) {
    return (
      `Operación <b>${tipo_operacion}</b>.\n` +
      `¿Cuánto deseas operar? Indica si es neto o bruto.\n` +
      `Ej: <code>neto 100000</code> o <code>bruto 103092</code>`
    );
  }

  formatAskDireccion() { return '📍 ¿Cuál es la dirección de entrega?'; }

  async generateNaturalResponse(userMessage, context = {}) {
    const systemPrompt =
      `Eres un asistente financiero profesional. Responde en español, breve y directo.\nContexto del cliente: saldo=${fmt(context.saldo ?? 0)}, cliente=${context.nombre ?? 'desconocido'}\nSi falta información para procesar la operación, pide SOLO lo que falta (tipo, monto o entrega).`;

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

  async parseFreeText(userMessage, context = {}) {
    const prompt =
      `Extrae datos de la operación financiera. Solo JSON, sin explicaciones.\nTipos: IAS(5.5%), TARJETAS(5.5%), SPEI(3%), EFECTIVO(3%), SINDICATO(5.5%)\nSaldo cliente: $${fmt(context.saldo ?? 0)}\nMensaje: "${userMessage}"\nJSON: {"tipo":"","tipo_monto":"neto|bruto","monto":0,"es_entrada":true,"tipo_entrega":"","confianza":"alta|media|baja"}`;

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
