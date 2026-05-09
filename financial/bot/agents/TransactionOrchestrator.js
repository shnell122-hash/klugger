'use strict';
const { OpenAI } = require('openai');

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

const TOOL = {
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
  constructor(llmClient, opts = {}) {
    if (!llmClient) throw new Error('TransactionOrchestrator requiere llmClient (OpenAI-compatible)');
    this.client = llmClient;
    this.model  = opts.model ?? process.env.DEEPSEEK_PRO_MODEL ?? 'deepseek-chat';
  }

  async rutear({ estado, mensajesRecientes, textoUsuario, saldo, nombre }) {
    const historial = (mensajesRecientes ?? [])
      .slice(-10)
      .map(m => `[${m.es_bot ? 'BOT' : 'USUARIO'}] ${m.texto ?? m.content ?? ''}`)
      .join('\n');

    const userMsg =
      `Estado de sesión: ${estado}\n` +
      `Saldo del cliente: $${saldo ?? 0}\n` +
      `Nombre del cliente: ${nombre ?? 'Desconocido'}\n\n` +
      `Historial reciente:\n${historial}\n\n` +
      `Mensaje actual del usuario: "${textoUsuario}"`;

    const start = Date.now();
    try {
      const response = await this.client.chat.completions.create({
        model:       this.model,
        max_tokens:  256,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMsg },
        ],
        tools:       [TOOL],
        tool_choice: { type: 'function', function: { name: 'decidir_accion' } },
      });

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      const result   = toolCall
        ? JSON.parse(toolCall.function.arguments)
        : { accion: 'ignorar', confianza: 'baja', razon: 'no tool call', params: {} };

      const usage = response.usage ?? {};
      console.log(
        `[TransactionOrchestrator/${this.model}] accion=${result.accion} confianza=${result.confianza} ` +
        `tokens=${usage.prompt_tokens ?? 0}+${usage.completion_tokens ?? 0} ${Date.now() - start}ms`
      );

      return { params: {}, ...result };
    } catch (e) {
      console.error('[TransactionOrchestrator]', e.message);
      return { accion: 'ignorar', confianza: 'baja', razon: e.message, params: {} };
    }
  }
}

module.exports = TransactionOrchestrator;
