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
      // Financial multi-agent Telegram bot
      // Requires: financial/.env → FIN_TELEGRAM_BOT_TOKEN, DEEPSEEK_API_KEY, DB_PASS
      // Setup:    cd financial/bot && npm install
      // Migrate:  mysql ai_monitoring < financial/db/migrate-financial-v1.sql
      name:        'financial-bot',
      script:      'financial/bot/financial-bot.js',
      cwd:         '/var/www/html/vilarkptl.com/ai-monitor',
      exec_mode:   'fork',
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '128M',
      env_file:    '/var/www/html/vilarkptl.com/ai-monitor/financial/.env',
      error_file:  '/var/log/ai-monitor/financial-bot-error.log',
      out_file:    '/var/log/ai-monitor/financial-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // Financial Dashboard — Next.js 15 (flujos.fiscalai.mx → localhost:3020)
      // Setup:  cd dashboard-financial && npm install && npm run build
      // Apache: deploy/apache/flujos.fiscalai.mx.conf
      name:        'financial-dashboard',
      script:      'node_modules/.bin/next',
      args:        'start -p 3020',
      cwd:         '/var/www/html/vilarkptl.com/ai-monitor/dashboard-financial',
      exec_mode:   'fork',
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV:             'production',
        BACKEND_INTERNAL_URL: 'http://localhost:3010',
      },
      error_file:  '/var/log/ai-monitor/financial-dashboard-error.log',
      out_file:    '/var/log/ai-monitor/financial-dashboard-out.log',
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
