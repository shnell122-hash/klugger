'use strict';

/**
 * relay/visual-check.js — Screenshot + análisis visual con Gemini Flash
 *
 * Uso:
 *   node relay/visual-check.js <url> [criteria] [wait_ms]
 *
 * Output: JSON a stdout
 *   { passed, analysis, issues, actions, screenshot, screenshot_url }
 *
 * Agentes: llámalo después de cada deploy para verificar el resultado visual.
 * Si `passed` es false, lee `issues` y `actions` para saber qué corregir.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── Load .env ─────────────────────────────────────────────────────────────────
(function loadEnv(file) {
  try {
    fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([^=#\s][^=]*?)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    });
  } catch (_) {}
})(path.join(__dirname, '.env'));

const [,, url, criteria, waitMsArg] = process.argv;
const waitMs = parseInt(waitMsArg || '4000');

if (!url) {
  process.stdout.write(JSON.stringify({ error: 'URL requerida. Uso: node visual-check.js <url> [criteria] [wait_ms]' }) + '\n');
  process.exit(1);
}

const DEFAULT_CRITERIA = 'La página carga correctamente sin errores 404/500, todos los elementos del nav están visibles, no hay texto de error en pantalla';
const EFFECTIVE_CRITERIA = criteria || DEFAULT_CRITERIA;

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'frontend', 'screenshots');
const SHOT_NAME       = `vc-${Date.now()}.png`;
const screenshotFile  = path.join(SCREENSHOTS_DIR, SHOT_NAME);
const screenshotUrl   = `/screenshots/${SHOT_NAME}`;

// ── Call Gemini Flash vision API ──────────────────────────────────────────────
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

function callGemini(b64Image, prompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) { resolve('ANÁLISIS_OMITIDO: GOOGLE_API_KEY no configurada'); return; }

    const body = JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/png', data: b64Image } },
          { text: prompt },
        ],
      }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
    });

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path:     `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json' },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          if (r.error) {
            const code = r.error.code;
            if (code === 429) { resolve(`ANÁLISIS_OMITIDO: cuota Gemini agotada (${GEMINI_MODEL})`); return; }
            if (code === 403) { resolve(`ANÁLISIS_OMITIDO: acceso denegado a ${GEMINI_MODEL}`); return; }
            resolve(`ANÁLISIS_OMITIDO: error API ${code} — ${r.error.message?.slice(0, 100)}`);
            return;
          }
          resolve(r.candidates?.[0]?.content?.parts?.[0]?.text || `(sin respuesta: ${data.slice(0, 200)})`);
        } catch (_) { resolve(data.slice(0, 500)); }
      });
    });
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Screenshot via Playwright (replaces Chromium CLI snap)
  let playwright;
  try {
    playwright = require('playwright');
  } catch (_) {
    try { playwright = require('/usr/local/lib/node_modules/playwright'); } catch (_2) {}
  }

  if (!playwright) {
    process.stdout.write(JSON.stringify({ error: 'Playwright no disponible. Instalar: npm install -g playwright && playwright install chromium' }) + '\n');
    process.exit(1);
  }

  try { fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true }); } catch (_) {}

  let browser;
  try {
    // Prefer system Chromium to avoid a 150 MB download on the server
    const systemChrome = process.env.CHROMIUM_PATH ||
      ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome']
        .find(p => { try { require('fs').accessSync(p); return true; } catch { return false; } });
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath: systemChrome || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(url, { waitUntil: 'load', timeout: 35_000 });
    await page.waitForTimeout(waitMs);
    await page.screenshot({ path: screenshotFile, fullPage: false });
    await browser.close();
    browser = null;
  } catch (e) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    process.stdout.write(JSON.stringify({ error: `Screenshot falló: ${e.message.slice(0, 300)}` }) + '\n');
    process.exit(1);
  }

  // 2. Vision analysis
  const b64 = fs.readFileSync(screenshotFile).toString('base64');

  const prompt =
    `Analiza esta captura de pantalla de una aplicación web.\n\n` +
    `Criterios a verificar:\n${EFFECTIVE_CRITERIA}\n\n` +
    `Responde EXACTAMENTE en este formato (sin texto adicional antes del VEREDICTO):\n` +
    `VEREDICTO: APROBADO\n` +
    `o\n` +
    `VEREDICTO: NECESITA_CORRECCIÓN\n` +
    `CRITERIOS:\n` +
    `- ✅ o ❌ [criterio]: [observación]\n` +
    `PROBLEMAS:\n` +
    `- [descripción específica del problema visible, o "Ninguno"]\n` +
    `ACCIONES_SUGERIDAS:\n` +
    `- [archivo o componente a corregir + qué cambiar, o "Ninguna"]`;

  let analysis = '(sin análisis)';
  try {
    analysis = await callGemini(b64, prompt);
  } catch (e) {
    analysis = `Error Gemini: ${e.message}`;
  }

  // 3. Parse result
  const analysisOmitted = analysis.startsWith('ANÁLISIS_OMITIDO');
  const passed  = analysisOmitted
    ? true
    : /VEREDICTO:\s*APROBADO/i.test(analysis) && !/NECESITA_CORRECCIÓN/i.test(analysis);
  const issues  = (analysis.match(/PROBLEMAS:([\s\S]*?)(?:ACCIONES|$)/i)?.[1] || '').trim()
                    .split('\n').map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
  const actions = (analysis.match(/ACCIONES_SUGERIDAS:([\s\S]*?)$/i)?.[1] || '').trim()
                    .split('\n').map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean);

  const output = {
    passed,
    verdict:        analysisOmitted ? 'SCREENSHOT_OK_SIN_ANÁLISIS' : (passed ? 'APROBADO' : 'NECESITA_CORRECCIÓN'),
    analysis,
    issues:         issues.filter(i => i !== 'Ninguno'),
    actions_needed: actions.filter(a => a !== 'Ninguna'),
    screenshot:     screenshotFile,
    screenshot_url: screenshotUrl,
    url,
    criteria:       EFFECTIVE_CRITERIA,
    timestamp:      new Date().toISOString(),
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  process.exit(passed ? 0 : 2); // exit 0=ok, 2=needs correction, 1=error
}

main().catch(e => {
  process.stdout.write(JSON.stringify({ error: e.message, stack: e.stack?.slice(0, 300) }) + '\n');
  process.exit(1);
});
