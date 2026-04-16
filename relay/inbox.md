# Fix lock bug + limpiar locks estancados

## Problema diagnosticado
El lock usa process.pid (relay-master) — como relay-master siempre vive,
el lock NUNCA expira. El coordinator lleva bloqueado desde las 13:28.

## Tareas

1. Limpiar todos los locks ahora:
   ```
   rm -f /tmp/relay-lock-*
   echo "locks eliminados"
   ```

2. Pull del fix:
   ```
   cd /home/user/agentic-repo
   git pull origin claude/agent-monitoring-dashboard-4v8iq
   ```

3. Verificar que el fix esta en master.js:
   ```
   grep -n 'activeTasks' /home/user/agentic-repo/relay/master.js | head -5
   ```

4. Reiniciar relay-master DETACHED:
   ```
   nohup bash -c 'sleep 2 && pm2 restart relay-master' > /tmp/relay-restart.log 2>&1 &
   echo "restart en 2s (PID $!)"
   ```

## Criterios
- [ ] locks eliminados
- [ ] grep muestra activeTasks en master.js
- [ ] pm2 restart programado

## Resultados
Reporta output de cada paso.
