'use strict';

/**
 * relay/master.js — Master Relay
 *
 * Un solo proceso Node.js que gobierna TODOS los proyectos.
 * Reemplaza: claude-relay (FiscalAI) + ai-monitor-relay
 *
 * Flujo por proyecto:
 *   inbox.md cambia → Cola de ejecución → Claude CLI → outbox.md → push → Telegram
 *
 * pm2: relay-master
 */

const fs      = require('fs');
const path    = require('path');