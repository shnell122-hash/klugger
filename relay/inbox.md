# Tarea desde Chat Claude — 2026-04-15

## Deploy: relay-master + schema update + backend restart

1. Hacer `git pull --rebase origin claude/agent-monitoring-dashboard-4v8iq` en `/var/www/html/vilarkptl.com/ai-monitor`
2. Aplicar schema nuevo (tabla `projects`): `mysql -u root ai_monitoring < /var/www/html/vilarkptl.com/ai-monitor/backend/db/schema.sql`
3. Crear `/var/log/ai-monitor/` si no existe: `mkdir -p /var/log/ai-monitor`
4. Copiar env del relay antiguo: asegurarse que `/var/www/html/vilarkptl.com/ai-monitor/relay/.env` existe con GITHUB_TOKEN, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
5. Verificar que `relay/.env` tiene MONITOR_API_URL=http://127.0.0.1:3010
6. Detener procesos viejos: `pm2 delete ai-monitor-relay 2>/dev/null; pm2 delete claude-relay 2>/dev/null; true`
7. Iniciar relay-master: `cd /var/www/html/vilarkptl.com/ai-monitor && pm2 start deploy/ecosystem.config.js --only relay-master`
8. Reiniciar backend: `pm2 restart ai-monitor`
9. Esperar 5 segundos y verificar: `pm2 list`
10. Health check: `curl -s http://127.0.0.1:3010/api/health`
11. Verificar proyectos API: `curl -s http://127.0.0.1:3010/api/projects | head -c 500`
12. Guardar pm2 startup: `pm2 save`
13. Reportar resultado de cada paso en outbox.md
