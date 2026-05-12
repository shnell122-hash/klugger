'use strict';
/**
 * ContextCompactor — Compresión semántica del historial de conversación.
 *
 * Cuando la conversación supera COMPACT_THRESHOLD mensajes, llama a DeepSeek Flash
 * para producir un resumen estructurado que TransactionOrchestrator puede usar
 * como contexto compacto en lugar del historial crudo completo.
 *
 * El resultado se cachea 90s por chatId para evitar llamadas repetidas en el mismo
 * intercambio (múltiples mensajes rápidos del mismo usuario).
 */

const https = require('https');

const COMPACT_THRESHOLD = 12;   // mensajes mínimos para activar compactación
const CACHE_TTL_MS      = 90_000;
const TIMEOUT_MS        = 12_000;
const MODEL             = process.env.DEEPSEEK_CHAT_MODEL ?? 'deepseek-chat';

class ContextCompactor {
  constructor(apiKey) {
    this._key   = apiKey ?? null;
    this._cache = new Map();  // chatId → { result, expiresAt }
  }

  /**
   * Compacta el historial de mensajes en un resumen estructurado.
   *
   * @param {string|number} chatId
   * @param {Array<{es_bot:boolean, texto:string, from_username?:string}>} mensajes
   * @returns {Promise<{intent:string, operacion_activa:object|null, pendiente:string|null, resumen:string}|null>}
   */
  async compact(chatId, mensajes) {
    if (!this._key) return null;
    if (!mensajes || mensajes.length < COMPACT_THRESHOLD) return null;

    const cacheKey = String(chatId);
    const cached   = this._cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    const historial = mensajes
      .slice(-20)
      .map(m => {
        const quien = m.es_bot ? 'BOT'
          : (m.from_username ? `@${m.from_username}` : 'USUARIO');
        return `[${quien}] ${(m.texto ?? '').slice(0, 200)}`;
      })
      .join('\n');

    const prompt =
      'Eres un extractor de contexto para un bot financiero en México.\n' +
      'Analiza la conversación y responde ÚNICAMENTE con JSON válido (sin texto adicional):\n' +
      '{\n' +
      '  "intent": "descripción breve de lo que quiere el usuario actualmente",\n' +
      '  "operacion_activa": null | {"tipo":"IAS|SPEI|SINDICATO|TARJETAS|EFECTIVO","monto":number,"tipo_monto":"neto|bruto"},\n' +
      '  "pendiente": null | "qué falta para completar la operación",\n' +
      '  "resumen": "1-2 oraciones del estado actual de la conversación"\n' +
      '}';

    try {
      const raw = await this._call(prompt, historial);
      const match = raw.match(/\{[\s\S]+\}/);
      if (!match) return null;

      const result = JSON.parse(match[0]);
      this._cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      console.log(`[ContextCompactor] chatId=${chatId} intent="${result.intent?.slice(0, 60)}"`);
      return result;
    } catch (e) {
      console.error('[ContextCompactor]', e.message);
      return null;
    }
  }

  /** Invalida la caché para un chat (llamar cuando la sesión cambia de estado). */
  invalidate(chatId) {
    this._cache.delete(String(chatId));
  }

  _call(systemPrompt, userContent) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model:      MODEL,
        max_tokens: 256,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: `Conversación:\n${userContent}` },
        ],
      });

      const req = https.request({
        hostname: 'api.deepseek.com',
        path:     '/v1/chat/completions',
        method:   'POST',
        headers: {
          'Authorization':  `Bearer ${this._key}`,
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) { reject(new Error(json.error.message)); return; }
            resolve(json.choices?.[0]?.message?.content ?? '');
          } catch (e) { reject(e); }
        });
      });

      req.on('error', reject);
      setTimeout(() => reject(new Error(`ContextCompactor timeout ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
      req.write(body);
      req.end();
    });
  }
}

module.exports = ContextCompactor;
