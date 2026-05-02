## Tarea: Completar financial/.env con Chat IDs de grupos de prueba

Los 3 bots simuladores (HermanVAbot/GermanBot, Vbpp2bot/VianeyBot, ChristianKeytBot/Christianbot) ya están en el grupo "Testing" junto con el bot principal (Flujos AI).
Completa los valores que faltan en `financial/.env`.

### Paso 0 — Verificar permisos de escritura en .env

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
if [ -w "$ENV" ]; then
  echo "PERMISOS OK"
else
  echo "SIN_PERMISOS: el archivo no es escribible. El usuario root debe ejecutar: chmod 664 $ENV"
  echo "USER_REQUIRED: chmod 664 $ENV"
fi
```

Si aparece SIN_PERMISOS, reporta USER_REQUIRED y detente (el root debe hacer chmod 664 primero).

### Paso 1 — Leer tokens del .env

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
GV_TOKEN=$(grep -oP 'SIM_GV_BOT_TOKEN=\K.*' "$ENV")
VBPP2_TOKEN=$(grep -oP 'SIM_VBPP2_BOT_TOKEN=\K.*' "$ENV")
C2_TOKEN=$(grep -oP 'SIM_CHRISTIAN2_BOT_TOKEN=\K.*' "$ENV")
FIN_TOKEN=$(grep -oP 'FIN_TELEGRAM_BOT_TOKEN=\K.*' "$ENV")
echo "GV=${GV_TOKEN:0:15}... VBPP2=${VBPP2_TOKEN:0:15}... C2=${C2_TOKEN:0:15}... FIN=${FIN_TOKEN:0:15}..."
```

Si algún token está vacío, reporta error y detente.

### Paso 2 — Obtener grupos via getUpdates (todos los bots)

```bash
curl -s "https://api.telegram.org/bot${GV_TOKEN}/getUpdates?allowed_updates=%5B%22message%22%2C%22my_chat_member%22%5D" > /tmp/gv_upd.json
curl -s "https://api.telegram.org/bot${VBPP2_TOKEN}/getUpdates?allowed_updates=%5B%22message%22%2C%22my_chat_member%22%5D" > /tmp/vbpp2_upd.json
curl -s "https://api.telegram.org/bot${C2_TOKEN}/getUpdates?allowed_updates=%5B%22message%22%2C%22my_chat_member%22%5D" > /tmp/c2_upd.json
curl -s "https://api.telegram.org/bot${FIN_TOKEN}/getUpdates?allowed_updates=%5B%22message%22%2C%22my_chat_member%22%5D" > /tmp/fin_upd.json

python3 - << 'PYEOF'
import json

def extract_chats(fname):
    try:
        with open(fname) as f:
            data = json.load(f)
    except:
        return {}
    chats = {}
    for upd in data.get('result', []):
        for key in ['message', 'my_chat_member', 'chat_member', 'channel_post']:
            if key in upd:
                chat = upd[key].get('chat', {})
                cid = chat.get('id')
                if cid and chat.get('type') in ('group', 'supergroup'):
                    chats[cid] = chat.get('title') or str(cid)
    return chats

all_chats = {}
for fname in ['/tmp/gv_upd.json', '/tmp/vbpp2_upd.json', '/tmp/c2_upd.json', '/tmp/fin_upd.json']:
    all_chats.update(extract_chats(fname))

if all_chats:
    print("Grupos encontrados:")
    for cid, title in all_chats.items():
        print(f"  {cid}: {title}")
else:
    print("SIN_GRUPOS: getUpdates vacío en todos los bots")
PYEOF
```

### Paso 3 — Si getUpdates sigue vacío, usar fin_chats de MySQL

```bash
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring -e "SELECT chat_id, title, type FROM fin_chats WHERE type IN ('group','supergroup') ORDER BY id DESC LIMIT 10;" 2>/dev/null || echo "tabla fin_chats no existe"
```

### Paso 4 — Identificar grupos por nombre

- **SIM_CHAT_ID** (grupo normal): nombre contiene "testing", "prueba", "test", "operaciones"
- **SIM_ASISTENTE_CHAT_ID** (grupo asistente): nombre contiene "asistente", "admin", o es el segundo grupo

Si solo hay un grupo en getUpdates, envía mensaje de prueba en él y también intenta con el grupo de Operaciones G conocido (-5135719373):

```bash
# Verificar si el bot sim puede enviar al grupo de OperacionesG
curl -s "https://api.telegram.org/bot${GV_TOKEN}/sendMessage" \
  -d "chat_id=-5135719373&text=Ping desde HermanVAbot" | python3 -c "import json,sys; d=json.load(sys.stdin); print('OK' if d.get('ok') else d.get('description','error'))"
```

### Paso 5 — FINBOT_TEST_REPORT_CHAT_ID desde relay/.env

```bash
RELAY_ENV=/var/www/html/vilarkptl.com/ai-monitor/relay/.env
REPORT_CHAT=$(grep -oP 'TELEGRAM_CHAT_ID=\K.*' "$RELAY_ENV" | head -1)
echo "Chat de reportes: $REPORT_CHAT"
```

### Paso 6 — Actualizar financial/.env (sin heredoc)

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
REPORT_CHAT=$(grep -oP 'TELEGRAM_CHAT_ID=\K.*' /var/www/html/vilarkptl.com/ai-monitor/relay/.env | head -1)

# Reemplaza <NORMAL_ID> y <ASISTENTE_ID> con los IDs reales encontrados
NORMAL_ID=<NORMAL_ID>
ASISTENTE_ID=<ASISTENTE_ID>

sed -i '/^SIM_CHAT_ID=/d' "$ENV"
sed -i '/^SIM_ASISTENTE_CHAT_ID=/d' "$ENV"
sed -i '/^FINBOT_TEST_REPORT_CHAT_ID=/d' "$ENV"

printf 'SIM_CHAT_ID=%s\n' "$NORMAL_ID" >> "$ENV"
printf 'SIM_ASISTENTE_CHAT_ID=%s\n' "$ASISTENTE_ID" >> "$ENV"
printf 'FINBOT_TEST_REPORT_CHAT_ID=%s\n' "$REPORT_CHAT" >> "$ENV"

grep -E 'SIM_CHAT_ID|SIM_ASISTENTE_CHAT_ID|FINBOT_TEST_REPORT_CHAT_ID' "$ENV"
```

### Paso 7 — Test de conectividad

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
SIM_CHAT=$(grep -oP 'SIM_CHAT_ID=\K.*' "$ENV")
GV_TOKEN=$(grep -oP 'SIM_GV_BOT_TOKEN=\K.*' "$ENV")
REPORT_CHAT=$(grep -oP 'FINBOT_TEST_REPORT_CHAT_ID=\K.*' "$ENV")
RELAY_BOT=$(grep -oP 'TELEGRAM_BOT_TOKEN=\K.*' /var/www/html/vilarkptl.com/ai-monitor/relay/.env | head -1)

curl -s "https://api.telegram.org/bot${GV_TOKEN}/sendMessage" \
  -d "chat_id=${SIM_CHAT}&text=sim-gv conectado — setup completo" | python3 -c "import json,sys; d=json.load(sys.stdin); print('PING OK msg_id=' + str(d.get('result',{}).get('message_id','?')) if d.get('ok') else 'PING FAIL: ' + d.get('description','?'))"

curl -s "https://api.telegram.org/bot${RELAY_BOT}/sendMessage" \
  -d "chat_id=${REPORT_CHAT}&text=finbot-tester listo — SIM_CHAT_ID=${SIM_CHAT}" | python3 -c "import json,sys; d=json.load(sys.stdin); print('REPORT OK' if d.get('ok') else 'REPORT FAIL: ' + d.get('description','?'))"
```

### Criterios de aceptación

- [ ] `SIM_CHAT_ID` en financial/.env (valor negativo de grupo)
- [ ] `SIM_ASISTENTE_CHAT_ID` en financial/.env (valor negativo de grupo)
- [ ] `FINBOT_TEST_REPORT_CHAT_ID` en financial/.env
- [ ] Mensaje de ping llega al grupo de prueba
- [ ] Mensaje de reporte llega al chat del relay-master

### Formato de salida OBLIGATORIO

```
STATUS: done | partial | failed
CHANGED: financial/.env
DEPLOYED: no
PENDING: (si algún chat ID no se pudo determinar)
USER_REQUIRED: (si necesitas que el usuario confirme qué grupo es cuál)

RESULTADO:
SIM_CHAT_ID=<valor>
SIM_ASISTENTE_CHAT_ID=<valor>
FINBOT_TEST_REPORT_CHAT_ID=<valor>
```
