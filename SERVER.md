# SERVER.md — Conexión al servidor para agentes vilarkptl-lang

> Referencia universal para cualquier agente Claude Code en cualquier repositorio de `vilarkptl-lang`.
> Última actualización: 2026-05-28

---

## Datos del servidor

| Campo | Valor |
|-------|-------|
| IP | `143.198.228.78` |
| Dominio principal | `ia.vilarkptl.com` |
| OS | Ubuntu 22.04.4 LTS |
| Usuario SSH | `german` |
| Contraseña SSH | `romanos12_2` |

---

## Método 1 — exec-lite (RECOMENDADO — systemd, siempre up)

Servicio independiente de Node.js corriendo como systemd. **No depende de PM2 ni de `ai-monitor`.**
Sobrevive crashes del backend y reinicios del servidor.

```bash
EXEC_TOKEN="<ELIMINADO-endpoint-exec-DESTRUIDO>"
EXEC_URL="https://ia.vilarkptl.com/exec-lite"

exec_server() {
  local CMD="$1"
  local CWD="${2:-/var/www/html/vilarkptl.com/ai-monitor}"
  local BODY
  BODY=$(python3 -c "import sys,json; print(json.dumps({'cmd':sys.argv[1],'cwd':sys.argv[2]}))" "$CMD" "$CWD")
  curl -s --max-time 30 -X POST "$EXEC_URL" \
    -H "Content-Type: application/json" \
    -H "x-exec-token: $EXEC_TOKEN" \
    -d "$BODY" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output') or d.get('error','(sin output)'))"
}

# Verificar que está up:
curl -s https://ia.vilarkptl.com/exec-lite/health
# → {"ok":true,"service":"exec-lite","pid":...}
```

> **Nota**: exec-lite requiere Apache activo. Si Apache está caído, la URL interna es:
> `http://127.0.0.1:3099` (solo desde dentro del servidor).

### Reinstalar exec-lite en el servidor

```bash
# Ejecutar en el servidor (SSH o consola del VPS):
cd /var/www/html/vilarkptl.com/ai-monitor
cp deploy/exec-lite.service /etc/systemd/system/exec-lite.service
systemctl daemon-reload && systemctl enable --now exec-lite
systemctl status exec-lite   # debe mostrar "active (running)"
```

---

## Método 2 — /api/exec (depende de ai-monitor)

Fallback. Solo funciona cuando el proceso `ai-monitor` (PM2) está corriendo.

```bash
EXEC_TOKEN="<ELIMINADO-endpoint-exec-DESTRUIDO>"
EXEC_URL="https://ia.vilarkptl.com/api/exec"
# (misma función exec_server — solo cambiar EXEC_URL)
```

---

## Método 3 — SSH directo

Usar cuando Apache está caído o para sesiones interactivas largas.
**Nota: el sandbox de Claude Code web bloquea el puerto 22 saliente.** Solo funciona desde CLI local.

```bash
apt-get install -y sshpass 2>/dev/null
sshpass -p 'romanos12_2' ssh -o StrictHostKeyChecking=no german@143.198.228.78 "pm2 status"

# Alias de sesión:
srv() { sshpass -p 'romanos12_2' ssh -o StrictHostKeyChecking=no german@143.198.228.78 "$@"; }
srv "pm2 restart ai-monitor"
```

---

## Apache

Apache expone todos los servicios en `ia.vilarkptl.com` (:443). Si está caído, nada es accesible externamente.

```bash
# Ver estado
exec_server "systemctl status apache2 --no-pager"

# Iniciar si está caído
# (requiere SSH o consola del VPS — exec-lite necesita Apache para funcionar externamente)
systemctl start apache2

# Recargar config (sin downtime)
exec_server "systemctl reload apache2"
```

### Rutas Apache → puertos internos

| Ruta pública | Puerto | Servicio |
|---|---|---|
| `ia.vilarkptl.com/exec-lite` | `:3099` | exec-lite (systemd) |
| `ia.vilarkptl.com/dash` | `:3030` | relay-dashboard (Next.js) |
| `ia.vilarkptl.com/api/exec` | `:3010` | ai-monitor backend |
| `ia.vilarkptl.com/` | `:3010` | ai-monitor frontend |

Config: `deploy/apache-ia.vilarkptl.com.conf` → `/etc/apache2/sites-available/ia.vilarkptl.com.conf`

---

## Ejemplos de uso

```bash
exec_server "pm2 status"
exec_server "pm2 restart financial-bot"
exec_server "pm2 logs relay-master --lines 30 --nostream"
exec_server "git log --oneline -5"
exec_server "git fetch origin main && git reset --hard origin/main"
exec_server "free -h"
exec_server "df -h"
```

### Comandos permitidos

| Categoría | Comandos |
|-----------|----------|
| PM2 | `status`, `logs`, `restart`, `stop`, `start`, `reload`, `list`, `show` |
| Git | `status`, `log`, `diff`, `fetch`, `pull`, `merge`, `push`, `checkout`, `branch`, `add`, `commit`, `reset`, `stash`, `remote` |
| MySQL | `mysql -u root ...` |
| Archivos | `cat`, `grep`, `ls`, `cp`, `mkdir`, `find`, `chmod`, `chown` |
| Sistema | `df`, `free`, `uptime`, `node`, `npm`, `systemctl status/restart/reload` |

---

## Árbol de directorios

```
/var/www/html/vilarkptl.com/
├── ai-monitor/                  ← Repo vilarkptl-lang/agentic-repo (main)
│   ├── backend/server.js        ← Express + Socket.io, puerto 3010
│   ├── backend/.env             ← DB_HOST, DB_PASS, CLAUDE_EXEC_TOKEN
│   ├── relay/master.js          ← Orquestador PM2: relay-master
│   ├── relay/projects.json      ← Config de agentes
│   ├── relay/.env               ← ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, etc.
│   ├── relay/workspaces/        ← Repos clonados por agente
│   ├── relay-dashboard/         ← Next.js, puerto 3030
│   ├── dashboard-financial/     ← Next.js, puerto 3020
│   ├── financial/bot/           ← financial-bot
│   └── deploy/
│       ├── ecosystem.config.js  ← PM2 config (todos los procesos)
│       ├── exec-lite.js         ← Exec relay systemd (puerto 3099)
│       └── exec-lite.service    ← systemd unit
│
├── pill-relay/                  ← Proyecto pill.ai
└── financial-bot/               ← financial-bot repo propio

/var/www/catalogos/
├── OCR/v59/                     ← App producción vilar-legal-os-v59
├── OCR/v59-repo/
│   └── ocr-ruby-lease/          ← Repo vilarkptl-lang/ocr-ruby-lease (main)
└── testing/v60/                 ← App testing vilar-legal-os-v60
```

---

## Procesos PM2 clave

```bash
exec_server "pm2 status"   # lista completa
```

| ID | Proceso | Puerto | Repo | Estado usual |
|----|---------|--------|------|---|
| 14 | `ai-monitor` | 3010 | agentic-repo | online |
| 7  | `relay-master` | — | agentic-repo | online |
| 25 | `claude-proxy-max` | 5001 | agentic-repo | online |
| 26-29 | `claude-proxy-pro-1..4` | 5002-5005 | agentic-repo | online (sin auth) |
| 8  | `claude-chat-bot` | — | agentic-repo | online |
| 9  | `code-reviewer` | — | agentic-repo | online |
| 15 | `cursor-worker` | — | agentic-repo | online |
| 41 | `relay-dashboard` | 3030 | agentic-repo | online |
| 44 | `financial-bot` | — | financial-bot | online |
| 43 | `financial-dashboard` | 3020 | agentic-repo | online |
| 23 | `vilar-legal-os-v59` | 5005 | ocr-ruby-lease | online |
| 36 | `vilar-legal-os-v60-testing` | 5008 | ocr-ruby-lease | online |
| 33 | `vilar-v60-nextjs` | 3060 | ocr-ruby-lease | online |
| 1  | `api-ekatena-prod` | — | — | online |
| 20 | `kptl-credito` | — | — | online |

**Procesos con errores conocidos** (no críticos para ai-monitor):
- `analisis-wp` (24) — errored
- `conversation-engine` (16) — errored

---

## Base de datos MySQL

```bash
# Leer contraseña del .env (NUNCA usar -p interactivo)
exec_server "grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env"

# Ejecutar query
exec_server "DB_PASS=\$(grep -oP 'DB_PASS=\K.*' backend/.env) && mysql -u root -p\"\$DB_PASS\" ai_monitoring -e 'SHOW TABLES'"

# Aplicar migración
exec_server "DB_PASS=\$(grep -oP 'DB_PASS=\K.*' backend/.env) && mysql -u root -p\"\$DB_PASS\" ai_monitoring < backend/db/migrate-vN.sql"
```

| Campo | Valor |
|-------|-------|
| Motor | MySQL / MariaDB |
| DB principal | `ai_monitoring` |
| Credenciales | `backend/.env` → `DB_PASS` |

---

## Deploy por subsistema

```bash
# Actualizar repo desde main
exec_server "git fetch origin main && git reset --hard origin/main"

# Solo backend
exec_server "pm2 restart ai-monitor"

# Solo relay-master
exec_server "pm2 restart relay-master"

# Aplicar nuevo ecosystem.config.js (B3, nuevos procesos)
exec_server "pm2 reload /var/www/html/vilarkptl.com/ai-monitor/deploy/ecosystem.config.js"

# relay-dashboard (build requerido tras cambios)
exec_server "cd relay-dashboard && npm install && npm run build && pm2 restart relay-dashboard" \
  "/var/www/html/vilarkptl.com/ai-monitor"

# financial-dashboard
exec_server "cd dashboard-financial && npm run build && pm2 restart financial-dashboard" \
  "/var/www/html/vilarkptl.com/ai-monitor"
```

---

## Despachar tareas al relay

```bash
# Desde cualquier agente
curl -s -X POST https://ia.vilarkptl.com/api/relay/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"project":"fiscalai","task":"Descripción de la tarea","requester":"mi-agente"}'
```

| Proyecto | Modelo | Descripción |
|----------|--------|-------------|
| `coordinator` | claude-haiku-4-5 | Coordinación entre agentes |
| `fiscalai` | claude-sonnet-4-6 | Backend FiscalAI + SAT |
| `fiscalai-front` | claude-sonnet-4-6 | Frontend FiscalAI |
| `ai-monitor` | claude-haiku-4-5 | Dashboard de monitoreo |
| `finbot-tester` | claude-sonnet-4-6 | Tester financial-bot |
| `finbot-verifier` | claude-haiku-4-5 | Verificador financial-bot |

---

## LiteLLM proxy

```
URL interna:  http://localhost:4000
Master key:   sk-litellm-11b2ccee224b47d82ba9b8e3677aa915
```

| Chain | Fallback |
|-------|---------|
| `kptl-chat` | claude-sonnet → DeepSeek V3 → GPT-4o |
| `kptl-chat-fast` | claude-haiku → GPT-4o-mini → Gemini Flash |
| `kptl-reasoning` | DeepSeek R1 → Claude Opus |

---

## ⛔ Prohibido — reglas anti-catástrofe para agentes

> Incidentes reales documentados. No omitir.

### 1. Nunca escribir configs Apache con `node -e writeFileSync` + contenido como argumento CLI

Los args CLI no interpretan `\n` → el archivo queda en una línea → Apache no arranca al reload/restart.

```bash
# ❌ DESTRUYE el config de Apache
node -e "require('fs').writeFileSync('/etc/apache2/sites-enabled/foo.conf', '<VirtualHost>\n...')"

# ✅ CORRECTO — copiar desde el repo
cp /var/www/html/vilarkptl.com/ai-monitor/deploy/apache-foo.conf /etc/apache2/sites-enabled/foo.conf
apache2ctl configtest && systemctl reload apache2
```

### 2. Siempre `apache2ctl configtest` antes de reload/restart

Un error de sintaxis en cualquier config habilitada tira Apache completo (todos los sitios caen).

```bash
apache2ctl configtest   # debe decir "Syntax OK" antes de continuar
systemctl reload apache2
```

### 3. Nunca `git reset --hard origin/main` sin verificar commits locales

```bash
# Antes del reset, verificar:
git log --oneline origin/main..HEAD   # commits locales no pusheados
# Si hay commits → pushearlos o mergearlos ANTES del reset
```

### 4. Los configs Apache viven en `deploy/` — nunca editar `/etc/apache2/` directamente

Flujo obligatorio:
1. Editar `deploy/apache-NOMBRE.conf` en el repo
2. Commit + push
3. En servidor: `git pull` → `cp deploy/apache-NOMBRE.conf /etc/apache2/sites-enabled/NOMBRE.conf`
4. `apache2ctl configtest && systemctl reload apache2`

Archivos fuente de verdad:
- `deploy/apache-ia.vilarkptl.com.conf` → HTTP :80
- `deploy/apache-ia.vilarkptl.com-le-ssl.conf` → HTTPS :443
- `deploy/apache-ocr.ruby.lease.conf` → ocr.ruby.lease HTTPS

### 5. Después de `git pull` con cambios en `deploy/exec-lite.js` → reiniciar el servicio

```bash
systemctl restart exec-lite
# Verificar: curl https://ia.vilarkptl.com/exec-lite/health
```

---

## Solución de problemas

| Síntoma | Diagnóstico | Fix |
|---------|-------------|-----|
| exec-lite no responde en HTTPS | Apache caído | `systemctl start apache2` (SSH o consola VPS) |
| `/api/exec` da "Connection refused" | ai-monitor caído | `exec_server "pm2 restart ai-monitor"` vía exec-lite |
| SSH timeout desde Claude Code web | Sandbox bloquea :22 | Usar exec-lite (Método 1) |
| Dashboard no carga | ai-monitor o Apache caído | Ver logs: `exec_server "pm2 logs ai-monitor --lines 20 --nostream"` |
| Relay no despacha | relay-master bloqueado | `exec_server "pm2 restart relay-master"` |
| OOM / swap lleno | RAM: 3.8 GB total | `exec_server "fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 && swapon /swapfile2"` |
| relay-dashboard crashea | OOM a 256M | Ya corregido a 512M en ecosystem.config.js |

---

## Verificación rápida

```bash
# ¿exec-lite up?
curl -s https://ia.vilarkptl.com/exec-lite/health

# ¿Procesos corriendo?
exec_server "pm2 list"

# ¿Memoria disponible?
exec_server "free -h"

# ¿Últimos commits en producción?
exec_server "git log --oneline -5"
```
