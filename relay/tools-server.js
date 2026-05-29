'use strict';

/**
 * relay/tools-server.js — Shared tool execution module for LLM agents
 *
 * Exports:
 *   AGENT_TOOLS   — OpenAI-format tool definitions (bash, read_file, write_file, git_commit, http_get)
 *   executeTool(name, args, opts) → Promise<string>
 *
 * Used by runDeepSeekAgent (and callable from any runner) so tool implementations
 * live in one place rather than duplicated per runner.
 */

const fs    = require('fs');
const path  = require('path');
const http  = require('http');
const https = require('https');
const { execSync } = require('child_process');

const TOOL_TIMEOUT_MS = 45_000;

// Commands that could cause irreversible damage
const BASH_DENY = /rm\s+-rf\s+\/(?!tmp|var\/www\/html\/vilarkptl|home)|DROP\s+TABLE\s|TRUNCATE\s+TABLE\s|git\s+push\s+--force|git\s+reset\s+--hard\s+origin/i;

// ── Tool definitions (OpenAI / DeepSeek format) ───────────────────────────────

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Run a shell command in the project repo. Returns stdout+stderr (max 5000 chars).',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string', description: 'Shell command to execute' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from disk. Returns content (max 10000 chars).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute or relative file path' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file on disk, creating parent directories as needed.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'Absolute or relative file path' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Stage specific files, commit with a message, and push to the project branch.',
      parameters: {
        type: 'object',
        properties: {
          files:   { type: 'array', items: { type: 'string' }, description: 'File paths to stage' },
          message: { type: 'string', description: 'Commit message' },
          branch:  { type: 'string', description: 'Branch to push to (omit to use project default)' },
        },
        required: ['files', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'http_get',
      description: 'Make an HTTP(S) GET request and return the response body (max 5000 chars).',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL to fetch' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace an exact unique string in a file. More precise than write_file for small changes. old_string must appear exactly once.',
      parameters: {
        type: 'object',
        properties: {
          path:       { type: 'string', description: 'File path (absolute or relative to repo).' },
          old_string: { type: 'string', description: 'Exact string to replace — must appear exactly once.' },
          new_string: { type: 'string', description: 'Replacement string.' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Search for a pattern in files using grep. Returns matches with line numbers and context.',
      parameters: {
        type: 'object',
        properties: {
          pattern:       { type: 'string', description: 'Grep pattern (supports regex).' },
          path:          { type: 'string', description: 'File or directory to search (default: project repo).' },
          context_lines: { type: 'integer', description: 'Lines of context around each match (default: 3).' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories. Use to explore project structure.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'Directory path (absolute or relative to repo).' },
          pattern: { type: 'string', description: 'Optional filename filter (e.g. "*.js").' },
        },
        required: ['path'],
      },
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

/**
 * @param {string} name         Tool name
 * @param {object} args         Tool arguments (already parsed from JSON)
 * @param {object} opts
 *   @param {string} opts.repoBase   Working directory for bash / relative paths
 *   @param {string} opts.branch     Git branch for git_commit
 * @returns {Promise<string>}   Tool output (always a string)
 */
async function executeTool(name, args = {}, opts = {}) {
  const repoBase = opts.repoBase || '/var/www/html/vilarkptl.com/ai-monitor';
  const branch   = opts.branch   || 'main';

  switch (name) {
    case 'bash': {
      const cmd = args.command || '';
      if (BASH_DENY.test(cmd)) return 'ERROR: comando bloqueado por política de seguridad';
      try {
        return execSync(cmd, { cwd: repoBase, timeout: TOOL_TIMEOUT_MS, stdio: 'pipe' })
          .toString().slice(0, 5000);
      } catch (e) {
        return (e.stdout?.toString() || e.stderr?.toString() || e.message || '').slice(0, 2000);
      }
    }

    case 'read_file': {
      try {
        const fp = path.isAbsolute(args.path) ? args.path : path.join(repoBase, args.path);
        return fs.readFileSync(fp, 'utf8').slice(0, 10000);
      } catch (e) {
        return `Error leyendo archivo: ${e.message}`;
      }
    }

    case 'write_file': {
      try {
        const fp = path.isAbsolute(args.path) ? args.path : path.join(repoBase, args.path);
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, args.content, 'utf8');
        return `Archivo escrito: ${fp}`;
      } catch (e) {
        return `Error escribiendo: ${e.message}`;
      }
    }

    case 'git_commit': {
      try {
        const br    = args.branch || branch;
        const files = (args.files || []).join(' ');
        const msg   = (args.message || 'update').replace(/"/g, "'");
        execSync(
          `cd ${repoBase} && git add ${files} && git diff --cached --quiet || ` +
          `git commit -m "${msg}" && git push origin HEAD:${br}`,
          { stdio: 'pipe', timeout: 60_000 }
        );
        return `Commit OK → ${br}`;
      } catch (e) {
        return `Git error: ${e.message?.slice(0, 300)}`;
      }
    }

    case 'http_get': {
      return new Promise((resolve) => {
        const url = args.url || '';
        const mod = url.startsWith('https') ? https : http;
        try {
          const req = mod.get(url, { timeout: 15_000 }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => resolve(data.slice(0, 5000)));
          });
          req.on('error',   e => resolve(`HTTP error: ${e.message}`));
          req.on('timeout', () => { req.destroy(); resolve('HTTP timeout'); });
        } catch (e) {
          resolve(`HTTP error: ${e.message}`);
        }
      });
    }

    case 'edit_file': {
      try {
        const fp      = path.isAbsolute(args.path) ? args.path : path.join(repoBase, args.path);
        const content = fs.readFileSync(fp, 'utf8');
        const count   = content.split(args.old_string || '').length - 1;
        if (count === 0) return `ERROR: old_string no encontrado en ${args.path}`;
        if (count > 1)  return `ERROR: old_string coincide ${count} veces — sé más específico`;
        fs.writeFileSync(fp, content.replace(args.old_string, args.new_string || ''), 'utf8');
        return `OK: editado ${fp}`;
      } catch (e) {
        return `Error en edit_file: ${e.message}`;
      }
    }

    case 'search_code': {
      const ctx = args.context_lines || 3;
      const sp  = args.path
        ? (path.isAbsolute(args.path) ? args.path : path.join(repoBase, args.path))
        : repoBase;
      try {
        const out = execSync(
          `grep -rn --context=${ctx} ${JSON.stringify(args.pattern || '')} "${sp}" 2>/dev/null | head -200`,
          { timeout: 10_000, stdio: 'pipe' }
        );
        return out.toString().slice(0, 5000) || '(sin coincidencias)';
      } catch (_) {
        return '(sin coincidencias)';
      }
    }

    case 'list_directory': {
      const dp = args.path
        ? (path.isAbsolute(args.path) ? args.path : path.join(repoBase, args.path))
        : repoBase;
      try {
        const cmd = args.pattern
          ? `find "${dp}" -maxdepth 2 -name "${args.pattern}" 2>/dev/null | head -100`
          : `ls -la "${dp}" 2>/dev/null | head -100`;
        return execSync(cmd, { timeout: 5_000, stdio: 'pipe' }).toString().slice(0, 3000);
      } catch (e) {
        return `ERROR: ${e.message.slice(0, 200)}`;
      }
    }

    default:
      return `Tool '${name}' no reconocida. Disponibles: ${AGENT_TOOLS.map(t => t.function.name).join(', ')}`;
  }
}

module.exports = { AGENT_TOOLS, executeTool };
