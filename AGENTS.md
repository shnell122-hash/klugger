# AGENTS.md — Sistema Relay

Cursor Cloud Agents se utilizan para revisar, probar, optimizar y desplegar el sistema relay de forma segura.

## Cuándo usar Cursor Agents

| Tarea | Agente recomendado |
|-------|--------------------|
| Revisión de código del relay | Cursor Cloud Agent (paralelo) |
| Pruebas de rutas API | Cursor Cloud Agent |
| Optimización de latencia y costos LLM | Cursor Cloud Agent |
| Validación de seguridad y rate-limits | Cursor Cloud Agent |
| Deploy después de cambios | cursor-worker (self-hosted) |
| Tareas de código en producción | Claude Code CLI (relay-master) |

## Agentes del sistema relay (Claude Code)

Los agentes Claude Code corren via `relay-master` y **no** deben ser reemplazados por Cursor para tareas en tiempo real.

| ID | Modelo | Especialización |
|----|--------|----------------|
| `coordinator` | claude-haiku-4-5 | Orquestación y dispatch |
| `fiscalai` | claude-sonnet-4-6 | Backend Node.js + MySQL + SAT |
| `fiscalai-front` | claude-sonnet-4-6 | Frontend HTML/CSS/JS |
| `ai-monitor` | claude-haiku-4-5 | Dashboard de monitoreo |

## Cursor Cloud Agent (self-hosted worker)

El proceso `cursor-worker` corre en PM2 y se conecta al dashboard de Cursor Cloud para recibir tareas asíncronas.

```bash
# Verificar worker
pm2 list | grep cursor-worker
pm2 logs cursor-worker --lines 50

# Reiniciar si es necesario
pm2 restart cursor-worker
```

## Prompts recomendados para Cursor Cloud Agents

### Revisión completa del relay
```
Estoy en el servidor de producción (/var/www/html/vilarkptl.com/ai-monitor).
Revisa todo el código del sistema relay (relay/master.js, relay/projects.json).
Verifica:
- Manejo de mensajes inbox/outbox
- Rate-limits y timeouts
- Uso correcto de process.env.*_API_KEY (nunca hardcoded)
- Posibles memory leaks o procesos zombie
- Puntos de mejora de latencia o costos
```

### Prueba de ruta específica
```
Ejecuta prueba del endpoint POST /api/relay/dispatch en localhost:3010
con un mensaje de prueba JSON. Reporta latencia y respuesta.
Verifica que el proyecto "ai-monitor" existe en relay/projects.json.
```

### Optimización de costos
```
Analiza relay/master.js y relay/projects.json.
Identifica qué tareas usan claude-sonnet-4-6 que podrían usar claude-haiku-4-5
sin degradar calidad. Estima el ahorro por día.
```

### Deploy después de cambios
```
Después de git pull origin claude/agent-monitoring-dashboard-4v8iq,
verifica que no hay errores de sintaxis en los archivos JS modificados,
luego ejecuta: pm2 restart ai-monitor
Reporta el status de PM2 después del restart.
```

## Reglas de oro

1. **Cursor Agents** → solo para desarrollo, revisión y pruebas
2. **relay-master** → procesa tareas de producción en tiempo real
3. **Nunca hardcodear** API keys — siempre `process.env.*_API_KEY`
4. **cursor-worker** debe estar corriendo permanentemente via PM2
5. **No reemplazar** el flujo inbox→outbox de Claude CLI con Cursor para tareas de producción

## Carpeta `.cursor/rules`

Ver `.cursor/rules/relay.md` para reglas de estilo, seguridad y convenciones del proyecto.
