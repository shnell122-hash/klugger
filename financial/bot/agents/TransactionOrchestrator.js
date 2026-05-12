'use strict';
const { OpenAI } = require('openai');

const MODEL = process.env.DEEPSEEK_PRO_MODEL ?? 'deepseek-v4-pro';

const SYSTEM_PROMPT =
  'Eres el orquestador de transacciones de un sistema financiero de cobro en México.\n' +
  'Tu tarea es analizar el contexto de una conversación y decidir qué acción tomar.\n\n' +
  'CONTEXTO DEL SISTEMA:\n' +
  '- El bot gestiona operaciones: IAS (nómina), SPEI, SINDICATO, TARJETAS, EFECTIVO\n' +
  '- Los clientes envían mensajes de texto para iniciar, confirmar o cancelar operaciones\n' +
  '- El bot tiene estados de sesión: idle, esperando_tipo, esperando_monto, esperando_entrega, etc.\n\n' +
  'DECISIONES POSIBLES:\n' +
  '- "iniciar_operacion": el usuario quiere hacer una operación financiera\n' +
  '- "confirmar": el usuario confirma una operación pendiente\n' +
  '- "cancelar": el usuario cancela\n' +
  '- "pedir_monto": necesitas pedirle el monto al usuario\n' +
  '- "pedir_cuenta_bancaria": necesitas pedirle cuenta bancaria\n' +
  '- "responder_info": responder una pregunta informativa (saldo, historial, etc.)\n' +
  '- "ignorar": el mensaje no requiere acción del bot financiero\n\n' +
  'IMPORTANTE:\n' +
  '- Solo decide "iniciar_operacion" si hay intención clara de hacer una transacción financiera\n' +
  '- "ignorar" si el mensaje es saludo casual, off-topic o ruido\n' +
  '- Sé conservador: ante la duda, "ignorar"';

// Tool schema en formato OpenAI-compatible (DeepSeek): "parameters" en vez de "input_schema"
const TOOL_SCHEMA = {
  type: 'function',
  function: {
    name: 'decidir_accion',
    description: 'Decide qué acción tomar para el mensaje actual del usuario',
    parameters: {
      type: 'object',
      required: ['accion', 'confianza', 'razon'],
      properties: {
        accion: {
          type: 'string',
          enum: ['iniciar_operacion', 'confirmar', 'cancelar', 'pedir_monto',
                 'pedir_cuenta_bancaria', 'responder_info', 'ignorar'],
        },
        params: {
          type: 'object',
          properties: {
            tipo_operacion:    { type: 'string' },
            monto:             { type: 'number' },
            tipo_monto:        { type: 'string' },
            mensaje_respuesta: { type: 'string' },
          },
        },
        confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
        razon:     { type: 'string' },
      },
    },
  },
};

class TransactionOrchestrator {
  constructor(apiKey) {
    if (!apiKey) throw new Error('TransactionOrchestrator requiere DEEPSEEK_API_KEY');
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
    });
  }

  async rutear({ estado, mensajesRecientes, textoUsuario, saldo, nombre, contextoCompactado }) {
    const historial = (mensajesRecientes ?? [])
      .slice(-8)
      .map(m => `[${m.es_bot ? 'BOT' : (m.from_username ? `@${m.from_username}` : 'USUARIO')}] ${m.texto ?? m.content ?? ''}`)
      .join('\n');

    const ctxExtra = contextoCompactado
      ? `\nContexto compactado de la conversación:\n` +
        `  Intención: ${contextoCompactado.intent ?? '?'}\n` +
        (contextoCompactado.operacion_activa
          ? `  Operación activa: ${JSON.stringify(contextoCompactado.operacion_activa)}\n`
          : '') +
        (contextoCompactado.pendiente
          ? `  Pendiente: ${contextoCompactado.pendiente}\n`
          : '') +
        `  Resumen: ${contextoCompactado.resumen ?? ''}\n`
      : '';

    const userMsg =
      `Estado de sesión: ${estado}\n` +
      `Saldo del cliente: $${saldo ?? 0}\n` +
      `Nombre del cliente: ${nombre ?? 'Desconocido'}\n` +
      ctxExtra +
      `\nHistorial reciente (últimos 8 mensajes):\n${historial}\n\n` +
      `Mensaje actual del usuario: "${textoUsuario}"`;

    const start = Date.now();
    try {
      const response = await this.client.chat.completions.create({
        model:       MODEL,
        max_tokens:  256,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMsg },
        ],
        tools:       [TOOL_SCHEMA],
        tool_choice: 'required',
      });

      const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
      const result   = toolCall
        ? JSON.parse(toolCall.function.arguments)
        : { accion: 'ignorar', confianza: 'baja', razon: 'no tool call', params: {} };

      const usage = response.usage ?? {};
      console.log(
        `[TransactionOrchestrator/deepseek-pro] accion=${result.accion} confianza=${result.confianza} ` +
        `tokens=${usage.prompt_tokens ?? 0}+${usage.completion_tokens ?? 0}` +
        (usage.prompt_cache_hit_tokens ? ` cache_hit=${usage.prompt_cache_hit_tokens}` : '') +
        ` ${Date.now() - start}ms`
      );

      return { params: {}, ...result };
    } catch (e) {
      console.error('[TransactionOrchestrator]', e.message);
      return { accion: 'ignorar', confianza: 'baja', razon: e.message, params: {} };
    }
  }
}

module.exports = TransactionOrchestrator;
