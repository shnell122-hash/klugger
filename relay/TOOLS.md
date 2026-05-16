# TOOLS.md — Herramientas Disponibles por Modo
> Referencia de todas las herramientas que los agentes pueden usar. Última actualización: 2026-05-16.

---

## Modo `full-claude-code` (Claude CLI)

Claude Code tiene acceso completo al filesystem y puede ejecutar cualquier herramienta de su suite nativa.

### Herramientas nativas de Claude Code CLI

| Herramienta | Descripción |
|-------------|-------------|
| `Read` | Leer archivos (preferir sobre `cat`) |
| `Edit` | Editar archivos con diff preciso |
| `Write` | Escribir archivos nuevos |
| `Bash` | Ejecutar comandos shell |
| `Agent` | Lanzar sub-agentes especializados |
| `WebFetch` | Obtener contenido de URLs |
| `WebSearch` | Buscar en la web |
| `NotebookEdit` | Editar notebooks Jupyter |
| `ExitPlanMode` | Salir del modo planificación |

### Comandos bash disponibles en servidor

```bash
# PM2
pm2 status | logs | restart | reload | delete
pm2 show [nombre] | pm2 save

# Git
git status | log | diff | add | commit | push | pull
git checkout | branch | merge | fetch | stash

# Node/npm
node -e "..." | node archivo.js
npm install [paquete] --prefix [dir]

# MySQL (siempre con contraseña del .env)
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /ruta/.env)
mysql -u root -p"$DB_PASS" [db] < migrate.sql

# Sistema
df -h | free -h | ps aux | lsof -i :[puerto]
curl http://localhost:[puerto]/health
```

---

## Modo `deepseek-agent` (tool loop)

DeepSeek V4-Pro con function calling. Hasta 25 turnos por tarea.

### Herramientas disponibles en deepseek-agent

#### `bash`
```json
{
  "name": "bash",
  "description": "Ejecutar un comando shell en el servidor",
  "parameters": {
    "command": "string — comando a ejecutar",
    "timeout": "number — ms (default 30000, max 120000)"
  }
}
```

**BASH_DENY** — comandos bloqueados automáticamente:
```
rm -rf
git reset --hard
git push --force
killall
shutdown
reboot
drop table
truncate
```

#### `read_file`
```json
{
  "name": "read_file",
  "description": "Leer contenido de un archivo",
  "parameters": {
    "path": "string — ruta absoluta",
    "lines_from": "number — opcional",
    "lines_to": "number — opcional"
  }
}
```

#### `write_file`
```json
{
  "name": "write_file",
  "description": "Escribir o sobrescribir un archivo",
  "parameters": {
    "path": "string — ruta absoluta",
    "content": "string — contenido completo del archivo"
  }
}
```

#### `git_commit`
```json
{
  "name": "git_commit",
  "description": "Hacer git add + commit + push de archivos específicos",
  "parameters": {
    "files": "array<string> — rutas relativas al repo",
    "message": "string — mensaje de commit",
    "repo_path": "string — ruta absoluta del repo"
  }
}
```

### Costos de deepseek-agent

```
DeepSeek V4-Pro:
  Input:  $0.00014 / 1K tokens
  Output: $0.00028 / 1K tokens
  Tarea típica (25 turnos): ~$0.02–0.08
```

---

## Modo `plan-execute` (DeepSeek planifica → Claude ejecuta)

### Fase 1: DeepSeek V4-Flash planifica

Llama a `callDeepSeekDirect()` con el task content.
Recibe un plan estructurado en markdown.
El plan se guarda en `relay/[id]-plan.md`.

### Fase 2: Claude CLI ejecuta el plan

```bash
claude --print --model claude-sonnet-4-6 "[plan generado por DeepSeek]"
```

Claude Code interpreta el plan y usa sus herramientas nativas para ejecutarlo.

---

## claude-chat-bot (`/chat` en Telegram)

Herramientas disponibles en sesión `/chat [proyecto]`:

| Herramienta | Descripción | Confirmación |
|-------------|-------------|--------------|
| `bash` | Ejecutar comando shell | Sí (si destructivo) |
| `read_file` | Leer archivo | No |
| `write_file` | Escribir archivo | No |
| `git_commit` | Commit + push | Sí |
| `visual_check` | Captura Chromium + análisis Gemini | No |
| `pm2_action` | start/stop/restart/logs de proceso | Sí |
| `github_create_repo` | Crear repositorio en GitHub | Sí |

### `visual_check`
```json
{
  "name": "visual_check",
  "description": "Captura screenshot de URL y analiza con Gemini Flash",
  "parameters": {
    "url": "string",
    "criteria": "string — qué verificar (ej: 'login form visible, no errors')",
    "timeout": "number — ms antes de captura (default 3000)"
  },
  "returns": {
    "passed": "boolean",
    "verdict": "APROBADO | NECESITA_CORRECCIÓN | ERROR",
    "analysis": "string",
    "issues": "array<string>",
    "actions_needed": "array<string>",
    "screenshot_url": "string"
  }
}
```

### `pm2_action`
```json
{
  "name": "pm2_action",
  "description": "Controlar proceso PM2 en el servidor",
  "parameters": {
    "action": "start | stop | restart | reload | logs | status",
    "process": "string — nombre del proceso PM2",
    "lines": "number — para logs (default 50)"
  }
}
```

---

## visual-check.js (standalone)

Ejecución directa:
```bash
node relay/visual-check.js "https://url.com" "criterio de verificación" 5000
# Exit 0: APROBADO
# Exit 2: NECESITA_CORRECCIÓN
# Exit 1: error
```

Output JSON:
```json
{
  "passed": true,
  "verdict": "APROBADO",
  "analysis": "La UI carga correctamente...",
  "issues": [],
  "actions_needed": [],
  "screenshot": "base64...",
  "screenshot_url": "/screenshots/check-1234567890.png"
}
```

---

## callDeepSeekWithTools() — function calling API

Para llamar a DeepSeek con herramientas desde master.js:

```js
// Definición de herramienta (formato OpenAI)
const tools = [{
  type: 'function',
  function: {
    name: 'mi_herramienta',
    description: 'Descripción de lo que hace',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'descripción' },
      },
      required: ['param1']
    }
  }
}];

// Llamada
const result = await callDeepSeekWithTools(
  systemPrompt,
  messages,
  tools,
  process.env.DEEPSEEK_PRO_MODEL,
  4096  // maxTokens
);
```

---

## Playwright (pendiente — reemplaza Chromium headless)

Estado: E3 en roadmap — no implementado aún.

```bash
# Instalar:
npm install playwright
npx playwright install chromium

# Ventaja sobre Chromium headless:
# - SPAs con Vue/React Router funcionan correctamente
# - Espera a hydration antes de capturar
# - Click, form fill, navegación programática
# - Mejor manejo de auth (cookies, sessionStorage)
```

Al implementar: reemplazar `puppeteer.launch()` en `visual-check.js` con `playwright.chromium.launch()`.
