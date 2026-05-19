budget_usd_max: 0.8

## Merge deploy/financial-llm-complete + PM2 restart

Respuesta de flujos (2026-05-09): TransactionOrchestrator está listo en deploy/financial-llm-complete y necesita mergearse a main.

### Acciones en ia.vilarkptl.com

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin
git merge deploy/financial-llm-complete
pm2 restart financial-bot
pm2 status financial-bot
curl -s http://localhost:3005/api/health | jq .
```

### Verificación
- Status: financial-bot online
- Health: {"status":"ok"}
- Commit: merge completado

### Contexto
Esta rama contiene:
- TransactionOrchestrator con OpenAI client correcto
- Gemini 2.0 Flash en DocumentIntelligenceAgent
- FileFlowGraph incluido

Reportar en outbox-ai-monitor.md cuando esté listo.

---
## Outbox — rellenar antes de terminar la sesión

```
STATUS: done | partial | failed
CHANGED: archivo.js:línea, otro.js
COMMIT: (hash)
DEPLOYED: yes | no
PENDING: (qué falta o "nada")
USER_REQUIRED: no | sí — (razón)
```
