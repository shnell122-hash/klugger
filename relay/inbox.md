# Dashboard v2 — Knowledge base, project tabs, costos y .env scan

## Contexto
Repo: /var/www/html/vilarkptl.com/ai-monitor
Backend: backend/server.js (Express + Socket.io + MySQL `ai_monitoring`)
Frontend: frontend/index.html + frontend/js/dashboard.js + frontend/css/dashboard.css

Antes de cualquier cambio: `git pull origin claude/agent-monitoring-dashboard-4v8iq`

---

## Tarea 1 — Escanear todos los .env del servidor

Ejecuta:
```bash
find / -name '.env' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null
```

Para cada .env encontrado extrae (sin imprimir valores sensibles):
- Ruta completa
- Nombre del proyecto (inferido del path)
- Variables presentes (solo nombres, no valores)
- Si tiene: ANTHROPIC_API_KEY, GITHUB_TOKEN, TELEGRAM_BOT_TOKEN, DB_HOST

Guarda el reporte en `/var/www/html/vilarkptl.com/ai-monitor/relay/env-scan.json`:
```json
[
  {
    "project": "ai-monitor",
    "path": "/var/www/html/vilarkptl.com/ai-monitor/relay/.env",
    "has_anthropic": true,
    "has_github": true,
    "has_telegram": true,
    "vars": ["GITHUB_TOKEN", "ANTHROPIC_API_KEY", ...]
  }
]
```

---

## Tarea 2 — MySQL: nuevas tablas para knowledge base y costos

Añade al schema de `ai_monitoring`:

```sql
-- Historial de tareas por proyecto (knowledge base)
CREATE TABLE IF NOT EXISTS project_tasks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  project_name VARCHAR(128),
  task_title VARCHAR(256),
  task_content TEXT,
  result_summary TEXT,
  exit_code INT,
  duration_sec INT,
  tool_call_count INT DEFAULT 0,
  cost_usd DECIMAL(10,6) DEFAULT 0,
  api_key_hash VARCHAR(16),   -- últimos 4 chars del API key usada
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  INDEX idx_project (project_id),
  INDEX idx_started (started_at)
);

-- Proyectos registrados (de projects.json + .env scan)
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128),
  repo VARCHAR(512),
  url VARCHAR(512),
  branch VARCHAR(128),
  github VARCHAR(128),
  api_key_hint VARCHAR(16),   -- últimos 4 chars
  total_cost_usd DECIMAL(10,4) DEFAULT 0,
  task_count INT DEFAULT 0,
  last_task_at DATETIME,
  context_md TEXT,            -- markdown para nuevo chat
  active TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
);
```

Corre el SQL en la base de datos `ai_monitoring`.

---

## Tarea 3 — Backend: endpoints nuevos

En `backend/routes/` crea o modifica:

### `backend/routes/projects.js`
- `GET /api/projects` — lista todos los proyectos con costo total, task_count, last_task_at
- `GET /api/projects/:id` — detalle de un proyecto
- `GET /api/projects/:id/tasks` — historial de tareas (últimas 50)
- `GET /api/projects/:id/costs` — costos agrupados por día (últimos 30 días)
- `PUT /api/projects/:id/context` — actualizar context_md

### En `backend/routes/events.js`
Al recibir un POST /api/events con `event_type: 'task_complete'`, insertar en `project_tasks`.

### En `backend/server.js`
Registrar la nueva ruta: `app.use('/api/projects', require('./routes/projects'))`

---

## Tarea 4 — Frontend: 3 pestañas nuevas

### 4a. Pestaña "Proyectos" (nueva vista principal)

Tarjetas por proyecto mostrando:
- Nombre + estado (activo/detenido)
- Costo total acumulado en USD
- Número de tareas completadas
- Última tarea (título + tiempo relativo)
- Botón "Ver detalle"

### 4b. Vista detalle de proyecto (modal o subpágina)

Pestañas dentro:
1. **Historial** — lista de tareas con ✅/❌, duración, costo, título
2. **Costos** — gráfica de barras por día (Chart.js, últimos 30 días) desglosando costo por API key hint
3. **Contexto** — textarea con markdown listo para copiar:
   ```
   # Contexto: [Nombre del proyecto]
   
   **Repo**: [repo]
   **Branch**: [branch]
   **URL**: [url]
   **Directorio**: [repo path en servidor]
   
   ## Últimas 5 tareas
   [lista]
   
   ## Instrucciones
   Eres el agente para [nombre]. Tu directorio de trabajo es [repo].
   Lee el código antes de modificar. Reporta en formato ## Resultados.
   ```
   Con botón "Copiar al portapapeles".

### 4c. Pestaña "Knowledge Base" (árbol de archivos)

Muestra árbol de archivos del repo del proyecto activo. Ejecuta via API:
```bash
find [repo] -not -path '*/.git/*' -not -path '*/node_modules/*' | head -200
```
Visualiza como árbol colapsable (HTML `<details>/<summary>`).
Al hacer click en un archivo, muestra sus últimas modificaciones (git log --follow).

---

## Tarea 5 — Sincronizar projects.json con tabla MySQL

Crea `backend/scripts/sync-projects.js`:
```js
// Lee relay/projects.json y upsert en tabla projects
// Lee relay/env-scan.json y agrega api_key_hint
// Corre una vez: node backend/scripts/sync-projects.js
```
Ejecútalo después de crearlo.

---

## Plan
1. Escanear .env → env-scan.json
2. Correr SQL para nuevas tablas
3. Crear backend/routes/projects.js
4. Registrar ruta en server.js
5. Crear sync-projects.js y ejecutar
6. Añadir pestañas Proyectos y Knowledge Base en frontend
7. Añadir vista detalle con sub-pestañas Historial / Costos / Contexto
8. pm2 restart ai-monitor
9. Verificar en http://ia.vilarkptl.com

## Criterios de aceptación
- [ ] env-scan.json existe con al menos 3 proyectos documentados
- [ ] `SHOW TABLES` muestra project_tasks y projects
- [ ] GET /api/projects devuelve JSON con proyectos
- [ ] Pestaña Proyectos visible en ia.vilarkptl.com
- [ ] Vista detalle abre con pestañas Historial / Costos / Contexto
- [ ] Botón Copiar contexto funciona
- [ ] Árbol de archivos visible en Knowledge Base

## Resultados
Reporta aquí output de cada paso.
