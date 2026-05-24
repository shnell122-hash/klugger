# SYSTEM.md — Arquitectura del Sistema
> Referencia técnica compacta. Para diagnóstico completo ver `relay/SYSTEM-DIAGNOSIS.md`. Última actualización: 2026-05-16.

---

## Flujo principal

```
Developer (Telegram / inbox.md / Claude Code chat)
    │
    ▼
relay/master.js  (Node.js, PM2: relay-master, puerto interno)
    │  poll inbox-[proyecto].md cada 15s
    │  detecta cambio de hash SHA256
    │
    ├── Modo plan-execute:
    │       DeepSeek V4 planifica → Claude CLI ejecuta
    │
    ├── Modo full-claude-code:
    │       claude --print --model [model] "[prompt]"
    │       (Max subscription, $0 costo API)
    │
    └── Modo deepseek-agent:
            DeepSeek V4-Pro tool loop (bash/read/write/git)
            hasta 25 turnos, BASH_DENY para comandos destructivos
    │
    ├── POST /api/events → backend/server.js → Socket.io → dashboard
    ├── git commit + push (en workspace del proyecto)
    └── post-deploy: visual-check.js (Chromium → Gemini Flash)
                     auto-dispatch correctivo hasta 3 iteraciones
```

---

## Stack tecnológico

| Capa | Tecnología | Detalle |
|------|-----------|----------|
| Runtime | Node.js | relay, backend, bots |
| Runtime | Python | financial-bot sims, Telethon bridge |
| Web framework | Express.js | backend API REST, puerto 3010 |
| Bot framework | GrammY | claude-chat-bot + financial-bot |
| Realtime | Socket.io | dashboard en tiempo real |
| Frontend (monitor) | HTML/CSS/JS vanilla | glassmorphism + dark/light |
| Frontend (financial) | React + Vite | dashboard-financial, puerto 3020 |
| LLM ejecución | Claude Max (CLI) | $0 vía OAuth, claude-proxy :5001 |
| LLM coding/plan | DeepSeek V4-Pro/Flash | ~$0.14/M tokens |
| LLM visión | Gemini Flash | screenshots, visual check |
| LLM code-review | DeepSeek V3 | auto-alertas en commits |
| LLM proxy | LiteLLM | puerto 4000, chains fallback |
| Base de datos | MySQL / MariaDB | `ai_monitoring` |
| Process manager | PM2 | fork mode, watch:false |
| VCS | GitHub | org: vilarkptl-lang |
| Infra | DigitalOcean | 143.198.228.78, 3.8 GB RAM |
| OS | Ubuntu/Debian | Apache2 + mod_proxy |
| Visual CI | Chromium headless | → Gemini Flash → JSON verdict |

---

## Servidor de producción

```
Host:  143.198.228.78
User:  root
SSH:   ssh root@143.198.228.78
Creds: /opt/kptl-secrets/server-credentials.txt

Raíz: /var/www/html/vilarkptl.com/ai-monitor/
├── backend/server.js      Puerto 3010
├── frontend/              Servido estático
├── relay/
│   ├── master.js          PM2: relay-master
│   ├── projects.json      Config de proyectos
│   ├── agents/            Prompts por agente
│   ├── .env               Claves API
│   └── workspaces/        Repos clonados
└── deploy/ecosystem.config.js
```

---

## Tablas de base de datos

| Tabla | Propósito |
|-------|-----------|
| `events` | Tool calls de agentes |
| `sessions` | Sesiones por agente/proyecto |
| `costs` | Costos por token |
| `providers` | API keys (últimos 6 chars) |
| `projects` | Proyectos registrados |
| `screenshots` | Capturas de visual check |
| `relay_alerts` | Alertas del sistema |
| `project_monthly_budget` | Kill-switch de presupuesto |

---

## Controles de seguridad activos

| Control | Descripción |
|---------|-------------|
| Kill-switch global | `SYSTEM_KILL_SWITCH=true` detiene todos los despachos |
| Kill-switch por proyecto | `budget_usd_max` en projects.json |
| Rate limiting | 3 despachos/hora por proyecto |
| Quiet hours | 11pm–8am MX sin despachos |
| Watchdog | Mata proceso si >25min sin update |
| Adaptive timeout | Reduce a la mitad tras fallo |
| Auto-stop journal | Detiene agente tras 3 fallos consecutivos |
| SHA pre-run | Captura hash antes de tarea → genera revert cmd |
| BASH_DENY | Bloquea `rm -rf`, `git reset --hard`, etc. en deepseek-agent |
| Commit guard | Detecta .env o node_modules en staging |

---

## Claude-proxy (OAuth, $0)

```bash
# claude-proxy corre en :5001
curl http://127.0.0.1:5001/health  # → {"ok":true}

# Claude Code CLI usa oauth via:
su -s /bin/bash claude-agent -c "claude --print --model claude-sonnet-4-6 '...'"
# O via ANTHROPIC_PROXY_URL=http://127.0.0.1:5001

# Costo: $0 — usa cuenta Max/Pro de claude-agent
```

---

## LiteLLM proxy (puerto 4000)

```bash
# Chains disponibles:
# kptl-chat:        Sonnet → DeepSeek → GPT4o
# kptl-chat-fast:   Haiku → GPT4o-mini → Gemini
# kptl-reasoning:   DeepSeek R1 → Opus

# Config en relay/.env:
LITELLM_BASE_URL=http://localhost:4000
LITELLM_MASTER_KEY=sk-litellm-11b2ccee224b47d82ba9b8e3677aa915
```

---

## checkSelfReload — Zero-downtime autoupdate

cuando `relay/master.js` cambia en disco (detectado por hash SHA256):
1. Espera a que `ACTIVE_TASKS.size === 0` (hasta 20 min)
2. `process.exit(0)` → PM2 reinicia automáticamente

**Requisito:** `watch: false` en `deploy/ecosystem.config.js`
