# Deploy — MTProto Conversation Engine

Este archivo se actualiza en cada commit que requiere acción en el servidor.
Siempre refleja el estado del **último commit en la rama activa**.

---

## Rama activa

```
claude/financial-multiagent-system-YwtYQ
```

---

## Último commit: `29b1c0b` — fix megagroup + KeyError

### ¿Qué cambió?
- `conversation_engine.py`: resuelve `PeerIdInvalidError` para megagrupos (Testing group)
- `conversation_engine.py`: corrige `KeyError: 'messages'` en escenarios con asset
- Todos los calls a Telethon usan la entidad resuelta en lugar del integer crudo

### Comandos a correr en el servidor

```bash
# 1. Actualizar código
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin claude/financial-multiagent-system-YwtYQ
git reset --hard origin/claude/financial-multiagent-system-YwtYQ

# 2. Reiniciar financial-bot CARGANDO nuevas env vars
#    (FIN_ALLOWED_CHAT_IDS=-5142407305 debe estar en financial/.env)
pm2 restart --update-env financial-bot

# 3. Verificar que el bot está corriendo y escuchando el grupo Testing
pm2 logs financial-bot --nostream --lines 20

# 4. Correr el motor de conversaciones (en screen o tmux para que persista)
cd /var/www/html/vilarkptl.com/ai-monitor/financial/bot/sims/mtproto
screen -S engine
./venv/bin/python conversation_engine.py
# Ctrl+A D  para dejar corriendo en background
```

### Verificación rápida

```bash
# ¿El bot está en whitelist?
grep FIN_ALLOWED /var/www/html/vilarkptl.com/ai-monitor/financial/.env

# ¿El grupo está en modo asistente?
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
mysql -u root -p"$DB_PASS" ai_monitoring -e \
  "SELECT chat_id, modo FROM fin_chats WHERE chat_id=-5142407305;"

# ¿Hay episodios de aprendizaje registrados?
mysql -u root -p"$DB_PASS" ai_monitoring -e \
  "SELECT id, episode_num, score_pct, complexity_tier, triggered_by
   FROM learning_episodes ORDER BY id DESC LIMIT 5;"
```

---

## Historial de deploys

| Commit | Descripción | Requiere restart? |
|--------|-------------|-------------------|
| `29b1c0b` | Fix megagroup entity + KeyError messages | `pm2 restart --update-env financial-bot` |
| `c317ed3` | Assets progresivos + learning DB + engine continuo | `pm2 restart financial-bot` |
| `a3e84f9` | Migración v16 (learning tables) | Correr migrate-financial-v16.sql |

---

## Variables de entorno requeridas en `financial/.env`

```env
# MTProto — credenciales de la app Telegram (obtenidas en my.telegram.org)
MTPROTO_API_ID=31799415
MTPROTO_API_HASH=881b5356171b414f33f8726b278818b4

# Grupo de Testing donde corren los simuladores
SIM_CHAT_ID=-5142407305

# Bot whitelist (el grupo Testing debe estar aquí)
FIN_ALLOWED_CHAT_IDS=-5142407305

# Telegram bot token para enviar reportes de aprendizaje al grupo
RELAY_BOT_TOKEN=<token del bot de relay>
# O usar el token principal del bot financiero:
# TELEGRAM_BOT_TOKEN=<ya debe existir>
```
