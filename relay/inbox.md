# Auto-deploy — relay-master restart + setup

## Contexto

relay/master.js fue actualizado en GitHub con mejoras críticas:
- stream-json real-time tool call events al dashboard
- PID-based locks (no más stale locks por reinicios)
- Dispatch queue fuera de git (`/var/lib/ai-monitor/`)
- Auto-loop buzon-ia.md ahora escribe al inbox correcto

## Tareas

1. Crear directorio de runtime si no existe:
   ```
   mkdir -p /var/lib/ai-monitor
   ```

2. Inicializar dispatch queue si no existe:
   ```
   test -f /var/lib/ai-monitor/pending-dispatches.json || echo '[]' > /var/lib/ai-monitor/pending-dispatches.json
   ```

3. Pull latest code en el repo agentic-repo:
   ```
   cd /home/user/agentic-repo && git fetch origin && git reset --hard origin/claude/agent-monitoring-dashboard-4v8iq
   ```

4. Reiniciar relay-master con el código nuevo:
   ```
   pm2 restart relay-master
   ```

5. Verificar que está corriendo:
   ```
   pm2 status relay-master
   pm2 logs relay-master --lines 10 --nostream
   ```

## Criterios de aceptación
- [ ] `/var/lib/ai-monitor/pending-dispatches.json` existe
- [ ] relay-master está en estado `online` en pm2
- [ ] pm2 logs muestran "=== relay-master iniciado ===" con la fecha de hoy

## Resultados esperados
Reporta el resultado de cada paso y el status final de pm2.
