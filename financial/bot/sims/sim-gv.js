'use strict';
/**
 * Simulador GV — Simula al usuario Germán Vilar en Telegram.
 *
 * Escenarios:
 *   0: Operación IAS completa (/operacion + CLABE + Confirmar)
 *   1: Cuadro retorno PNG en modo asistente
 *   2: Cuadro retorno XLSX en modo asistente
 *   3: Nota de voz OGG con instrucciones
 *   4: Comprobante foto en modo asistente
 *   5: Consulta de saldo /saldo
 *
 * Uso:
 *   node sim-gv.js 0       # Ejecutar escenario 0
 *   node sim-gv.js         # Ejecutar todos en secuencia
 *
 * Requiere en financial/.env:
 *   SIM_GV_BOT_TOKEN, SIM_CHAT_ID, SIM_ASISTENTE_CHAT_ID
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs   = require('fs');
const path = require('path');
const https = require('https');

const BOT_TOKEN       = process.env.SIM_GV_BOT_TOKEN;
const CHAT_ID         = process.env.SIM_CHAT_ID;
const ASISTENTE_CHAT_ID = process.env.SIM_ASISTENTE_CHAT_ID;
const ASSETS_DIR      = path.join(__dirname, 'assets');

if (!BOT_TOKEN) {
  console.error('[sim-gv] ERROR: SIM_GV_BOT_TOKEN no configurado en financial/.env');
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── API Telegram helpers ──────────────────────────────────────────────────────

function telegramRequest(method, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: false, raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function sendMessage(chatId, text) {
  const r = await telegramRequest('sendMessage', { chat_id: chatId, text });
  if (!r.ok) console.error('[sim-gv] sendMessage error:', r.description);
  return r;
}

async function sendPhoto(chatId, filePath, caption) {
  const { FormData, File } = await import('node:buffer').then(() => ({
    FormData: global.FormData ?? require('form-data'),
    File: null,
  })).catch(() => ({ FormData: require('form-data'), File: null }));

  return new Promise((resolve, reject) => {
    const form = new (require('form-data'))();
    form.append('chat_id', String(chatId));
    form.append('photo', fs.createReadStream(filePath));
    if (caption) form.append('caption', caption);

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendPhoto`,
      method: 'POST',
      headers: form.getHeaders(),
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: false, raw: data }); }
      });
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

async function sendDocument(chatId, filePath, filename, caption) {
  return new Promise((resolve, reject) => {
    const form = new (require('form-data'))();
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
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: false, raw: data }); }
      });
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

async function sendVoice(chatId, filePath) {
  return new Promise((resolve, reject) => {
    const form = new (require('form-data'))();
    form.append('chat_id', String(chatId));
    form.append('voice', fs.createReadStream(filePath), { filename: 'audio.ogg', contentType: 'audio/ogg' });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendVoice`,
      method: 'POST',
      headers: form.getHeaders(),
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: false, raw: data }); }
      });
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

// ── Escenarios ────────────────────────────────────────────────────────────────

const SCENARIOS = [
  // 0: Operación IAS completa
  async () => {
    console.log('[sim-gv] Escenario 0: Operación IAS neto 23000');
    await sendMessage(CHAT_ID, '/operacion IAS neto 23000');
    await sleep(4000);
    // Bot pedirá CLABE → enviarla
    await sendMessage(CHAT_ID, '058597000030773833');
    await sleep(4000);
    // Bot enviará resumen + poll/botones → confirmar con texto
    await sendMessage(CHAT_ID, 'Confirmar');
    await sleep(3000);
    console.log('[sim-gv] Escenario 0 completado');
  },

  // 1: Cuadro retorno PNG modo asistente
  async () => {
    console.log('[sim-gv] Escenario 1: Cuadro retorno PNG');
    const imgPath = path.join(ASSETS_DIR, 'cuadro-retorno-sem14.png');
    if (!fs.existsSync(imgPath)) {
      console.warn('[sim-gv] WARN: assets/cuadro-retorno-sem14.png no existe — crear antes de ejecutar');
      return;
    }
    await sendPhoto(ASISTENTE_CHAT_ID, imgPath, 'PARA PAGO SEM 14');
    await sleep(8000);
    console.log('[sim-gv] Escenario 1 completado');
  },

  // 2: Cuadro retorno XLSX modo asistente
  async () => {
    console.log('[sim-gv] Escenario 2: Cuadro retorno XLSX');
    const xlsxPath = path.join(ASSETS_DIR, 'cuadro-retorno-sem14.xlsx');
    if (!fs.existsSync(xlsxPath)) {
      console.warn('[sim-gv] WARN: assets/cuadro-retorno-sem14.xlsx no existe — crear antes de ejecutar');
      return;
    }
    await sendDocument(ASISTENTE_CHAT_ID, xlsxPath, 'SEM14.xlsx');
    await sleep(8000);
    console.log('[sim-gv] Escenario 2 completado');
  },

  // 3: Nota de voz
  async () => {
    console.log('[sim-gv] Escenario 3: Nota de voz');
    const oggPath = path.join(ASSETS_DIR, 'audio-instrucciones.ogg');
    if (!fs.existsSync(oggPath)) {
      console.warn('[sim-gv] WARN: assets/audio-instrucciones.ogg no existe — crear antes de ejecutar');
      return;
    }
    await sendVoice(CHAT_ID, oggPath);
    await sleep(10000); // más tiempo para transcripción
    console.log('[sim-gv] Escenario 3 completado');
  },

  // 4: Comprobante foto modo asistente
  async () => {
    console.log('[sim-gv] Escenario 4: Comprobante foto');
    const imgPath = path.join(ASSETS_DIR, 'comprobante-foto.jpg');
    if (!fs.existsSync(imgPath)) {
      console.warn('[sim-gv] WARN: assets/comprobante-foto.jpg no existe — crear antes de ejecutar');
      return;
    }
    await sendPhoto(ASISTENTE_CHAT_ID, imgPath, 'Comprobante ingreso SEM 14');
    await sleep(8000);
    console.log('[sim-gv] Escenario 4 completado');
  },

  // 5: Consulta de saldo
  async () => {
    console.log('[sim-gv] Escenario 5: /saldo');
    await sendMessage(CHAT_ID, '/saldo');
    await sleep(3000);
    console.log('[sim-gv] Escenario 5 completado');
  },
];

// ── Ejecución ─────────────────────────────────────────────────────────────────

async function main() {
  const scenarioIdx = parseInt(process.argv[2] ?? 'NaN');

  if (!isNaN(scenarioIdx)) {
    if (scenarioIdx < 0 || scenarioIdx >= SCENARIOS.length) {
      console.error(`[sim-gv] Escenario inválido: ${scenarioIdx} (0-${SCENARIOS.length - 1})`);
      process.exit(1);
    }
    await SCENARIOS[scenarioIdx]();
  } else {
    console.log(`[sim-gv] Ejecutando todos los escenarios (0-${SCENARIOS.length - 1})`);
    for (let i = 0; i < SCENARIOS.length; i++) {
      await SCENARIOS[i]();
      if (i < SCENARIOS.length - 1) await sleep(10000);
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error('[sim-gv] Error:', err);
  process.exit(1);
});
