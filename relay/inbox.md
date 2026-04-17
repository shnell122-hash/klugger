# Actualización + env scan + reinicio de servicios

## Plan
1. Verificar estado del sistema: `hostname && date && sudo -u german pm2 list`
2. Hacer git pull del repo: `cd /var/www/html/vilarkptl.com/ai-monitor && git pull origin claude/agent-monitoring-dashboard-4v8iq`
3. Escanear archivos .env del servidor y guardar en relay/env-scan.json (solo nombres de variables, NO valores)
4. Reiniciar servicio ai-monitor: `nohup bash -c 'sleep 2 && sudo -u german pm2 restart ai-monitor' &`
5. Verificar que la API responde: `curl -s http://localhost:3010/api/health`

## Criterios de aceptación
- [ ] git pull exitoso — muestra los archivos actualizados
- [ ] relay/env-scan.json existe con al menos 2 entradas
- [ ] `curl http://localhost:3010/api/health` retorna `{"ok":true,...}`
- [ ] pm2 list muestra ai-monitor online

## Instrucciones para env-scan.json

```bash
find /var/www/html /home/german -name '.env' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -20
```

Para cada .env encontrado, extrae solo NOMBRES (no valores) y crea este JSON:
```json
[
  {
    "project": "nombre-inferido-del-path",
    "path": "/ruta/completa/.env",
    "has_anthropic": true,
    "has_github": false,
    "has_telegram": true,
    "vars": ["LISTA_DE_NOMBRES_SIN_VALORES"]
  }
]
```

Guarda en: `/var/www/html/vilarkptl.com/ai-monitor/relay/env-scan.json`
