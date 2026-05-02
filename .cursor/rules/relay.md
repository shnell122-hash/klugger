# Cursor Rules — Sistema Relay AI Monitor

## Identidad del proyecto

Este es el repositorio del sistema multi-agente **Relay AI Monitor**.
Stack: Node.js + PM2 + MySQL + Express + Socket.io + Claude CLI + Telegram.

## Seguridad (obligatorio)

- **NUNCA** hardcodear API keys, tokens o contraseñas en código
- Siempre usar `process.env.NOMBRE_DE_VARIABLE`
- Variables de entorno en `relay/.env` y `backend/.env` (no commitear)
- Los archivos `.env` deben estar en `.gitignore`
- No agregar logs que expongan valores de `process.env.*_API_KEY`

## Estilo de código

- `'use strict'` al inicio de todos los archivos Node.js
- Callbacks en lugar de async/await en master.js (coherencia con el código existente)
- async/await en backend routes
- `const` para valores que no cambian, `let` solo cuando necesario
- Nombres en camelCase para variables y funciones
- Constantes globales en SCREAMING_SNAKE_CASE

## Convenciones del relay

- El archivo `relay/master.js` es el proceso central — modificar con cuidado
- Cambios en master.js disparan `checkSelfReload()` automáticamente en producción
- `relay/projects.json` controla qué agentes están activos — no agregar `active: false` sin razón
- Los inbox/outbox son archivos markdown — el relay los monitorea via hash SHA256
- Timeouts: CLAUDE_TIMEOUT_MS=25min, OUTBOX_TIMEOUT_MS=35min

## Base de datos

- Motor: MySQL (ai_monitoring)
- Migraciones: `backend/db/migrate-v*.sql` (numeración secuencial)
- Nunca DROP TABLE en producción sin respaldo
- Queries: usar parámetros `?` (prepared statements) — nunca interpolación de strings

## Frontend

- Vanilla JS — sin frameworks (React, Vue, etc.)
- Chart.js 4 para gráficas
- CSS custom properties (variables) — ver `--accent`, `--glass`, `--bg`, etc.
- `dashboard.js` expone funciones globales en `window` para onclick handlers
- No agregar dependencias npm al frontend

## PM2

- `watch: false` siempre (PM2 watch causa reinicios en bucle)
- `max_memory_restart` definido para cada proceso
- Logs en `/var/log/ai-monitor/`
- Usar `pm2 reload` para zero-downtime, `pm2 restart` solo si es necesario

## Git

- Nunca `git add .` — siempre `git add <archivos específicos>`
- Nunca commitear: `node_modules/`, `.env`, `nohup.out`, `FETCH_HEAD`
- Commits en español o inglés, con prefijo convencional: `feat:`, `fix:`, `docs:`, `refactor:`
- Branch de desarrollo: `claude/agent-monitoring-dashboard-4v8iq`
- Branch de producción ai-monitor: `claude/agent-monitoring-dashboard-4v8iq` (ver projects.json)

## Costos LLM (prioridad)

- **Sonnet 4.6**: solo para tareas que requieren edición de código compleja
- **Haiku 4.5**: coordinación, planificación, tareas simples
- **DeepSeek V3**: reviews de código, resúmenes (mucho más barato)
- `max_tokens` siempre definido — nunca dejar sin límite
- Prompt caching en system prompts que se repiten (`cache_control: {type: 'ephemeral'}`)

## Testing con Cursor Agents

Al revisar el código, verificar:
1. Que `relay/master.js` no tenga memory leaks obvios (ACTIVE_PIDS, ACTIVE_TASKS)
2. Que los endpoints API validen input con parámetros `?` en SQL
3. Que el kill-switch diario funcione correctamente
4. Que el outbox watchdog termine procesos correctamente
