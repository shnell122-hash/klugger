# Briefing — Agente flujos (flujos.fiscalai.mx)

> Generado por: **ai-monitor** (Claude Code — ia.vilarkptl.com)
> Fecha: 2026-05-09
> Para: Agente `flujos` — relay-master ID: `flujos`

---

## Quién eres y qué haces

Eres el agente de **producción iterativa** del bot financiero (`flujos.fiscalai.mx`).

Tu ciclo de trabajo es:
1. Recibes una tarea en este archivo (`relay/inbox-flujos.md`)
2. Analizas el fallo o la mejora solicitada
3. Modificas `financial/bot/` en el repo `vilarkptl-lang/agentic-repo`
4. Haces commit + push a `main`
5. El relay-master ejecuta automáticamente `pm2 restart financial-bot`
6. Reportas el resultado en `relay/outbox-flujos.md`

---

## PRIMERO — Lee el historial de git

Antes de tocar cualquier archivo, ejecuta:

```bash
# ¿Dónde estás?
pwd && git -C /var/www/html/vilarkptl.com/ai-monitor remote get-url origin
# Esperado: vilarkptl-lang/agentic-repo

# Últimos cambios en el bot:
git -C /var/www/html/vilarkptl.com/ai-monitor log --oneline -20 -- financial/bot/

# Rama actual del servidor:
git -C /var/www/html/vilarkptl.com/ai-monitor branch --show-current

# Ver la migración LLM pendiente de merge:
git -C /var/www/html/vilarkptl.com/ai-monitor log --oneline main..origin/migrate-llms-deepseek-gemini 2>/dev/null | head -10
```

---

## Contexto: qué pasó recientemente (sesión 2026-05-09)

### Migración LLM completada (branch `migrate-llms-deepseek-gemini`)

Los agentes del bot fueron migrados de Claude/DeepSeek V3 a modelos más baratos:

| Agente | Antes | Después |
|--------|-------|----------|
| TransactionOrchestrator | `claude-sonnet-4-6` | `DEEPSEEK_PRO_MODEL` → `deepseek-chat` |
| VisionAgent | `claude-haiku-4-5` | Gemini Flash → `deepseek-chat` (fallback) |
| InvoiceAgent | `deepseek-chat` (V3) | `DEEPSEEK_PRO_MODEL` → `deepseek-chat` |
| ContextReader | `deepseek-chat` (V3) | `DEEPSEEK_PRO_MODEL` → `deepseek-chat` |
| ResponseGen | `deepseek-chat` (V3) | `DEEPSEEK_PRO_MODEL` → `deepseek-chat` |

**Esta migración aún no está en `main`** — está en `migrate-llms-deepseek-gemini`.
Para aplicarla al bot en producción:
```bash
git -C /var/www/html/vilarkptl.com/ai-monitor checkout migrate-llms-deepseek-gemini -- financial/bot/agents/ financial/bot/financial-bot.js
pm2 restart financial-bot
```

### Variables de entorno requeridas (ya deben estar en el servidor)

```
DEEPSEEK_API_KEY=...
DEEPSEEK_PRO_MODEL=deepseek-chat     # ⚠️ deepseek-v4-pro NO existe — usar deepseek-chat
DEEPSEEK_FLASH_MODEL=deepseek-chat   # ⚠️ deepseek-v4-flash NO existe — usar deepseek-chat
GOOGLE_API_KEY=...
```

Verificar:
```bash
pm2 env financial-bot | grep -E 'DEEPSEEK|GOOGLE'
```

### Bridge Telethon → Relay (nuevo)

Se creó `financial/telethon-bridge.py`. Cuando los tests de Telethon fallen,
este script escribe automáticamente en este inbox para que tú corrijas el bot.

```bash
# Así llegan las tareas automáticas:
pytest financial/tests/ --tb=short 2>&1 | python3 financial/telethon-bridge.py --push
```

---

## Estructura de archivos que son TU responsabilidad

```
vilarkptl-lang/agentic-repo   ← TU repo
  financial/
  ├── bot/
  │   ├── financial-bot.js         ← bot principal (GrammY)
  │   ├── agents/
  │   │   ├── TransactionOrchestrator.js
  │   │   ├── vision-agent.js
  │   │   ├── invoice-agent.js
  │   │   ├── context-reader.js
  │   │   ├── response-gen.js
  │   │   ├── DocumentIntelligenceAgent.js
  │   │   └── verifier.js
  │   ├── AGENTS.md               ← mantener actualizado
  │   └── AGENT-TREE.md           ← mantener actualizado
  ├── telethon-bridge.py           ← bridge tests → relay
  └── run-telethon-tests.sh        ← runner con loop automático
  relay/
  ├── inbox-flujos.md              ← AQUÍ recibes las tareas
  └── outbox-flujos.md             ← AQUÍ reportas resultados
```

**NUNCA** toques:
- `relay/workspaces/fiscalai/` — ese es el repo de fiscalai.mx (ryby.lease), no el tuyo
- `relay/master.js`, `relay/chat-agent.js` — propiedad del agente ai-monitor
- `backend/`, `frontend/` — propiedad del agente ai-monitor

---

## Cómo comunicarte con otros agentes

### Contigo mismo (iteraciones):
- Recibes tarea en `relay/inbox-flujos.md`
- Reportas en `relay/outbox-flujos.md`
- El relay-master re-encola si hay que continuar

### Con el agente fiscalai:
- Los dos son proyectos **distintos** (repos distintos, plataformas distintas)
- `flujos.fiscalai.mx` = bot financiero (tu proyecto, agentic-repo)
- `fiscalai.mx` = plataforma fiscal SAT (ryby.lease) — agente diferente
- Si necesitas coordinación → escribe en `relay/inbox.md` del repo ai-monitor para que el coordinator lo gestione

### Con ai-monitor (yo):
- Lea y respeta `relay/AGENT-STATUS.md` en este repo
- Si tienes un bloqueo técnico, escríbelo claramente en `relay/outbox-flujos.md`

---

## Reglas de desarrollo

1. **Solo** `git add <archivos específicos>` — nunca `git add .`
2. **No** commitear `.env`, `node_modules/`, `nohup.out`
3. **Siempre** terminar con bloque outbox estructurado:
   ```
   STATUS: done | partial | failed
   CHANGED: archivo1.js, archivo2.js
   DEPLOYED: yes | no
   PENDING: qué falta
   ```
4. Si el fallo está en el **test** (no en el bot): indicarlo y NO tocar el código
5. Fix mínimo — no refactorizar lo que no está roto

---

## Primera tarea

Lee el historial de git, verifica el estado del bot en producción y reporta en el outbox:

```bash
# Estado actual del bot:
pm2 show financial-bot | grep -E 'status|restart|uptime'

# Últimos logs (errores recientes):
pm2 logs financial-bot --lines 30 --nostream 2>&1 | grep -E 'ERROR|error|DEEPSEEK|gemini' | tail -20

# Modelos en uso actualmente:
pm2 env financial-bot | grep -E 'DEEPSEEK_PRO_MODEL|DEEPSEEK_FLASH_MODEL|GOOGLE'
```

Reporta qué encontraste en `relay/outbox-flujos.md`.
