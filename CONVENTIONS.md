# CONVENTIONS.md — Estándares y reglas de desarrollo

> Aplicar en todas las sesiones. Actualizado: 2026-05-10.

---

## Reglas de git (obligatorias)

```bash
# ✅ Siempre agregar archivos específicos:
git add ruta/archivo.js

# ❌ Nunca usar:
git add .
git add -A

# ❌ Nunca commitear:
node_modules/   .env   nohup.out   FETCH_HEAD   *.log

# ✅ Contraseña MySQL — siempre leer del .env:
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /ruta/al/.env)
mysql -u root -p"$DB_PASS" db_name < migrate.sql
```

### Formato de commit messages

```
tipo(scope): descripción corta en español

Ejemplos:
feat(financial): añadir soporte IAS multi-beneficiario
fix(relay): corregir regex de .env loader
deploy: financial-bot.js — DeepSeek + Gemini integration
relay(inbox): coordinator → fiscalai — refactor auth
```

---

## Reglas de manejo de archivos (CRÍTICAS)

### ⚠️ Antes de tocar CUALQUIER archivo grande

```bash
wc -c ruta/del/archivo.js   # verificar tamaño primero
```

| Tamaño | Acción permitida |
|--------|------------------|
| < 50 KB | Read completo + Write/Edit normal |
| 50–80 KB | Read en chunks de ≤1,600 líneas máximo |
| > 80 KB | **Solo `Edit` puntual**. Nunca re-escritura completa. |
| > 80 KB en sesión con >25 mensajes | **Abrir sesión nueva y limpia** |

### Regla de oro para archivos grandes

> Usar `Edit` (edición puntual de líneas específicas) en lugar de `Write` completo.
> Un archivo de 103 KB = ~26,000 tokens. Supera el límite de 25,000 del `Read` tool.

### Herramientas permitidas según tamaño

```bash
# Para archivos < 80 KB:
Read tool → Edit tool

# Para archivos > 80 KB — solo edición puntual:
Edit tool con old_string/new_string específicos
# NUNCA: cat (trunca en bash), Write completo, get_file_contents MCP

# Para verificar contenido de un archivo grande sin leerlo completo:
grep -n "patron" archivo.js        # buscar línea específica
sed -n '95,105p' archivo.js        # ver solo líneas 95-105
wc -l archivo.js                   # contar líneas
```

---

## Reglas de sesión

1. **Máximo 3 objetivos por sesión**
2. **Deploy siempre como tarea separada** — nunca combinar con cambios de código
3. **Sesiones con >25-30 mensajes** → no leer archivos grandes, crear sesión nueva
4. **Al inicio de sesión** → verificar tamaños con `wc -c` antes de tocar archivos

---

## Estándares de código

### JavaScript (Node.js)

```js
'use strict';                          // siempre al inicio
const { algo } = require('modulo');   // destructuring para imports
// Sin comentarios obvios — solo WHY no-obvio
// Sin docstrings multi-línea
// Sin console.log en producción (usar solo para errores y startup)
```

### Variables de entorno

```js
// ✅ Siempre desde process.env:
const API_KEY = process.env.DEEPSEEK_API_KEY;

// ❌ Nunca hardcodear:
const API_KEY = 'sk-abc123';
```

### Manejo de errores

```js
// ✅ Solo validar en boundaries (input usuario, APIs externas):
try { ... } catch (err) { console.error('[módulo]', err.message); }

// ❌ No añadir fallbacks para escenarios imposibles
// ❌ No duplicar validaciones que el framework ya hace
```

---

## Estructura de archivos

### Outbox estructurado (obligatorio al terminar cada tarea)

```
STATUS: done | partial | failed
CHANGED: ruta/archivo1.js, ruta/archivo2.css
DEPLOYED: yes | no
PENDING: descripción de lo pendiente
USER_REQUIRED: acción que necesita intervención humana
```

### Branches

| Branch | Propietario | Uso |
|--------|-------------|-----|
| `main` | todos | Producción — merge via MCP push_files |
| `claude/agent-monitoring-dashboard-4v8iq` | ai-monitor | Feature branch ai-monitor |
| `claude/financial-multiagent-system-YwtYQ` | finbot | Feature branch financial |
| `cursor/financial-bot-env-review-*` | Cursor | Revisiones Cursor |

---

## Regla de consistencia de dependencias

Cuando cambies constructores en `agents/`:
```bash
# 1. Buscar todos los archivos que instancian ese agente:
grep -r "new AgentNombre(" financial/bot/

# 2. Actualizar TODOS los call sites encontrados
# 3. Verificar con golden_suite.py que G09-G11 pasan
```
