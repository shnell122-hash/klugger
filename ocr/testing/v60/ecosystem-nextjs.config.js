// PM2 config for the Next.js web frontend (v60 testing)
// Usage: pm2 start ecosystem-nextjs.config.js
module.exports = {
  apps: [{
    name: 'vilar-v60-nextjs',
    script: 'node_modules/.bin/next',
    args: 'start -p 3060',
    cwd: '/var/www/catalogos/testing/v60/frontend-nextjs',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    error_file: '/home/german/.pm2/logs/vilar-v60-nextjs-error.log',
    out_file:   '/home/german/.pm2/logs/vilar-v60-nextjs-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    env: {
      PORT: '3060',
      NODE_ENV: 'production',
    },
  }]
};
