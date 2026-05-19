budget_usd_max: 0.8

## Deploy analisis-wp — Verificación post-dispatch

Ejecutar en el servidor los siguientes pasos:

1. Cambiar remote de origin:
   cd /var/www/html/analisis-wp
   git remote set-url origin https://github.com/vilarkptl-lang/analisis-wp.git

2. Fetch y reset:
   git fetch origin
   git reset --hard origin/main

3. Listar contenido:
   ls -la

4. Verificar que existen:
   - webapp.py
   - run.py
   - requirements.txt
   - templates/index.html

Reportar en outbox-ai-monitor.md cuando esté listo.

Dispatch original: f5071fdd-1890-480d-93ea-722e886b3aad

---
## Outbox — rellenar antes de terminar la sesión

```
STATUS: done | partial | failed
CHANGED: archivo.js:línea, otro.js
COMMIT: (hash)
DEPLOYED: yes | no
PENDING: (qué falta o "nada")
USER_REQUIRED: no | sí — (razón)
```
