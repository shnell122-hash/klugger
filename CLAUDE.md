# VILAR Legal OS — Notas de desarrollo para Claude

## URLs de entornos

| Entorno | URL pública | Puerto interno | PM2 |
|---------|------------|----------------|-----|
| **Producción v59** | https://ocr.ruby.lease/OCR/v59/ | 5005 | `vilar-legal-os-v59` |
| **Testing v60** | https://ocr.ruby.lease/testing/v60/ | Flask 5008 / Next.js 3060 | `vilar-legal-os-v60-testing` / `vilar-v60-nextjs` |
| **GitHub** | https://github.com/vilarkptl-lang/agentic-repo/tree/claude/ocr-v59-implementation-vOcPD | — | — |
| **Claude proxy Max** | http://127.0.0.1:5001 (interno) | 5001 | `claude-proxy-max` |

## REGLA: Siempre entregar links al terminar

Al completar cualquier tarea de desarrollo, **siempre incluir en el mensaje final**:

```
### Links de deploy
- Producción: https://ocr.ruby.lease/OCR/v59/
- Testing v60: https://ocr.ruby.lease/testing/v60/
- GitHub (rama): https://github.com/vilarkptl-lang/agentic-repo/tree/claude/ocr-v59-implementation-vOcPD
- Commit: https://github.com/vilarkptl-lang/agentic-repo/commit/<SHA>
```

Incluir solo los links relevantes para la tarea realizada. Si solo se modificó testing, omitir producción; si solo se hizo commit sin deploy, omitir los links de entorno.



| Campo | Valor |
|-------|-------|
| Host | `143.198.228.78` (ocr.ruby.lease) |
| Usuario SSH | `german` |
| Contraseña SSH | `romanos12_2` |
| App path | `/var/www/catalogos/OCR/v59/` |
| Repo path | `/var/www/catalogos/OCR/v59-repo/agentic-repo/` |
| Branch activo | `claude/ocr-v59-implementation-vOcPD` |
| Puerto Flask | `5005` |

## Conexión al servidor desde agentes Claude Code

```bash
# SSH directo
sshpass -p 'romanos12_2' ssh -o StrictHostKeyChecking=no german@143.198.228.78 "comando"

# Alias útil para sesión
srv() { sshpass -p 'romanos12_2' ssh -o StrictHostKeyChecking=no german@143.198.228.78 "$@"; }
# Uso: srv "pm2 status"
#      srv "pm2 restart vilar-legal-os-v59"
#      srv "pm2 logs vilar-legal-os-v59 --lines 50 --nostream"
```

**Si SSH no responde (sandbox web bloquea puerto 22), usar HTTPS:**

```bash
EXEC_TOKEN="cb5871c0aa6ccd67997237c5238017753c0b35bdd7167b56e226aff25bcbf67a"
EXEC_URL="https://ia.vilarkptl.com/api/exec"
OCR_REPO="/var/www/catalogos/OCR/v59-repo/agentic-repo"

exec_server() {
  local CMD="$1"
  local CWD="${2:-$OCR_REPO}"
  local BODY
  BODY=$(python3 -c "import sys,json; print(json.dumps({'cmd':sys.argv[1],'cwd':sys.argv[2]}))" "$CMD" "$CWD")
  curl -s --max-time 60 -X POST "$EXEC_URL" \
    -H "Content-Type: application/json" \
    -H "x-exec-token: $EXEC_TOKEN" \
    -d "$BODY" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output') or d.get('error','(sin output)'))"
}

# Ejemplos:
exec_server "pm2 status"
exec_server "pm2 logs vilar-legal-os-v59 --lines 30 --nostream"
exec_server "pm2 restart vilar-legal-os-v59"
```

**IMPORTANTE — `cp` no está permitido. Para copiar archivos usar `node -e`:**

```bash
# Copiar archivo individual
exec_server "node -e \"require('fs').copyFileSync('/var/www/catalogos/OCR/v59-repo/agentic-repo/ocr/v59/api/routes/admin.py','/var/www/catalogos/OCR/v59/api/routes/admin.py')\""

# Copiar todos los archivos del deploy (one-liner completo)
exec_server "node -e \"const fs=require('fs'); const S='/var/www/catalogos/OCR/v59-repo/agentic-repo/ocr/v59'; const D='/var/www/catalogos/OCR/v59'; ['api/routes/admin.py','api/routes/chat.py','api/routes/artifacts.py','api/routes/upload.py','api/routes/dashboard.py','api/routes/auth.py','api/app.py','frontend/index.html','openclaw/tool_definitions.json','openclaw/tool_router.py','openclaw/soul-v59.md'].forEach(f=>{fs.copyFileSync(S+'/'+f,D+'/'+f);console.log('copied',f);});\""

# git pull usa HTTPS (la remote SSH no funciona desde el sandbox):
exec_server "git pull https://github.com/vilarkptl-lang/agentic-repo.git claude/ocr-v59-implementation-vOcPD"
```

## Deploy one-liner

```bash
cd /var/www/catalogos/OCR/v59-repo/agentic-repo && \
git pull origin claude/ocr-v59-implementation-vOcPD && \
cp ocr/v59/api/routes/chat.py        /var/www/catalogos/OCR/v59/api/routes/chat.py && \
cp ocr/v59/api/routes/artifacts.py   /var/www/catalogos/OCR/v59/api/routes/artifacts.py && \
cp ocr/v59/api/routes/imagen.py      /var/www/catalogos/OCR/v59/api/routes/imagen.py && \
cp ocr/v59/api/routes/transcribe.py  /var/www/catalogos/OCR/v59/api/routes/transcribe.py && \
cp ocr/v59/api/routes/admin.py       /var/www/catalogos/OCR/v59/api/routes/admin.py && \
cp ocr/v59/api/routes/dashboard.py   /var/www/catalogos/OCR/v59/api/routes/dashboard.py && \
cp ocr/v59/api/app.py                /var/www/catalogos/OCR/v59/api/app.py && \
cp ocr/v59/openclaw/tool_definitions.json /var/www/catalogos/OCR/v59/openclaw/tool_definitions.json && \
cp ocr/v59/openclaw/tool_router.py   /var/www/catalogos/OCR/v59/openclaw/tool_router.py && \
cp ocr/v59/openclaw/soul-v59.md      /var/www/catalogos/OCR/v59/openclaw/soul-v59.md && \
cp ocr/v59/frontend/index.html       /var/www/catalogos/OCR/v59/frontend/index.html && \
pm2 restart vilar-legal-os-v59
```

## Virtualenv

El intérprete de Python es `/var/www/catalogos/OCR/v59/venv/bin/python3`.
Para instalar paquetes: `/var/www/catalogos/OCR/v59/venv/bin/pip install <paquete>`

## Variables de entorno (.env)

Archivo: `/var/www/catalogos/OCR/v59/api/.env`

| Variable | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Claude claude-opus-4-6 |
| `FAL_KEY` | Generación de imágenes (fal.ai Flux.1) |
| `OPENAI_API_KEY` | Transcripción de audio (Whisper) |
| `APP_BASE_PATH` | `/OCR/v59` (prefijo de rutas estáticas) |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` | MySQL |

## Estructura de tablas clave

| Tabla | Contenido |
|---|---|
| `user_artifacts` | Archivos subidos por usuario (source='user') + audio/imágenes generadas (source='system') |
| `system_artifacts` | Artefactos de texto generados por Claude (contratos, análisis, transcripciones) |
| `cases` | Expedientes |
| `chat_history` | Historial de conversaciones |

## URLs compartibles (/caso/)

Los HTMLs y artefactos generados se pueden compartir en `ocr.ruby.lease/caso/<slug>`.

### Migración de BD (ejecutar UNA VEZ en producción):
```sql
ALTER TABLE system_artifacts ADD COLUMN share_slug VARCHAR(255) DEFAULT NULL;
ALTER TABLE system_artifacts ADD UNIQUE KEY uk_share_slug (share_slug);
```

### Configuración Apache (requerida para que /caso/ llegue a Flask):

```apache
ProxyPass /caso/ http://127.0.0.1:5005/caso/
ProxyPassReverse /caso/ http://127.0.0.1:5005/caso/
```
