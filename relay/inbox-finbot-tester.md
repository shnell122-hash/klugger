## Tarea: Completar financial/.env con Chat ID del grupo Testing

Solo hay UN grupo de prueba ("Testing"). Usar el mismo ID para `SIM_CHAT_ID` y `SIM_ASISTENTE_CHAT_ID`.
Los bots HermanVAbot/Vbpp2bot/ChristianKeytBot y Flujos AI ya están en el grupo Testing.

### Paso 0 — Verificar permisos de escritura en .env

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
if [ -w "$ENV" ]; then
  echo "PERMISOS OK"
else
  echo "SIN_PERMISOS: el root debe ejecutar: chmod 664 $ENV"
  exit 1
fi
```

### Paso 1 — Leer tokens del .env

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
GV_TOKEN=$(grep -oP 'SIM_GV_BOT_TOKEN=\K.*' "$ENV")
VBPP2_TOKEN=$(grep -oP 'SIM_VBPP2_BOT_TOKEN=\K.*' "$ENV")
C2_TOKEN=$(grep -oP 'SIM_CHRISTIAN2_BOT_TOKEN=\K.*' "$ENV")
FIN_TOKEN=$(grep -oP 'FIN_TELEGRAM_BOT_TOKEN=\K.*' "$ENV")
echo "GV=${GV_TOKEN:0:15}... FIN=${FIN_TOKEN:0:15}..."
```

### Paso 2 — Obtener chat ID del grupo Testing via getUpdates

```bash
for BOT_TOKEN in "$GV_TOKEN" "$VBPP2_TOKEN" "$C2_TOKEN" "$FIN_TOKEN"; do
  curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getUpdates" >> /tmp/all_updates.json
  echo "" >> /tmp/all_updates.json
done

python3 - << 'PYEOF'
import json, glob

chats = {}
with open('/tmp/all_updates.json') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except:
            continue
        for upd in data.get('result', []):
            for key in ['message', 'my_chat_member', 'chat_member', 'channel_post']:
                if key in upd:
                    chat = upd[key].get('chat', {})
                    cid = chat.get('id')
                    if cid and chat.get('type') in ('group', 'supergroup'):
                        chats[cid] = chat.get('title') or str(cid)

if chats:
    for cid, title in chats.items():
        print(f"FOUND {cid} {title}")
else:
    print("EMPTY: ningún grupo encontrado en getUpdates")
PYEOF
```

Si EMPTY: el usuario debe enviar un mensaje en el grupo Testing y re-ejecutar esta tarea.

### Paso 3 — Actualizar financial/.env

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
TESTING_ID=<ID_ENCONTRADO_EN_PASO_2>
REPORT_CHAT=$(grep -oP 'TELEGRAM_CHAT_ID=\K.*' /var/www/html/vilarkptl.com/ai-monitor/relay/.env | head -1)

sed -i '/^SIM_CHAT_ID=/d' "$ENV"
sed -i '/^SIM_ASISTENTE_CHAT_ID=/d' "$ENV"
sed -i '/^FINBOT_TEST_REPORT_CHAT_ID=/d' "$ENV"

printf 'SIM_CHAT_ID=%s\n' "$TESTING_ID" >> "$ENV"
printf 'SIM_ASISTENTE_CHAT_ID=%s\n' "$TESTING_ID" >> "$ENV"
printf 'FINBOT_TEST_REPORT_CHAT_ID=%s\n' "$REPORT_CHAT" >> "$ENV"

echo "Verificando:"
grep -E 'SIM_CHAT_ID|SIM_ASISTENTE_CHAT_ID|FINBOT_TEST_REPORT_CHAT_ID' "$ENV"
```

### Paso 4 — Test de conectividad

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
SIM_CHAT=$(grep -oP 'SIM_CHAT_ID=\K.*' "$ENV")
GV_TOKEN=$(grep -oP 'SIM_GV_BOT_TOKEN=\K.*' "$ENV")
REPORT_CHAT=$(grep -oP 'FINBOT_TEST_REPORT_CHAT_ID=\K.*' "$ENV")
RELAY_BOT=$(grep -oP 'TELEGRAM_BOT_TOKEN=\K.*' /var/www/html/vilarkptl.com/ai-monitor/relay/.env | head -1)

curl -s "https://api.telegram.org/bot${GV_TOKEN}/sendMessage" \
  -d "chat_id=${SIM_CHAT}&text=sim-gv conectado — setup completo" | python3 -c "import json,sys; d=json.load(sys.stdin); print('PING OK id=' + str(d.get('result',{}).get('message_id','?')) if d.get('ok') else 'PING FAIL: ' + d.get('description','?'))"

curl -s "https://api.telegram.org/bot${RELAY_BOT}/sendMessage" \
  -d "chat_id=${REPORT_CHAT}&text=finbot-tester listo — SIM_CHAT_ID=${SIM_CHAT}" | python3 -c "import json,sys; d=json.load(sys.stdin); print('REPORT OK' if d.get('ok') else 'REPORT FAIL: ' + d.get('description','?'))"
```

### Formato de salida OBLIGATORIO

```
STATUS: done | partial | failed
CHANGED: financial/.env
DEPLOYED: no
PENDING: (si algo falta)
USER_REQUIRED: (solo si necesitas acción del usuario)

RESULTADO:
SIM_CHAT_ID=<valor>
SIM_ASISTENTE_CHAT_ID=<valor>
FINBOT_TEST_REPORT_CHAT_ID=<valor>
```
