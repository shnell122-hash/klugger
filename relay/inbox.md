# Tarea desde Chat Claude — 2026-04-15

## Deploy: watcher mejorado + fix chart

1. Hacer `git pull --rebase origin claude/agent-monitoring-dashboard-4v8iq`
2. Ejecutar `pm2 restart ai-monitor ai-monitor-relay`
3. Esperar 5 segundos y verificar que ambos procesos están `online` con `pm2 list`
4. Verificar health check: `curl -s http://127.0.0.1:3010/api/health`
5. Confirmar que `frontend/index.html` contiene `chart-wrapper` (grep rápido)
6. Reportar resultado en outbox.md con estado de cada paso
