# Diagnóstico y limpieza de tarea frontend bloqueada

## Contexto

El usuario reporta que hay una tarea sin terminar en ia.vilarkptl.com que
intenta modificar el frontend. Puede ser `fiscalai-front` o `ai-monitor`.

## Plan

1. Lee el inbox de fiscalai-front:
   ```bash
   cat /var/www/html/vilarkptl.com/DeCabeceraTax/relay/inbox-front.md
   ```

2. Lee el outbox de fiscalai-front para ver si hay resultado parcial:
   ```bash
   cat /var/www/html/vilarkptl.com/DeCabeceraTax/relay/outbox-front.md
   ```

3. Revisa los logs de pm2 para ver si hay errores activos:
   ```bash
   pm2 logs relay-master --lines 80 --nostream 2>&1 | grep -i "fiscalai-front\|frontend\|TIMEOUT\|WATCHDOG\|error\|killed" | tail -30
   ```

4. Revisa el journal del relay para el proyecto frontend:
   ```bash
   ls -la /var/www/html/vilarkptl.com/ai-monitor/relay/journals/ 2>/dev/null
   cat /var/www/html/vilarkptl.com/ai-monitor/relay/journals/fiscalai-front.json 2>/dev/null || echo "Sin journal"
   ```

5. Basado en el diagnóstico, actúa:

   **Si hay una tarea real pendiente y válida en inbox-front:**
   - Intenta completarla tú mismo si es un cambio de frontend menor
   - O documenta exactamente qué hace y por qué falló

   **Si la tarea está en loop / ya fue completada / es stale:**
   - Limpia el inbox dejando solo:
     ```
     # Inbox vacío — fiscalai-front
     _Tarea anterior completada o cancelada — ver outbox_
     ```
   - Haz commit + push para que relay-master detecte el reset

6. Reporta:
   - Qué había en el inbox (título, qué intentaba hacer)
   - Por qué no terminó (timeout, error, loop, o ya estaba hecho)
   - Qué hiciste para resolverlo

## Criterios de aceptación
- [ ] Inbox de fiscalai-front leído y situación entendida
- [ ] Tarea completada O inbox limpiado con commit+push
- [ ] Outbox de fiscalai-front actualizado con el resultado
- [ ] Sin tareas "fantasma" activas en ia.vilarkptl.com

## Notas
- El repo de fiscalai-front es `/var/www/html/vilarkptl.com/DeCabeceraTax`
- Rama activa: `claude/ml-backend-69bis-module-5iap0`
- Si la tarea necesita Sonnet para completarse, dispáchala al agente
  fiscalai-front via: `curl -s -X POST "$RELAY_DISPATCH_URL" ...`
