# AGENT-STATUS.md

Estado compartido de agentes activos — actualizado por cada agente al terminar su sesión.

_Fusión de AGENT-STATUS.md + ESTADO-SERVIDOR.md — 2026-05-02 | Actualizado 2026-05-05_

## ai-monitor (Claude Code — AI Monitor Dashboard)

| Campo | Valor |
|-------|-------|
| Última sesión | 2026-05-09 |
| Estado | ✅ Completo |
| Rama trabajo | `claude/agent-monitoring-dashboard-4v8iq` |
| Rama relay | `main` |
| Commits principales | `4299fc8` (projects.json flujos+fiscalai-test), `f153a45` (telethon-bridge), `cc5f0aa` (AGENT-TREE.md migración) |
| Usuario requerido | Sí — ver sección Pendiente |

### Cambios sesión 2026-05-09

| Archivo | Cambio | Branch |
|---------|--------|--------|
| `relay/projects.json` | +flujos, +fiscalai-test, deepseek_model en finbot-* | main |
| `relay/inbox-flujos.md` | Briefing completo para agente flujos | main |
| `relay/outbox-flujos.md` | Creado vacío | main |
| `relay/BRIEFING-fiscalai.md` | Briefing para agente fiscalai (copiar a ryby.lease) | main |
| `relay/chat-agent.js` | DeepSeek bypass LiteLLM + anti-alucinación + repo awareness | main |
| `financial/telethon-bridge.py` | Bridge tests Telethon → relay (nuevo) | claude/agent-monitoring-dashboard-4v8iq |
| `financial/run-telethon-tests.sh` | Runner con loop automático | claude/agent-monitoring-dashboard-4v8iq |
| `financial/bot/AGENT-TREE.md` | Actualizado: DeepSeek V4 Pro + Gemini Flash | migrate-llms-deepseek-gemini |
| `financial/bot/agents/TransactionOrchestrator.js` | Migrado Anthropic → DeepSeek OpenAI-compat | migrate-llms-deepseek-gemini |
| `financial/bot/agents/vision-agent.js` | Migrado: Gemini Flash primario + DeepSeek Flash fallback | migrate-llms-deepseek-gemini |
| `financial/bot/agents/invoice-agent.js` | deepseek-chat → DEEPSEEK_PRO_MODEL | migrate-llms-deepseek-gemini |
| `financial/bot/agents/context-reader.js` | deepseek-chat → DEEPSEEK_PRO_MODEL | migrate-llms-deepseek-gemini |
| `financial/bot/agents/response-gen.js` | deepseek-chat → DEEPSEEK_PRO_MODEL | migrate-llms-deepseek-gemini |

---

## Otros agentes (vacío)

| Agente | Sesión/Branch | Último cambio | Estado |
|--------|--------------|---------------|--------|
| Claude Code (`claude/agent-monitoring-dashboard-4v8iq`) | 2026-05-04 | P1+P2 optimización costos: DeepSeek V4-Flash/Pro + caching, project_killed enforcement, budget proporcional (40%), max depth 3, projects.json actualizado | ✅ Pusheado |
| Claude Code (`claude/agent-monitoring-dashboard-4v8iq`) | 2026-05-03 | Multi-account spending, $100/proyecto/mes kill-switch, gasto histórico, migrate-v12 | ✅ Pusheado |
| Claude Code (`claude/agent-monitoring-dashboard-4v8iq`) | 2026-05-02 12:43 | Redesign, toggle tema, SYSTEM.md, audit, Cursor integration, AGENT-STATUS.md, PR #21 → mergeado a main | ✅ En main |
| Claude Code (`claude/onboard-ai-monitor-subproject-zXvki`) | 2026-05-02 11:35 | LiteLLM activado, auth login, kptl-credito fix | ✅ Pusheado |
| Claude Code (`claude/financial-multiagent-system-YwtYQ`) | 2026-05-12 | LangGraph Parts 5+9: FileFlowGraph wired, SupervisorNode, semantic routing, context compaction, session drift fix — commit fe3a633 | ✅ Pusheado — pendiente deploy |
| Claude Code (`claude/financial-multiagent-system-YwtYQ`) | 2026-05-03 | financial-bot bugs: timeout /saldo + CLABE/asistente, race condition, reconnect, keywords clabegv | ✅ En producción |
| relay-master / claude-code-suborq | 2026-05-03 | Nuevo proyecto activo — comunicación bidireccional confirmada | ✅ Funcionando |

---

## Estado de producción (143.198.228.78)

| Proceso | Estado | Notas |
|---------|--------|-------|
| `ai-monitor` | ✅ online | Puerto 3010 — ia.vilarkptl.com |
| `relay-master` | ✅ online | 144 restarts (histórico acumulado) |
| `claude-chat-bot` | ✅ online | LiteLLM key corregida esta sesión |
| `cursor-worker` | ✅ online | 0 restarts |
| `litellm` | ✅ online | Puerto 4000, ~357 MB RAM |
| `kptl-credito` | ✅ online | Fix webhook.py aplicado — era SyntaxError línea 52 |
| `kptl-credito-worker` | ⚠️ online | 213 restarts — depende de kptl-credito |
| `vilar-legal-os-v59` | ⚠️ online | 146k+ restarts — crash loop no resuelto |
| `financial-bot` | ✅ online | Fixes aplicados 2026-05-03 — score 73.3% → ~85% esperado |
| `conversation-engine` | ✅ online | Tier 2, score 62.5% (ep. #52), restart 5 |
| `claude-code-suborq` | ✅ online | Nuevo — comunicación bidireccional activa |

### Memoria

```
RAM:  ~1.8 GB usada / 3.8 GB total
Swap: ~1.9 GB usada / 2.0 GB total  ← CRÍTICO (94%)
```

---

## Estado de branches

| Branch | Contiene | Estado |
|--------|----------|--------|
| `main` | Versión base — sin redesign, sin auth | ⚠️ Pendiente merge de ambos PRs |
| `claude/agent-monitoring-dashboard-4v8iq` | Redesign glassmorphism, toggle tema, docs, audit, AGENT-STATUS | ✅ PR #21 abierto → main |
| `claude/onboard-ai-monitor-subproject-zXvki` | Auth/login, LiteLLM integration, ESTADO-SERVIDOR (obsoleto) | ✅ Pendiente PR → main |

---

## Archivos críticos — NO sobrescribir sin leer esto

| Archivo | Quién lo tocó | Qué contiene |
|---------|--------------|--------------|
| `frontend/index.html` | sesión 4v8iq | Redesign glassmorphism + botón toggle |
| `frontend/css/dashboard.css` | sesión 4v8iq | Tema claro + oscuro, variables CSS |
| `frontend/js/dashboard.js` | sesión 4v8iq | Fix duplicate PROVIDER_COLORS |
| `backend/server.js` | sesión zXvki | Auth middleware + login route |
| `relay/master.js` | sesión 4v8iq | Haiku buzon, prompt caching, budget inheritance |
| `relay/projects.json` | sesión zXvki + 4v8iq | `ai-monitor.branch = "main"` |
| `relay/.env` | sesión zXvki | LITELLM_BASE_URL + LITELLM_MASTER_KEY (corregido) |
| `relay/AGENT-STATUS.md` | sesión 4v8iq | Este archivo — siempre actualizar |

> ⚠️ `relay/ESTADO-SERVIDOR.md` (sesión zXvki) está **fusionado aquí y es obsoleto** — borrar al mergear.

---

## PRs abiertos

| PR | Branch → Base | Descripción | Estado |
|----|--------------|-------------|--------|
| [#21](https://github.com/vilarkptl-lang/agentic-repo/pull/21) | `claude/agent-monitoring-dashboard-4v8iq` → `main` | Redesign + toggle + docs + AGENT-STATUS | ⏳ Pendiente merge |
| (pendiente crear) | `claude/onboard-ai-monitor-subproject-zXvki` → `main` | Auth + LiteLLM | ⏳ Pendiente PR |

---

## Advertencia git — LEER ANTES DE HACER RESET

El servidor puede tener commits locales no pusheados en `main`:
```bash
# Verificar antes de cualquier reset:
git -C /var/www/html/vilarkptl.com/ai-monitor log origin/main..HEAD --oneline

# Si solo ves commits "relay: resultado..." → reset seguro
# Si ves features reales → backup primero:
git -C /var/www/html/vilarkptl.com/ai-monitor push origin HEAD:backup/server-local-2026-05-02 --force
```

---

## Tareas pendientes

### En servidor (ejecutar manualmente)
- [ ] Mergear `claude/agent-monitoring-dashboard-4v8iq` → main y `pm2 restart relay-master` para activar P1+P2
- [ ] Verificar IDs DeepSeek V4: `curl https://api.deepseek.com/v1/models -H "Authorization: Bearer $DEEPSEEK_API_KEY" | jq '.data[].id'`
- [ ] Actualizar relay/.env con IDs reales: `DEEPSEEK_FLASH_MODEL=...` y `DEEPSEEK_PRO_MODEL=...`
- [ ] Correr `mysql ai_monitoring < backend/db/migrate-v12.sql` si no se hizo
- [ ] Agregar Admin API keys al relay/.env:
  - `ANTHROPIC_ADMIN_KEY_GVA` (cuenta gva.server@gmail.com)
  - `ANTHROPIC_ADMIN_KEY_LEASINGAGATA` (cuenta leasingagata@gmail.com)
- [ ] Detener `vilar-legal-os-v59`: `pm2 stop vilar-legal-os-v59 && pm2 delete vilar-legal-os-v59`
- [ ] Agregar 1GB swap: `fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 && swapon /swapfile2`
- [ ] pm2-logrotate: `pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 50M`
- [ ] Crear y mergear PR de `claude/onboard-ai-monitor-subproject-zXvki` → main (auth + LiteLLM)
- [ ] `git push origin main` desde servidor (commits locales sin push)

### Próximas sesiones de código
- [ ] P3: Quiet hours (11pm-8am MX) + rate limiting (3 dispatches/hora) en master.js
- [ ] P4: `selectClaudeModel()` — routing inteligente usando `claude_model_fast`
- [ ] P5: LiteLLM en master.js (`callViaLiteLLM()`) — copiar patrón de chat-agent.js
- [ ] P6: Claude CLI proxy shadow test en ai-monitor (use_cli_proxy flag ya en projects.json)

---

## Protocolo para agentes

### Antes de empezar
```bash
cat /var/www/html/vilarkptl.com/ai-monitor/relay/AGENT-STATUS.md
# Verifica: ¿hay otro agente con tarea activa en el mismo archivo?
# Si sí → espera o coordina antes de modificar
```

### Al terminar
```bash
# 1. Actualiza este archivo: sección "Última sesión por agente" + archivos que tocaste + tareas
# 2. Commit y push:
git add relay/AGENT-STATUS.md
git commit -m "status: [tu-agente] — [resumen de 1 línea]"
git push
```
