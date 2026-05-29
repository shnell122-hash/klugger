# AGENT-STATUS.md

Estado compartido de agentes activos — actualizado por cada agente al terminar su sesión.

_Fusión de AGENT-STATUS.md + ESTADO-SERVIDOR.md — 2026-05-02 | Actualizado 2026-05-20_

## ai-monitor (Claude Code — AI Monitor Dashboard)

| Campo | Valor |
|-------|-------|
| Última sesión | 2026-05-29 |
| Estado | ✅ Completo |
| Rama trabajo | `claude/agent-monitoring-dashboard-4v8iq` |
| Rama relay | `main` |
| Último commit | `fc963d4 feat: relay/tools-server.js` |

### Cambios sesión 2026-05-29

| Archivo | Cambio | Estado |
|---------|--------|--------|
| `backend/db/migrate-v17.sql` | `result_summary`, `files_changed`, `commits_made` en dispatch_tasks | branch ✅ |
| `backend/routes/dispatch.js` | `extractQualityMetrics()` + `/complete` guarda métricas + GET incluye cols | branch ✅ |
| `frontend/js/dashboard.js` | `renderDispatchCard()` muestra badge de calidad (commits · archivos) | branch ✅ |
| `frontend/css/dashboard.css` | Clase `.ds-quality` (verde, 9px) | branch ✅ |
| `relay/tools-server.js` | Nuevo módulo compartido: 8 tools OpenAI-format + `executeTool()` | branch ✅ |
| `relay/master.js` | `runDeepSeekAgent` usa `AGENT_TOOLS` de tools-server (eliminó 110 líneas duplicadas) | branch ✅ |
| `tests/dispatch.test.js` | 13 tests, 5 suites — todos pasan contra producción (T1 ✅) | branch ✅ |

### Pendiente sesión 2026-05-29

- B3 multi-cuenta routing: **diferido** hasta que el sistema haga mejores tareas que Claude Code
- P2.2 A/B comparison panel: sin asignar
- Fase 3 ASK protocol + poll 3s: sin asignar
- relay/visual-check.js: Playwright instalado pero no integrado con tareas activas aún

### Sesión 2026-05-25

| Archivo | Cambio | Estado |
|---------|--------|--------|
| `relay/master.js` | `checkBackendReload()` — auto-restart backend cuando server.js cambia | main ✅ |
| `relay/master.js` | `.backend-needs-restart` flag — reinicio one-shot del backend al startup | main ✅ |
| `relay/master.js` | `gitPull`: rebase → merge con `-X theirs` + stash (evita pérdida de historial local) | main ✅ |
| `frontend/index.html` | `#resume-breakdown` — sección de tasa de reanudación por proyecto | main ✅ |
| `frontend/js/dashboard.js` | `refreshResumeStats()`: pobla breakdown de by_project (barras + colores) | main ✅ |
| `tests/dispatch.test.js` | Suite de tests: projects.json + /api/relay/dispatch + /api/sessions/stats/resume | main ✅ |

---

### Cambios sesión 2026-05-20

| Archivo | Cambio | Branch |
|---------|--------|--------|
| `relay/master.js` | Fix loop infinito 4289 reinicios — gitPull branch restore + initial pulledRepos share | main (PR #38) |
| `relay/projects.json` | finbot-coordinator.branch: `main` (era `claude/financial-multiagent-system-YwtYQ`) | main (PR #38) |
| `relay/master.js` | Real cost tracking — DeepSeek/Gemini/Grok pricing corregido, Claude Max = $0 | main (PR #39) |
| `backend/routes/providerCosts.js` | Nuevo endpoint POST/GET `/api/provider-costs` | main (PR #39) |
| `backend/db/migrate-v15.sql` | Nueva tabla `provider_costs` | main (PR #39) |
| `backend/server.js` | Monta providerCostsRouter + auto-run migrations | main (PR #39) |
| `frontend/index.html` | Panel "Costos reales por proveedor API" en tab costs | main (PR #39) |
| `frontend/css/dashboard.css` | Estilos `.provider-badge` | main (PR #39) |
| `frontend/js/dashboard.js` | `refreshProviderCostsPanel()` + socket `provider_cost` | main (PR #39) |
| `relay/inbox-flujos.md` | Briefing P1+session fixes + exec_server() pattern | main (directo) |

---

## flujos (Claude Code — flujos.fiscalai.mx / financial-bot)

| Campo | Valor |
|-------|-------|
| Última sesión | 2026-05-20 |
| Estado | ✅ Completo — model fixes + deploy |
| Rama trabajo | `main` (directo) |
| Rama relay | `main` |
| Commit | `b41a677e` fix(models): gemini-2.0-flash + deepseek-chat for tool_choice compat |

### Cambios sesión 2026-05-20

- **DocumentIntelligenceAgent.js**: `gemini-1.5-flash` → `gemini-2.0-flash` (modelo deprecado)
- **vision-agent.js**: mismo fix — gemini default actualizado
- **financial-bot.js**: TransactionOrchestrator hardcodeado a `deepseek-chat` (deepseek-v4-pro mapeaba a reasoner → bloqueaba tool_choice)
- **Deploy**: git plumbing → push → git checkout HEAD → pm2 restart financial-bot ✅

### Score

- Pre-fix sesión anterior: 77.8% (ep #1747) — debajo del 80%
- Root causes: 177x saldo sin keywords (TO→ignorar fallback), 91x timeout
- Post-fix esperado: 85%+ (tool_choice funciona, Gemini disponible)

---

## Otros agentes

| Agente | Sesión/Branch | Último cambio | Estado |
|--------|--------------|---------------|--------|
| Claude Code (`claude/agent-monitoring-dashboard-4v8iq`) | 2026-05-04 | P1+P2 optimización costos: DeepSeek V4-Flash/Pro + caching, project_killed enforcement, budget proporcional (40%), max depth 3, projects.json actualizado | ✅ Pusheado |
| Claude Code (`claude/agent-monitoring-dashboard-4v8iq`) | 2026-05-03 | Multi-account spending, $100/proyecto/mes kill-switch, gasto histórico, migrate-v12 | ✅ Pusheado |
| Claude Code (`claude/agent-monitoring-dashboard-4v8iq`) | 2026-05-02 12:43 | Redesign, toggle tema, SYSTEM.md, audit, Cursor integration, AGENT-STATUS.md, PR #21 → mergeado a main | ✅ En main |
| Claude Code (`claude/onboard-ai-monitor-subproject-zXvki`) | 2026-05-02 11:35 | LiteLLM activado, auth login, kptl-credito fix | ✅ Pusheado |
| Claude Code (`claude/financial-multiagent-system-YwtYQ`) | 2026-05-18 | Respuesta conflictos + merge aprobado → ai-monitor | ✅ En main |
| Claude Code (`claude/financial-multiagent-system-YwtYQ`) | 2026-05-13 | Fix crítico plateau 53%: TO-ignorar → regex fallback (ef179a5) + monto_invalido 0/-1000 (5602e43) + models fix gemini-2.0-flash + deepseek-reasoner→chat (28ca6cb) | ✅ En producción (via deploy/financial-llm-complete) |
| relay-master / claude-code-suborq | 2026-05-03 | Nuevo proyecto activo — comunicación bidireccional confirmada | ✅ Funcionando |

---

## Estado de producción (143.198.228.78)

| Proceso | Estado | Notas |
|---------|--------|-------|
| `ai-monitor` | ✅ online | Puerto 3010 — ia.vilarkptl.com |
| `relay-master` | ✅ online | Loop infinito (4289 reinicios) resuelto 2026-05-19 18:49 CST |
| `claude-chat-bot` | ✅ online | LiteLLM key corregida |
| `cursor-worker` | ✅ online | 0 restarts |
| `litellm` | ✅ online | Puerto 4000, ~357 MB RAM |
| `kptl-credito` | ✅ online | Fix webhook.py aplicado |
| `kptl-credito-worker` | ⚠️ online | 213 restarts — depende de kptl-credito |
| `vilar-legal-os-v59` | ⚠️ online | 146k+ restarts — crash loop no resuelto |
| `financial-bot` | ✅ online | Model fixes en main (b41a677e) — gemini-2.0-flash + deepseek-chat para tool_choice |
| `conversation-engine` | ✅ online | P1 fix deployado, score 62.5% ep.#52 → mejorando |
| `claude-code-suborq` | ✅ online | Comunicación bidireccional activa |

### Memoria

```
RAM:  ~1.8 GB usada / 3.8 GB total
Swap: ~1.9 GB usada / 2.0 GB total  ← CRÍTICO (94%)
```

---

## Estado de branches

| Branch | Contiene | Estado |
|--------|----------|--------|
| `main` | PRs #38 #39 + flujos P1+session fixes | ✅ Producción |
| `claude/agent-monitoring-dashboard-4v8iq` | Base de trabajo german — necesita sync con main | ✅ Activo |
| `claude/onboard-ai-monitor-subproject-zXvki` | Auth + LiteLLM | ✅ Pendiente PR → main |
| `claude/financial-multiagent-system-YwtYQ` | Solo 1 commit relay result adelante de main | ⏳ Sin código nuevo |
| `deploy/financial-llm-complete` | TransactionOrchestrator OpenAI + Gemini + FileFlowGraph | ✅ Mergeado a main |

---

## Archivos críticos — NO sobrescribir sin leer esto

| Archivo | Quién lo tocó | Qué contiene |
|---------|--------------|-------------|
| `frontend/index.html` | sesión 4v8iq 2026-05-20 | Provider costs panel + glassmorphism |
| `frontend/css/dashboard.css` | sesión 4v8iq 2026-05-20 | `.provider-badge` estilos |
| `frontend/js/dashboard.js` | sesión 4v8iq 2026-05-20 | `refreshProviderCostsPanel()` + socket |
| `backend/server.js` | sesión zXvki + 4v8iq | Auth middleware + providerCostsRouter |
| `relay/master.js` | sesión 4v8iq 2026-05-20 | Loop fix + real cost tracking — SOLO german/ai-monitor |
| `relay/projects.json` | sesión 4v8iq 2026-05-20 | finbot-coordinator.branch = main |
| `relay/.env` | sesión zXvki | LITELLM_BASE_URL + LITELLM_MASTER_KEY (corregido) |
| `financial/bot/financial-bot.js` | flujos 2026-05-19 | Session cleanup timer |
| `financial/bot/sims/mtproto/conversation_engine.py` | flujos 2026-05-19 | Per-scenario mode + ASISTENTE_CHAT_ID |

---

## PRs abiertos

| PR | Branch → Base | Descripción | Estado |
|----|--------------|-------------|--------|
| (pendiente crear) | `claude/onboard-ai-monitor-subproject-zXvki` → `main` | Auth + LiteLLM | ⏳ Pendiente PR |

---

## Tareas pendientes

### En servidor (ejecutar manualmente si es necesario)
- [ ] Verificar `pm2 restart conversation-engine` y `pm2 restart financial-bot` (coordinator fue despachado — confirmar logs)
- [ ] Verificar score financial-bot en próximos episodios (esperado 85–93%)
- [ ] `git stash clear` en servidor (182+ stashes acumulados de gitPull antiguo)
- [ ] Detener `vilar-legal-os-v59`: `pm2 stop vilar-legal-os-v59 && pm2 delete vilar-legal-os-v59`
- [ ] Agregar 1GB swap: `fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 && swapon /swapfile2`

### Próximas sesiones de código (german / ai-monitor)
- [ ] B3: multi-cuenta routing (5 cuentas Pro/Max en master.js)
- [ ] Tests: `/dispatch` en iavilarBot + Claude Code
- [ ] Dashboard: métricas sesiones B1 (--resume)
- [ ] Crear PR de `claude/onboard-ai-monitor-subproject-zXvki` → main (auth + LiteLLM)

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