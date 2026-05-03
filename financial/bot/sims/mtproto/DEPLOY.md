# Deploy - MTProto Conversation Engine

Updated on every commit that requires a server action.

---

## Active branch

```
claude/financial-multiagent-system-YwtYQ
```

---

## Latest commit: `725badd` - natural chat + crash-proof engine

**What changed:**
- `conversation_engine.py`: 14 ambient conversations between German/Vianey/Christian
- Natural Spanish phrases replace bare commands (no more caveman `/operacion` only)
- `type='chat'` scenarios send multi-turn cross-talk; `type='bot'` sends to the bot
- Engine no longer crashes when Noela/Kevin are not in the group:
  - `resolve_group_entity`: logs actual PeerChannel error instead of silent pass
  - `run_chat_scenario`: skips turns for accounts without group access
  - `run_scenario`: try/except around every send_message/send_file call
  - `run_engine`: detects fallback accounts, filters scenarios, prints actionable warning

**Required manual action:** Add Noela and Kevin (Christian) to the Testing group in Telegram.
Once added, all three accounts will participate in conversations automatically.

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
pm2 logs financial-bot --nostream --lines 10
```

Run the engine:

```bash
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto
nohup ./venv/bin/python -u conversation_engine.py > /tmp/engine.log 2>&1 &
tail -f /tmp/engine.log
```

Press `Ctrl+C` to stop tailing (engine keeps running). To stop the engine:

```bash
pkill -f conversation_engine.py
```

---

## What the group will look like after this deploy

With only GV in the group (Noela/Kevin not yet added):

```
[GV] Buenos dias
[GV] cuadro_png sent  <-- bot processes, replies with saldo/comision
[GV] cuanto tengo?    <-- bot replies
```

After adding Noela (Vianey) and Kevin (Christian) to the group:

```
[GV]     Buenos dias
[NOELA]  Buenos dias German!
[KEVIN]  Que tal, buenos dias
[NOELA]  Voy a mandar el cuadro de esta semana
[GV]     Ok Vianey, ya lo espero
[NOELA]  <cuadro_png>   <-- bot processes silently in asistente mode
[GV]     Listo. Ya esta registrado en el sistema
[KEVIN]  Perfecto, gracias German
```

---

## Quick checks

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

Engine log tail:

```bash
tail -50 /tmp/engine.log
```

---

## Deploy history

| Commit | Description | Action |
|--------|-------------|--------|
| `725badd` | Natural multi-user chat + crash-proof engine | Pull + pm2 restart + run engine |
| `4404af7` | PeerChannel fix for megagroup | Pull + pm2 restart |
| `c317ed3` | Progressive assets + learning DB + continuous engine | pm2 restart financial-bot |
| `a3e84f9` | Migration v16 (learning tables) | Run migrate-financial-v16.sql |

---

## Required env vars in `financial/.env`

```
MTPROTO_API_ID=31799415
MTPROTO_API_HASH=881b5356171b414f33f8726b278818b4
SIM_CHAT_ID=-5142407305
FIN_ALLOWED_CHAT_IDS=-5142407305
RELAY_BOT_TOKEN=<relay bot token>
```
