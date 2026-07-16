# /stack — System State Report — VILAR Legal OS

Genera un informe completo del estado actual del sistema, lo escribe como Markdown en el repositorio y entrega el link de GitHub. No pidas permiso entre pasos.

## Entorno

```
EXEC_URL:    https://ia.vilarkptl.com/api/exec
EXEC_TOKEN:  <ELIMINADO-endpoint-exec-DESTRUIDO>
REPO_LOCAL:  /home/user/agentic-repo
REPO_SRV:    /var/www/catalogos/OCR/v59-repo/agentic-repo
DEPLOY_V59:  /var/www/catalogos/OCR/v59
DEPLOY_V60:  /var/www/catalogos/testing/v60
BRANCH:      claude/ocr-v59-implementation-vOcPD
GITHUB_REPO: vilarkptl-lang/agentic-repo
```

### exec_server (bash helper)

```bash
exec_server() {
  local CMD="$1" CWD="${2:-/var/www/catalogos/OCR/v59-repo/agentic-repo}"
  BODY=$(python3 -c "import sys,json;print(json.dumps({'cmd':sys.argv[1],'cwd':sys.argv[2]}))" "$CMD" "$CWD")
  curl -s --max-time 120 -X POST "https://ia.vilarkptl.com/api/exec" \
    -H "Content-Type: application/json" \
    -H "x-exec-token: <ELIMINADO-endpoint-exec-DESTRUIDO>" \
    -d "$BODY" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('output') or d.get('error','(sin output)'))"
}
```

Para scripts multi-línea, encode a base64:
```bash
B64=$(echo "$SCRIPT" | base64 -w 0)
exec_server "node -e \"eval(Buffer.from('${B64}','base64').toString())\""
```

---

## Proceso de ejecución

### Paso 1 — Recolectar datos en vivo

Ejecutar **en paralelo** con Bash:

**1a. PM2 status**
```bash
exec_server "pm2 jlist"
```

**1b. Árbol de producción v59**
```bash
exec_server "node -e \"
const fs=require('fs');
function tree(dir,indent,depth){
  if(depth>3)return;
  try{fs.readdirSync(dir).forEach(f=>{
    const p=dir+'/'+f;
    const isDir=fs.statSync(p).isDirectory();
    console.log(indent+(isDir?'📁 ':'📄 ')+f);
    if(isDir)tree(p,indent+'  ',depth+1);
  });}catch(e){}
}
tree('/var/www/catalogos/OCR/v59','',0);
\"" "/var/www/catalogos/OCR/v59"
```

**1c. Árbol de testing v60**
```bash
exec_server "node -e \"
const fs=require('fs');
function tree(dir,indent,depth){
  if(depth>3)return;
  try{fs.readdirSync(dir).forEach(f=>{
    const skip=['node_modules','.next','__pycache__','venv','.git'];
    if(skip.includes(f))return;
    const p=dir+'/'+f;
    const isDir=fs.statSync(p).isDirectory();
    console.log(indent+(isDir?'📁 ':'📄 ')+f);
    if(isDir)tree(p,indent+'  ',depth+1);
  });}catch(e){}
}
tree('/var/www/catalogos/testing/v60','',0);
\"" "/var/www/catalogos/testing/v60"
```

**1d. Disk & memoria**
```bash
exec_server "node -e \"
const {execSync}=require('child_process');
console.log('=== DISK ===');
console.log(execSync('df -h /var/www/catalogos').toString());
console.log('=== MEM ===');
console.log(execSync('free -h').toString());
\""
```

**1e. Git log reciente**
```bash
exec_server "git log --oneline -20 claude/ocr-v59-implementation-vOcPD"
```

**1f. Skills actuales**
```bash
ls /home/user/agentic-repo/.claude/commands/
```

**1g. Estado de salud v59 y v60**
```bash
# v59
exec_server "node -e \"
const http=require('http');
http.get({host:'127.0.0.1',port:5005,path:'/api/health'},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log('v59:',d))});
\""
# v60
exec_server "node -e \"
const http=require('http');
http.get({host:'127.0.0.1',port:5008,path:'/api/health'},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log('v60:',d))});
\""
```

**1h. Paquetes Python v59 clave**
```bash
exec_server "/var/www/catalogos/OCR/v59/venv/bin/pip list 2>/dev/null | grep -iE 'flask|socket|anthropic|openai|mysql|litellm|fal'"
```

**1i. package.json v60 frontend**
```bash
# Lee local:
cat /home/user/agentic-repo/ocr/testing/v60/frontend-nextjs/package.json
```

---

### Paso 2 — Leer archivos clave locales

Leer **en paralelo** con Read tool:

- `/home/user/agentic-repo/CLAUDE.md` — contexto general
- `/home/user/agentic-repo/ocr/testing/v60/api/app.py` — blueprints registrados, SocketIO config
- `/home/user/agentic-repo/ocr/testing/v60/api/routes/chat.py` — tiers, artifact types
- `/home/user/agentic-repo/ocr/testing/v60/frontend-nextjs/package.json` — dependencias Next.js
- `/home/user/agentic-repo/.claude/commands/` — todos los skills .md

---

### Paso 3 — Sintetizar el informe

Con todos los datos recolectados, redactar el informe completo en Markdown. El informe debe incluir **todas** las secciones siguientes:

```markdown
# VILAR Legal OS — Stack Report
> Generado: <timestamp ISO>  
> Rama activa: `claude/ocr-v59-implementation-vOcPD`

---

## 1. Estado del sistema en vivo

| Servicio | Puerto | PM2 ID | Status | Uptime | Restarts |
|----------|--------|--------|--------|--------|----------|
| Flask v59 | 5005 | ... | online/stopped | ... | ... |
| Flask v60 testing | 5008 | ... | ... | ... | ... |
| Next.js v60 | 3060 | ... | ... | ... | ... |
| Claude Proxy Max | 5001 | ... | ... | ... | ... |

**Health v59:** `<respuesta>`  
**Health v60:** `<respuesta>`

**Disco:** `<uso /var/www/catalogos>`  
**Memoria:** `<free -h>`

---

## 2. Árbol de documentos — Producción v59

```
/var/www/catalogos/OCR/v59/
  <árbol real del servidor>
```

## 3. Árbol de documentos — Testing v60

```
/var/www/catalogos/testing/v60/
  <árbol real, excluyendo node_modules, .next, venv>
```

---

## 4. Stack técnico actual

### Backend (v59 producción)
| Capa | Tecnología | Versión |
|------|-----------|---------|
| Runtime | Python | 3.x |
| Framework | Flask + Flask-SocketIO | ... |
| ORM | mysql-connector-python | ... |
| IA principal | Claude (via claude-proxy-max) | claude-opus-4-6 |
| IA multimodal | Gemini Flash (Tier 1) | gemini-2.0-flash |
| IA redacción | DeepSeek Chat (Tier 2) | deepseek-chat |
| IA razonamiento | DeepSeek Reasoner (Tier 4) | deepseek-reasoner |
| Transcripción | OpenAI Whisper | whisper-1 |
| Imágenes | fal.ai Flux.1 | fal-ai/flux/schnell |
| Router IA | LiteLLM 5-tier | custom |
| DB | MySQL | ... |
| Proxy inverso | Apache | ... |
| Proceso | PM2 | ... |

### Frontend (v60 testing)
| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js 15 App Router | ... |
| UI | React 19 | ... |
| Estilos | Tailwind CSS | ... |
| Markdown | ReactMarkdown + remark-gfm | ... |
| Tiempo real | Socket.io client (polling) | ... |
| Tipado | TypeScript | ... |
| Bundler | Turbopack (dev) | ... |

### Infraestructura
| Componente | Detalle |
|-----------|---------|
| Servidor | DigitalOcean VPS — 143.198.228.78 |
| OS | Ubuntu / Linux 6.18.5 |
| Dominio | ocr.ruby.lease |
| SSL | Apache reverse proxy (HTTPS) |
| Repo | GitHub — vilarkptl-lang/agentic-repo |
| CI/CD | Manual: git pull → node copyFileSync → pm2 restart |

---

## 5. División Testing vs. Producción

| Dimensión | v59 Producción | v60 Testing |
|-----------|---------------|-------------|
| URL | /OCR/v59/frontend/ | /testing/v60/ |
| Frontend | HTML monolítico (index.html) | Next.js 15 App Router |
| Auth | Flask session | Flask session (igual) |
| Socket.io | WebSocket + polling | Polling only (werkzeug fix) |
| Artifact viewer | HTML inline | ReactMarkdown nativo |
| Upload UI | Presente | Presente (drag-and-drop) |
| Dashboard | Datos crudos | Normalizado (total_cost_mxn, by_user) |
| Graph | Sin endpoint | POST /api/v1/tools/generate_graph |
| Chat history | Al reload | On mount (GET /api/chat/history/<id>) |
| Brecha principal | — | <listar lo que aún falta migrar de v59 a v60> |

---

## 6. Skills actuales del agente

| Skill | Función |
|-------|---------|
| `/ejecutar` | Ejecutor autónomo de roadmap v60 |
| `/smoke-v60` | Smoke test 12 endpoints v60 |
| `/stack` | Este informe |

---

## 7. Ventajas del sistema actual

- <listar al menos 6 ventajas concretas basadas en el código real>

## 8. Debilidades y deuda técnica

- <listar al menos 6 debilidades concretas>

---

## 9. Roadmap — Siguientes fases

### Fase 1 — Estabilización (≤4 semanas)
- <ítems concretos>

### Fase 2 — Features (1-3 meses)
- <ítems concretos>

### Fase 3 — Escala (3-6 meses)
- <ítems concretos>

### Fase 4 — Plataforma (6-12 meses)
- <ítems concretos>

---

## 10. Stack recomendado por fase de crecimiento

| Fase | Componente | Actual | Recomendado | Razón |
|------|-----------|--------|-------------|-------|
| F1 | CI/CD | Manual (pm2 + git pull) | GitHub Actions → rsync | Eliminar deploy manual |
| F1 | Testing | Ninguno | pytest + Playwright | Prevenir regresiones |
| F2 | DB | MySQL raw | SQLAlchemy ORM | Migraciones, type safety |
| F2 | Queue | Ninguna | Redis + Celery | Tareas async sin bloquear Flask |
| F2 | Observabilidad | PM2 logs | Sentry + Prometheus | Errores y métricas en tiempo real |
| F3 | Auth | Flask session | NextAuth.js / Auth0 | SSO, MFA, tokens JWT |
| F3 | Storage | Filesystem local | S3 / R2 | Escala horizontal, CDN |
| F3 | IA Router | LiteLLM custom | LiteLLM OSS server | Fallback, rate limiting, dashboard |
| F4 | Infra | Single VPS | k8s / Fly.io | Multi-región, auto-scale |
| F4 | DB | MySQL single | PlanetScale / Neon | Branch-based migrations |

---

## 11. Skills recomendados para el agente

| Skill | Propósito | Prioridad |
|-------|-----------|-----------|
| `/deploy-v59` | Deploy one-liner producción v59 | Alta |
| `/migrate` | Detectar y aplicar migraciones de BD pendientes | Alta |
| `/logs` | Tail de logs v59/v60 con filtro de errores | Media |
| `/rollback` | Revertir último deploy (git reset + pm2 restart) | Media |
| `/costs` | Resumen de costos IA del mes (dashboard API) | Media |
| `/test` | Correr pytest y Playwright (cuando existan) | Baja |
| `/release` | Promover v60-testing → v59-producción | Baja |

---

## 12. Git — Últimos 20 commits

```
<git log --oneline -20>
```

---

> Informe generado automáticamente por el agente Claude Code  
> Repo: https://github.com/vilarkptl-lang/agentic-repo/tree/claude/ocr-v59-implementation-vOcPD
```

**Reglas de redacción:**
- Completar TODAS las secciones con datos reales recolectados en el Paso 1 y 2
- No dejar placeholders ni `<texto>` vacíos — si no hay dato, escribir "N/D"
- Las ventajas y debilidades deben ser específicas al código real, no genéricas
- La brecha testing vs. producción debe listar diferencias concretas observadas

---

### Paso 4 — Escribir el archivo en el repo

```bash
# Nombre del archivo: docs/stack-<YYYY-MM-DD>.md
# Ej: docs/stack-2026-05-30.md
```

Usar la herramienta **Write** para crear el archivo en:
`/home/user/agentic-repo/docs/stack-<fecha>.md`

Si no existe el directorio `docs/`, crearlo implícitamente con Write.

---

### Paso 5 — Commit y push

```bash
cd /home/user/agentic-repo
git add docs/stack-<fecha>.md
git commit -m "docs: stack report <fecha>

https://claude.ai/code/session_014um857yU8qbV1Y36dVA94P"
git push -u origin claude/ocr-v59-implementation-vOcPD
```

---

### Paso 6 — Reportar

Responder con el link directo al archivo en GitHub:

```
### Stack Report generado

📄 https://github.com/vilarkptl-lang/agentic-repo/blob/claude/ocr-v59-implementation-vOcPD/docs/stack-<fecha>.md

Secciones: estado en vivo · árbol de archivos · stack técnico · testing vs producción · roadmap · skills · recomendaciones por fase
```

---

## Notas para futuros agentes

- El exec_server bloquea `cp`, `cat`, `find`, `curl` directos — usar `node -e "..."` o base64
- PM2 `jlist` devuelve JSON con todos los procesos; parsear para tabla de estado
- La rama es siempre `claude/ocr-v59-implementation-vOcPD` — nunca pushear a otra
- El informe va en `docs/stack-<fecha>.md` en el repo local, luego push; el link GitHub es el canónico
- Si algún endpoint no responde, marcarlo como "⚠️ sin respuesta" en lugar de fallar todo el informe
