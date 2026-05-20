# Tarea — Financial Bot · Fix P1 + Auto-deploy + Session hygiene

> Prioridad: CRÍTICA | Score actual: 40% → objetivo ≥90%
> Tienes acceso directo al servidor. Ejecuta bash para todo — no marques "DEPLOYED: pendiente".

---

## Contexto crítico

El financial-bot lleva 40+ episodios con score 40% por tres causas encadenadas:

1. **P1 (root cause):** `conversation_engine.py` llama `set_asistente_mode(chat_id)` al inicializarse. Cada `pm2 restart conversation-engine` resetea `fin_chats.modo = 'asistente'` para el chat de prueba. Los 45 tests corren en modo silencioso → timeouts y falsos-positivos en saldo/IAS/SPEI.

2. **P3 (encubierto por P1):** Handler `esperando_datos_bancarios` guardaba CLABE vacía antes del fix `0bd49af`. Ya deployado, pero enmascarado por P1.

3. **Deploy lag:** Los agentes escriben `DEPLOYED: pendiente` en el outbox pero nadie ejecuta los comandos. Los fixes esperan 40–100 episodios. Esto hay que eliminarlo: tú ejecutas el deploy como parte de tu tarea.

---

## Objetivo 1 — Deploy fix P1 + reset DB (inmediato, ~10 min)

```bash
# A. Reset DB — efecto inmediato en siguiente episodio
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring \
  -e "UPDATE fin_chats SET modo='normal' WHERE modo='asistente'; SELECT ROW_COUNT() AS afectadas;"

# B. Deploy commit 28208b9 (per-scenario mode switching)
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin claude/financial-multiagent-system-YwtYQ
git checkout origin/claude/financial-multiagent-system-YwtYQ \
  -- financial/bot/sims/mtproto/conversation_engine.py
pm2 restart conversation-engine

# C. Verificar que el engine arrancó sin errores
pm2 logs conversation-engine --lines 20 --nostream
```

Confirma que los logs NO muestran `set_asistente_mode` al inicio.

---

## Objetivo 2 — Session cleanup timer en financial-bot.js (~20 min)

En `financial/bot/financial-bot.js`, en el handler principal de texto, después de `getOrCreateSession(chatId)` agrega este bloque:

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

Después: `git add financial/bot/financial-bot.js && git commit -m "fix: auto-reset sesiones intermedias >5min para prevenir contaminación entre episodios" && git push origin main && pm2 restart financial-bot`

---

## Objetivo 3 — Chat ID separado para escenarios asistente (~15 min)

En `financial/bot/sims/mtproto/conversation_engine.py`, busca el lugar donde se llama `set_asistente_mode` y reemplázalo por lógica que use `ASISTENTE_CHAT_ID` (ya existe en `sim-gv.js` como env `SIM_ASISTENTE_CHAT_ID`) para escenarios de modo asistente, en vez de cambiar el modo del chat principal.

La idea: en `run_scenario`, si el escenario tiene `"mode": "asistente"`, usar un `target_chat_id = ASISTENTE_CHAT_ID` separado (ya permanentemente en modo asistente en la DB) en vez de cambiar `fin_chats.modo` del chat principal.

Esto elimina la interferencia entre escenarios normal y asistente.

Después del cambio:
```bash
git add financial/bot/sims/mtproto/conversation_engine.py
git commit -m "fix(sim): usar ASISTENTE_CHAT_ID separado para escenarios asistente — elimina interferencia entre modos"
git push origin main
pm2 restart conversation-engine
```

---

## Reglas de esta sesión

1. **Deploy SIEMPRE en la misma sesión** — no escribas "DEPLOYED: pendiente". Si haces cambios, los deploys.
2. Trabaja en `main` para estos archivos (`financial/bot/` → `main`, per CLAUDE.md).
3. Verifica cada deploy con `pm2 logs [proceso] --lines 10 --nostream`.
4. Si algo falla, incluye el error exacto en el outbox.

---

## Score esperado post-deploy

- Post Obj 1: ~55–65% (P1 resuelto, P3 resuelto, P5 desaparece)
- Post Obj 2+3: ~85–93% (sin contaminación entre episodios)
- Residual ~5–7%: imágenes sintéticas (P4, sin fix aún — no es parte de esta sesión)

---

budget_usd_max: 5.00
