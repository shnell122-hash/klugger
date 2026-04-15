# AI Monitor — Relay Outbox
_Resultado: 

Warning: no stdin data received in 3s, proceeding without it. If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.
Entendido — tengo toda la información necesaria. Aquí está el estado del sistema para el relay:

---

## INIT confirmado — 2026-04-15 03:14 UTC

**Sistema relay operativo.** El watcher detectó `inbox.md` y este mensaje fue procesado correctamente.

### Estado PM2

```
pm2 list → vacío (sin procesos registrados)
```

El backend **NO está gestionado por pm2**. Corre como proceso directo:

```
PID    : 2018887
CMD    : node /var/www/html/vilarkptl.com/ai-monitor/backend/server.js
Usuario: root
Puerto : 3010 (0.0.0.0:3010 LISTEN)
Inicio : ~21:13 hoy (04-14)
```

### Health check ✓

```json
{"ok":true,"ts":"2026-04-15T03:14:15.803Z","port":"3010"}
```

### URL del Dashboard

```
http://ia.vilarkptl.com
http://127.0.0.1:3010
```

### Relay watcher

```
PID: 2018905  (bash /var/www/html/.../relay/watcher.sh)
Estado: activo, monitoreando inbox.md cada 15s
Log: relay/watcher.log
```

---

**Nota:** El backend no está en pm2. Para que sobreviva reinicios del servidor, registrarlo con:

```bash
pm2 start /var/www/html/vilarkptl.com/ai-monitor/backend/server.js --name ai-monitor-backend
pm2 save
pm2 startup
```
