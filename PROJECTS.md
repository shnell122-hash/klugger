# PROJECTS.md — Proyectos del sistema

> Actualizado: 2026-05-10

---

## Proyectos activos

### ai-monitor
- **Repo:** `vilarkptl-lang/agentic-repo` (este repo)
- **Servidor:** `/var/www/html/vilarkptl.com/ai-monitor/`
- **URL:** https://ia.vilarkptl.com
- **Puerto:** 3010 (Express + Socket.io)
- **PM2:** `ai-monitor` (backend), `relay-master` (orquestador)
- **Stack:** Node.js + MySQL + HTML/CSS/JS vanilla + Socket.io
- **Función:** Dashboard de monitoreo de agentes en tiempo real
- **Branch agente:** `main`

### fiscalai (DeCabeceraTax)
- **Repo:** GitHub privado (DeCabeceraTax)
- **Servidor:** `/var/www/html/vilarkptl.com/DeCabeceraTax/`
- **Stack:** Node.js + MySQL + SAT APIs (CFDI, complementos)
- **Función:** Sistema de autofacturación y contabilidad fiscal
- **Agente:** claude-sonnet-4-6 | Branch: `main`
- **Inbox:** `DeCabeceraTax/relay/inbox.md`

### fiscalai-front
- **Repo:** mismo que fiscalai
- **Stack:** HTML/CSS/JS vanilla
- **Función:** Frontend del sistema fiscal
- **Agente:** claude-sonnet-4-6 | Branch: `main`
- **Inbox:** `DeCabeceraTax/relay/inbox-front.md`

### financial-bot
- **Repo:** `vilarkptl-lang/agentic-repo` (carpeta `financial/bot/`)
- **Servidor:** `/var/www/html/vilarkptl.com/ai-monitor/financial/bot/`
- **PM2:** `financial-bot`
- **Stack:** Node.js + grammy + MySQL + DeepSeek + Gemini
- **Función:** Bot de Telegram para operaciones financieras (IAS, SPEI, SINDICATO)
- **Agentes internos:** TransactionOrchestrator, DocumentIntelligenceAgent, VisionAgent, etc.
- **Agente externo:** `finbot-tester` (pruebas), `finbot-verifier` (verificación)

### dashboard-financial
- **Repo:** `vilarkptl-lang/agentic-repo` (carpeta `dashboard-financial/`)
- **Servidor:** `/var/www/html/vilarkptl.com/ai-monitor/dashboard-financial/`
- **PM2:** `financial-dashboard`
- **Puerto:** 3020
- **Stack:** Node.js (build requerido con `npm run build`)
- **Función:** Dashboard de monitoreo del financial-bot

---

## Procesos PM2 en producción

| Proceso | Puerto | Función |
|---------|--------|--------|
| `ai-monitor` | 3010 | Express + Socket.io — dashboard |
| `relay-master` | interno | Orquestador multi-agente |
| `claude-chat-bot` | interno | Telegram bot directo |
| `code-reviewer` | interno | DeepSeek auto-review cada 5min |
| `litellm` | 4000 | LLM proxy con fallback chains |
| `cursor-worker` | interno | Cursor Cloud Agent worker |
| `financial-bot` | interno | Bot Telegram financiero |
| `financial-dashboard` | 3020 | Dashboard financiero |

---

## Base de datos

| Proyecto | DB | Motor |
|----------|----|-------|
| ai-monitor | `ai_monitoring` | MySQL/MariaDB |
| fiscalai | `decabecera_db` | MySQL/MariaDB |
| financial-bot | `ai_monitoring` | MySQL/MariaDB (tablas `fin_*`) |

**Tablas principales de ai_monitoring:**
- `events` — tool calls de agentes
- `sessions` — sesiones por agente
- `costs` — costos por token
- `projects` — proyectos registrados
- `relay_alerts` — alertas del sistema
- `fin_operations` — operaciones financieras
- `fin_clients` — clientes del financial-bot
- `fin_sessions` — sesiones del bot
- `fin_banking_accounts` — cuentas bancarias detectadas

---

## Migraciones SQL activas

| Archivo | Descripción |
|---------|-------------|
| `backend/db/migrate-v*.sql` | Migraciones de ai_monitoring (v1–v18) |
| `financial/db/migrate-financial-v19.sql` | Agrega `updated_at` a `fin_banking_accounts` |

---

## Chains LiteLLM (`/opt/litellm/config.yaml`)

| Chain | Primary | Fallback |
|-------|---------|----------|
| `kptl-chat` | Sonnet 4.6 | DeepSeek → GPT-4o |
| `kptl-chat-fast` | Haiku 4.5 | GPT-4o-mini → Gemini |
| `kptl-reasoning` | DeepSeek R1 | Opus |
