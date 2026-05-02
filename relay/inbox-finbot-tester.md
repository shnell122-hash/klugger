## Tarea: Descubrir Chat IDs de grupos de prueba + completar financial/.env

Los 3 bots simuladores ya fueron creados (HermanVAbot, Vbpp2bot, ChristianKeytBot)
y los grupos de Telegram ya existen. Necesito que completes el `financial/.env`
con los chat IDs y el chat de reportes.

### Paso 1 — Leer tokens del .env (ya deberían estar)

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
GV_TOKEN=$(grep -oP 'SIM_GV_BOT_TOKEN=\K.*' "$ENV")
VBPP2_TOKEN=$(grep -oP 'SIM_VBPP2_BOT_TOKEN=\K.*' "$ENV")
C2_TOKEN=$(grep -oP 'SIM_CHRISTIAN2_BOT_TOKEN=\K.*' "$ENV")
echo "GV_TOKEN=${GV_TOKEN:0:20}..."
echo "VBPP2_TOKEN=${VBPP2_TOKEN:0:20}..."
echo "C2_TOKEN=${C2_TOKEN:0:20}..."
```

Si algún token está vacío, reporta error y detente.

### Paso 2 — Obtener updates de los bots (detecta grupos)

Cuando se agrega un bot a un grupo, Telegram registra `my_chat_member`.

```bash
curl -s "https://api.telegram.org/bot${GV_TOKEN}/getUpdates" > /tmp/gv_updates.json
curl -s "https://api.telegram.org/bot${VBPP2_TOKEN}/getUpdates" > /tmp/vbpp2_updates.json
curl -s "https://api.telegram.org/bot${C2_TOKEN}/getUpdates" > /tmp/c2_updates.json

# Extraer chat IDs y títulos de cualquier update
python3 - << 'PYEOF'
import json, sys

def extract_chats(fname):
    with open(fname) as f:
        data = json.load(f)
    chats = {}
    for upd in data.get('result', []):
        for key in ['message', 'my_chat_member', 'chat_member']:
            if key in upd:
                chat = upd[key].get('chat', {})
                if chat.get('id'):
                    chats[chat['id']] = chat.get('title') or chat.get('username') or str(chat['id'])
    return chats

all_chats = {}
for fname in ['/tmp/gv_updates.json', '/tmp/vbpp2_updates.json', '/tmp/c2_updates.json']:
    all_chats.update(extract_chats(fname))

print("Chats encontrados:")
for cid, title in all_chats.items():
    print(f"  {cid}: {title}")
PYEOF
```

### Paso 3 — Si getUpdates devuelve vacío

Usar el bot principal (`FIN_TELEGRAM_BOT_TOKEN`) que ya está en ambos grupos:

```bash
FIN_TOKEN=$(grep -oP 'FIN_TELEGRAM_BOT_TOKEN=\K.*' "$ENV")
curl -s "https://api.telegram.org/bot${FIN_TOKEN}/getUpdates" > /tmp/fin_updates.json
python3 - << 'PYEOF'
import json
with open('/tmp/fin_updates.json') as f:
    data = json.load(f)
chats = {}
for upd in data.get('result', []):
    for key in ['message', 'my_chat_member']:
        if key in upd:
            chat = upd[key].get('chat', {})
            if chat.get('type') in ('group', 'supergroup') and chat.get('id'):
                chats[chat['id']] = chat.get('title', str(chat['id']))
print("Grupos del bot principal:")
for cid, t in chats.items():
    print(f"  {cid}: {t}")
PYEOF
```

### Paso 4 — Identificar cuál grupo es cuál

- El grupo **normal** (SIM_CHAT_ID): donde se hacen operaciones (/operacion, CLABEs)
  — nombre probablemente contiene "prueba", "test", "operaciones" o similar
- El grupo **asistente** (SIM_ASISTENTE_CHAT_ID): donde se comparten comprobantes/cuadros
  — nombre probablemente contiene "asistente", "admin" o similar

Si los nombres son ambiguos, envía un mensaje en cada grupo e identifica por la respuesta:

```bash
# Enviar mensaje de prueba en cada chat encontrado
for CHAT_ID in <id1> <id2>; do
  curl -s "https://api.telegram.org/bot${GV_TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}&text=🤖 Identificando grupo — ID: ${CHAT_ID}"
done
```

### Paso 5 — Leer FINBOT_TEST_REPORT_CHAT_ID desde relay/.env

El relay-master ya tiene el chat de resultados configurado. Usarlo directamente:

```bash
RELAY_ENV=/var/www/html/vilarkptl.com/ai-monitor/relay/.env
REPORT_CHAT=$(grep -oP 'TELEGRAM_CHAT_ID=\K.*' "$RELAY_ENV")
echo "Chat de reportes: $REPORT_CHAT"
```

### Paso 6 — Actualizar financial/.env

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env

# Eliminar si ya existen
sed -i '/^SIM_CHAT_ID=/d; /^SIM_ASISTENTE_CHAT_ID=/d; /^FINBOT_TEST_REPORT_CHAT_ID=/d' "$ENV"

# Agregar los valores encontrados (reemplaza <NORMAL> y <ASISTENTE> con los IDs reales)
printf 'SIM_CHAT_ID=<NORMAL>\nSIM_ASISTENTE_CHAT_ID=<ASISTENTE>\nFINBOT_TEST_REPORT_CHAT_ID=%s\n' "$REPORT_CHAT" >> "$ENV"

# Verificar
grep -E 'SIM_CHAT_ID|SIM_ASISTENTE_CHAT_ID|FINBOT_TEST_REPORT_CHAT_ID' "$ENV"
```

### Paso 7 — Test de conectividad rápido

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
SIM_CHAT=$(grep -oP 'SIM_CHAT_ID=\K.*' "$ENV")
GV_TOKEN=$(grep -oP 'SIM_GV_BOT_TOKEN=\K.*' "$ENV")
REPORT_CHAT=$(grep -oP 'FINBOT_TEST_REPORT_CHAT_ID=\K.*' "$ENV")
RELAY_BOT=$(grep -oP 'TELEGRAM_BOT_TOKEN=\K.*' /var/www/html/vilarkptl.com/ai-monitor/relay/.env)

# Ping al grupo de prueba desde sim-gv
curl -s "https://api.telegram.org/bot${GV_TOKEN}/sendMessage" \
  -d "chat_id=${SIM_CHAT}&text=✅ sim-gv conectado — setup completo"

# Ping de reporte al chat de relay
curl -s "https://api.telegram.org/bot${RELAY_BOT}/sendMessage" \
  -d "chat_id=${REPORT_CHAT}&text=✅ finbot-tester inicializado — SIM_CHAT_ID=${SIM_CHAT}"
```

### Criterios de aceptación

- [ ] `SIM_CHAT_ID` en financial/.env (valor negativo de grupo)
- [ ] `SIM_ASISTENTE_CHAT_ID` en financial/.env (valor negativo de grupo)
- [ ] `FINBOT_TEST_REPORT_CHAT_ID` en financial/.env (leído de relay/.env TELEGRAM_CHAT_ID)
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
