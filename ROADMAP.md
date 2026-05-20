# ROADMAP — AI Monitor / Agentic Relay System

> Actualizado: 2026-05-20  
> Autor: análisis conjunto Claude Code + german  
> Objetivo: cerrar la brecha entre AI Monitor (7/10) y Claude Code (9/10) como plataforma de desarrollo autónomo

---

## Por qué está armado así

Este roadmap se construyó con un criterio de **impacto sobre esfuerzo**, no de completitud técnica.

Hay dos tipos de mejoras posibles:

1. **Mejoras de infraestructura** — hacen que el sistema funcione más confiable (multi-cuenta, branch fixes, monitoreo). Son invisibles para el usuario pero evitan interrupciones de servicio.
2. **Mejoras de capacidad** — hacen que los agentes produzcan código de mejor calidad (tool server, contexto persistente, interactividad). Son visibles y tienen impacto directo en la calidad del output.

El orden prioriza **confiabilidad primero, capacidad después**, porque un sistema de alta capacidad que falla intermitentemente es menos útil que uno de capacidad media que siempre funciona. La única excepción es el Tool Server (Fase 2) que sube de golpe la calidad de código de DeepSeek de 6/10 a 8/10.

Las últimas fases (paralelismo, CI/CD) son mejoras de escala — solo tienen valor cuando las fases anteriores están sólidas.

---

## Estado actual (2026-05-20)

| Componente | Estado | Calificación |
|------------|--------|-------------|
| relay-master (orquestador) | ✅ Online | 8/10 |
| DeepSeek V4 Pro (código) | ✅ Activo en `fiscalai-test` | 7/10 |
| Gemini 2.0 Flash (visual) | ✅ Screenshot OK, análisis limitado por cuota free tier | 6/10 |
| Claude Code CLI (full-claude-code) | ✅ Activo para fiscalai, flujos | 9/10 |
| Dashboard ia.vilarkptl.com | ✅ Online | 7/10 |
| Telegram bot (iaVilarBot) | ✅ Todos los comandos operativos | 8/10 |
| Multi-cuenta API keys | ❌ Solo 1 key Anthropic | 3/10 |
| DeCabeceraTax branch testing | ⚠️ Rama incorrecta en producción | 5/10 |
| pill.ai integración | ❌ No registrado | 0/10 |
| conversation-engine score | ⚠️ Online pero score no verificado post-SQL fix | 6/10 |

### Comparación actual vs Claude Code

| Dimensión | AI Monitor | Claude Code |
|-----------|-----------|-------------|
| Operación autónoma 24/7 | **9/10** | 2/10 |
| Calidad de código generado | 6/10 | **9/10** |
| Debugging interactivo | 3/10 | **9/10** |
| Coordinación multi-proyecto | **9/10** | 4/10 |
| Costo por tarea | **8/10** | 5/10 |
| Visibilidad / trazabilidad | **8/10** | 5/10 |
| Velocidad de respuesta | 5/10 | **9/10** |
| Toolset del agente | 5/10 | **10/10** |
| **Overall** | **7/10** | **9/10** |

---

## Fase 1 — Confiabilidad 🔴 Alta prioridad | ~1 semana

> Con una sola API key de Anthropic, si hay rate limit todos los agentes `full-claude-code` se quedan sin motor. Es el punto de falla más crítico del sistema antes de cualquier mejora de capacidad.

### 1.1 Multi-cuenta API key routing (B3)

- Agregar `ANTHROPIC_API_KEY_2` … `ANTHROPIC_API_KEY_5` al `relay/.env`
- Implementar round-robin en `runClaude()` de `relay/master.js`
- Si una key devuelve 429 → pasar a la siguiente automáticamente
- Registrar qué key se usó en cada sesión (columna en tabla `sessions`)

**Impacto**: elimina el riesgo de downtime total por rate limit. Escala a 5 proyectos concurrentes sin throttling.

### 1.2 Fix permanente DeCabeceraTax rama `testing`

- El repo de producción vive en `claude/ml-backend-69bis-module-5iap0`
- relay-master intenta hacer `git checkout testing` en cada ciclo → falla → outbox push falla → `fiscalai-test` pierde historial
- Fix: crear worktree dedicado en `/var/www/html/vilarkptl.com/DeCabeceraTax-testing` apuntando a rama `testing`
- Actualizar `fiscalai-test.repo` en `projects.json` a la ruta del worktree

**Impacto**: elimina errores de outbox en cada tarea de fiscalai-test.

### 1.3 Activar billing en Google Cloud (Gemini)

- Agregar tarjeta al proyecto Google Cloud con la API key actual
- Costo real: ~$0.001 por imagen con `gemini-2.0-flash`
- Sin billing: el sistema toma screenshots pero no puede analizarlos → loop visual de corrección automática inútil

**Impacto**: el loop de corrección visual automática pasa de 0% efectivo a 100%.

---

## Fase 2 — Tool Server para DeepSeek 🔴 Alta prioridad | ~1 semana

> Es el cambio de mayor impacto en calidad de código. DeepSeek reescribe archivos completos porque no tiene `edit_file` quirúrgico. Esto genera diffs enormes, conflictos git y errores por contexto perdido.

### 2.1 Implementar servidor de herramientas MCP-compatible

Crear `relay/tools-server.js` con las siguientes herramientas que DeepSeek puede invocar via tool-calling:

| Herramienta | Equivalente Claude Code | Descripción |
|-------------|------------------------|-------------|
| `read_file(path, offset?, limit?)` | `Read` | Líneas numeradas, soporte paginación |
| `edit_file(path, old_str, new_str)` | `Edit` | Reemplazo quirúrgico, falla si `old_str` no es único |
| `list_directory(path, pattern?)` | `Bash ls` | Árbol de archivos con tamaños |
| `search_code(pattern, path?, context)` | `Bash grep -n` | Grep con líneas de contexto |
| `web_fetch(url)` | `WebFetch` | HTTP GET |
| `file_exists(path)` | — | Boolean |

El `runDeepSeekAgent()` ya tiene la infraestructura de tool-calling loop en `relay/master.js`. Solo hay que registrar estas herramientas adicionales en el schema de tools que se envía a la API de DeepSeek.

**Impacto**: calidad de código DeepSeek sube de 6/10 a 8/10. Diffs quirúrgicos en vez de reescrituras totales.

### 2.2 Modelo correcto por tipo de tarea

| Tipo de tarea | Modelo actual | Modelo correcto | Ahorro |
|---------------|--------------|-----------------|--------|
| Código complejo (>3 archivos) | Haiku | Claude Sonnet | calidad +3 |
| Código simple / repetible | Claude Sonnet | DeepSeek V4 Pro | -96% costo |
| Coordinación / dispatch | Claude Haiku | Claude Haiku ✅ | — |
| Planning | DeepSeek V4 Pro | DeepSeek V4 Pro ✅ | — |
| Visual analysis | Gemini Flash | Gemini Flash ✅ | — |

**Impacto**: ~60% reducción de costo en tareas simples; mejor calidad en tareas complejas.

---

## Fase 3 — Interactividad 🟡 Media prioridad | ~3-4 días

> Sin esto el agente tiene que adivinar cuando hay ambigüedad → errores evitables que desperdician sesiones enteras.

### 3.1 Protocolo ASK mid-task

Cuando un agente necesita aclaración a mitad de tarea, escribe en su outbox:

```
ASK: ¿Quieres usar MySQL o PostgreSQL para la nueva tabla?
```

relay-master detecta el prefijo `ASK:`, envía a Telegram, pausa el ciclo del proyecto y espera respuesta. El agente continúa con el contexto de la respuesta del usuario.

**Impacto**: elimina ~80% de errores por suposiciones incorrectas del agente.

### 3.2 Reducir poll interval a 3 segundos

El ciclo actual de 15s hace que el sistema se sienta lento para flujos interactivos. Bajar a 3s para proyectos `active` con `ignore_quiet_hours: true`.

**Impacto**: latencia 15s → 3s. El sistema se siente interactivo.

---

## Fase 4 — Contexto persistente 🟡 Media prioridad | ~1 semana

> Mejora significativa para tareas largas. Hasta que Fases 1-3 estén sólidas, el beneficio marginal es menor.

### 4.1 Historial de conversación en DB

- Guardar el array completo de `messages` de cada sesión DeepSeek en la tabla `sessions` (columna `conversation_json`)
- Al iniciar tarea de corrección del mismo proyecto, inyectar las últimas 20 interacciones como contexto
- Visible en dashboard: "sesión retomó contexto de X mensajes anteriores"

### 4.2 Session resume para Claude Code CLI

- El flag `--resume` retoma la última sesión del directorio de trabajo
- Completar la integración en relay-master: tareas de corrección automática reanuden la sesión anterior del mismo proyecto

**Impacto**: agentes que "recuerdan" lo que hicieron → menos re-lectura de archivos, decisiones más consistentes. Estimado: -40% tiempo por tarea en sesiones de corrección.

---

## Fase 5 — Proyectos pendientes 🟡 Media prioridad | Paralelo con Fases 3-4

### 5.1 pill.ai → projects.json

```bash
/addproject pill-ai "Pill AI" https://pill.ai \
  github=vilarkptl-lang/pill.ai \
  repo=/var/www/html/vilarkptl.com/pill-relay \
  branch=claude/add-licensing-system-KsFAw \
  mode=full-claude-code
```

### 5.2 conversation-engine score verificación

- Ejecutar test de scoring post-SQL fix
- Documentar resultado en `relay/AGENT-STATUS.md`

### 5.3 Dashboard métricas `--resume` (B1)

- Mostrar en dashboard: sesiones nuevas vs sesiones reanudadas con `--resume`
- Útil para medir cuánto contexto se está reutilizando efectivamente

### 5.4 CI/CD pipeline básico

- `pytest` + `ruff` para `financial/bot/` en cada push
- Si CI falla → no deploy automático → despachar tarea de fix al agente
- Resultado visible en dashboard y Telegram

---

## Fase 6 — Paralelismo y escala 🟢 Baja prioridad | ~2 semanas

> Solo agrega valor con >10 proyectos activos concurrentes. Complejidad alta, beneficio marginal hasta llegar a ese volumen.

### 6.1 Sub-task dispatch con join/wait

Dentro de una tarea, un agente puede despachar sub-tareas paralelas:

```
DISPATCH_PARALLEL:
  - fiscalai: actualizar endpoints de saldo
  - fiscalai-front: actualizar UI de saldo
WAIT_FOR: fiscalai, fiscalai-front
THEN: deploy y verificación visual
```

relay-master ejecuta ambos en paralelo y continúa solo cuando ambos reportan `STATUS: done`.

### 6.2 Múltiples workers relay-master

- Actualmente single-cluster — con >5 tareas concurrentes hay cola de espera
- Escalar a 2-3 workers con partición por proyecto o por prioridad

---

## Métricas de éxito por fase

| Fase | Métrica clave | Target |
|------|--------------|--------|
| 1 | Uptime sin interrupciones por rate limit | 99.9% |
| 2 | % de commits con diffs <50 líneas (quirúrgicos) | >70% |
| 3 | % de tareas completadas sin errores por suposición incorrecta | >85% |
| 4 | Reducción de tiempo en sesiones de corrección | -40% |
| 5 | Proyectos activos registrados | ≥8 |
| 6 | Tareas concurrentes sin degradación | ≥10 |

---

## Calificación proyectada

| Después de | AI Monitor | vs Claude Code |
|------------|-----------|----------------|
| Hoy        | 7/10      | −2 puntos |
| Fase 1     | 7.5/10    | −1.5 puntos |
| Fases 1+2  | 8.5/10    | −0.5 puntos |
| Fases 1-3  | 9/10      | = empate funcional |
| Fases 1-6  | 9.5/10    | +0.5 (autonomía supera a Claude Code) |

La ventaja final de AI Monitor sobre Claude Code no es la calidad del código individual — ahí Claude Code siempre gana. La ventaja es operar **24/7 sin humano presente**, coordinar **múltiples proyectos simultáneamente**, y reducir el costo por tarea ~30x usando DeepSeek para trabajo repetible.
