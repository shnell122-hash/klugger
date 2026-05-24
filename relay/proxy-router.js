'use strict';
/**
 * relay/proxy-router.js — Multi-account Claude proxy routing
 *
 * Selects which claude-proxy instance to use based on project and complexity.
 * Used by relay/master.js when building the ANTHROPIC_PROXY_URL for runClaude().
 *
 * Pool:
 *   Port 5001 — Claude Max  (coordinator, fiscalai, fiscalai-front)
 *   Port 5002 — Claude Pro 1  ┐
 *   Port 5003 — Claude Pro 2  │ round-robin for all other projects
 *   Port 5004 — Claude Pro 3  │
 *   Port 5005 — Claude Pro 4  ┘
 *
 * Setup (once per account on the server):
 *   useradd -m claudepro1 && su - claudepro1 -c "claude auth login"
 *   useradd -m claudepro2 && su - claudepro2 -c "claude auth login"
 *   useradd -m claudepro3 && su - claudepro3 -c "claude auth login"
 *   useradd -m claudepro4 && su - claudepro4 -c "claude auth login"
 *
 * Add to relay/.env:
 *   CLAUDE_PROXY_MAX=http://127.0.0.1:5001
 *   CLAUDE_PROXY_PRO_1=http://127.0.0.1:5002
 *   CLAUDE_PROXY_PRO_2=http://127.0.0.1:5003
 *   CLAUDE_PROXY_PRO_3=http://127.0.0.1:5004
 *   CLAUDE_PROXY_PRO_4=http://127.0.0.1:5005
 *   CLAUDE_PROXY_MAX_PROJECTS=coordinator,fiscalai,fiscalai-front
 *
 * Integration in relay/master.js — add near top (after PROJECTS_FILE const):
 *
 *   const { selectProxy } = require('./proxy-router');
 *
 * Then in runClaude() call, pass the proxy URL as ANTHROPIC_BASE_URL env:
 *
 *   const proxyUrl = selectProxy(project);
 *   const env = { ...process.env };
 *   if (proxyUrl) env.ANTHROPIC_BASE_URL = proxyUrl;
 *   // spawn claude with env
 */

const POOL = {
  max: process.env.CLAUDE_PROXY_MAX || null,
  pro: [
    process.env.CLAUDE_PROXY_PRO_1,
    process.env.CLAUDE_PROXY_PRO_2,
    process.env.CLAUDE_PROXY_PRO_3,
    process.env.CLAUDE_PROXY_PRO_4,
  ].filter(Boolean),
};

const MAX_PROJECTS = new Set(
  (process.env.CLAUDE_PROXY_MAX_PROJECTS || 'coordinator,fiscalai,fiscalai-front')
    .split(',').map(s => s.trim()).filter(Boolean)
);

let _idx = 0;

/**
 * Returns the proxy base URL for the given project.
 * Returns null if no proxy is configured (falls back to direct API).
 *
 * @param {{ id: string, mode?: string }} project
 * @returns {string|null}
 */
function selectProxy(project) {
  // Max account → coordinator and critical/complex projects
  if (POOL.max && MAX_PROJECTS.has(project.id)) {
    return POOL.max;
  }
  // Pro round-robin → all other projects
  if (POOL.pro.length > 0) {
    const url = POOL.pro[_idx % POOL.pro.length];
    _idx++;
    return url;
  }
  // No pool configured — use existing single proxy or direct API
  return process.env.ANTHROPIC_PROXY_URL || null;
}

/**
 * Returns a summary of the current pool state for logging/debugging.
 */
function poolStatus() {
  return {
    max:         POOL.max || '(not configured)',
    pro:         POOL.pro.length > 0 ? POOL.pro : ['(not configured)'],
    maxProjects: [...MAX_PROJECTS],
    totalProxies: (POOL.max ? 1 : 0) + POOL.pro.length,
  };
}

module.exports = { selectProxy, poolStatus };
