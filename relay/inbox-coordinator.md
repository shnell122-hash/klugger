# TAREA: Deploy analisis-wp — Ricardo 2026-05-19

## Acción requerida

El repo `vilarkptl-lang/analisis-wp` acaba de recibir código (25 archivos, commit inicial).

Ejecutar en el servidor los siguientes comandos:

```bash
cd /var/www/html/analisis-wp
git remote set-url origin https://github.com/vilarkptl-lang/analisis-wp.git
git fetch origin
git reset --hard origin/main
ls -la
```

## Contexto

- Repo GitHub: https://github.com/vilarkptl-lang/analisis-wp (privado)
- Directorio servidor: /var/www/html/analisis-wp
- El directorio existe pero estaba vacío — ahora tiene el código en GitHub
- Es un inspector de frontend (Python + webapp.py + templates/)

## Verificación post-deploy

Confirmar que los archivos están en el servidor:
- webapp.py
- run.py
- requirements.txt
- templates/index.html

Reportar en outbox-coordinator.md cuando esté listo.
