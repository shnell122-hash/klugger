# Diagnóstico rápido — ping del servidor

Tarea de verificación simple. Ejecuta los siguientes comandos y reporta resultados:

1. `hostname && date`
2. `sudo -u german pm2 list 2>/dev/null | grep -E "relay-master|ai-monitor"`
3. `ls /var/www/html/vilarkptl.com/ai-monitor/relay/journals/ 2>/dev/null`
4. `cat /var/www/html/vilarkptl.com/ai-monitor/relay/journals/ai-monitor.json 2>/dev/null | python3 -m json.tool 2>/dev/null | head -20`

## Resultados esperados
- hostname y fecha actual
- pm2 muestra relay-master y ai-monitor corriendo (status online)
- journals/ contiene ai-monitor.json
- journal muestra state y consecutive_failures

Responde con el output exacto de cada comando.
