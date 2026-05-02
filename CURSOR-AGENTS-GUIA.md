# Guía: Cursor Cloud Agents en el Sistema Relay

**Fecha:** Mayo 2026
**Sistema:** Relay AI Monitor (Node.js + PM2)
**Objetivo:** Usar Cursor Cloud Agents (Parallel Agents + Self-Hosted Worker) para revisar,
probar, optimizar y desplegar el sistema relay de forma segura y eficiente.

---

## 1. En el Repositorio (GitHub)

Los siguientes archivos ya están configurados en este repo:

| Archivo | Descripción |
|---------|-------------|
| `AGENTS.md` | Configuración y prompts para Cursor Cloud Agents |
| `.cursor/rules/relay.md` | Reglas de estilo, seguridad y convenciones |
| `CURSOR-AGENTS-GUIA.md` | Esta guía |

### Carpeta `.cursor/rules`

Contiene reglas que Cursor respeta automáticamente al editar código:
- Seguridad: nunca hardcodear API keys
- Estilo: `'use strict'`, camelCase, async/await en routes
- Convenciones relay: timeouts, inbox/outbox, PM2

---

## 2. En el Servidor (Producción)

El worker corre como `cursor-worker` en PM2.

### Comandos útiles

```bash
# 1. Verificar que Cursor Cloud Agent worker está activo
pm2 list | grep cursor-worker
ps aux | grep -E 'cursor|agent worker'

# 2. Reiniciar el worker si es necesario
pm2 restart cursor-worker

# 3. Ver logs del worker
pm2 logs cursor-worker --lines 100

# 4. Entrar a la carpeta del relay
cd /var/www/html/vilarkptl.com/ai-monitor
```

### Configuración del worker (ecosystem.config.js)

El worker ya está incluido en `deploy/ecosystem.config.js`:

```js
{
  name: 'cursor-worker',
  script: 'node_modules/.bin/cursor-agent-worker',
  // o la ruta que Cursor indique al configurar el self-hosted worker
  cwd: '/var/www/html/vilarkptl.com/ai-monitor',
  autorestart: true,
  watch: false,
  env: {
    CURSOR_WORKER_TOKEN: process.env.CURSOR_WORKER_TOKEN,
  }
}
```

> **Nota**: Obtén `CURSOR_WORKER_TOKEN` desde cursor.com/dashboard/cloud-agents
> al configurar el self-hosted worker, y agrégalo a `relay/.env`.

---

## 3. Cómo lanzar Cursor Cloud Agents

Ve a: **cursor.com/dashboard/cloud-agents → Create Agent**

### Prompts genéricos (copiar y pegar)

#### Prompt 1 — Revisión completa del relay

```
Estoy en el servidor de producción (/var/www/html/vilarkptl.com/ai-monitor).
Revisa todo el código del sistema relay (Node.js + PM2):
- relay/master.js: manejo de inbox/outbox, kill-switch, watchdog
- relay/projects.json: configuración de agentes
- Verifica uso correcto de process.env.*_API_KEY (nunca hardcoded)
- Identifica posibles memory leaks en ACTIVE_PIDS y ACTIVE_TASKS
- Reporta puntos de mejora de latencia o costos LLM
```

#### Prompt 2 — Prueba de una ruta específica

```
Ejecuta prueba del endpoint POST /api/relay/dispatch en localhost:3010
con este payload:
{"project":"ai-monitor","task":"## Test\nVerifica integración relay.","requester":"cursor-agent"}
Reporta: latencia, response body, y status HTTP.
Verifica que inbox.md en /var/www/html/vilarkptl.com/ai-monitor/relay/inbox.md fue actualizado.
```

#### Prompt 3 — Optimización de costos

```
Analiza relay/master.js y relay/projects.json.
El sistema usa claude-sonnet-4-6 (~$15/M output tokens) y claude-haiku-4-5 (~$4/M).
Identifica qué llamadas a Sonnet podrían usar Haiku sin degradar calidad.
También revisa si hay llamadas a callAnthropicDirect sin cache_control ephemeral
y sugiere dónde agregar prompt caching para reducir costo.
```

#### Prompt 4 — Deploy después de cambios

```
Después de ejecutar:
  git fetch origin claude/agent-monitoring-dashboard-4v8iq
  git reset --hard origin/claude/agent-monitoring-dashboard-4v8iq

Verifica que no hay errores de sintaxis en:
  node --check relay/master.js
  node --check backend/server.js

Si todo está correcto, ejecuta:
  pm2 restart ai-monitor

Reporta el output de pm2 status al terminar.
```

#### Prompt 5 — Auditoría de seguridad

```
Audita el sistema relay en busca de vulnerabilidades:
1. Revisa todos los endpoints en backend/routes/ — ¿hay SQL injection posible?
2. Revisa relay/master.js — ¿hay command injection en execSync/spawn?
3. Verifica que .env no está en ningún commit del historial git
4. Comprueba que el dashboard en ia.vilarkptl.com no expone datos sensibles
5. Reporta cada issue con severidad: Alta / Media / Baja
```

---

## 4. Flujo Recomendado

```
1. Claude Code (en esta sesión) → modifica código → commit → push a GitHub
2. Cursor Cloud Agent (en servidor) → revisa, prueba y valida los cambios
3. Tú → en el servidor haces git pull + pm2 restart si Cursor lo aprueba
4. relay-master → detecta cambio en master.js → auto-reload via checkSelfReload()
5. Repite
```

### División de responsabilidades

| Herramienta | Cuándo usarla |
|------------|---------------|
| **Claude Code CLI** (relay-master) | Tareas de código en producción, commits, push |
| **Cursor Cloud Agents** | Revisión, pruebas, auditoría, deploy manual |
| **cursor-worker** (PM2) | Recibe tareas asíncronas de Cursor Cloud |
| **DeepSeek V3** (code-reviewer) | Auto-review de cada commit, alertas de bugs |

---

## 5. Reglas de Oro

1. **Cursor Cloud Agents** solo para desarrollo, revisión y pruebas — no para procesar mensajes en tiempo real
2. **relay-master** es el orquestador de producción — Cursor no lo reemplaza
3. **Siempre** usar `process.env.NOMBRE_VARIABLE` — nunca strings con keys reales
4. **cursor-worker** debe estar corriendo permanentemente con PM2
5. **Máximo 3 tareas simultáneas** para Cursor — no inundar la cola del servidor
6. **Verificar outbox** antes de reportar éxito — no asumir que funcionó

---

## 6. Setup inicial del cursor-worker

Si el worker no está corriendo aún:

```bash
# 1. Obtener el token en cursor.com/dashboard/cloud-agents → "Add Worker"
# 2. Agregar al .env del relay
echo "CURSOR_WORKER_TOKEN=tu_token_aqui" >> /var/www/html/vilarkptl.com/ai-monitor/relay/.env

# 3. Instalar el worker (sigue las instrucciones de Cursor para self-hosted)
# Típicamente: npm install -g @cursor/agent-worker o similar

# 4. Arrancar con PM2
pm2 start deploy/ecosystem.config.js --only cursor-worker
pm2 save

# 5. Verificar
pm2 logs cursor-worker --lines 20
```

---

## Referencias

- Dashboard Cursor: cursor.com/dashboard/cloud-agents
- Documentación del sistema relay: [SYSTEM.md](./SYSTEM.md)
- Config de agentes Claude: [AGENTS.md](./AGENTS.md)
- Reglas Cursor: [.cursor/rules/relay.md](./.cursor/rules/relay.md)
- Dashboard de monitoreo: ia.vilarkptl.com
