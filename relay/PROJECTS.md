# PROJECTS.md — Registro de Proyectos
> Estado real de proyectos activos con rutas completas del servidor. Actualizado: 2026-05-16.

---

## Proyectos activos en producción

### ai-monitor
```
ID:          ai-monitor
Descripción: Dashboard de monitoreo IA — ia.vilarkptl.com
Repo local:  /var/www/html/vilarkptl.com/ai-monitor
Repo GitHub: vilarkptl-lang/agentic-repo
Branch:      main
URL:         https://ia.vilarkptl.com
Puerto:      3010 (Express + Socket.io)
PM2:         ai-monitor (id 15)
Modelo:      claude-haiku-4-5-20251001
Modo:        full-claude-code
Inbox:       /var/www/html/vilarkptl.com/ai-monitor/relay/inbox.md
Outbox:      /var/www/html/vilarkptl.com/ai-monitor/relay/outbox.md
```

**Stack:** Node.js + Express + Socket.io + MySQL + HTML/CSS/JS vanilla  
**DB:** `ai_monitoring` en MySQL local  
**Auth:** login con bcrypt (hash en `/opt/kptl-secrets/api-keys.env`)  
**Deploy:** `pm2 restart ai-monitor` tras cambios en `backend/` o `frontend/`

---

### fiscalai (backend)
```
ID:          fiscalai
Descripción: Backend fiscal — APIs SAT, MySQL, lógica de negocio
Repo local:  /var/www/html/vilarkptl.com/DeCabeceraTax
Repo GitHub: vilarkptl-lang/ryby.lease
Branch:      claude/ml-backend-69bis-module-5iap0
URL:         https://fiscalai.mx
Modelo:      claude-sonnet-4-6
Modo:        plan-execute
Inbox:       /var/www/html/vilarkptl.com/DeCabeceraTax/relay/inbox.md
Outbox:      /var/www/html/vilarkptl.com/DeCabeceraTax/relay/outbox.md
```

---

### fiscalai-front
```
ID:          fiscalai-front
Descripción: Frontend HTML/CSS/JS — UI fiscalai.mx
Repo local:  /var/www/html/vilarkptl.com/DeCabeceraTax
Repo GitHub: vilarkptl-lang/ryby.lease
Branch:      claude/ml-backend-69bis-module-5iap0
URL:         https://fiscalai.mx
Modelo:      claude-sonnet-4-6
Modo:        full-claude-code
Inbox:       /var/www/html/vilarkptl.com/DeCabeceraTax/relay/inbox-front.md
Outbox:      /var/www/html/vilarkptl.com/DeCabeceraTax/relay/outbox-front.md
```

---

### flujos (financial-bot)
```
ID:          flujos
Descripción: Bot financiero GrammY — flujos.fiscalai.mx
Repo local:  /var/www/html/vilarkptl.com/ai-monitor
Working dir: financial/bot
Repo GitHub: vilarkptl-lang/agentic-repo
Branch:      main
URL:         https://flujos.fiscalai.mx
PM2:         financial-bot
Modelo:      claude-sonnet-4-6
Modo:        full-claude-code
Post-deploy: pm2 restart financial-bot
Inbox:       /var/www/html/vilarkptl.com/ai-monitor/relay/inbox-flujos.md
Outbox:      /var/www/html/vilarkptl.com/ai-monitor/relay/outbox-flujos.md
```

**Agentes internos del financial-bot:**
| Agente | Modelo | Env var |
|--------|--------|--------|
| DocumentIntelligenceAgent | gemini-1.5-flash | GOOGLE_API_KEY |
| TransactionOrchestrator | DEEPSEEK_PRO_MODEL | DEEPSEEK_API_KEY |
| VisionAgent (fallback OCR) | claude-haiku-4-5-20251001 | ANTHROPIC_API_KEY |
| InvoiceAgent | deepseek-chat | DEEPSEEK_API_KEY |
| ContextReader | deepseek-chat | DEEPSEEK_API_KEY |
| ResponseGen | deepseek-chat | DEEPSEEK_API_KEY |
| Verifier | rule-based | — |

---

### fiscalai-test
```
ID:          fiscalai-test
Descripción: Entorno de testing — fiscalai en branch testing
Repo local:  /var/www/html/vilarkptl.com/DeCabeceraTax
Branch:      testing
URL:         https://testing.fiscalai.mx
Modelo:      claude-sonnet-4-6
Modo:        plan-execute
Inbox:       /var/www/html/vilarkptl.com/DeCabeceraTax/relay/inbox-test.md
Outbox:      /var/www/html/vilarkptl.com/DeCabeceraTax/relay/outbox-test.md
```

---

### coordinator
```
ID:          coordinator
Descripción: Orquestador — despacha entre agentes, sin código propio
Repo local:  /var/www/html/vilarkptl.com/DeCabeceraTax
Branch:      claude/ml-backend-69bis-module-5iap0
Modelo:      claude-haiku-4-5-20251001
Modo:        plan-execute
Inbox:       /var/www/html/vilarkptl.com/DeCabeceraTax/relay/coordinator-inbox.md
Outbox:      /var/www/html/vilarkptl.com/DeCabeceraTax/relay/coordinator-outbox.md
```

---

### finbot-tester / finbot-verifier / finbot-coordinator
```
Todos en:    /var/www/html/vilarkptl.com/ai-monitor
GitHub:      vilarkptl-lang/agentic-repo
Branch base: main (finbot-coordinator usa claude/financial-multiagent-system-YwtYQ)
Modelo:      claude-sonnet-4-6
Modo:        full-claude-code
```

---

## Proyectos inactivos (sin inbox configurado)

| ID | URL | Motivo inactivo |
|----|-----|------------------|
| `credito` | credito.vilarkptl.com | Sin inbox/repo asignado |
| `voltic` | voltic.mx | Sin inbox/repo asignado |
| `ocr` | ocr.ryby.lease | Sin inbox/repo asignado |
| `tareas` | tareas.ryby.lease | Sin inbox/repo asignado |
| `noticias` | noticias.ryby.lease | Sin inbox/repo asignado |
| `telegram-inversiones` | — | Sin inbox/repo asignado |

Para activar cualquiera: ver sección "Proceso de Nuevo Proyecto" en `CLAUDE.md` o `relay/WORKFLOW.md`.

---

## Estado de branches (2026-05-16)

| Branch | Contenido | Estado |
|--------|-----------|--------|
| `main` | Base del sistema | ✅ Actualizado |
| `claude/agent-monitoring-dashboard-4v8iq` | visual check loop, deepseek-agent, chat-agent tools | ⏳ Pendiente merge → main |
| `claude/financial-multiagent-system-YwtYQ` | LangGraph, mejoras financial-bot | ⏳ Pendiente merge |
| `deploy/financial-llm-complete` | DeepSeek V4 + Gemini en financial-bot | ⏳ Merge selectivo pendiente |
| `claude/onboard-ai-monitor-subproject-zXvki` | Auth + LiteLLM | ⏳ Pendiente PR |

---

## Procesos PM2 en producción (143.198.228.78)

| Proceso | ID PM2 | Puerto | Estado |
|---------|--------|--------|--------|
| `ai-monitor` | 15 | 3010 | ✅ online |
| `relay-master` | 8 | interno | ✅ online |
| `claude-chat-bot` | — | interno | ✅ online |
| `code-reviewer` | — | interno | ✅ online |
| `cursor-worker` | 26 | — | ✅ online |
| `litellm` | — | 4000 | ✅ online |
| `financial-bot` | — | — | ✅ online |
| `vilar-legal-os-v59` | — | — | ⚠️ crash loop 146k+ restarts |

---

## Base de datos

| Campo | Valor |
|-------|-------|
| Motor | MySQL / MariaDB |
| DB name | `ai_monitoring` |
| Credenciales | `/var/www/html/vilarkptl.com/ai-monitor/backend/.env` |

```bash
# Leer contraseña siempre así (nunca interactivo):
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring < migrate.sql
```
