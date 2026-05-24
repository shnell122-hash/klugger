Despacha una tarea directamente al inbox de un agente del relay-master.

**Uso:** `/dispatch [proyecto] [descripción de la tarea]`

**Pasos a ejecutar:**

1. Lee `relay/projects.json` y muestra los proyectos activos (campo `active: true` y con `inbox` definido).

2. Si no se especificó proyecto o tarea en los argumentos del comando, pregunta al usuario cuál proyecto y qué tarea quiere despachar.

3. Escribe el siguiente contenido al archivo `inbox` del proyecto (campo `project.inbox` en projects.json):
   ```
   # Tarea despachada via Claude Code
   
   [descripción de la tarea]
   
   _Despachada por: Claude Code — [fecha ISO]_
   ```

4. Ejecuta:
   ```bash
   git add [ruta del inbox]
   git commit -m "dispatch: claude-code→[proyecto] — [primeros 60 chars de la tarea]"
   git push origin HEAD
   ```

5. Confirma con: `✅ Tarea enviada a [proyecto]. El relay la procesará en ~15s.`

**Notas:**
- El inbox de cada proyecto está en `project.inbox` dentro de `relay/projects.json`
- Si el inbox está en otro repo (ej: `/var/www/html/vilarkptl.com/DeCabeceraTax/relay/inbox.md`), hacer el commit en ese repo, no en este
- Si el inbox está dentro de este repo (`relay/inbox-*.md`), hacer el commit aquí y push a `origin main`
- No usar `git add .` — solo agregar el archivo inbox específico
