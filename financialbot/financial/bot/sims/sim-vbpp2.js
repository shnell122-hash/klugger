'use strict';
/**
 * Simulador VBPP2 — Simula al usuario VBPP2 en Telegram.
 *
 * Escenarios:
 *   0: SPEI salida 50000 neto + CLABE + confirmar
 *   1: Comprobante PDF modo asistente
 *   2: Consulta de saldo
 *   3: Mensaje de diferencia (texto libre)
 *
 * Uso:
 *   node sim-vbpp2.js 0
 *   node sim-vbpp2.js
 *
 * Requiere en financial/.env:
 *   SIM_VBPP2_BOT_TOKEN, SIM_CHAT_ID, SIM_ASISTENTE_CHAT_ID
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs   = require('fs');
const path = require('path');
const https = require('https');
const FormData = require('form-data');

const BOT_TOKEN         = process.env.SIM_VBPP2_BOT_TOKEN;
const CHAT_ID           = process.env.SIM_CHAT_ID;
const ASISTENTE_CHAT_ID = process.env.SIM_ASISTENTE_CHAT_ID;
const ASSETS_DIR        = path.join(__dirname, 'assets');

if (!BOT_TOKEN) {
  console.error('[sim-vbpp2] ERROR: SIM_VBPP2_BOT_TOKEN no configurado en financial/.env');
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function telegramRequest(method, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function sendMessage(chatId, text) {
  const r = await telegramRequest('sendMessage', { chat_id: chatId, text });
  if (!r.ok) console.error('[sim-vbpp2] sendMessage error:', r.description);
  return r;
}

async function sendDocument(chatId, filePath, filename, caption) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('document', fs.createReadStream(filePath), { filename: filename ?? path.basename(filePath) });
    if (caption) form.append('caption', caption);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendDocument`,
      method: 'POST',
      headers: form.getHeaders(),
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

const SCENARIOS = [
  // 0: Operación SPEI salida 50000 neto
  async () => {
    console.log('[sim-vbpp2] Escenario 0: SPEI 50000 neto');
    await sendMessage(CHAT_ID, 'quiero hacer un SPEI de 50000 neto');
    await sleep(4000);
    await sendMessage(CHAT_ID, '058597000068994820'); // CLABE Noela
    await sleep(4000);
    await sendMessage(CHAT_ID, 'sí confirmo');
    await sleep(3000);
    console.log('[sim-vbpp2] Escenario 0 completado');
  },

  // 1: Comprobante PDF modo asistente
  async () => {
    console.log('[sim-vbpp2] Escenario 1: Comprobante PDF');
    const pdfPath = path.join(ASSETS_DIR, 'comprobante-spei.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.warn('[sim-vbpp2] WARN: assets/comprobante-spei.pdf no existe');
      return;
    }
    await sendDocument(ASISTENTE_CHAT_ID, pdfPath, 'comprobante.pdf');
    await sleep(8000);
    console.log('[sim-vbpp2] Escenario 1 completado');
  },

  // 2: Consulta de saldo
  async () => {
    console.log('[sim-vbpp2] Escenario 2: ¿cuánto tengo en saldo?');
    await sendMessage(CHAT_ID, '¿cuánto tengo en saldo?');
    await sleep(3000);
    console.log('[sim-vbpp2] Escenario 2 completado');
  },

  // 3: Mensaje de diferencia (texto libre que el bot debe ignorar o enrutar)
  async () => {
    console.log('[sim-vbpp2] Escenario 3: Mensaje de diferencia');
    await sendMessage(CHAT_ID, 'hay una diferencia de $200, mándalo a Ricardo');
    await sleep(4000);
    console.log('[sim-vbpp2] Escenario 3 completado');
  },
];

async function main() {
  const scenarioIdx = parseInt(process.argv[2] ?? 'NaN');
  if (!isNaN(scenarioIdx)) {
    if (scenarioIdx < 0 || scenarioIdx >= SCENARIOS.length) {
      console.error(`[sim-vbpp2] Escenario inválido: ${scenarioIdx}`);
      process.exit(1);
    }
    await SCENARIOS[scenarioIdx]();
  } else {
    for (let i = 0; i < SCENARIOS.length; i++) {
      await SCENARIOS[i]();
      if (i < SCENARIOS.length - 1) await sleep(10000);
    }
  }
  process.exit(0);
}

main().catch(err => { console.error('[sim-vbpp2] Error:', err); process.exit(1); });
