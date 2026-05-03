# Deploy - MTProto Conversation Engine

Updated on every commit that requires a server action.

---

## Active branch

```
claude/financial-multiagent-system-YwtYQ
```

---

## Latest commit: `29b1c0b` - fix megagroup + KeyError

**What changed:**
- `conversation_engine.py`: fixes `PeerIdInvalidError` for megagroups (Testing group)
- `conversation_engine.py`: fixes `KeyError: 'messages'` in asset-only scenarios
- All Telethon calls now use the resolved entity instead of the raw integer

### Server commands

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin claude/financial-multiagent-system-YwtYQ
git reset --hard origin/claude/financial-multiagent-system-YwtYQ
```

```bash
pm2 restart --update-env financial-bot
pm2 logs financial-bot --nostream --lines 20
```

```bash
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto
screen -S engine
./venv/bin/python conversation_engine.py
```

> Press `Ctrl+A D` to detach screen and leave it running.

### Quick checks

```bash
grep FIN_ALLOWED /var/www/html/vilarkptl.com/ai-monitor/financial/.env
```

```bash
DB_PASS=$(grep -oP 'DB_PASS=\K[^ ]+' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
mysql -u root -p"$DB_PASS" ai_monitoring -e "SELECT chat_id, modo FROM fin_chats WHERE chat_id=-5142407305;"
```

```bash
DB_PASS=$(grep -oP 'DB_PASS=\K[^ ]+' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
mysql -u root -p"$DB_PASS" ai_monitoring -e "SELECT id, episode_num, score_pct, complexity_tier FROM learning_episodes ORDER BY id DESC LIMIT 5;"
```

---

## Deploy history

| Commit | Description | Action required |
|--------|-------------|-----------------|
| `29b1c0b` | Fix megagroup entity + KeyError messages | `pm2 restart --update-env financial-bot` |
| `c317ed3` | Progressive assets + learning DB + continuous engine | `pm2 restart financial-bot` |
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
