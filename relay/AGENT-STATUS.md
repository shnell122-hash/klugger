# AGENT-STATUS.md — Estado compartido entre agentes

> ⚠️ LEE ESTE ARCHIVO ANTES DE CUALQUIER TAREA.
> Actualízalo al terminar. Es la única fuente de verdad cross-agente.

---

## Último agente activo

| Campo | Valor |
|-------|-------|
| **Agente** | Claude Code (sesión `claude/agent-monitoring-dashboard-4v8iq`) |
| **Fecha** | 2026-05-02 |
| **Completado** | Redesign dashboard, toggle día/noche, SYSTEM.md, audit script, Cursor integration, PR #21 |
| **Branch activo** | `claude/agent-monitoring-dashboard-4v8iq` → PR #21 abierto hacia `main` |

---

## Estado de branches

| Branch | Contiene | Estado |
|--------|----------|--------|
| `main` | Versión base del sistema | ⚠️ Pendiente merge PR #21 y PR auth |
| `claude/agent-monitoring-dashboard-4v8iq` | Redesign glassmorphism, toggle tema, docs, audit | ✅ PR #21 abierto |
| `claude/onboard-ai-monitor-subproject-zXvki` | Auth/login dashboard, LiteLLM integration | ✅ En producción (no mergeado a main) |

---

## Archivos críticos — NO sobrescribir sin leer esto

| Archivo | Última modificación | Qué contiene |
|---------|-------------------|--------------|
| `frontend/index.html` | sesión 4v8iq | Redesign glassmorphism + toggle botón |
| `frontend/css/dashboard.css` | sesión 4v8iq | Tema claro + oscuro, variables CSS |
| `frontend/js/dashboard.js` | sesión 4v8iq | Fix duplicate PROVIDER_COLORS |
| `backend/server.js` | sesión zXvki | Auth middleware + login route |
| `relay/master.js` | sesión 4v8iq | Haiku buzon, prompt caching, budget inheritance |
| `relay/projects.json` | sesión 4v8iq | branch=main para ai-monitor |
| `relay/AGENT-STATUS.md` | sesión 4v8iq | Este archivo — actualizar siempre |

---

## Estado de producción (143.198.228.78)

| Proceso | Estado | Notas |
|---------|--------|-------|
| `ai-monitor` | ✅ online | Puerto 3010 |
| `relay-master` | ✅ online | 144 restarts (histórico) |
| `claude-chat-bot` | ✅ online | LiteLLM key corregida |
| `cursor-worker` | ✅ online | Sin restarts |
| `kptl-credito` | ✅ online | Fix webhook.py aplicado |
| `vilar-legal-os-v59` | ⚠️ online | 146k+ restarts — crash loop no resuelto |
| `litellm` | ✅ online | Puerto 4000 |

**Swap**: ~94% usado — CRÍTICO. Pendiente `fallocate -l 1G /swapfile2`.

---

## PRs abiertos

| PR | Branch → Base | Descripción | Estado |
|----|--------------|-------------|--------|
| [#21](https://github.com/vilarkptl-lang/agentic-repo/pull/21) | `claude/agent-monitoring-dashboard-4v8iq` → `main` | Redesign + toggle + docs | ⏳ Pendiente merge |

---

## Tareas pendientes

- [ ] Merge PR #21 a main → `git fetch && git reset --hard origin/main` en servidor
- [ ] Merge `claude/onboard-ai-monitor-subproject-zXvki` a main (auth + LiteLLM)
- [ ] Fix `vilar-legal-os-v59` — investigar causa de crash loop
- [ ] Agregar 1GB swap: `fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 && swapon /swapfile2`
- [ ] `git push origin main` desde servidor (9 commits locales sin push)

---

## Protocolo para agentes

### Antes de empezar
```
1. git pull origin main  (o el branch del proyecto)
2. cat relay/AGENT-STATUS.md
3. Verifica qué archivos críticos están en uso
4. Si otro agente tiene una tarea activa en el mismo archivo → espera o coordina
```

### Al terminar
```
1. Actualiza relay/AGENT-STATUS.md:
   - Sección "Último agente activo" con tu nombre, fecha y qué hiciste
   - Actualiza estados de archivos que modificaste
   - Agrega/tacha tareas pendientes
2. git add relay/AGENT-STATUS.md
3. git commit -m "status: [resumen de lo que hiciste]"
4. git push
```
