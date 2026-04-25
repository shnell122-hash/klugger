'use strict';
/**
 * Context Reader — Analiza el historial de conversación y determina qué acción tomar.
 * Evita respuestas repetitivas: solo propone respuesta si hay información accionable nueva.
 */

const SYSTEM_PROMPT = `Eres el asistente de un sistema financiero multiagente (FinOps).
Analizas el historial de una conversación de Telegram entre clientes/proveedores y el bot financiero.

Tu trabajo es:
1. Entender qué acaba de ocurrir en la conversación.
2. Determinar si el bot debe responder y qué decir.
3. Detectar automáticamente montos, tipos de operación, cuentas bancarias y confirmaciones de pago.

Tipos de operación:
- IAS: comisión 5.5% (facturas de comercializadoras, IAS)
- SINDICATO: comisión 5.5% (nómina sindical)
- SPEI: comisión 3.0% (transferencias bancarias)
- TARJETAS: comisión 5.5% (pagos con tarjeta)
- EFECTIVO: comisión 3.0% (pagos en efectivo)

Reglas:
- Si el usuario ya tiene una sesión activa y la IA ya preguntó algo, NO repitas la pregunta.
- Si el usuario envía info de pago (comprobante, monto, "ya pagué") → confirma saldo.
- Si el usuario envía datos bancarios → confírmalos y espera siguiente paso.
- Responde en español mexicano, de forma concisa y natural, sin plantillas rígidas.
- Si no hay nada que decir, responde con null.`;

class ContextReader {
  /**
   * @param {import('openai').OpenAI} llmClient - cliente DeepSeek/OpenAI compatible
   * @param {{ model: string }} opts
   */
  constructor(llmClient, opts = {}) {
    this.llm   = llmClient;
    this.model = opts.model ?? 'deepseek-chat';
  }

  /**
   * Analiza el contexto de conversación y decide qué responder.
   * @param {Array<{es_bot:boolean, texto:string, tipo:string, created_at:string}>} mensajes
   * @param {{ estado:string, saldo:number, nombre:string }} clienteInfo
   * @param {string} nuevoMensaje - el mensaje/evento más reciente que disparó el análisis
   * @returns {{ responder: boolean, mensaje: string | null, accion: string | null }}
   */
  async analizar(mensajes, clienteInfo, nuevoMensaje) {
    try {
      const historial = mensajes
        .slice(-25) // últimos 25 mensajes máximo
        .map(m => `[${m.es_bot ? 'BOT' : 'USUARIO'}] ${m.texto ?? `[${m.tipo}]`}`)
        .join('\n');

      const userPrompt = `
HISTORIAL DE CONVERSACIÓN:
${historial}

NUEVO EVENTO: ${nuevoMensaje}

ESTADO DEL CLIENTE:
- Nombre: ${clienteInfo.nombre ?? 'desconocido'}
- Saldo actual: $${clienteInfo.saldo?.toFixed(2) ?? '0.00'}
- Estado de sesión: ${clienteInfo.estado ?? 'idle'}

Responde con JSON:
{
  "responder": true|false,
  "mensaje": "texto de respuesta o null si no hay que responder",
  "accion": "confirmar_pago|registrar_cuenta|nueva_operacion|informar_saldo|ninguna"
}`;

      const completion = await this.llm.chat.completions.create({
        model:       this.model,
        max_tokens:  300,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt },
        ],
      });

      const raw    = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw);
      return {
        responder: parsed.responder === true,
        mensaje:   parsed.mensaje   ?? null,
        accion:    parsed.accion    ?? 'ninguna',
      };
    } catch (e) {
      console.error('[context-reader]', e.message);
      return { responder: false, mensaje: null, accion: 'ninguna' };
    }
  }
}

module.exports = ContextReader;
