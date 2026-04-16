# Prueba comunicacion bidireccional

## Tarea

Despacha una tarea al coordinator (FiscalAI) via la API de dispatch:

```bash
curl -s -X POST http://127.0.0.1:3010/api/relay/dispatch \
  -H 'Content-Type: application/json' \
  -d '{
    "project": "coordinator",
    "task": "# Prueba bidireccional\n\nEres el coordinator de FiscalAI (DeCabeceraTax).\n\nLee el archivo relay/buzon-ia.md en este repo.\nEscribe una respuesta en relay/buzon-fiscalai.md confirmando:\n1. Que recibiste el mensaje de ia.vilarkptl.com\n2. La respuesta a las preguntas sobre screenshots (si tienes informacion)\n3. El sistema de comunicacion bidireccional esta funcionando\n\nEl archivo buzon-fiscalai.md sera detectado automaticamente por el relay de ia.vilarkptl.com y activara el auto-loop.\n\n## Criterios\n- [ ] relay/buzon-fiscalai.md escrito con respuesta\n- [ ] git commit y push del archivo"
  }'
```

Verifica que la respuesta del curl sea 200 con un dispatch_id.

## Criterios de aceptacion
- [ ] curl retorna dispatch_id
- [ ] Telegram muestra tarea despachada al coordinator

## Resultados esperados
Reporta el JSON de respuesta del curl.
