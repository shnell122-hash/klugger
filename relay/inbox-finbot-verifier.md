# Instrucciones — finbot-verifier: Verificación continua post-deploy

> De: **flujos** (flujos.fiscalai.mx)
> Para: **finbot-verifier**
> Fecha: 2026-05-10
> Modo: **CONTINUO** — verificar cada vez que el inbox cambie

---

## Rol del verifier

Monitorear que el financial-bot esté respondiendo correctamente en producción.
Complementa a finbot-tester (que corre simulaciones). El verifier verifica el sistema real.

---

## Ciclo de verificación

### 1. Verificar que el bot esté vivo

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
pm2 status financial-bot

# Si está caído:
pm2 restart financial-bot
sleep 5 && pm2 logs financial-bot --lines 20 --nostream
```

### 2. Verificar que los módulos críticos cargan

```bash
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot

node -e "require('./agents/TransactionOrchestrator'); console.log('TransactionOrchestrator OK')"
node -e "require('./graph/finbot-graph').FinBotGraph; console.log('FinBotGraph OK')"
node -e "require('./graph/subgraphs/file-flow-graph'); console.log('FileFlowGraph OK')"
node -e "require('./graph/subgraphs/text-flow-graph'); console.log('TextFlowGraph OK')"
```

Si alguno falla: buscar el error, reportar en outbox con descripción exacta del módulo y el mensaje de error.

### 3. Correr golden suite

```bash
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto
source venv/bin/activate
python3 golden_suite.py
```

Si score < 92%: reportar cuáles tests fallaron y con qué error.

### 4. Verificar la DB

```bash
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring -e "
  SELECT 'fin_operations' as tabla, COUNT(*) as rows FROM fin_operations
  UNION SELECT 'fin_clients', COUNT(*) FROM fin_clients
  UNION SELECT 'fin_sessions', COUNT(*) FROM fin_sessions
  UNION SELECT 'learning_episodes', COUNT(*) FROM learning_episodes;
"
```

Si alguna tabla no existe → la migración v19 no se aplicó. Reportar.

### 5. Revisar logs por errores

```bash
pm2 logs financial-bot --lines 50 --nostream | grep -iE "error|crash|uncaught|ECONNREFUSED|model not found" | head -20
```

---

## Qué reportar en outbox

Después de cada ciclo de verificación, escribir en `relay/outbox-finbot-verifier.md`:

```
TIMESTAMP: 2026-05-10 HH:MM CST
BOT_STATUS: online | offline | restarted
IMPORTS: OK | FAIL (módulo + error)
GOLDEN_SUITE: X/Y (score Z%) | FAIL
DB: OK | FAIL (tabla faltante)
LOGS_ERRORS: ninguno | descripción breve
ACCION_TOMADA: descripción o "ninguna"
```

---

## Si encuentras un bug

1. Describir exactamente: archivo, línea, mensaje de error
2. Si puedes identificar la causa: incluir la corrección sugerida
3. NO modificar código de producción directamente
4. Despachar fix a finbot-tester via relay si es un bug de LangGraph

---

## NUNCA modificar

- `relay/master.js`, `relay/projects.json`, `relay/chat-agent.js`
- Código de producción directamente en main sin pasar por el branch de feature
