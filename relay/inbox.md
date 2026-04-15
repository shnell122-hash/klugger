# Tarea desde Chat Claude — 2026-04-15

## Objetivo
Aplicar actualizaciones del repo y verificar que funcionan en producción.

## Tareas

1. Hacer git pull de la rama claude/agent-monitoring-dashboard-4v8iq
2. Ejecutar `pm2 restart ai-monitor ai-monitor-relay`
3. Verificar que `curl http://127.0.0.1:3010/api/health` responde `ok:true`
4. Tomar screenshot del dashboard con Chromium headless:
   - Si chromium-browser está instalado: `chromium-browser --headless --disable-gpu --screenshot=/tmp/dashboard.png http://127.0.0.1:3010`
   - Si no está instalado: instálalo con `apt-get install -y chromium-browser` y luego tomar el screenshot
5. Verificar que el chart NO se desborda (revisar el HTML del frontend/index.html — debe tener un div.chart-wrapper envolviendo el canvas)
6. Reportar en outbox.md:
   - Estado de pm2 (pm2 list)
   - Resultado del health check
   - Si el screenshot fue posible o no y por qué
   - Cualquier error encontrado

## Notas
- El repo está en: /var/www/html/vilarkptl.com/ai-monitor
- Si hay conflicto de git: `git pull --rebase origin claude/agent-monitoring-dashboard-4v8iq`
- Si pm2 restart falla: `pm2 logs ai-monitor --lines 20` para diagnóstico
