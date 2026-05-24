# CONVENTIONS.md — Convenciones del Sistema
> Reglas obligatorias para todos los agentes. Última actualización: 2026-05-16.

---

## REGLA CRÍTICA DE COSTO

```
NUNCA usar ANTHROPIC_API_KEY para inferencia.
Claude SOLO se usa vía Max subscription (claude-proxy, $0).
delete process.env.ANTHROPIC_API_KEY está en línea 5 de master.js — NO remover.

Stack de LLMs:
  Coding/planning:  DeepSeek V4-Pro / V4-Flash  (DEEPSEEK_API_KEY)
  Visión/UI check:  Gemini Flash                  (GOOGLE_API_KEY)
  Ejecución agente: Claude CLI (Max, $0)           (claude-proxy)
  Code review:      DeepSeek V3                   (DEEPSEEK_API_KEY)
```

---

## Git

```bash
# ✅ CORRECTO — archivos específicos
git add relay/master.js relay/projects.json
git commit -m "feat: descripción concisa"
git push origin main

# ❌ PROHIBIDO
git add .                    # puede incluir .env, node_modules
git add -A                   # igual
git commit --amend           # no en commits ya pusheados
git reset --hard origin/main # sin backup primero
git push --force             # nunca a main

# NUNCA commitear:
node_modules/
.env
nohup.out
FETCH_HEAD
*.log
```

### Formato de commits

```
feat: descripción del nuevo feature
fix: descripción del bug corregido
refactor: descripción del refactor
docs: descripción del cambio de documentación
dispatch: [origen]→[destino] descripción de la tarea
status: [agente] — resumen de sesión
merge: descripción del merge
```

### Antes de hacer reset en servidor
```bash
# SIEMPRE verificar primero:
git log origin/main..HEAD --oneline
# Si hay commits no pusheados → backup o push primero
git branch backup/server-main-$(date +%Y%m%d) HEAD
```

---

## Formato de outbox estructurado (OBLIGATORIO)

Todo agente debe terminar su tarea con este bloque exacto:

```
STATUS: done | partial | failed
CHANGED: ruta/archivo1.js, ruta/archivo2.css
DEPLOYED: yes | no
PENDING: descripción de lo que falta (o "ninguno")
USER_REQUIRED: acción que necesita el usuario (o "ninguna")
```

**Ejemplo:**
```
STATUS: done
CHANGED: relay/master.js, relay/projects.json
DEPLOYED: no
PENDING: pm2 restart relay-master en servidor
USER_REQUIRED: ejecutar: pm2 restart relay-master --update-env
```

---

## Variables de entorno

### Nombres obligatorios (no cambiar ni hardcodear)
```bash
# relay/.env
TELEGRAM_BOT_TOKEN
ANTHROPIC_API_KEY      # SOLO para claude-proxy (no usar directamente)
DEEPSEEK_API_KEY
DEEPSEEK_PRO_MODEL    # ej: deepseek-v4-pro
DEEPSEEK_FLASH_MODEL  # ej: deepseek-v4-flash
GOOGLE_API_KEY
LITELLM_BASE_URL=http://localhost:4000
LITELLM_MASTER_KEY

# financial/bot/ (mismos nombres, nunca otros)
process.env.ANTHROPIC_API_KEY   # Claude → TransactionOrchestrator (fallback)
process.env.GOOGLE_API_KEY      # Gemini → DocumentIntelligenceAgent
process.env.DEEPSEEK_API_KEY    # DeepSeek → InvoiceAgent, ContextReader, ResponseGen
```

---

## Código

```
- No agregar comentarios obvios — solo el WHY cuando no es evidente
- No docstrings multi-línea innecesarios
- No manejo de errores para casos imposibles — confiar en garantías del framework
- No abstracciones prematuras — 3 líneas similares no justifican un helper
- No feature flags de compatibilidad hacia atrás cuando se puede cambiar directo
- No hardcodear claves, URLs, IDs de modelo
- No console.log en producción sin condición de debug
```

---

## Migraciones SQL

```bash
# SIEMPRE así — nunca mysql -u root -p interactivo
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env)
mysql -u root -p"$DB_PASS" ai_monitoring < backend/db/migrate-vN.sql
```

Nombrar migraciones: `migrate-v[N].sql` donde N es el siguiente número disponible.
Siempre usar `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

---

## Deploy

Incluir siempre al final del outbox los comandos exactos de deploy:

```bash
# Cambios en relay/master.js o relay/*.js:
pm2 restart relay-master --update-env

# Cambios en backend/:
pm2 restart ai-monitor

# Cambios en financial/bot/:
pm2 restart financial-bot

# Cambios en dashboard-financial/:
cd dashboard-financial && npm run build && pm2 restart financial-dashboard

# NUNCA hacer npm install en producción sin indicación explícita
```

---

## Reglas de sesión

1. **Máximo 3 objetivos por sesión** — si hay más, priorizar y dejar el resto en PENDING
2. **Deploy siempre como tarea separada** — no mezclar con cambios de código en el mismo commit
3. **Actualizar AGENT-STATUS.md al terminar** — siempre, sin excepción
4. **Leer AGENT-STATUS.md al empezar** — siempre, sin excepción
5. **Verificar conflictos antes de merge** — preguntar al coordinator si hay duda
