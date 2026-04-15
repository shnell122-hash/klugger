# AI Monitor — Relay Outbox
_Resultado: 

Deploy completo. Ahora el reporte final:

---

## Reporte deploy — 2026-04-15 ~19:34 UTC

### 1. Git pull — OMITIDO (ya actualizado)
Repo en commit `839f490` (más reciente que origin `15bfef6`). No se requirió pull.

### 2. Schema — APLICADO con ALTER TABLE
`CREATE TABLE IF NOT EXISTS` no añadió columnas a tablas existentes. Se ejecutaron `ALTER TABLE` para añadir:
- `agent_sessions.project_name VARCHAR(128)`
- `agent_sessions.api_provider VARCHAR(32) DEFAULT 'anthropic'`
- `agent_events.project_name VARCHAR(128)`
- `agent_events.api_provider VARCHAR(32) DEFAULT 'anthropic'`
- Índices `idx_project` e `idx_provider` en ambas tablas

### 3. Directorio /var/log/ai-monitor/ — OK
Ya existía. Verificado.

### 4. relay/.env — OK
Contiene: `GITHUB_TOKEN`, `ANTHROPIC_API_KEY` (evaluado desde DeCabeceraTax env), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

### 5. MONITOR_API_URL — OK (default en código)
`relay/.env` no tenía la variable (permisos root-only), pero `master.js:27` tiene:
```js
const MONITOR_API = process.env.MONITOR_API_URL || 'http://127.0.0.1:3010';
```

### 6. Procesos viejos eliminados — OK
`ai-monitor-relay` (id 2, uptime 3h) eliminado. `claude-relay` no existía.

### 7. relay-master iniciado — ONLINE
```
│ 3  │ relay-master  │ fork  │ 2187477 │ ~90s │ 0 │ online │ 53.6mb │
```
Nota: `ecosystem.config.js` no pudo usarse directamente (log path `/var/log/ai-monitor/` sin permisos). Se inició con `pm2 start relay/master.js` directamente con logs en `~/.pm2/logs/`. `dotenv` se resolvió via `NODE_PATH` del backend.

### 8. Backend (ai-monitor) — OPERATIVO vía root pm2
El backend ya corría bajo root's pm2 (PID 2186813, puerto 3010). Inicio redundante desde claude-agent fallaba con `EADDRINUSE`. El servidor funciona correctamente.

### 9. pm2 list — VERIFICADO
```
│ 3  │ relay-master  │ fork  │ online  │ 53.6mb │
```

### 10. Health check — OK
```json
{"ok":true,"ts":"2026-04-15T19:34:03.994Z","port":"3010"}
```

### 11. Proyectos API — OK
```json
[{"id":"ai-monitor","name":"AI Monitor","github_repo":"vilarkptl-lang/agentic-repo",...},
 {"id":"fiscalai","name":"FiscalAI / DeCabeceraTax",...}]
```

### 12. pm2 save — OK
`[PM2] Successfully saved in /home/claude-agent/.pm2/dump.pm2`

---

### Resumen de estado

| Paso | Estado | Notas |
|------|--------|-------|
| git pull | ✓ | Ya en commit más reciente |
| Schema SQL | ✓ | ALTER TABLE aplicado |
| /var/log/ai-monitor/ | ✓ | Existe |
| relay/.env env vars | ✓ | 4 vars presentes |
| MONITOR_API_URL | ✓ | Default en master.js |
| pm2 delete viejos | ✓ | ai-monitor-relay eliminado |
| relay-master | ✓ ONLINE | PID 2187477 |
| backend ai-monitor | ✓ ONLINE | Root pm2 PID 2186813, puerto 3010 |
| /api/health | ✓ | ok:true |
| /api/projects | ✓ | 2 proyectos activos |
| pm2 save | ✓ | Guardado |

### Issues identificados
1. **Permisos de archivos**: Los archivos del proyecto son `root:www-data 644`. `claude-agent` no puede modificar `.env`, `outbox.md`, ni instalar módulos en relay/. Relay-master tampoco puede escribir a outbox.md.
2. **dotenv faltante en relay/**: `master.js` requiere `dotenv` pero relay/ no tiene `package.json` ni `node_modules`. Se inició con NODE_PATH apuntando al backend.
3. **Dos watchers activos**: El `watcher.sh` (PID 2021054, root) y `relay-master` (PID 2187477) ambos monitorean `inbox.md`. Se duplicará la ejecución de tareas. Recomendación: `kill 2021054` como root para dejar solo relay-master.
