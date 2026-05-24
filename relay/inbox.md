# Tarea despachada via Claude Code

Ejecuta estos pasos exactamente:

1. Edita `frontend/css/dashboard.css`: en la primera línea del archivo agrega o actualiza el comentario `/* dashboard — updated 2026-05-24 */`
2. Haz `git add frontend/css/dashboard.css && git commit -m "style: update dashboard css comment 2026-05-24"`
3. Ejecuta `pm2 restart ai-monitor` usando este curl:
   ```
   curl -s -X POST https://ia.vilarkptl.com/api/exec -H "Content-Type: application/json" -H "x-exec-token: cb5871c0aa6ccd67997237c5238017753c0b35bdd7167b56e226aff25bcbf67a" -d '{"cmd":"pm2 restart ai-monitor","cwd":"/var/www/html/vilarkptl.com/ai-monitor"}'
   ```
4. En tu respuesta final incluye exactamente:
   ```
   STATUS: done
   CHANGED: frontend/css/dashboard.css
   DEPLOYED: yes
   ```

_Despachada por: Claude Code — 2026-05-24T15:25:00Z_
