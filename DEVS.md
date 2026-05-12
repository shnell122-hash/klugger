# Guía para Desarrolladores — Sistema Relay Multi-Agente

> **vilarkptl.com / ia.vilarkptl.com** — Mayo 2026

---

## Visión del proyecto

Este sistema convierte a Claude Code en un **equipo de desarrollo autónomo**. En lugar de que cada desarrollador ejecute código manualmente, escribes el plan en lenguaje natural y el sistema lo ejecuta solo: crea ramas, escribe código, hace commits, abre PRs, corre tests y despliega.

La diferencia clave con otros sistemas de IA:

- **Cero costos de API** — las sesiones usan tu suscripción personal de Claude (Pro/Max), no una API key de pago. El razonamiento y código corren en DeepSeek V4-Pro/Flash y Gemini Flash.
- **Multi-agente real** — hay agentes especializados por dominio (backend, frontend, bot financiero, testing) que se coordinan solos via `@coordinator`.
- **Observabilidad completa** — cada tarea, costo, commit y error es visible en el dashboard y en Telegram en tiempo real.
- **Memoria acumulada** — cada agente recuerda sesiones anteriores. El contexto no se pierde entre tareas.

### Quick wins inmediatos

| Qué puedes hacer hoy | Cómo |
|---|---|
| Despachar una tarea a producción en 30s | `/tarea fiscalai Agrega endpoint GET /api/health` en Telegram |
| Ver todos los agentes activos en tiempo real | `ia.vilarkptl.com` |
| Que dos agentes se coordinen solos | Escribe `@coordinator flujos necesito X` en tu outbox |
| Auto-fix cuando algo falla | relay-master reintenta 3 veces con auto-crítica |
| Cancelar una tarea en exceso de presupuesto | `project_killed` flag en dashboard |

---

## Arquitectura en una página

```
Tú (Telegram o terminal)
    │
    ├─ /tarea [proyecto] [descripción]    ←─ forma más rápida
    └─ claude (en servidor)               ←─ forma más poderosa
         │
         │  ANTHROPIC_BASE_URL=http://localhost:4000
         ▼
    LiteLLM proxy (puerto 4000)
         │
         ├─ DeepSeek V4-Pro   (planning, código complejo)
         ├─ DeepSeek Flash    (ACKs, tareas simples)
         └─ Gemini Flash      (visión, screenshots, PDFs)
         │
         ▼
    relay-master (Node.js, PM2)
         │  poll inbox.md cada 15s
         │  spawn Claude Code CLI por tarea
         │
         ├─► agente fiscalai   (backend fiscal — DeCabeceraTax)
         ├─► agente flujos      (bot financiero — financial/bot)
         ├─► agente fiscalai-front (frontend)
         ├─► agente coordinator (routing @coordinator)
         └─► agente ai-monitor  (dashboard + relay)
              │
              ▼
    Git: commit → push → GitHub
    PM2: restart automático post-deploy
    Telegram: notificación con resultados
    Dashboard: ia.vilarkptl.com (Socket.io)
```

---

## Setup inicial (una sola vez por desarrollador)

### Paso 1 — Acceso al servidor

Abre en tu navegador:
```
http://143.198.228.78:3030/terminal
```

Ingresa con tu usuario y contraseña (te los da Germán).

> Alternativa: SSH `ssh tuusuario@143.198.228.78`

### Paso 2 — Autenticarte con tu cuenta Claude

En la terminal del servidor:
```bash
claude auth login
```

Aparece un enlace. Ábrelo en tu navegador, inicia sesión con **tu cuenta Claude Pro o Max personal**. Listo — el token queda guardado en el servidor bajo tu usuario.

> **¿Por qué tu cuenta personal?** Las sesiones usan tu suscripción (sin cargo extra), no una API key de pago. Claude Code corre igual que en tu máquina local.

### Paso 3 — Configurar el proxy (cero API costs)

```bash
echo 'export ANTHROPIC_BASE_URL=http://localhost:4000' >> ~/.bashrc
echo 'export LITELLM_BASE_URL=http://localhost:4000' >> ~/.bashrc
source ~/.bashrc
```

Esto hace que Claude Code use DeepSeek V4-Pro en lugar de Anthropic API. Misma calidad, sin cargo a tu cuenta.

### Paso 4 — Verificar

```bash
claude --version          # debe mostrar la versión instalada
claude -p "hola"          # respuesta rápida vía proxy
pm2 status | grep online  # relay-master y financial-bot deben estar online
```

---

## Cómo despachar tareas

### Opción A — Telegram (más rápido)

Envía al bot de Telegram del equipo:

```
/tarea fiscalai Agrega endpoint GET /api/facturas con paginación
/tarea flujos Corrige el flujo de SPEI cuando el monto es cero
/tarea fiscalai-front Actualiza el formulario de RFC con validación en tiempo real
```

El relay-master recibe la tarea, la ejecuta y te responde con los resultados en ~5 minutos.

### Opción B — Claude Code en el servidor (más poderoso)

Para tareas complejas que requieren diseño iterativo:

```bash
# Iniciar nuevo chat
claude

# Continuar un chat anterior
claude --continue

# Ver chats recientes
claude --list-sessions
```

Cuando tengas el plan, despáchalo:

```bash
despachar fiscalai
# pega el plan, presiona Ctrl+D
# relay-master lo ejecuta automáticamente
```

### Opción C — Editar inbox directamente

```bash
nano /var/www/html/vilarkptl.com/ai-monitor/relay/inbox.md
# escribe la tarea, guarda
# relay-master la detecta en los próximos 15 segundos
```

---

## Cómo conectar un nuevo proyecto al relay-master

### 1. Agrega el proyecto a `relay/projects.json`

```json
{
  "id": "mi-proyecto",
  "name": "Mi Proyecto",
  "mode": "full-claude-code",
  "claude_model": "claude-sonnet-4-6",
  "use_cli_proxy": true,
  "inbox":  "/ruta/al/repo/relay/inbox-mi-proyecto.md",
  "outbox": "/ruta/al/repo/relay/outbox-mi-proyecto.md",
  "repo":   "/ruta/al/repo",
  "branch": "main",
  "github": "org/repo",
  "url":    "https://mi-proyecto.com",
  "active": true
}
```

Campos importantes:
- `use_cli_proxy: true` → usa DeepSeek en lugar de Anthropic API
- `mode: "full-claude-code"` → agente con acceso completo a archivos y git
- `post_deploy_cmd` → comando que corre después de cada deploy (ej. `pm2 restart mi-app`)
- `working_dir` → subdirectorio si el proyecto vive dentro del repo (ej. `financial/bot`)

### 2. Crea el prompt del agente

```bash
nano /var/www/html/vilarkptl.com/ai-monitor/relay/agents/mi-proyecto.md
```

Estructura mínima:
```markdown
# Agente — Mi Proyecto

Eres el agente de desarrollo para [descripción].

## Especialización
- [stack técnico]
- Repo: /ruta/al/repo
- Branch: main

## Reglas
1. Lee el código antes de modificarlo
2. Un commit por funcionalidad
3. Si necesitas otro agente: escribe `@coordinator [agente] [qué necesitas]`

## Formato de outbox obligatorio
STATUS: done|partial|blocked
CHANGED: archivo:linea
DEPLOYED: yes|no
PENDING: descripción
USER_REQUIRED: no
```

### 3. Crea los archivos de inbox/outbox

```bash
touch /ruta/al/repo/relay/inbox-mi-proyecto.md
touch /ruta/al/repo/relay/outbox-mi-proyecto.md
git add relay/inbox-mi-proyecto.md relay/outbox-mi-proyecto.md
git commit -m "relay: agregar inbox/outbox mi-proyecto"
git push origin main
```

### 4. Reinicia relay-master

```bash
pm2 restart relay-master
pm2 logs relay-master --lines 5 --nostream
# debe aparecer: "mi-proyecto: inbox vacío — esperando tarea"
```

---

## Agentes disponibles hoy

| ID | Proyecto | Stack | Qué puede hacer |
|----|----------|-------|------------------|
| `fiscalai` | fiscalai.mx backend | Node.js, MySQL, SAT | APIs, CFDI, endpoints, migraciones |
| `fiscalai-front` | fiscalai.mx frontend | HTML/CSS/JS vanilla | UI, formularios, páginas |
| `flujos` | flujos.fiscalai.mx | Node.js, LangGraph, Telegram | Bot financiero, SPEI, IAS |
| `coordinator` | ia.vilarkptl.com | Node.js | Routing entre agentes |
| `ai-monitor` | ia.vilarkptl.com | Node.js, Express, Socket.io | Dashboard, relay, monitoreo |
| `finbot-tester` | financial/bot | Node.js | Tests automatizados |
| `finbot-verifier` | financial/bot | Node.js | Verificación continua |

---

## Modelos que usa el sistema

| Tarea | Modelo | Por qué |
|-------|--------|----------|
| Planning, código complejo | DeepSeek V4-Pro | Mejor razón/costo para código |
| ACKs, tareas rápidas, routing | DeepSeek Flash | Ultra rápido y barato |
| Visión, screenshots, PDFs, multimodal | Gemini Flash | Mejor modelo visual gratuito |
| Claude Code CLI (razonamiento de agentes) | Via proxy → DeepSeek V4-Pro | Cero API cost |

> **Sin Anthropic API key.** Toda la inferencia va por DeepSeek o Gemini. Las sesiones de Claude Code usan tu suscripción personal (Pro/Max).

---

## Dashboard — ia.vilarkptl.com

| Tab | Qué muestra |
|-----|-------------|
| **Eventos** | Cada tool call de cada agente en tiempo real |
| **Sesiones** | Duración, costo y estado de cada tarea |
| **Costos** | Gasto por agente, por día, por modelo |
| **Alertas** | Sesiones sin cambios, deploys fallidos, budget excedido |
| **Dispatch** | Cola de tareas pendientes y despachadas |

---

## Coordinación entre agentes

Si un agente necesita que otro haga algo, escribe en su outbox:

```
@coordinator flujos necesito que el bot acepte archivos XLSX — 
  actualmente solo procesa imágenes. Necesito que DocumentIntelligenceAgent
  detecte hojas de cálculo y extraiga transacciones.
```

relay-master detecta el `@coordinator` y despacha automáticamente al agente correcto. Sin que tú hagas nada.

---

## Troubleshooting rápido

```bash
# Agente no responde en 35min
pm2 logs relay-master --lines 50 --nostream | grep [id-proyecto]

# financial-bot crashea
pm2 logs financial-bot --lines 20 --nostream
cd financial/bot && npm install  # si hay módulos faltantes

# relay-master no detecta inbox
pm2 restart relay-master

# Ver estado de todos los agentes
cat /var/www/html/vilarkptl.com/ai-monitor/relay/AGENT-STATUS.md

# Cancelar una tarea que está quemando presupuesto
# En dashboard → Proyectos → Kill switch
```

---

## Ventajas vs desarrollo tradicional

| Desarrollo tradicional | Con relay-master |
|------------------------|------------------|
| Escribes código tú mismo | Describes qué quieres, el agente lo implementa |
| Un dev por tarea | Múltiples agentes en paralelo |
| PR manual, review manual | Commit + push + PR automáticos |
| Contexto se pierde entre sesiones | Memoria acumulada por agente |
| Errors requieren debug manual | Auto-fix loop con 3 intentos + Telegram alert |
| Costo de API por cada llamada | Zero API cost (DeepSeek + suscripción personal) |
| Deploy manual | post_deploy_cmd automático |

---

*Última actualización: 2026-05-12 — ia.vilarkptl.com*
