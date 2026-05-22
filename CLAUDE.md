# VILAR Legal OS — Notas de desarrollo para Claude

## Servidor de producción

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

exec_server() {
  local CMD="$1"
  local CWD="${2:-/var/www/catalogos/OCR/v59-repo/agentic-repo}"
  local BODY
  BODY=$(python3 -c "import sys,json; print(json.dumps({'cmd':sys.argv[1],'cwd':sys.argv[2]}))" "$CMD" "$CWD")
  curl -s --max-time 30 -X POST "$EXEC_URL" \
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
