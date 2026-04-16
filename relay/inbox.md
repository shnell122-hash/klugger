# Auto-deploy — relay-master restart + setup

## Tareas

1. Crea el directorio de runtime:
   ```
   mkdir -p /var/lib/ai-monitor
   test -f /var/lib/ai-monitor/pending-dispatches.json || echo '[]' > /var/lib/ai-monitor/pending-dispatches.json
   ```

2. Aplica el patch a master.js:
   ```
   cd /home/user/agentic-repo && git pull origin claude/agent-monitoring-dashboard-4v8iq
   bash relay/patch-master.sh
   ```

3. Reinicia relay-master:
   ```
   pm2 restart relay-master
   pm2 logs relay-master --lines 5 --nostream
   ```

## Criterios de aceptación
- [ ] `/var/lib/ai-monitor/pending-dispatches.json` existe
- [ ] `grep AI_MONITOR_INBOX relay/master.js` muestra la constante
- [ ] pm2 status muestra relay-master `online`
- [ ] pm2 logs muestran "=== relay-master iniciado ==="

## Resultados esperados
Reporta output de cada comando y status final de pm2.
