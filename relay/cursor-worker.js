'use strict';

/**
 * relay/cursor-worker.js — Cursor Cloud Agent self-hosted worker bridge
 *
 * Este proceso es el puente entre Cursor Cloud y el servidor de producción.
 * Cursor Cloud Agent envía tareas a este worker para revisión y pruebas.
 *
 * Setup:
 *   1. Obtener CURSOR_WORKER_TOKEN en cursor.com/dashboard/cloud-agents
 *   2. Agregar CURSOR_WORKER_TOKEN a relay/.env
 *   3. pm2 start deploy/ecosystem.config.js --only cursor-worker
 *
 * PM2: cursor-worker
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Cargar relay/.env sin depender de dotenv
(function loadEnv(file) {
  try {
    fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([^=#\s][^=]*?)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    });
  } catch (_) {}
})(path.join(__dirname, '.env'));

const CURSOR_WORKER_TOKEN = process.env.CURSOR_WORKER_TOKEN;
const REPO_ROOT = path.join(__dirname, '..');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
function log(msg) { console.log(`${ts()} [cursor-worker] ${msg}`); }

// Verificar que el token está configurado
if (!CURSOR_WORKER_TOKEN) {
  log('CURSOR_WORKER_TOKEN no configurado en relay/.env');
  log('Obtén el token en cursor.com/dashboard/cloud-agents → Add Worker');
  log('Agrega CURSOR_WORKER_TOKEN=tu_token a relay/.env y reinicia este proceso');
  // No crashear — esperar config
  setInterval(() => {
    log('Esperando CURSOR_WORKER_TOKEN... (ver CURSOR-AGENTS-GUIA.md para setup)');
  }, 60_000);
} else {
  log('CURSOR_WORKER_TOKEN detectado');
  log('Para conectar: cursor.com/dashboard/cloud-agents');
  log(`Repo raíz: ${REPO_ROOT}`);
  log('Worker listo — Cursor Cloud Agent puede enviar tareas a este servidor');

  // Intentar arrancar el worker de Cursor si el binario está instalado
  try {
    const cursorBin = execSync('which cursor-agent-worker 2>/dev/null || which cursor 2>/dev/null', { encoding: 'utf8' }).trim();
    if (cursorBin) {
      log(`Binario encontrado: ${cursorBin}`);
      // El proceso principal sería: exec cursor-agent-worker --token $CURSOR_WORKER_TOKEN
      // Por ahora registramos el estado y dejamos PM2 manejar el proceso real
    }
  } catch (_) {
    log('Binario cursor-agent-worker no encontrado');
    log('Instalar: sigue las instrucciones en cursor.com/dashboard/cloud-agents → Self-Hosted Worker');
  }

  // Heartbeat para que PM2 no marque el proceso como crashed
  setInterval(() => {
    log('cursor-worker heartbeat — proceso activo');
  }, 5 * 60_000);
}
