const express = require('express');
const { execSync } = require('child_process');
const router = express.Router();

const EXEC_TOKEN = process.env.CLAUDE_EXEC_TOKEN;

// Whitelist of allowed command prefixes — prevents arbitrary RCE
const ALLOWED = [
  /^pm2 (status|logs|restart|stop|start|reload|list)/,
  /^git (status|log|diff|fetch|pull|merge|push|checkout|branch|add|commit|reset|stash)/,
  /^cat (\/var\/www\/html\/vilarkptl\.com\/ai-monitor\/relay\/|\/var\/log\/ai-monitor\/)/,
  /^tail -/,
  /^grep /,
  /^ls /,
  /^cd \/var\/www\/html\/vilarkptl\.com\//,
  /^node -e /,
  /^mysql -u root/,
  /^systemctl (status|restart|reload|stop|start) /,
  /^journalctl /,
  /^df /,
  /^free /,
  /^uptime/,
  /^echo /,
  /^rm -f \.git\/(index\.lock|rebase-merge)/,
];

function isAllowed(cmd) {
  return ALLOWED.some(pattern => pattern.test(cmd.trim()));
}

router.post('/', (req, res) => {
  if (!EXEC_TOKEN) return res.status(503).json({ error: 'exec endpoint disabled — set CLAUDE_EXEC_TOKEN' });

  const token = req.headers['x-exec-token'] || req.body?.token;
  if (!token || token !== EXEC_TOKEN) return res.status(401).json({ error: 'unauthorized' });

  const { cmd, cwd } = req.body || {};
  if (!cmd || typeof cmd !== 'string') return res.status(400).json({ error: 'cmd requerido' });

  if (!isAllowed(cmd)) {
    console.log(`[exec] BLOQUEADO: ${cmd.slice(0, 100)}`);
    return res.status(403).json({ error: `comando no permitido: ${cmd.slice(0, 80)}` });
  }

  const workdir = cwd || '/var/www/html/vilarkptl.com/ai-monitor';
  console.log(`[exec] ${cmd.slice(0, 120)}`);

  try {
    const output = execSync(cmd, {
      cwd:     workdir,
      timeout: 60000,
      stdio:   'pipe',
      env:     { ...process.env, TERM: 'dumb' },
    }).toString();
    res.json({ ok: true, output: output.slice(0, 20000) });
  } catch (err) {
    const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '') || err.message;
    res.json({ ok: false, output: output.slice(0, 20000), exit: err.status });
  }
});

module.exports = router;
