# DIAGNÓSTICO DEL SISTEMA — AI Relay & Agent Orchestration
> Generado automáticamente el 2026-05-15 | Estado del sistema a la fecha de análisis

---

## 1. Resumen Ejecutivo

El sistema es una plataforma de orquestación de agentes IA construida sobre Node.js, PM2 y GitHub, diseñada para automatizar el desarrollo de software a través de múltiples proyectos simultáneos. En su núcleo, un proceso `relay-master.js` (3,296 líneas) actúa como orquestador central: detecta tareas en archivos `inbox-[proyecto].md`, despacha Claude Code CLI o DeepSeek V4-Pro como agentes ejecutores, y reporta resultados al dashboard en tiempo real vía Socket.io. El sistema se encuentra **operativo y maduro en sus fundamentos**: control de costos (kill-switch global + por proyecto), seguridad (rate limiting, quiet hours, watchdog por proceso), integración con Telegram, visual check post-deploy con Chromium+Gemini, y soporte multi-modo (plan-execute, full-claude-code, deepseek-agent). Los principales pendientes son de naturaleza operacional: resolver la divergencia crítica de Git en el servidor, controlar el uso de swap (94%), detener el crash loop de `vilar-legal-os-v59`, y completar los merges de las ramas de desarrollo activas.

---

## 2. Árbol de Agentes

```
SISTEMA DE AGENTES IA
│
├── RELAY TIER (Orchestration Layer)
│   │
│   ├── relay-master.js [PM2: relay-master] ← NÚCLEO
│   │   ├── Poll cada 15s → inbox-[proyecto].md
│   │   ├── Modo plan-execute   → DeepSeek V4 planifica → Claude CLI ejecuta
│   │   ├── Modo full-claude-code → Claude CLI (Max subscription, $0)
│   │   ├── Modo deepseek-agent → DeepSeek V4-Pro tool loop (bash/git/read/write)
│   │   ├── runDeepSeekCodeFix  → corrector automático de errores
│   │   ├── Post-deploy visual check → Chromium + Gemini Flash (hasta 3 iter)
│   │   ├── Outbox watchdog (35 min) → alerta al coordinator
│   │   ├── Adaptive timeout → reduce a la mitad por fallo consecutivo
│   │   └── checkSelfReload → zero-downtime auto-update
│   │
│   ├── chat-agent.js [PM2: claude-chat-bot] ← INTERFAZ DE USUARIO
│   │   ├── GrammY Telegram bot
│   │   ├── Tools: bash, git_commit, read_file, write_file
│   │   ├── Tools: visual_check, pm2_action, github_create_repo
│   │   ├── Confirmation system (inline keyboard para comandos peligrosos)
│   │   ├── /chat [proyecto] → sesión con contexto de repo
│   │   ├── /nuevo → wizard para crear proyecto
│   │   └── DeepSeek V4-Pro para tareas de código
│   │
│   ├── code-reviewer.js [PM2: code-reviewer]
│   │   ├── DeepSeek V3
│   │   ├── Poll git log cada 5 min
│   │   └── Alertas automáticas en bugs detectados
│   │
│   └── visual-check.js
│       ├── Chromium headless
│       └── Gemini Flash → veredicto JSON (APROBADO / NECESITA_CORRECCIÓN)
│
├── AGENTES ACTIVOS (relay/projects.json)
│   │
│   ├── coordinator     [Haiku 4.5, plan-execute]   ← dispatcher / orquestador lógico
│   ├── ai-monitor      [Haiku 4.5, full-claude]    ← dashboard redesign + auditoría
│   ├── fiscalai        [Sonnet 4.6, plan-execute]  ← backend SAT + MySQL
│   ├── fiscalai-front  [Sonnet 4.6, full-claude]   ← frontend HTML/CSS/JS
│   ├── flujos          [Sonnet 4.6, full-claude]   ← workflows internos
│   ├── fiscalai-test   [Sonnet 4.6, plan-execute]  ← testing env + visual check
│   ├── finbot-tester   [Sonnet 4.6, full-claude]   ← tester automatizado financial-bot
│   ├── finbot-verifier [Sonnet 4.6, full-claude]   ← verificador continuo
│   └── finbot-coordinator [Sonnet 4.6, full-claude] ← coordinación financial
│
├── AGENTES INACTIVOS (sin inbox/outbox configurado)
│   ├── credito
│   ├── voltic
│   ├── ocr
│   ├── tareas
│   ├── noticias
│   └── telegram-inversiones
│
└── FINANCIAL BOT TIER (financial/bot/)
    │
    ├── financial-bot.js [PM2: financial-bot] ← GrammY state machine
    │
    ├── DocumentIntelligenceAgent   [gemini-1.5-flash, GOOGLE_API_KEY]
    ├── InvoiceAgent (fallback)     [deepseek-pro, DEEPSEEK_API_KEY]
    ├── VisionAgent (fallback OCR)  [Gemini → DeepSeek fallback]
    ├── TransactionOrchestrator     [DEEPSEEK_PRO_MODEL]
    ├── ResponseGen                 [DEEPSEEK_PRO_MODEL, ~80% templates]
    ├── Verifier                    [rule-based, sin LLM]
    ├── BalanceManager              [MySQL]
    ├── BankingManager              [MySQL]
    ├── ContextManager              [historial de mensajes]
    ├── Calculator                  [fees/totales]
    └── Parser                      [extracción de montos]
```

---

## 3. Stack Tecnológico

| Capa | Componente | Versión / Detalle |
|------|-----------|-------------------|
| **Runtime** | Node.js | relay, backend, bots |
| **Runtime** | Python | simulaciones financial bot, Telethon bridge |
| **Web Framework** | Express.js | backend API REST (puerto 3010) |
| **Bot Framework** | GrammY | relay/chat-agent.js + financial/bot.js |
| **Realtime** | Socket.io | dashboard ia.vilarkptl.com |
| **Frontend (monitor)** | HTML/CSS/JS vanilla | frontend/ — glassmorphism + dark/light |
| **Frontend (financial)** | React + Vite | dashboard-financial/ (puerto 3020) |
| **LLM principal** | Claude (Max subscription) | CLI, $0 costo por API |
| **LLM planeación** | DeepSeek V4-Pro/Flash | API, costo bajo, coding + planning |
| **LLM visión** | Gemini Flash | screenshots, visual check |
| **LLM code-review** | DeepSeek V3 | code-reviewer (auto-alertas) |
| **LLM proxy** | LiteLLM | puerto 4000, chains kptl-chat/fast/reasoning — instalado pero deshabilitado en flujo principal |
| **Base de datos** | MySQL / MariaDB | DB: ai_monitoring, 8 tablas |
| **Process manager** | PM2 | fork mode, autorestart, 256MB max RAM relay-master |
| **VCS** | GitHub (org: vilarkptl-lang) | webhook-based, per-project branch tracking |
| **Infraestructura** | DigitalOcean droplet | 143.198.228.78, 3.8 GB RAM |
| **OS** | Ubuntu / Debian | Apache2 (mod_proxy + mod_proxy_wstunnel) |
| **Testing** | Nginx | testing.fiscalai.mx |
| **CI/Visual** | Chromium headless | chromium → Gemini Flash → JSON verdict |
| **Tunneling** | Apache2 reverse proxy | ia.vilarkptl.com → localhost:3010 |

### Tablas de base de datos (ai_monitoring)

| Tabla | Propósito |
|-------|-----------|
| `events` | Tool calls de agentes |
| `sessions` | Sesiones por agente/proyecto |
| `costs` | Costos por token |
| `providers` | API keys (últimos 6 chars) |
| `projects` | Proyectos registrados |
| `screenshots` | Capturas de visual check |
| `relay_alerts` | Alertas del sistema (desde migrate-v6.sql) |
| `project_monthly_budget` | Kill-switch de presupuesto por proyecto |

---

## 4. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DEVELOPER INTERFACE                              │
│                                                                     │
│  Telegram Bot (/chat, /nuevo, comandos)  ←→  claude-chat-bot       │
│  inbox-[proyecto].md (commits en GitHub)  ←→  relay-master          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                               │
│                                                                     │
│  relay-master.js (PM2: relay-master)                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  poll 15s → detecta inbox.md nuevo/modificado               │   │
│  │      │                                                       │   │
│  │      ├── plan-execute  → DeepSeek V4 planifica              │   │
│  │      │       └──────────────► Claude CLI ejecuta            │   │
│  │      │                                                       │   │
│  │      ├── full-claude-code → Claude CLI (Max, $0)            │   │
│  │      │                                                       │   │
│  │      └── deepseek-agent → DeepSeek V4-Pro tool loop         │   │
│  │                  (bash / read_file / write_file / git)       │   │
│  │                                                       │      │   │
│  │  post-deploy → visual-check.js (Chromium + Gemini)   │      │   │
│  │             → auto-dispatch corrective (hasta 3x)    │      │   │
│  └───────────────────────────────────────────────────────┘   │   │
│                             │                                    │   │
│         safety controls     │                                    │   │
│         ─────────────────   │                                    │   │
│         kill-switch global  │                                    │   │
│         rate limit 3/h      │                                    │   │
│         quiet hours 11p-8a  │                                    │   │
│         watchdog 25min      │                                    │   │
│         adaptive timeout    │                                    │   │
└─────────────────────────────┼────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
┌─────────────────┐  ┌──────────────┐  ┌────────────────────┐
│  GitHub repos   │  │  MySQL DB    │  │  backend/server.js │
│  (git commit    │  │  ai_monitoring│  │  Express + Socket.io│
│   + push)       │  │  (costos,     │  │  puerto 3010        │
│                 │  │   sesiones,   │  │       │             │
└─────────────────┘  │   alertas)    │  │       ▼             │
                     └──────────────┘  │  ia.vilarkptl.com   │
                                       │  (dashboard frontend)│
                                       └────────────────────┘

FINANCIAL BOT (paralelo, independiente)
────────────────────────────────────────
Telegram → financial-bot.js → agentes especializados
           (GrammY state machine)   (Gemini, DeepSeek, rules)
                    │
                    └── MySQL (balances, transacciones)
```

---

## 5. Estado de Proyectos

| ID | Modelo | Modo | Repo | Branch | Estado |
|----|--------|------|------|--------|--------|
| `coordinator` | Haiku 4.5 | plan-execute | DeCabeceraTax | claude/ml-backend-69bis-module-5iap0 | ✅ Activo |
| `ai-monitor` | Haiku 4.5 | full-claude-code | ai-monitor | main | ✅ Activo |
| `fiscalai` | Sonnet 4.6 | plan-execute | DeCabeceraTax | claude/ml-backend-69bis-module-5iap0 | ✅ Activo |
| `fiscalai-front` | Sonnet 4.6 | full-claude-code | DeCabeceraTax | claude/ml-backend-69bis-module-5iap0 | ✅ Activo |
| `flujos` | Sonnet 4.6 | full-claude-code | ai-monitor | main | ✅ Activo |
| `fiscalai-test` | Sonnet 4.6 | plan-execute | DeCabeceraTax | testing | ✅ Activo |
| `finbot-tester` | Sonnet 4.6 | full-claude-code | ai-monitor | main | ✅ Activo |
| `finbot-verifier` | Sonnet 4.6 | full-claude-code | ai-monitor | main | ✅ Activo |
| `finbot-coordinator` | Sonnet 4.6 | full-claude-code | ai-monitor | claude/financial-multiagent-system-YwtYQ | ✅ Activo |
| `credito` | — | — | — | — | ⛔ Inactivo |
| `voltic` | — | — | — | — | ⛔ Inactivo |
| `ocr` | — | — | — | — | ⛔ Inactivo |
| `tareas` | — | — | — | — | ⛔ Inactivo |
| `noticias` | — | — | — | — | ⛔ Inactivo |
| `telegram-inversiones` | — | — | — | — | ⛔ Inactivo |

> **Nota Haiku vs Sonnet**: Haiku 4.5 mostró 0 tool calls en tareas de código complejas. Solo usar para `coordinator` y `ai-monitor` (tareas de orquestación). Todo código real → Sonnet 4.6.

---

## 6. Planes Completados

- ✅ **P1: Integración DeepSeek V4-Flash/Pro** — Reemplaza llamadas Anthropic API en planeación y coding (costo reducido drásticamente)
- ✅ **P2: Cero costo Anthropic API** — Claude solo corre vía Max subscription ($0 por uso)
- ✅ **Redesign dashboard glassmorphism** — dark/light toggle, interfaz moderna
- ✅ **Auth/login en dashboard** — ia.vilarkptl.com protegido con bcrypt (branch onboard-ai-monitor)
- ✅ **LiteLLM proxy instalado** — puerto 4000, chains configuradas (disponible, no activo en flujo principal)
- ✅ **Multi-account spending tracking** — kill-switch $100/proyecto/mes en MySQL
- ✅ **Adaptive timeout** — reduce a la mitad por fallo consecutivo (mínimo 5 min)
- ✅ **Auto-stop journal** — detiene agente tras 3 fallos consecutivos
- ✅ **Budget cap por tarea** — campo `budget_usd_max` en inbox
- ✅ **Rate limiting** — 3 despachos/hora por proyecto
- ✅ **Quiet hours** — 11pm–8am MX sin despachos
- ✅ **Outbox watchdog** — alerta al coordinator tras 35 min sin update
- ✅ **Pre-run SHA + degradation guard** — captura hash antes de cada tarea, genera comando de revert
- ✅ **runDeepSeekCodeFix** — corrector automático de errores de código post-fallo
- ✅ **Telegram confirmation system** — inline keyboard para comandos peligrosos
- ✅ **visual_check tool** en chat-agent (Chromium + Gemini Flash)
- ✅ **pm2_action + github_create_repo** tools en chat-agent
- ✅ **Post-deploy visual check loop** — Chromium+Gemini, auto-dispatch correctivo hasta 3 iteraciones
- ✅ **runDeepSeekAgent mode** — DeepSeek V4-Pro tool loop (bash, read_file, write_file, git_commit)
- ✅ **callDeepSeekWithTools** — function calling compatible con OpenAI API
- ✅ **fiscalai-test agent prompt** — entorno testing con visual check integrado
- ✅ **Telethon bridge** — testing automatizado de financial bot
- ✅ **DocumentIntelligenceAgent** (Gemini), **TransactionOrchestrator** (DeepSeek), **LangGraph FileFlowGraph**
- ✅ **Code reviewer** (DeepSeek V3, auto-alertas en commits nuevos)
- ✅ **Multi-dev broadcast** — notificaciones Telegram a múltiples desarrolladores
- ✅ **checkSelfReload** — zero-downtime auto-update cuando master.js cambia en disco

---

## 7. Planes Pendientes (Priorizados)

### CRÍTICOS — Bloquean estabilidad de producción

| # | Tarea | Justificación |
|---|-------|---------------|
| C1 | **Añadir 1 GB swap** | Swap al 94% (1.9/2.0 GB) — OOM inminente puede matar relay-master |
| C2 | **Detener crash loop `vilar-legal-os-v59`** | 146k+ reinicios consume RAM y logs sin ningún beneficio |
| C3 | **Resolver divergencia Git en servidor** | 93 commits locales adelante + 54 remotos — cualquier pull force destruye trabajo |
| C4 | **pm2-logrotate** | Sin rotación de logs a 50 MB máximo, disco en riesgo |

### ALTA PRIORIDAD — Merges pendientes

| # | Tarea | Justificación |
|---|-------|---------------|
| M1 | **Merge `claude/agent-monitoring-dashboard-4v8iq` → main** | 59 commits listos: visual check loop + deepseek-agent mode + chat-agent tools |
| M2 | **Merge `deploy/financial-llm-complete` → main (selectivo)** | Solo archivos `financial/bot/` — DeepSeek V4 + Gemini migration |
| M3 | **Crear PR `claude/onboard-ai-monitor-subproject-zXvki`** | Auth + LiteLLM pendiente de review |
| M4 | **git prune en servidor** | Loose objects warning — salud del repo |

### MEDIA PRIORIDAD — Features de resiliencia

| # | Tarea | Justificación |
|---|-------|---------------|
| F1 | **P4: `selectClaudeModel()`** — routing inteligente vía `claude_model_fast` | Optimiza uso Haiku vs Sonnet por tipo de tarea |
| F2 | **P5: LiteLLM en master.js** (`callViaLiteLLM()`) | Centraliza fallback LLM chain; copia patrón ya probado en chat-agent.js |
| F3 | **Verificar IDs de modelos DeepSeek** (`DEEPSEEK_FLASH_MODEL` / `DEEPSEEK_PRO_MODEL`) | Posible fallo silencioso si los IDs cambiaron |
| F4 | **Agregar Admin API keys** (ANTHROPIC_ADMIN_KEY_GVA, ANTHROPIC_ADMIN_KEY_LEASINGAGATA) | Permite monitoring de uso de cuentas Max |

### BAJA PRIORIDAD — Expansión

| # | Tarea | Justificación |
|---|-------|---------------|
| E1 | **P3: Quiet hours exceptions + rate limiting tuning** | Casos de urgencia real bloqueados por reglas genéricas |
| E2 | **P6: Claude CLI proxy shadow test** | `use_cli_proxy` flag ya en projects.json — solo activar y medir |
| E3 | **Playwright integration** | Mejor que Chromium headless para SPAs con router |
| E4 | **Configurar TELEGRAM_EXTRA_CHAT_IDS** | Broadcast a más developers |
| E5 | **Onboarding proyectos inactivos** (credito, voltic, ocr, tareas, noticias) | Expansión de capacidad operativa |
| E6 | **Testing real-world `deepseek-agent` mode** | Modo nuevo, sin validación en producción |

---

## 8. Problemas de Git — Análisis y Plan de Resolución

### Estado actual del servidor

```
main local:  93 commits adelante de origin/main
origin/main: 54 commits adelante de main local
             ↓
         DIVERGENCIA — no es un fast-forward
```

### Ramas activas con merges pendientes

| Branch | Commits | Contenido | Conflicto potencial |
|--------|---------|-----------|---------------------|
| `claude/agent-monitoring-dashboard-4v8iq` | 59 | visual check loop, deepseek-agent, chat-agent tools | relay/master.js |
| `claude/financial-multiagent-system-YwtYQ` | ? | mejoras financial bot | financial/bot/ |
| `deploy/financial-llm-complete` | ? | DeepSeek V4 + Gemini migration | financial/bot/ |
| `claude/onboard-ai-monitor-subproject-zXvki` | ? | auth + LiteLLM | backend/, frontend/ |

### ⚠️ Zona de conflicto crítica: `relay/master.js`

`relay/master.js` fue tocado por múltiples ramas. Cualquier merge sin resolución manual puede sobrescribir funcionalidades.

### Plan de resolución (en orden)

```bash
# PASO 1: Leer estado actual antes de cualquier acción
cat relay/AGENT-STATUS.md
git log --oneline main..HEAD | head -20
git log --oneline HEAD..origin/main | head -20

# PASO 2: Hacer backup del estado local
git stash list
git branch backup/server-main-$(date +%Y%m%d) HEAD

# PASO 3: Merge del branch más antiguo primero (agent-monitoring)
git fetch origin
git merge origin/claude/agent-monitoring-dashboard-4v8iq --no-ff
# Si hay conflicto en relay/master.js: revisar manualmente (TOMAR VERSIÓN DEL BRANCH)

# PASO 4: Merge financial (solo archivos financial/bot/)
git checkout origin/deploy/financial-llm-complete -- financial/bot/

# PASO 5: Resolver divergencia con origin/main
git merge origin/main --no-ff
# Conflictos esperados en: relay/master.js, relay/projects.json
# relay/projects.json: FUSIONAR MANUALMENTE (ambas versiones pueden tener entradas válidas)

# PASO 6: Push tras resolver
git push origin main

# PASO 7: Limpiar objetos sueltos
git prune
git gc --auto
```

### Reglas anti-degradación

- NUNCA ejecutar `git reset --hard origin/main` sin hacer backup primero
- Verificar SIEMPRE: `git log --oneline HEAD..origin/main` antes de cualquier reset
- Si hay commits locales no pusheados, mergearlos antes de cualquier operación destructiva

---

## 9. Comparación con Claude Code Estándar

### Tabla de calificación (1–10)

| Dimensión | Este Sistema | Claude Code (nativo) | Ventaja |
|-----------|:-----------:|:--------------------:|----------|
| **Latencia por tarea** | 7 | 9 | Claude Code — overhead del relay (poll 15s, DeepSeek plan) |
| **Costo operativo** | 10 | 6 | Este sistema — $0 API (Max subscription) + DeepSeek barato |
| **Eficiencia multitarea** | 9 | 5 | Este sistema — múltiples proyectos paralelos nativos |
| **Seguridad / guardrails** | 9 | 6 | Este sistema — kill-switch, rate limit, watchdog, quiet hours |
| **Calidad de código** | 7 | 9 | Claude Code — sin overhead de traducción plan→ejecución |
| **Observabilidad** | 9 | 4 | Este sistema — dashboard, alertas, costos, visual check |
| **Recuperación de errores** | 8 | 5 | Este sistema — adaptive timeout, auto-retry, DeepSeek code fix |
| **Experiencia de dev** | 7 | 9 | Claude Code — UX nativa más fluida; este tiene Telegram pero más fricción |
| **Capacidad de escala** | 8 | 3 | Este sistema — N proyectos simultáneos con un solo proceso |

**Puntuación global**: Este sistema **8.2/10** vs Claude Code nativo **6.2/10** (en escenario multi-proyecto)

### Análisis narrativo

#### Fortalezas de este sistema vs Claude Code

**Costo**: La mayor ventaja. Claude Code vía Max subscription a $0 por API, combinado con DeepSeek V4 para tareas de planeación y código repetitivo, hace que el sistema sea prácticamente gratuito a escala. Claude Code nativo a $3–15/millón de tokens se vuelve costoso en orquestación continua.

**Multi-proyecto paralelo**: Claude Code está diseñado para un desarrollador en una sesión. Este sistema corre 9+ proyectos simultáneos con aislamiento completo, rate limiting por proyecto, y presupuesto independiente. Es fundamentalmente una arquitectura diferente.

**Observabilidad**: El dashboard en tiempo real, las alertas automáticas (`commit_quality`, `session_low_yield`, `deploy_verify_fail`), y el tracking de costos por sesión/proyecto no tienen equivalente en Claude Code nativo.

**Recuperación de errores**: El adaptive timeout, auto-stop journal, runDeepSeekCodeFix, y el visual check loop post-deploy crean un ciclo de auto-corrección que Claude Code no tiene por defecto.

#### Debilidades vs Claude Code

**Calidad de código en tareas complejas**: El modo `plan-execute` introduce una capa de traducción (DeepSeek planifica → Claude ejecuta). En tareas de refactoring complejo o arquitectura, la interpretación del plan puede introducir errores que Claude Code nativo evitaría por tener el contexto completo.

**Latencia**: El poll de 15 segundos + tiempo de planeación DeepSeek añade latencia vs la respuesta inmediata de Claude Code interactivo. Para tareas urgentes, 15s de espera más 2-3min de planificación puede ser frustrante.

**Experiencia de desarrollador**: Claude Code tiene UX integrada, diff visualization, y contexto de conversación natural. Editar un `inbox.md` y esperar el outbox es más tosco que una sesión interactiva, aunque el canal Telegram mitiga parcialmente esto.

**Complejidad operacional**: 3,296 líneas en `master.js`, múltiples modos de ejecución, y estado distribuido entre MySQL + archivos .md es una carga cognitiva significativa para mantener.

---

## 10. Capacidad Técnica Actual

El sistema puede, en este momento:

### Automatización de desarrollo
- Recibir tareas de código vía Telegram o inbox.md y ejecutarlas sin intervención humana
- Planificar con DeepSeek V4 y ejecutar con Claude CLI (Max, $0) en modo híbrido
- Ejecutar agentes DeepSeek V4-Pro con herramientas nativas (bash, git, leer/escribir archivos)
- Detectar cambios en su propio código y reiniciarse sin downtime (`checkSelfReload`)

### Control y seguridad
- Limitar gasto por proyecto a $100/mes con kill-switch automático
- Bloquear commits con .env o node_modules incluidos
- Detener agentes atascados (watchdog 25min + SIGTERM/SIGKILL)
- Revertir código automáticamente si el deploy falla (SHA pre-run + revert command)
- Respetar horario laboral (sin despachos 11pm–8am)

### Observabilidad
- Dashboard en tiempo real (ia.vilarkptl.com) con sesiones, costos, alertas
- Code review automático con DeepSeek V3 en cada commit nuevo
- Visual check post-deploy (Chromium → Gemini Flash → veredicto en JSON)
- Alertas Telegram a desarrolladores con opciones de acción inline

### Procesamiento de documentos financieros
- Clasificar y extraer datos de documentos/imágenes vía Telegram
- Routing inteligente según tipo de mensaje (documento, texto, consulta)
- Gestión de balances y transacciones bancarias en MySQL
- Fallback multi-LLM (Gemini → DeepSeek → reglas) para máxima resiliencia

### Interfaz conversacional
- Chat directo con contexto de repo vía Telegram (`/chat [proyecto]`)
- Creación de nuevos proyectos con wizard interactivo (`/nuevo`)
- Ejecución de comandos peligrosos con confirmación explícita

---

## 11. Proceso de Onboarding para Nuevo Desarrollador

### Paso 1: Acceso e infraestructura
```bash
# 1.1 Obtener credenciales SSH
cat /opt/kptl-secrets/server-credentials.txt  # solo root en servidor

# 1.2 Conectar al servidor
ssh root@143.198.228.78

# 1.3 Verificar estado PM2
pm2 status
pm2 logs relay-master --lines 50
```

### Paso 2: Entender la arquitectura
1. Leer `CLAUDE.md` completo (este archivo de referencia)
2. Leer `relay/AGENT-STATUS.md` — estado actual de todos los agentes
3. Ver `relay/projects.json` — proyectos activos, modelos, ramas
4. Ver `relay/master.js` líneas 1–100 — constantes y configuración global

### Paso 3: Acceso al dashboard
1. Abrir `https://ia.vilarkptl.com`
2. Login con credenciales (hash bcrypt en `/opt/kptl-secrets/api-keys.env`)
3. Familiarizarse con tabs: Events, Sessions, Costs, Alerts, Screenshots

### Paso 4: Configurar Telegram
```bash
# Verificar que tu Telegram ID está en relay/telegram-users.json
cat relay/telegram-users.json

# Si no está, agregar tu ID y hacer push
# Después de reiniciar claude-chat-bot, enviar /start al bot
```

### Paso 5: Primera tarea de prueba
```bash
# Opción A: vía inbox.md
cat > relay/inbox-ai-monitor.md << 'EOF'
# TAREA: Verificar estado del sistema
Listar los últimos 5 eventos en la tabla events de MySQL y reportar en outbox.

STATUS_CHECK: true
EOF
git add relay/inbox-ai-monitor.md
git commit -m "test: primera tarea de onboarding"
git push origin main
# Esperar ~15 segundos + tiempo de ejecución → ver relay/outbox.md

# Opción B: vía Telegram
# /chat ai-monitor
# Mensaje: "Lista los últimos 5 eventos del dashboard"
```

### Paso 6: Variables de entorno críticas
```bash
# Ver las variables disponibles (sin mostrar valores)
cat relay/.env | grep -oP '^[A-Z_]+='

# Variables obligatorias por subsistema:
# - relay/.env: TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, DEEPSEEK_PRO_MODEL, DEEPSEEK_FLASH_MODEL
# - backend/.env: DB_HOST, DB_USER, DB_PASS, DB_NAME=ai_monitoring
# - financial/bot/.env: ANTHROPIC_API_KEY, GOOGLE_API_KEY, DEEPSEEK_API_KEY
```

---

## 12. Proceso de Nuevo Proyecto

### Opción A: Wizard automático (recomendado)
```
/nuevo en Telegram → seguir el wizard interactivo del claude-chat-bot
```

### Opción B: Manual

#### Paso 1: Agregar entrada en `relay/projects.json`
```json
{
  "mi-proyecto": {
    "model": "claude-sonnet-4-6",
    "mode": "full-claude-code",
    "repo": "nombre-del-repo-en-github",
    "branch": "main",
    "description": "Descripción del proyecto",
    "enabled": true,
    "rate_limit_per_hour": 3,
    "budget_usd_max": 5.0,
    "claude_model_fast": "claude-haiku-4-5"
  }
}
```

#### Paso 2: Crear archivos de comunicación
```bash
touch relay/inbox-mi-proyecto.md
touch relay/outbox-mi-proyecto.md
echo "# Inbox Mi Proyecto\n_Sin tareas pendientes_" > relay/inbox-mi-proyecto.md
```

#### Paso 3: Crear prompt del agente
```bash
# Crear relay/agents/mi-proyecto.md con:
# - Descripción del proyecto
# - Stack tecnológico
# - Convenciones de código
# - Rutas críticas
# - Restricciones
```

#### Paso 4: Clonar workspace
```bash
cd relay/workspaces/
git clone git@github.com:vilarkptl-lang/nombre-del-repo.git mi-proyecto
cd mi-proyecto && git checkout main
```

#### Paso 5: Registrar en base de datos
```bash
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring -e "
  INSERT INTO projects (name, repo, branch, model, status)
  VALUES ('mi-proyecto', 'nombre-del-repo', 'main', 'claude-sonnet-4-6', 'active');
"
```

#### Paso 6: Commitear y reiniciar
```bash
git add relay/projects.json relay/inbox-mi-proyecto.md relay/outbox-mi-proyecto.md relay/agents/mi-proyecto.md
git commit -m "feat: agregar proyecto mi-proyecto"
git push origin main
# relay-master detectará el cambio en projects.json en el siguiente ciclo (15s)
# NO es necesario reiniciar relay-master manualmente
```

---

## 13. Qué le Falta para Superar a Claude Code

### Gap 1: Calidad de razonamiento en contexto largo
Claude Code nativo mantiene conversación iterativa con contexto acumulado. El sistema actual trata cada dispatch como sesión independiente (aunque hay memoria de sesión). En refactorizaciones complejas que requieren múltiples iteraciones de feedback, Claude Code tiene ventaja clara.

**Solución parcial en desarrollo**: P4 `selectClaudeModel()` + mejores prompts de agente con contexto explícito de sesiones previas.

### Gap 2: Interactividad en tiempo real
Claude Code responde en segundos. Este sistema tiene latencia de 15s (poll) + 2-5min (planificación DeepSeek en plan-execute) + tiempo de ejecución. Para debugging interactivo, la diferencia es significativa.

**Mitigación existente**: `claude-chat-bot` con `/chat` reduce a respuesta casi inmediata para tareas conversacionales.

### Gap 3: Modo deepseek-agent sin validación real
El modo `deepseek-agent` (DeepSeek V4-Pro con tool loop) es nuevo y no ha sido probado en producción en tareas complejas. Si DeepSeek comete errores en el tool loop, los guardrails actuales (watchdog, SHA revert) pueden no ser suficientes.

**Acción requerida**: Testing controlado antes de habilitarlo en proyectos críticos.

### Gap 4: LiteLLM no integrado en flujo principal
LiteLLM está instalado (puerto 4000) con chains de fallback (Sonnet→DeepSeek→GPT4o) pero NO se usa en `master.js`. Si Claude Max falla o DeepSeek tiene downtime, no hay fallback automático en el flujo principal.

**Acción requerida**: P5 — integrar `callViaLiteLLM()` copiando patrón de chat-agent.js.

### Gap 5: Testing de integración ausente
No existe suite de tests automáticos del relay en sí. Los cambios en `master.js` se validan solo en producción. Un bug en el orchestrator puede silenciosamente romper todos los proyectos.

**Propuesta**: Tests de integración con mocks de Claude CLI y DeepSeek API para los flujos críticos (dispatch, timeout, kill-switch).

### Gap 6: Observabilidad de calidad de tareas
El sistema mide costos y eventos, pero no tiene métricas de calidad de output (tasa de éxito por tipo de tarea, regresiones introducidas, etc.). Un agente puede estar "completando" tareas con código que no funciona sin que el sistema lo detecte.

**Parcialmente resuelto**: `hasVerifiableArtifact` + visual check post-deploy. Falta métricas longitudinales.

### Gap 7: Documentación del protocolo outbox
El formato de outbox estructurado (STATUS/CHANGED/DEPLOYED/PENDING/USER_REQUIRED) depende de que el agente lo respete. No hay validación automática del formato ni parseado para workflows downstream.

---

## 14. Veredicto Final

### Calificación Global: 8.0 / 10

### Justificación

El sistema ha alcanzado **madurez operacional real** para un uso de producción multi-proyecto. Los fundamentos de orquestación, control de costos, seguridad, y observabilidad están bien implementados y probados. La arquitectura es pragmática: usa la herramienta correcta para cada trabajo (Claude Max para calidad, DeepSeek para velocidad/costo, Gemini para visión), y tiene mecanismos de auto-corrección que van más allá de lo que ofrece Claude Code nativo.

**La puntuación no llega a 9/10 por tres razones concretas:**

1. **Estado operacional frágil** (swap 94%, divergencia Git crítica, crash loop activo): El sistema está un OOM o un `git reset` incorrecto de perder trabajo significativo. Estos problemas CRÍTICOS necesitan resolverse antes de expandir capacidad.

2. **Modo deepseek-agent sin battle-testing**: Es una capacidad nueva que podría ser transformadora (DeepSeek a $0.14/M tokens haciendo trabajo de agente completo) pero aún no validada en producción compleja.

3. **relay/master.js como single point of failure**: 3,296 líneas en un proceso Node.js que gobierna TODO. Si ese proceso se cuelga o tiene un bug, todos los proyectos se detienen. La arquitectura correcta sería worker processes por proyecto, pero requeriría una refactorización mayor.

**El sistema supera a Claude Code en el escenario para el que fue diseñado**: desarrollo autónomo paralelo de múltiples proyectos a costo mínimo con observabilidad completa. Para un solo desarrollador trabajando en un solo proyecto de manera interactiva, Claude Code nativo sigue siendo mejor.

### Próximos pasos inmediatos (por prioridad)

```
HOY:
  1. fallocate -l 1G /swapfile2 && ... swapon /swapfile2
  2. pm2 delete vilar-legal-os-v59
  3. pm2 install pm2-logrotate

ESTA SEMANA:
  4. Resolver divergencia Git (backup → merge branches → push)
  5. Merge claude/agent-monitoring-dashboard-4v8iq → main
  6. git prune en servidor

PRÓXIMA SEMANA:
  7. P5: LiteLLM en master.js
  8. Testing deepseek-agent mode en proyecto sandbox
  9. P4: selectClaudeModel()
```

---

## 15. Brecha de Contexto — Por Qué los Agentes Relay No Tienen el Mismo Contexto que Claude Code Chat

### La causa raíz: el flag `--print`

Cuando relay-master despacha una tarea, ejecuta algo equivalente a:

```bash
claude --print --model claude-sonnet-4-6 "[prompt de tarea]"
```

El flag `--print` convierte a Claude Code en un **procesador de lotes sin estado**. Cada invocación es una sesión nueva desde cero, sin memoria de la conversación anterior. No importa cuántas tareas haya completado el agente antes — cada dispatch es como abrir Claude Code por primera vez.

En contraste, cuando un desarrollador usa Claude Code de manera interactiva, la conversación se acumula en el mismo contexto: el agente recuerda qué archivos editó, qué errores encontró, qué decidió no hacer y por qué, y puede construir sobre esa base iterativamente.

### Qué contexto SÍ recibe el agente relay (por despacho)

| Fuente | Contenido | Tamaño típico |
|--------|-----------|---------------|
| `relay/agents/[id].md` | Descripción del proyecto, stack, rutas críticas, restricciones | ~200–500 tokens |
| `relay/agent-memory.md` | Resúmenes de las últimas 15 sesiones (lossy) | ~800–1500 tokens |
| `relay/[id]-plan.md` | Plan activo para la tarea actual (si existe) | ~300–800 tokens |
| Contenido del inbox | La tarea en sí | ~100–500 tokens |
| **Total inyectado** | | **~1400–3300 tokens** |

### Qué contexto le FALTA vs Claude Code interactivo

| Dimensión | Claude Code interactivo | Agente relay |
|-----------|------------------------|---------------|
| **Historial de conversación** | Completo, en ventana de contexto (hasta 200K tokens) | Ausente — solo resúmenes lossy en agent-memory.md |
| **Memoria cross-sesión** | Acumulada automáticamente en la sesión activa | Requiere que el agente escriba explícitamente en agent-memory.md |
| **Contexto de errores previos** | "Intenté X, falló por Y, cambié a Z" | Solo si el agente lo documentó en agent-memory |
| **Estado del workspace** | Claude Code lee el FS en tiempo real | ✅ Igual — el agente tiene acceso al filesystem del servidor |
| **Decisiones implícitas** | "No hice A porque viste que rompía B" | Perdidas entre sesiones |
| **Feedback iterativo** | El dev puede corregir en tiempo real dentro de la misma sesión | Requiere nuevo dispatch con contexto explicado |
| **CLAUDE.md auto-cargado** | ✅ Claude Code lee CLAUDE.md automáticamente al iniciar | ❌ No disponible con `--print`; debe inyectarse manualmente |

### El problema concreto que esto genera

En sesiones largas de Claude Code interactivo (como esta sesión donde se implementaron `callDeepSeekWithTools`, `runDeepSeekAgent`, `runVisualCheckOnce`, y el refactor de `onTaskComplete`), el modelo construye una comprensión profunda del sistema: qué patrones usa el código, qué limitaciones tiene la arquitectura, qué errores ya se intentaron. Un agente relay que recibe la misma tarea parte de cero, y puede repetir errores documentados, ignorar convenciones establecidas en la sesión previa, o introducir código inconsistente con decisiones recientes.

---

## 16. Soluciones a la Brecha de Contexto

Ordenadas de mayor a menor impacto/esfuerzo:

### Solución 1: `--resume [sessionId]` — Continuidad real de sesión ⭐⭐⭐⭐⭐

Claude Code CLI expone el `session_id` en el stream-json output. Si relay-master captura ese ID y lo persiste por proyecto, puede continuar la misma sesión en el siguiente dispatch:

```bash
claude --print --resume abc123def456 "Nueva tarea del mismo proyecto"
```

**Implementación en master.js:**
```js
// 1. En runClaude(), parsear session_id del stream output
const sessionId = parseSessionIdFromStream(output);
if (sessionId) project.lastSessionId = sessionId;
saveProjects(); // persistir

// 2. En el siguiente dispatch, inyectar --resume
const resumeFlag = project.lastSessionId ? `--resume ${project.lastSessionId}` : '';
const cmd = `claude --print ${resumeFlag} --model ${model} "${escapedPrompt}"`;
```

**Resultado**: El agente "recuerda" todo lo que hizo en sesiones anteriores del mismo proyecto. Equivale a un desarrollador que nunca cierra su terminal.

**Limitación**: La sesión puede expirar (Claude Code limpia sesiones antiguas). Necesita fallback a sesión nueva si `--resume` falla.

### Solución 2: `agent-memory.md` más rico — Mejor contexto lossy ⭐⭐⭐

Actualmente `appendAgentMemory()` escribe resúmenes genéricos. Cambiar a capturar:

```
[2026-05-15 14:32] Tarea: implementar runDeepSeekAgent
  ARCHIVOS: relay/master.js:1897–2050 (función nueva)
  DECISIONES: MAX_TURNS=25, BASH_DENY regex bloquea rm -rf y git reset --hard
  ERRORES_RESUELTOS: TypeError en toolCall.function.arguments — era string JSON, necesita JSON.parse()
  PENDIENTE: testear con proyecto sandbox antes de producción
  SHA: 72fdf6a
```

Esto reduce la pérdida de información entre sesiones de ~70% a ~20% sin cambio arquitectural.

### Solución 3: Sesiones de larga duración — Eliminar el problema ⭐⭐⭐⭐

En vez de `claude --print` (one-shot), mantener Claude Code como proceso interactivo que recibe tareas vía stdin y las acumula en la misma conversación:

```js
// Proceso persistente por proyecto
const proc = spawn('claude', ['--model', model], { stdio: ['pipe', 'pipe', 'pipe'] });
project.claudeProc = proc;

// Para cada nueva tarea:
project.claudeProc.stdin.write(taskContent + '\n');
```

**Ventaja**: Contexto completo acumulado, igual que sesión interactiva.
**Riesgo**: Gestión de estado del proceso (qué pasa si el proceso muere, se queda esperando, o llena el contexto). Requiere monitoreo adicional y lógica de reinicio.

### Solución 4: `deepseek-agent` como proxy de continuidad ⭐⭐

El modo `deepseek-agent` (DeepSeek V4-Pro tool loop) mantiene conversación de hasta 25 turnos **dentro** de una tarea. Esto resuelve la continuidad intra-tarea (el agente puede inspeccionar resultados de herramientas y ajustar su plan), aunque el problema entre tareas distintas persiste.

**Mejora complementaria**: Al final de cada sesión `deepseek-agent`, forzar que el agente escriba un resumen estructurado en `agent-memory.md` como última acción antes de terminar.

### Roadmap de implementación

```
Semana 1 (alta ROI, bajo riesgo):
  → Enriquecer appendAgentMemory() (Solución 2) — cambio en master.js, ~50 líneas
  → Agregar campo lastSessionId a projects.json + captura en runClaude()

Semana 2:
  → Implementar --resume flag en runClaude() con fallback a sesión nueva
  → Agregar escritura de memoria al final de sesiones deepseek-agent

Semana 3+ (si Solución 1 funciona bien):
  → Evaluar sesiones de larga duración (Solución 3) en proyecto sandbox
```

---

## 17. Propuesta: Dev Workflow con Paridad Claude Code

### El objetivo

Que un desarrollador trabajando en este sistema tenga la misma experiencia fluida que usando Claude Code interactivo, pero con el poder de los agentes autónomos del relay: paralelismo, observabilidad, costo cero, y ejecución desatendida.

### Modelo mental: "Claude Code como servicio"

```
Dev escribe plan                    Dev ve progreso en tiempo real
     │                                        ▲
     │ (buzón / Telegram / Claude Code chat)  │ (fiscalaibot Telegram)
     ▼                                        │
 relay-master recibe tarea          backend/Socket.io → dashboard
     │                                        ▲
     ▼                                        │
 Agente en servidor ejecuta  ────────────────►│
  DeepSeek V4-Pro (coding)                    │
  Gemini Flash (visión)                       │
  Playwright (browser automation)             │
     │                                        │
     └── git commit + push ────────────────────
```

### Canales de entrada de planes (todos equivalentes)

#### Canal 1: Buzón — como fiscalai (el flujo actual)
```markdown
# relay/inbox-[proyecto].md
## Plan: Implementar autenticación OAuth
- Instalar passport.js
- Crear ruta /auth/google
- Proteger rutas existentes
- Tests: login exitoso, token expirado

VERIFY_URLS: https://mi-app.com/login
BUDGET: $2.00
```
```bash
git add relay/inbox-[proyecto].md && git commit -m "dispatch: OAuth" && git push origin main
# → relay-master detecta en 15s, ejecuta, reporta en outbox y Telegram
```

#### Canal 2: Telegram (interactivo)
```
/chat fiscalai
→ [sesión interactiva con contexto del repo]
"Implementa autenticación OAuth con Google"
→ DeepSeek planifica en tiempo real
→ Dev puede hacer preguntas, refinar el plan, aprobar
→ Al confirmar: relay-master ejecuta el plan aprobado
```

#### Canal 3: Claude Code chat (esta sesión) — para planes complejos
El dev trabaja aquí para diseñar la arquitectura, tomar decisiones, y al final:
```bash
# Claude Code escribe el plan resultante directo al inbox
git add relay/inbox-[proyecto].md && git commit && git push origin main
# El agente en el servidor lo ejecuta con el stack de producción
```

### Stack de ejecución en servidor: DeepSeek + Gemini + Playwright

#### Por qué este stack como default (en vez de Claude CLI)

| Criterio | Claude CLI (Max) | DeepSeek V4-Pro + Gemini + Playwright |
|----------|:----------------:|:--------------------------------------:|
| Costo | $0 (Max sub) | ~$0.14/M tokens (casi gratis) |
| Velocidad de respuesta | ~8–15s por turno | ~3–6s por turno |
| Herramientas nativas | Limitadas a CLI | bash, git, read, write, browser |
| Autonomía de browser | ❌ No nativa | ✅ Playwright — SPA-ready |
| Análisis visual | ❌ No nativo | ✅ Gemini Flash integrado |
| Control de loop | Opaco (interno) | ✅ Configurable (MAX_TURNS, BASH_DENY) |
| Concurrencia | 1 instancia/proyecto | N paralelos en mismo proceso |

#### Flujo de ejecución del agente

```
Tarea recibida
     │
     ▼
DeepSeek V4-Pro (sistema de razonamiento)
├── Lee archivos relevantes (read_file)
├── Ejecuta comandos (bash)
├── Escribe código (write_file)
├── Hace commit (git_commit)
│
├── Si hay UI para verificar:
│   └── Playwright abre browser → captura screenshot → Gemini Flash analiza
│       ├── APROBADO → reporta éxito
│       └── NECESITA_CORRECCIÓN → DeepSeek corrige y repite (hasta 3x)
│
└── Escribe resumen en agent-memory.md (última acción)
```

#### Configuración en projects.json para habilitar este modo

```json
{
  "mi-proyecto": {
    "mode": "deepseek-agent",
    "deepseek_model": "deepseek-v4-pro",
    "vision_model": "gemini-flash",
    "browser_automation": "playwright",
    "verify_urls": ["https://mi-app.com"],
    "max_turns": 25,
    "budget_usd_max": 5.0
  }
}
```

### Reportes en tiempo real vía fiscalaibot (Telegram)

Cada evento relevante del agente llega al canal de Telegram del proyecto:

```
🔧 [fiscalai] Iniciando tarea: OAuth Google
   Agente: DeepSeek V4-Pro | Turno 1/25

📝 [fiscalai] Turno 3: Escribiendo routes/auth.js
   Herramienta: write_file | 127 líneas

✅ [fiscalai] Turno 8: git commit
   SHA: a1b2c3d | "feat: OAuth Google routes"

🔍 [fiscalai] Visual check: testing.fiscalai.mx/login
   Gemini: APROBADO — login flow funcional

🎉 [fiscalai] Tarea completada en 4m 32s | $0.03
   [Ver diff] [Ver outbox] [Nueva tarea]
```

El dev no necesita hacer polling — el sistema le empuja el estado en tiempo real.

### Bidireccionalidad: el dev puede intervenir mid-task

Cuando el agente está ejecutando, el dev puede enviar aclaraciones vía Telegram:

```
Dev: /clarify fiscalai "usa sesiones JWT, no cookies"
```

relay-master inyecta esa aclaración en el contexto del agente en ejecución:
- Si es `deepseek-agent`: agrega un mensaje de sistema al thread activo antes del siguiente turno
- Si es Claude CLI: no es posible mid-task, pero se encola como contexto adicional para el próximo dispatch

Esto replica la experiencia de "interrumpir a Claude Code con una corrección" sin detener la tarea.

### Comparación final: dev experience antes y después

| Acción | Flujo actual | Flujo propuesto |
|--------|-------------|------------------|
| Dar una tarea | Editar inbox.md + commit + push | Telegram `/chat` o inbox.md (igual) |
| Ver progreso | Poll outbox.md manualmente | Telegram notificaciones automáticas |
| Corregir mid-task | Imposible — esperar que termine | `/clarify [proyecto] "..."` |
| Ver estado visual | Ver screenshot en dashboard | Gemini Flash en cada deploy |
| Aprobar cambios | Pull request manual | Telegram `[Aprobar]` `[Rechazar]` botones |
| Costo total | $0 (Max) | ~$0.01–0.10 por tarea (DeepSeek) |
| Latencia primera respuesta | 15s + 2-5min plan | 15s + ejecución directa |

### Plan de implementación del modo propuesto

```
Semana 1 — Base (ya parcialmente implementado):
  ✅ runDeepSeekAgent() con bash/read/write/git tools
  ✅ Post-deploy visual check con Gemini Flash
  → Mejorar notificaciones Telegram por turno (actualmente solo inicio/fin)
  → Implementar /clarify command en chat-agent.js

Semana 2 — Playwright:
  → Reemplazar Chromium headless en visual-check.js con Playwright
  → Ventaja: SPAs con Vue/React router funcionan correctamente
  → Configurar como herramienta adicional en runDeepSeekAgent()

Semana 3 — Continuidad de contexto:
  → --resume sessionId (Solución §16.1)
  → agent-memory.md estructurado (Solución §16.2)

Semana 4 — Bidireccionalidad:
  → /clarify command: inyección mid-task en deepseek-agent
  → Botones Telegram inline para aprobar/rechazar commits antes de push
```

---

*Documento generado el 2026-05-15. Actualizado con §15–17: brecha de contexto, soluciones, y propuesta de dev workflow con DeepSeek V4-Pro + Gemini Flash + Playwright.*
