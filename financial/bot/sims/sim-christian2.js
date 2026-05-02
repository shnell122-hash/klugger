'use strict';
/**
 * Simulador Christian2 — Simula al usuario Christian2 en Telegram.
 *
 * Escenarios:
 *   0: Cuadro retorno XLSX modo asistente (emisor del cuadro)
 *   1: Confirmación verbal de entrega de efectivo
 *   2: Factura CFDI RE en modo asistente
 *
 * Uso:
 *   node sim-christian2.js 0
 *   node sim-christian2.js
 *
 * Requiere en financial/.env:
 *   SIM_CHRISTIAN2_BOT_TOKEN, SIM_CHAT_ID, SIM_ASISTENTE_CHAT_ID
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs   = require('fs');
const path = require('path');
const https = require('https');
const FormData = require('form-data');

const BOT_TOKEN         = process.env.SIM_CHRISTIAN2_BOT_TOKEN;
const CHAT_ID           = process.env.SIM_CHAT_ID;
const ASISTENTE_CHAT_ID = process.env.SIM_ASISTENTE_CHAT_ID;
const ASSETS_DIR        = path.join(__dirname, 'assets');

if (!BOT_TOKEN) {
  console.error('[sim-christian2] ERROR: SIM_CHRISTIAN2_BOT_TOKEN no configurado en financial/.env');
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
  if (!r.ok) console.error('[sim-christian2] sendMessage error:', r.description);
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
  // 0: Cuadro de retorno XLSX (Christian2 como emisor)
  async () => {
    console.log('[sim-christian2] Escenario 0: Cuadro retorno XLSX');
    const xlsxPath = path.join(ASSETS_DIR, 'cuadro-retorno-sem14.xlsx');
    if (!fs.existsSync(xlsxPath)) {
      console.warn('[sim-christian2] WARN: assets/cuadro-retorno-sem14.xlsx no existe');
      return;
    }
    await sendDocument(ASISTENTE_CHAT_ID, xlsxPath, 'PARA_PAGO_SEM14.xlsx');
    await sleep(8000);
    console.log('[sim-christian2] Escenario 0 completado');
  },

  // 1: Confirmación verbal de entrega
  async () => {
    console.log('[sim-christian2] Escenario 1: Confirmación verbal');
    await sendMessage(CHAT_ID, 'ya entregué el efectivo');
    await sleep(3000);
    console.log('[sim-christian2] Escenario 1 completado');
  },

  // 2: Factura CFDI RE
  async () => {
    console.log('[sim-christian2] Escenario 2: Factura CFDI RE');
    const xmlPath = path.join(ASSETS_DIR, 'factura-cfdi.xml');
    if (!fs.existsSync(xmlPath)) {
      console.warn('[sim-christian2] WARN: assets/factura-cfdi.xml no existe');
      return;
    }
    await sendDocument(ASISTENTE_CHAT_ID, xmlPath, 'RE_SEM14.xml');
    await sleep(8000);
    console.log('[sim-christian2] Escenario 2 completado');
  },
];

async function main() {
  const scenarioIdx = parseInt(process.argv[2] ?? 'NaN');
  if (!isNaN(scenarioIdx)) {
    if (scenarioIdx < 0 || scenarioIdx >= SCENARIOS.length) {
      console.error(`[sim-christian2] Escenario inválido: ${scenarioIdx}`);
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

main().catch(err => { console.error('[sim-christian2] Error:', err); process.exit(1); });
