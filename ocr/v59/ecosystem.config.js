// ecosystem.config.js — VILAR Legal OS v59
// Uso: pm2 start ecosystem.config.js
// NOTA: NO usar --env-file como flag de CLI (PM2 v6 no lo soporta)
module.exports = {
  apps: [{
    name: 'vilar-legal-os-v59',
    script: 'api/app.py',
    interpreter: '/var/www/catalogos/OCR/v59/venv/bin/python3',
    cwd: '/var/www/catalogos/OCR/v59',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    error_file: '/home/german/.pm2/logs/vilar-legal-os-v59-error.log',
    out_file:   '/home/german/.pm2/logs/vilar-legal-os-v59-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
