# VILAR Legal OS — Notas de desarrollo para Claude

## Entorno de producción

- **Servidor:** ocr.ruby.lease (Ubuntu, Apache2 + PM2 + MySQL)
- **App path:** `/var/www/catalogos/OCR/v59/`
- **Repo path:** `/var/www/catalogos/OCR/v59-repo/agentic-repo/`
- **Branch activo:** `claude/ocr-v59-implementation-vOcPD`
- **Puerto Flask:** 5005

## ⚠️ SIEMPRE usar el virtualenv

El intérprete de Python de la app es:
```
/var/www/catalogos/OCR/v59/venv/bin/python3
```

PM2 lo usa directamente vía `ecosystem.config.js` (campo `interpreter`).

**Para instalar paquetes en producción SIEMPRE usar:**
```bash
/var/www/catalogos/OCR/v59/venv/bin/pip install <paquete>
```

**NUNCA usar `pip install` global ni `apt install python3-xxx`** — rompe
el aislamiento y puede conflictuar con otros proyectos en el mismo servidor.

## Deploy one-liner

```bash
cd /var/www/catalogos/OCR/v59-repo/agentic-repo && \
git pull origin claude/ocr-v59-implementation-vOcPD && \
cp ocr/v59/api/routes/chat.py        /var/www/catalogos/OCR/v59/api/routes/chat.py && \
cp ocr/v59/api/routes/artifacts.py   /var/www/catalogos/OCR/v59/api/routes/artifacts.py && \
cp ocr/v59/api/routes/imagen.py      /var/www/catalogos/OCR/v59/api/routes/imagen.py && \
cp ocr/v59/api/routes/transcribe.py  /var/www/catalogos/OCR/v59/api/routes/transcribe.py && \
cp ocr/v59/api/app.py                /var/www/catalogos/OCR/v59/api/app.py && \
cp ocr/v59/openclaw/tool_definitions.json /var/www/catalogos/OCR/v59/openclaw/tool_definitions.json && \
cp ocr/v59/openclaw/tool_router.py   /var/www/catalogos/OCR/v59/openclaw/tool_router.py && \
cp ocr/v59/openclaw/soul-v59.md      /var/www/catalogos/OCR/v59/openclaw/soul-v59.md && \
cp ocr/v59/frontend/index.html       /var/www/catalogos/OCR/v59/frontend/index.html && \
pm2 restart vilar-legal-os-v59
```

## Instalación de nuevas dependencias Python

```bash
/var/www/catalogos/OCR/v59/venv/bin/pip install <paquete>
pm2 restart vilar-legal-os-v59
```

## Instalación de dependencias del sistema

```bash
apt install -y ffmpeg           # requerido para transcripción
pip install yt-dlp              # ojo: este es el global; yt-dlp es un CLI
# o mejor:
/var/www/catalogos/OCR/v59/venv/bin/pip install yt-dlp
```

## Variables de entorno (.env)

Archivo: `/var/www/catalogos/OCR/v59/api/.env`

| Variable | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Claude claude-opus-4-6 |
| `FAL_KEY` | Generación de imágenes (fal.ai Flux.1) |
| `OPENAI_API_KEY` | Transcripción de audio (Whisper) |
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

Si el VirtualHost de Apache solo hace proxy de `/api/` pero sirve el frontend
como archivos estáticos, hay que añadir la ruta `/caso/` al proxy:

```apache
# En el VirtualHost de ocr.ruby.lease:
ProxyPass /caso/ http://127.0.0.1:5005/caso/
ProxyPassReverse /caso/ http://127.0.0.1:5005/caso/
```

Si ya hay un `ProxyPass / http://127.0.0.1:5005/` catch-all, no se necesita
nada adicional (Flask maneja `/caso/` automáticamente).

Verificar con: `curl -I https://ocr.ruby.lease/caso/test`
— Si responde 404 de Flask: Apache ya pasa la ruta (correcto).
— Si responde 404 de Apache: añadir las líneas ProxyPass arriba.
