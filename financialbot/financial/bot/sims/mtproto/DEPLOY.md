# Deploy - MTProto Conversation Engine

Updated on every commit that requires a server action.

---

## Active branch

```
claude/financial-multiagent-system-YwtYQ
```

---

## Latest commit: `1e4fa23` - fix gemini-2.0-flash

**What changed:**
- `DocumentIntelligenceAgent.js`: `gemini-1.5-flash` -> `gemini-2.0-flash`
- The old model was removed from the v1beta endpoint (404 Not Found)
- This was blocking ALL document processing: cuadros, comprobantes, audio

**Who writes in the group (roles):**
- **German** = cliente (cuenta gv)
- **Vianey** = asistente (cuenta noela) — PENDIENTE: agregar al grupo Testing
- **Christian** = proveedor (cuenta kevin) — PENDIENTE: agregar al grupo Testing
- **Flujos AI** = bot financiero

Until Vianey and Christian are added to the Testing group, only German can send messages.

---

## Server commands

Pull and restart:

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin claude/financial-multiagent-system-YwtYQ
git reset --hard origin/claude/financial-multiagent-system-YwtYQ
```

```bash
pm2 restart --update-env financial-bot
pm2 logs financial-bot --nostream --lines 15
```

Restart and tail engine:

```bash
pkill -f conversation_engine.py
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto
nohup ./venv/bin/python -u conversation_engine.py > /tmp/engine.log 2>&1 &
tail -f /tmp/engine.log
```

---

## What the group looks like with all three accounts

```
[GERMAN]    Buenos dias
[VIANEY]    Buenos dias German!
[CHRISTIAN] Que tal, buenos dias
[VIANEY]    Voy a mandar el cuadro de esta semana
[GERMAN]    Ok Vianey, ya lo espero
[VIANEY]    <cuadro_png>
[Flujos AI] Cuadro registrado. Saldo: $XXX | Comision: X%
[GERMAN]    Listo. Ya esta registrado en el sistema
[CHRISTIAN] Perfecto, gracias German
```

---

## Quick checks

Gemini working (no 404 error):

```bash
pm2 logs financial-bot --nostream --lines 20 | grep -i gemini
```

Asistente mode active:

```bash
DB_PASS=$(grep -oP 'DB_PASS=\K[^ ]+' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
mysql -u root -p"$DB_PASS" ai_monitoring -e "SELECT chat_id, modo FROM fin_chats WHERE chat_id=-5142407305;"
```

Learning episodes:

```bash
DB_PASS=$(grep -oP 'DB_PASS=\K[^ ]+' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
mysql -u root -p"$DB_PASS" ai_monitoring -e "SELECT id, episode_num, score_pct, complexity_tier FROM learning_episodes ORDER BY id DESC LIMIT 5;"
```

Engine log:

```bash
tail -50 /tmp/engine.log
```

---

## Deploy history

| Commit | Description | Action |
|--------|-------------|--------|
| `1e4fa23` | Fix Gemini model 404 (gemini-2.0-flash) | Pull + pm2 restart |
| `725badd` | Natural multi-user chat + crash-proof engine | Pull + pm2 restart + run engine |
| `4404af7` | PeerChannel fix for megagroup | Pull + pm2 restart |
| `c317ed3` | Progressive assets + learning DB | pm2 restart financial-bot |

---

## Required env vars in `financial/.env`

```
MTPROTO_API_ID=31799415
MTPROTO_API_HASH=881b5356171b414f33f8726b278818b4
SIM_CHAT_ID=-5142407305
FIN_ALLOWED_CHAT_IDS=-5142407305
RELAY_BOT_TOKEN=<relay bot token>
```
