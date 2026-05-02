## Tarea: Auto-descubrir Chat IDs y actualizar financial/.env

Los 3 bots simuladores ya fueron creados y añadidos a los grupos de Telegram.
Necesito que descubras los chat IDs de ambos grupos y los agregues al `.env`.

### Tokens disponibles en financial/.env (ya están)

```
SIM_GV_BOT_TOKEN       → bot HermanVAbot
SIM_VBPP2_BOT_TOKEN    → bot Vbpp2bot
SIM_CHRISTIAN2_BOT_TOKEN → bot ChristianKeytBot
```

### Pasos

**1. Leer tokens del .env**
```bash
GV_TOKEN=$(grep -oP 'SIM_GV_BOT_TOKEN=\K.*' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
VBPP2_TOKEN=$(grep -oP 'SIM_VBPP2_BOT_TOKEN=\K.*' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
C2_TOKEN=$(grep -oP 'SIM_CHRISTIAN2_BOT_TOKEN=\K.*' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
```

**2. Obtener updates de cada bot** (cuando un bot se agrega a un grupo, aparece en getUpdates)
```bash
curl -s "https://api.telegram.org/bot${GV_TOKEN}/getUpdates?allowed_updates=my_chat_member,message"
curl -s "https://api.telegram.org/bot${VBPP2_TOKEN}/getUpdates?allowed_updates=my_chat_member,message"
curl -s "https://api.telegram.org/bot${C2_TOKEN}/getUpdates?allowed_updates=my_chat_member,message"
```

**3. Si getUpdates devuelve result vacío (`"result":[]`)**

Significa que los bots aún no recibieron actualizaciones. Envía cualquier mensaje en cada grupo:
```bash
# Enviar /start en ambos grupos usando el primer bot disponible
# Necesitas los chat IDs desde otra fuente o esperar updates
```

En ese caso, usa el FIN_TELEGRAM_BOT_TOKEN (el bot principal ya está en ambos grupos):
```bash
FIN_TOKEN=$(grep -oP 'FIN_TELEGRAM_BOT_TOKEN=\K.*' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
curl -s "https://api.telegram.org/bot${FIN_TOKEN}/getUpdates" | python3 -m json.tool | grep -E '"id"|"title"'
```

**4. Identificar cuál grupo es cuál**

- El grupo **normal** (SIM_CHAT_ID): el que tiene nombre que sugiere operaciones/pagos
- El grupo **asistente** (SIM_ASISTENTE_CHAT_ID): el que tiene modo asistente activo

Si ambos tienen nombres ambiguos, reporta los nombres y IDs para que el usuario confirme.

**5. Actualizar financial/.env**
```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
sed -i '/^SIM_CHAT_ID=/d; /^SIM_ASISTENTE_CHAT_ID=/d' "$ENV"
echo "SIM_CHAT_ID=<ID_GRUPO_NORMAL>"       >> "$ENV"
echo "SIM_ASISTENTE_CHAT_ID=<ID_GRUPO_ASISTENTE>" >> "$ENV"
```

**6. Verificar**
```bash
grep -E 'SIM_CHAT_ID|SIM_ASISTENTE' /var/www/html/vilarkptl.com/ai-monitor/financial/.env
```

**7. Ejecutar test rápido** para confirmar que los bots pueden enviar mensajes:
```bash
SIM_CHAT=$(grep -oP 'SIM_CHAT_ID=\K.*' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
GV_TOKEN=$(grep -oP 'SIM_GV_BOT_TOKEN=\K.*' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
curl -s "https://api.telegram.org/bot${GV_TOKEN}/sendMessage" \
  -d "chat_id=${SIM_CHAT}&text=✅ sim-gv conectado correctamente"
```

### Criterios de aceptación

- [ ] `SIM_CHAT_ID` y `SIM_ASISTENTE_CHAT_ID` presentes en `financial/.env`
- [ ] Los valores son negativos (grupos de Telegram tienen IDs negativos)
- [ ] El mensaje de verificación del paso 7 llega al grupo

### Formato de salida

```
STATUS: done | partial | failed
CHANGED: financial/.env
DEPLOYED: no
PENDING: (si algo falta)
USER_REQUIRED: (si el usuario necesita confirmar qué grupo es cuál)

RESULTADO:
SIM_CHAT_ID=<valor encontrado>
SIM_ASISTENTE_CHAT_ID=<valor encontrado>
```
