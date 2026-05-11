// pm2 ecosystem config for ai-monitor
// Usage: pm2 start deploy/ecosystem.config.js
// Or:    pm2 reload deploy/ecosystem.config.js

module.exports = {
  apps: [
    {
      // Master relay — replaces ai-monitor-relay + claude-relay (FiscalAI)
      // Manages ALL projects from relay/projects.json
      name:        'relay-master',
      script:      'relay/master.js',
      cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
      exec_mode:   'fork',
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '256M',
      error_file:  '/var/log/ai-monitor/relay-master-error.log',
      out_file:    '/var/log/ai-monitor/relay-master-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // Claude chat bot — Telegram direct interface with tool use (grammy + Anthropic SDK)
      // Requires: relay/.env → TG_CLAUDE_BOT_TOKEN, TG_CLAUDE_CHAT_ID, DB_PASS
      // Setup:    cd relay && npm install
      name:        'claude-chat-bot',
      script:      'relay/chat-agent.js',
      cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
      exec_mode:   'fork',
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '128M',
      error_file:  '/var/log/ai-monitor/claude-chat-error.log',
      out_file:    '/var/log/ai-monitor/claude-chat-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // DeepSeek V3 code reviewer — polls git log every 5min, alerts on bugs
      // Cost: ~$0.002/review. Silent when OK. Requires DEEPSEEK_API_KEY in relay/.env
      name:        'code-reviewer',
      script:      'relay/code-reviewer.js',
      cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
      exec_mode:   'fork',
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '64M',
      error_file:  '/var/log/ai-monitor/code-reviewer-error.log',
      out_file:    '/var/log/ai-monitor/code-reviewer-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // Cursor Cloud Agent self-hosted worker
      // Setup: obtener CURSOR_WORKER_TOKEN en cursor.com/dashboard/cloud-agents
      // Agregar CURSOR_WORKER_TOKEN a relay/.env antes de arrancar
      name:        'cursor-worker',
      script:      'relay/cursor-worker.js',
      cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
      exec_mode:   'fork',
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '128M',
      env_file:    '/var/www/html/vilarkptl.com/ai-monitor/relay/.env',
      error_file:  '/var/log/ai-monitor/cursor-worker-error.log',
      out_file:    '/var/log/ai-monitor/cursor-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // Claude CLI proxy — serves POST /v1/messages using local claude --print
      // Routes Anthropic API calls through your Pro/Max subscription ($0 per call)
      // Requires: claude CLI installed and authenticated (claude auth login)
      // Configure: ANTHROPIC_PROXY_URL=http://127.0.0.1:5001 in relay/.env
      name:        'claude-proxy',
      script:      'deploy/claude-proxy.js',
      args:        '--port 5001',
      cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
      exec_mode:   'fork',
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '128M',
      env: {
        CLAUDE_BIN: process.env.CLAUDE_BIN || '/usr/local/bin/claude',
        HOME:       '/root',   // needed to read ~/.claude/credentials
      },
      error_file:  '/var/log/ai-monitor/claude-proxy-error.log',
      out_file:    '/var/log/ai-monitor/claude-proxy-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // FinBot conversation engine — MTProto simulator (Telethon) + curriculum learning
      // Requires: financial/bot/sims/mtproto/venv + financial/.env (DB_PASS, TELEGRAM_API_ID, etc.)
      name:        'conversation-engine',
      script:      'conversation_engine.py',
      interpreter: '/var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto/venv/bin/python',
      cwd:         '/var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto',
      exec_mode:   'fork',
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '128M',
      env_file:    '/var/www/html/vilarkptl.com/ai-monitor/financial/.env',
      error_file:  '/root/.pm2/logs/conversation-engine-error.log',
      out_file:    '/root/.pm2/logs/conversation-engine-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name:        'ai-monitor',
      script:      'backend/server.js',
      cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
      instances:   1,
      autorestart: true,
      watch:       false,
      exec_mode:   'fork',
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT:     3010,
        DB_HOST:  '127.0.0.1',
        DB_PORT:  3306,
        DB_USER:  'root',
        DB_NAME:  'ai_monitoring',
      },
      error_file:  '/var/log/ai-monitor/error.log',
      out_file:    '/var/log/ai-monitor/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
