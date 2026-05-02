# AGENT-STATUS.md — Estado compartido entre agentes

> ⚠️ **PROTOCOLO OBLIGATORIO**: Todo agente que trabaje en este repo DEBE:
> 1. **Leer este archivo AL INICIO** de su sesión
> 2. **Actualizar este archivo AL FINAL** de su sesión con commit + push
> 3. Nunca hacer acciones destructivas (reset, drop, rm -rf) sin verificar "En progreso"

_Fusión de AGENT-STATUS.md + ESTADO-SERVIDOR.md — 2026-05-02_

---

## Última sesión por agente

| Agente | Sesión/Branch | Último cambio | Estado |
|--------|--------------|---------------|--------|
| Claude Code (`claude/agent-monitoring-dashboard-4v8iq`) | 2026-05-02 12:43 | Redesign, toggle tema, SYSTEM.md, audit, Cursor integration, AGENT-STATUS.md, PR #21 | ✅ Pusheado |
| Claude Code (`claude/onboard-ai-monitor-subproject-zXvki`) | 2026-05-02 11:35 | LiteLLM activado, auth login, kptl-credito detenido, ESTADO-SERVIDOR.md | ✅ Pusheado |
| relay-master / fiscalai-front | 2026-05-02 08:20 | Diagnóstico sistema limpio | — |

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
| `financial-bot` | ⚠️ online | 136+ restarts |

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

- [ ] Merge PR #21 a main → `git fetch && git reset --hard origin/main` en servidor
- [ ] Crear y mergear PR de `claude/onboard-ai-monitor-subproject-zXvki` → main (auth + LiteLLM)
- [ ] Al mergear: resolver conflictos → frontend = sesión 4v8iq, server.js = sesión zXvki, AGENT-STATUS.md = este archivo, borrar ESTADO-SERVIDOR.md
- [ ] Agregar 1GB swap: `fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 && swapon /swapfile2`
- [ ] Investigar `vilar-legal-os-v59` — causa de 146k+ restarts
- [ ] `git push origin main` desde servidor (commits locales sin push)

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
