# Deploy - MTProto Conversation Engine

Updated on every commit that requires a server action.

---

## Active branch

```
claude/financial-multiagent-system-YwtYQ
```

---

## Latest commit: `4404af7` - PeerChannel fix for megagroup

**What changed:**
- `resolve_group_entity` now uses `PeerChannel(abs(chat_id))` which forces Telethon
  to use `GetChannelsRequest` instead of `GetChatsRequest`. The Testing group is a
  megagroup = Channel internally. This fixes `PeerIdInvalidError` for Noela and Kevin.

**Two known bot issues also need fixing (see SQL steps below):**
- `Unknown column 'costo_pct' in 'field list'` - missing column in `fin_commissions`
- Duplicate `FIN_ALLOWED_CHAT_IDS` lines in `.env` may cause issues

---

## Step 1 - Fix duplicate env var (run once)

```bash
grep -c FIN_ALLOWED /var/www/html/vilarkptl.com/ai-monitor/financial/.env
```

If output is greater than 1, remove duplicates:

```bash
DB_FILE=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
grep -v FIN_ALLOWED "$DB_FILE" > /tmp/env_clean && echo "FIN_ALLOWED_CHAT_IDS=-5142407305" >> /tmp/env_clean && cp /tmp/env_clean "$DB_FILE"
```

---

## Step 2 - Fix missing costo_pct column in fin_commissions

```bash
DB_PASS=$(grep -oP 'DB_PASS=\K[^ ]+' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
mysql -u root -p"$DB_PASS" ai_monitoring -e "ALTER TABLE fin_commissions ADD COLUMN IF NOT EXISTS costo_pct DECIMAL(5,2) DEFAULT 0.00 AFTER pct;"
```

---

## Step 3 - Pull and restart

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin claude/financial-multiagent-system-YwtYQ
git reset --hard origin/claude/financial-multiagent-system-YwtYQ
```

```bash
pm2 restart --update-env financial-bot
```

Verify bot started cleanly (no costo_pct error):

```bash
pm2 logs financial-bot --nostream --lines 10
```

---

## Step 4 - Run the engine

```bash
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto
screen -S engine
./venv/bin/python conversation_engine.py
```

Press `Ctrl+A D` to detach and leave running.

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

---

## Deploy history

| Commit | Description | Action |
|--------|-------------|--------|
| `4404af7` | PeerChannel fix - Noela/Kevin can now send to megagroup | Steps 1-4 above |
| `dafb58f` | DEPLOY.md ASCII-only bash blocks | none |
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
