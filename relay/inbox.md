# Aplicar actualizacion de master.js

## Tarea

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git pull origin claude/agent-monitoring-dashboard-4v8iq
wc -l relay/master.js
grep -c 'TASK_START_TIMES\|RUNNING_WARN_MS' relay/master.js
nohup bash -c 'sleep 3 && pm2 restart relay-master' &
echo 'Reinicio programado'
```

## Criterios
- [ ] wc -l muestra mas de 1070 lineas
- [ ] grep muestra 2 (las nuevas constantes)
- [ ] pm2 restart ejecutado
