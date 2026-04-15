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
      max_memory_restart: '128M',
      error_file:  '/var/log/ai-monitor/relay-master-error.log',
      out_file:    '/var/log/ai-monitor/relay-master-out.log',
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
