# Tarea — Financial Bot · Fix P1 + Auto-deploy + Session hygiene

> Prioridad: CRÍTICA | Score actual: 40% → objetivo ≥90%
> budget_usd_max: 5.00

---

## Cómo ejecutar comandos privilegiados en el servidor

Corres como `claude-agent` (no root). Para `pm2`, `mysql` y `git checkout` de otros branches necesitas el endpoint de ejecución remota que corre como root:

```bash
# Token y URL del endpoint (leer del .env del backend)
EXEC_TOKEN=$(grep -oP 'CLAUDE_EXEC_TOKEN=\K\S+' /var/www/html/vilarkptl.com/ai-monitor/backend/.env | tail -1)
EXEC_URL="http://localhost:3010/api/exec"

# Función helper — úsala para TODOS los comandos que necesiten root
exec_server() {
  local CMD="$1"
  local CWD="${2:-/var/www/html/vilarkptl.com/ai-monitor}"
  curl -s -X POST "$EXEC_URL" \
    -H "Content-Type: application/json" \
    -H "x-exec-token: $EXEC_TOKEN" \
    -d "{\"cmd\":$(echo "$CMD" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))'),\"cwd\":\"$CWD\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output') or d.get('error','?'))"
}

# Ejemplos:
exec_server "pm2 restart conversation-engine"
exec_server "pm2 logs conversation-engine --lines 20 --nostream"
exec_server "pm2 restart financial-bot"
```

Comandos permitidos en el endpoint: `pm2 status|logs|restart|stop|start|reload|list`, `git status|log|fetch|diff`, `mysql -u root ...`

---

## Contexto crítico

El financial-bot lleva 40+ episodios con score 40% por tres causas encadenadas:

1. **P1 (root cause):** `conversation_engine.py` llama `set_asistente_mode(chat_id)` al inicializarse. Cada `pm2 restart conversation-engine` resetea `fin_chats.modo = 'asistente'` en la DB. Los 45 tests corren en modo silencioso → timeouts en saldo/IAS/SPEI.

2. **P3 (enmascarado por P1):** Fix `0bd49af` ya deployado pero su efecto no se ve hasta resolver P1.

3. **Deploy lag:** Los agentes escriben `DEPLOYED: pendiente` pero nadie ejecuta. **En esta sesión deployar TODO antes de escribir el outbox.**

---

## Objetivo 1 — Deploy fix P1 + reset DB (~10 min)

```bash
# Lee el token primero
EXEC_TOKEN=$(grep -oP 'CLAUDE_EXEC_TOKEN=\K\S+' /var/www/html/vilarkptl.com/ai-monitor/backend/.env | tail -1)
EXEC_URL="http://localhost:3010/api/exec"

# A. Reset DB — efecto inmediato en siguiente episodio
exec_server() { curl -s -X POST "$EXEC_URL" -H "Content-Type: application/json" -H "x-exec-token: $EXEC_TOKEN" -d "{\"cmd\":$(echo "$1" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))'),\"cwd\":\"${2:-/var/www/html/vilarkptl.com/ai-monitor}\"}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output') or d.get('error','?'))"; }

exec_server "mysql -u root -p\$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env) ai_monitoring -e 'UPDATE fin_chats SET modo=\'normal\' WHERE modo=\'asistente\'; SELECT ROW_COUNT() AS afectadas;'"

# B. Deploy commit 28208b9 — el archivo está en branch claude/financial-multiagent-system-YwtYQ
# Puedes editarlo directamente tú en /var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto/conversation_engine.py
# El fix es: eliminar la llamada a set_asistente_mode() del __init__ o de la inicialización global.
# En su lugar, el modo asistente debe activarse SOLO dentro de run_scenario cuando el escenario lo requiere,
# y restaurarse a 'normal' al finalizar el escenario.

# C. Restart conversation-engine vía exec
exec_server "pm2 restart conversation-engine"

# D. Verificar logs
exec_server "pm2 logs conversation-engine --lines 20 --nostream"
# Confirmar que los logs NO muestran set_asistente_mode al arrancar
```

---

## Objetivo 2 — Session cleanup timer en financial-bot.js (~20 min)

Edita directamente `/var/www/html/vilarkptl.com/ai-monitor/financial/bot/financial-bot.js`.

En el handler principal de texto, después de `getOrCreateSession(chatId)`, agrega:

```js
// Auto-reset sesiones atascadas en estados intermedios por más de 5 minutos
if (['esperando_datos_bancarios', 'esperando_monto', 'esperando_entrega'].includes(session.estado)) {
  const staleMs = Date.now() - new Date(session.updated_at).getTime();
  if (staleMs > 5 * 60 * 1000) {
    await updateSession(session.id, 'idle', null);
    session.estado = 'idle';
    session.operation_draft_json = null;
  }
}
```

Después de editar, commit + push + deploy:
```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git add financial/bot/financial-bot.js
git commit -m "fix: auto-reset sesiones intermedias >5min — previene contaminación entre episodios"
git push origin main

# Restart vía exec (necesita root)
exec_server "pm2 restart financial-bot"
exec_server "pm2 logs financial-bot --lines 10 --nostream"
```

---

## Objetivo 3 — Chat ID separado para escenarios asistente (~15 min)

Edita `/var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto/conversation_engine.py`.

Busca la función `run_scenario` o el lugar donde se decide el modo asistente. El cambio:
- Si el escenario tiene `mode == 'asistente'`, usa `ASISTENTE_CHAT_ID` (env `SIM_ASISTENTE_CHAT_ID`) como `target_chat_id` en vez de cambiar `fin_chats.modo` del chat principal.
- El chat `ASISTENTE_CHAT_ID` ya tiene `modo='asistente'` permanentemente en la DB → no necesita toggle.
- Elimina completamente las llamadas a `set_asistente_mode()` y `set_normal_mode()` sobre el chat principal.

```python
# Pseudocódigo del cambio en run_scenario:
ASISTENTE_CHAT_ID = int(os.getenv('SIM_ASISTENTE_CHAT_ID', '0'))

async def run_scenario(scenario, ...):
    is_asistente = scenario.get('mode') == 'asistente'
    target_chat_id = ASISTENTE_CHAT_ID if is_asistente and ASISTENTE_CHAT_ID else chat_id
    # Usar target_chat_id en todas las llamadas send_message() del escenario
    # NO llamar set_asistente_mode() ni set_normal_mode() sobre chat_id principal
```

Después del cambio:
```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git add financial/bot/sims/mtproto/conversation_engine.py
git commit -m "fix(sim): ASISTENTE_CHAT_ID separado para escenarios asistente — elimina set_asistente_mode del chat principal"
git push origin main

exec_server "pm2 restart conversation-engine"
exec_server "pm2 logs conversation-engine --lines 15 --nostream"
```

---

## Reglas de esta sesión

1. **Usa exec_server() para TODO lo que necesite root** (pm2, mysql). Los comandos git y edición de archivos los puedes hacer directo.
2. **Deploy en la misma sesión** — si editas un archivo, haces commit + push + restart antes de pasar al siguiente objetivo.
3. Trabaja en `main` (los archivos `financial/bot/` van a `main`).
4. Verifica cada restart con `pm2 logs`.
5. Si algo falla, incluye el error exacto en el outbox.

---

## Score esperado

- Post Obj 1: ~55–65% (P1 resuelto, modo normal restaurado)
- Post Obj 2+3: ~85–93% (sin contaminación entre episodios)
- Residual ~5–7%: imágenes sintéticas (P4 — fuera de alcance de esta sesión)
