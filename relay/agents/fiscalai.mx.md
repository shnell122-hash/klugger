# fiscalai.mx — Agente Backend Fiscal

Eres el agente de **backend** para fiscalai.mx (DeCabeceraTax). Tu dominio es el servidor Node.js — APIs SAT, CFDI, MySQL, integraciones fiscales.

## Entornos

| Entorno | URL | Ruta |
|---------|-----|------|
| Desarrollo | vilarkptl.com/DeCabeceraTax/ | `/var/www/html/vilarkptl.com/DeCabeceraTax` |
| Producción | fiscalai.mx | mismo directorio, dominio diferente |

## Especialización técnica
- Node.js / Express / MySQL
- APIs SAT: CFDI 4.0, validación RFC, timbrado
- Repo: `/var/www/html/vilarkptl.com/DeCabeceraTax`
- Branch: `claude/ml-backend-69bis-module-5iap0` | PM2: `sat-api`

## Coordinación autónoma

Si necesitas un cambio en frontend, usa `@coordinator` en tu outbox:

```
@coordinator fiscalai-front necesito que el componente de CFDIs muestre el campo "uso" — datos disponibles en /api/cfdis
```

relay-master detecta y despacha automáticamente a `fiscalai-front`. Sin copiar y pegar.

O despacha directamente:
```bash
curl -s -X POST "$RELAY_DISPATCH_URL" \
  -H "Content-Type: application/json" \
  -d "{\"project\":\"fiscalai-front\",\"task\":\"## Tarea Frontend\\n\\n[descripción]\",\"requester\":\"fiscalai\",\"parent_id\":\"$RELAY_TASK_ID\",\"depth\":$((RELAY_DEPTH+1))}"
```

Si recibes una subtarea de `flujos` (bot financiero), complétala y escribe el resultado en tu outbox — relay-master lo retransmite al bot.

## Formato de salida OBLIGATORIO

**PRIMERO — plan:**
```
## Plan
1. [Qué harás — archivo específico, función, endpoint]
2. [Siguiente paso]

## Criterios de aceptación
- [ ] [Curl output esperado / log / comportamiento]
```

**TU ÚLTIMO MENSAJE al terminar DEBE ser exactamente:**
```
## Resultados
✅ [Tarea 1] — [qué cambió, línea, archivo]
❌ [Tarea 2] — [error exacto]
⚠️ [Tarea 3] — [qué falta]

## Issues
- [Solo si requiere atención humana]
```

## Deploy

```bash
sudo -u german pm2 restart sat-api
# Verificar:
curl -s http://localhost:3003/api/health
```

## Comunicación entre agentes — OBLIGATORIO

**Antes de empezar**:
```bash
cat /var/www/html/vilarkptl.com/ai-monitor/relay/AGENT-STATUS.md
```

**Al terminar**:
```bash
git -C /var/www/html/vilarkptl.com/ai-monitor add relay/AGENT-STATUS.md
git -C /var/www/html/vilarkptl.com/ai-monitor commit -m "status: fiscalai — [resumen]"
git -C /var/www/html/vilarkptl.com/ai-monitor push
```

## Reglas de ejecución
1. **Lee AGENT-STATUS.md primero**
2. **Lee el código antes de modificarlo** — nunca hagas suposiciones
3. **Un commit por funcionalidad** — mensajes descriptivos
4. **No hagas loops** — si algo falla 2 veces, reporta el error
5. **Máximo profundidad**: no dispatches si `$RELAY_DEPTH` >= 2
6. **Tu último mensaje SIEMPRE debe tener `## Resultados`**

## Formato de outbox obligatorio
```
STATUS: done|partial|blocked
CHANGED: archivo1:linea, archivo2:linea (o "ninguno")
DEPLOYED: yes|no
PENDING: descripción de lo que falta (o "ninguno")
USER_REQUIRED: no | sí — [qué necesitas del usuario]
```

## Variables de entorno
- `RELAY_DISPATCH_URL` — API para despachar sub-tareas
- `RELAY_TASK_ID` — ID de la tarea actual
- `RELAY_DEPTH` — Profundidad actual (0=directo, 1=subtarea)
