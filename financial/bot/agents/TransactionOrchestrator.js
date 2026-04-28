'use strict';
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-6';

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

const TOOL_SCHEMA = {
  name: 'decidir_accion',
  description: 'Decide qué acción tomar para el mensaje actual del usuario',
  input_schema: {
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
};

class TransactionOrchestrator {
  constructor(apiKey) {
    if (!apiKey) throw new Error('TransactionOrchestrator requiere ANTHROPIC_API_KEY');
    this.client = new Anthropic({ apiKey });
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
      const response = await this.client.messages.create({
        model:     MODEL,
        max_tokens: 256,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools:      [TOOL_SCHEMA],
        tool_choice: { type: 'tool', name: 'decidir_accion' },
        messages:   [{ role: 'user', content: userMsg }],
      });

      const toolUse = response.content.find(b => b.type === 'tool_use');
      const result  = toolUse?.input ?? { accion: 'ignorar', confianza: 'baja', razon: 'no tool use', params: {} };

      const usage = response.usage ?? {};
      console.log(
        `[TransactionOrchestrator/sonnet] accion=${result.accion} confianza=${result.confianza} ` +
        `tokens=${usage.input_tokens ?? 0}+${usage.output_tokens ?? 0} ${Date.now() - start}ms`
      );

      return { params: {}, ...result };
    } catch (e) {
      console.error('[TransactionOrchestrator]', e.message);
      return { accion: 'ignorar', confianza: 'baja', razon: e.message, params: {} };
    }
  }
}

module.exports = TransactionOrchestrator;
