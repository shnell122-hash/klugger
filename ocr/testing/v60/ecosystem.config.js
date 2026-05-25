// ecosystem.config.js — VILAR Legal OS v60 "Artifact Factory" (testing)
// Uso: pm2 start ecosystem.config.js
module.exports = {
  apps: [{
    name: 'vilar-legal-os-v60-testing',
    script: 'api/app.py',
    interpreter: '/var/www/catalogos/testing/v60/venv/bin/python3',
    cwd: '/var/www/catalogos/testing/v60',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    error_file: '/home/german/.pm2/logs/vilar-legal-os-v60-error.log',
    out_file:   '/home/german/.pm2/logs/vilar-legal-os-v60-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    env: {
      PORT: '5006',
      APP_BASE_PATH: '/testing/v60',
    },
  }]
};
