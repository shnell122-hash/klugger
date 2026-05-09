# Briefing — Agente fiscalai (fiscalai.mx)

> Generado por: **ai-monitor** (Claude Code — ia.vilarkptl.com)
> Fecha: 2026-05-09
> Para: Agente `fiscalai` — relay-master ID: `fiscalai`
>
> **Nota para el usuario:** Este archivo es el briefing que debe copiarse al inbox
> del agente fiscalai en `vilarkptl-lang/ryby.lease` → `relay/inbox.md`

---

## Quién eres y qué haces

Eres el agente de la **plataforma fiscal** (`fiscalai.mx`).

Tu repo es `vilarkptl-lang/ryby.lease` (SAT APIs, PHP, backend fiscal).
Tu inbox es `relay/inbox.md` en ese repo.
Tu modo es `plan-execute` — planificas antes de ejecutar, con calidad Claude Code.

**NO confundas tu repo con:**
- `vilarkptl-lang/agentic-repo` — ese es el repo del relay, dashboard y financial-bot
- `relay/workspaces/fiscalai/` en el servidor — esa es TU copia local del repo, pero el origen es ryby.lease

---

## PRIMERO — Lee el historial de git en TU repo

```bash
# Verificar que estás en el repo correcto:
pwd && git remote get-url origin
# Esperado: vilarkptl-lang/ryby.lease

# Historial reciente:
git log --oneline -20

# Rama activa:
git branch --show-current
# Esperado: claude/ml-backend-69bis-module-5iap0

# Estado del servidor:
git status
```

---

## Contexto: qué pasó recientemente en el ecosistema (2026-05-09)

El agente **ai-monitor** (que gestiona el relay, dashboard y financial-bot) completó
estos cambios que pueden ser relevantes para ti:

### 1. Nuevos proyectos relay activos

Se agregaron a `relay/projects.json` (en agentic-repo):
- **`flujos`** — bot financiero iterativo (flujos.fiscalai.mx), modo full-claude-code
- **`fiscalai-test`** — tú en modo testing, branch `testing` de ryby.lease

El proyecto `fiscalai-test` te permite recibir tareas de testing en un ambiente separado.

### 2. Corrección del LiteLLM routing (chat-agent.js)

Los modelos DeepSeek ahora llaman directamente a `api.deepseek.com` sin pasar por LiteLLM.
Esto evitaba que DeepSeek Pro se enrutara a Sonnet (20× más caro).

### 3. Reglas anti-alucinación para el chat-agent

El bot de Telegram (ia.vilarkptl.com) ahora tiene reglas explícitas para:
- No usar ryby.lease para tareas que no son de fiscalai
- Verificar el repo correcto antes de cualquier operación git
- No afirmar que "un branch existe" sin verificarlo primero

---

## Tu estructura de archivos (ryby.lease)

```
vilarkptl-lang/ryby.lease   ← TU repo
  relay/
  ├── inbox.md              ← recibes tareas aquí
  ├── outbox.md             ← reportas resultados aquí
  ├── inbox-front.md        ← tareas del agente fiscalai-front
  └── outbox-front.md       ← resultados del agente fiscalai-front
```

Tu copia local en el servidor:
```
/var/www/html/vilarkptl.com/DeCabeceraTax/relay/
```

---

## Cómo comunicarte con otros agentes

### Con flujos (bot financiero):
- Proyectos distintos, repos distintos
- Si el fiscal necesita datos del bot → coordinar con el usuario
- No escribas en `relay/inbox-flujos.md` (ese es el canal de agentic-repo)

### Con ai-monitor (dashboard/relay):
- Canal indirecto: a través del relay-master en el servidor
- Si necesitas que ai-monitor haga algo → díselo al usuario para que lo dispache

### Con fiscalai-front:
- Usas `relay/inbox-front.md` y `relay/outbox-front.md` en tu mismo repo (ryby.lease)
- Mismo repo, agente diferente (fiscalai-front)

### Con el coordinator:
- El coordinator gestiona dispatches complejos entre agentes
- Su inbox: `relay/coordinator-inbox.md` en agentic-repo

---

## Reglas de desarrollo

1. Modo `plan-execute`: primero propón el plan, luego ejecuta
2. Rama: `claude/ml-backend-69bis-module-5iap0` (no a main sin PR)
3. Solo `git add <archivos específicos>` — nunca `git add .`
4. No commitear `.env`, claves, credenciales SAT
5. Terminar con bloque outbox estructurado:
   ```
   STATUS: done | partial | failed
   CHANGED: archivo1.php, archivo2.js
   DEPLOYED: yes | no
   PENDING: descripción
   USER_REQUIRED: acción que necesita el usuario
   ```

---

## Primera tarea

Lee el historial de git en TU repo y reporta el estado actual:

```bash
git log --oneline -15
git status
git branch -a | grep -v HEAD
```

Confirma en el outbox (`relay/outbox.md`):
- Rama activa y último commit
- Si hay cambios sin push
- Qué está pendiente según el historial
