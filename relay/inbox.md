# Setup runtime + patch master.js

## Tareas

1. Crear directorio y archivo dispatch:
   ```
   mkdir -p /var/lib/ai-monitor
   test -f /var/lib/ai-monitor/pending-dispatches.json || echo '[]' > /var/lib/ai-monitor/pending-dispatches.json
   ```

2. Pull y aplicar patch:
   ```
   cd /home/user/agentic-repo
   git pull origin claude/agent-monitoring-dashboard-4v8iq
   bash relay/patch-master.sh
   ```

3. Verificar patch aplicado:
   ```
   grep -n 'AI_MONITOR_INBOX' /home/user/agentic-repo/relay/master.js | head -3
   ```

4. Reiniciar relay-master DETACHED (no bloquear este proceso):
   ```
   nohup bash -c 'sleep 3 && pm2 restart relay-master' > /tmp/relay-restart.log 2>&1 &
   echo "restart programado en 3s (PID $!)"
   ```

## Criterios de aceptacion
- [ ] `/var/lib/ai-monitor/pending-dispatches.json` existe
- [ ] grep muestra AI_MONITOR_INBOX en master.js
- [ ] restart programado sin error

## Resultados esperados
Reporta el output de cada paso. El restart ocurrira 3s despues de que escribas el outbox.
