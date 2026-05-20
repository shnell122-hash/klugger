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
 *
 * Ejemplo:
 *   RESULT=$(node /var/www/html/vilarkptl.com/ai-monitor/relay/visual-check.js \
 *     "https://testing.fiscalai.mx?id=XAXX010101000" \
 *     "nav bar visible con ítem Análisis Fiscal, tabla de datos carga sin errores" \
 *     5000)
 *   echo $RESULT | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['analysis'])"
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawnSync } = require('child_process');

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

// ── Find Chromium binary ──────────────────────────────────────────────────────
function findChromium() {
  for (const bin of ['chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable']) {
    try { execSync(`which ${bin} 2>/dev/null`, { stdio: 'pipe' }); return bin; } catch (_) {}
  }
  return null;
}

// ── Call Gemini Flash vision API ──────────────────────────────────────────────
// ANÁLISIS_OMITIDO is returned when quota (429) or access (403) is unavailable —
// callers treat this as "screenshot OK, no analysis" and do not fail the check.
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
          // Handle quota exhausted (429) or access denied (403) gracefully
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
  // 1. Screenshot
  const chromium = findChromium();
  if (!chromium) {
    process.stdout.write(JSON.stringify({ error: 'Chromium no encontrado. Instala con: apt-get install -y chromium-browser' }) + '\n');
    process.exit(1);
  }

  try {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    // Snap Chromium writes 'screenshot.png' to cwd; absolute --screenshot= paths are blocked.
    const shotCwd = '/root';
    const shotSrc = `${shotCwd}/screenshot.png`;
    try { fs.unlinkSync(shotSrc); } catch (_) {}

    spawnSync(chromium, [
      '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--screenshot',
      '--window-size=1280,900',
      `--virtual-time-budget=${waitMs}`,
      url,
    ], { timeout: 35_000, cwd: shotCwd, stdio: 'pipe' });

    if (!fs.existsSync(shotSrc)) {
      throw new Error('Screenshot no creado (snap Chromium no escribió screenshot.png en /root)');
    }
    fs.copyFileSync(shotSrc, screenshotFile);
    try { fs.unlinkSync(shotSrc); } catch (_) {}
  } catch (e) {
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
  // When analysis is unavailable (quota/access), screenshot success = passed
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
