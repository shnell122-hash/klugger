# Tarea desde Chat Claude — 2026-04-15

## Escaneo de API keys + limpieza relay duplicado

1. Eliminar relay-master duplicado de claude-agent: `sudo -u claude-agent pm2 delete all 2>/dev/null; sudo -u claude-agent pm2 kill 2>/dev/null; true`
2. Verificar que solo hay UN relay-master en root pm2: `pm2 list | grep relay-master`
3. Buscar todos los archivos .env en el servidor: `find /var/www/html /home -name ".env" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null`
4. Para cada .env encontrado, extraer las API keys (líneas que contengan: ANTHROPIC, OPENAI, DEEPSEEK, FAL, ELEVENLABS, STRIPE, TWILIO) y registrarlas via: `curl -s -X POST http://127.0.0.1:3010/api/providers -H "Content-Type: application/json" -d '{"provider":"anthropic","project_name":"NOMBRE","api_key_masked":"últimos 6 chars"}'`
5. Verificar permisos de outbox.md para relay-master: `ls -la /var/www/html/vilarkptl.com/ai-monitor/relay/outbox.md`
6. Si relay-master (root pm2) no puede escribir outbox.md, corregir: `chown root:root /var/www/html/vilarkptl.com/ai-monitor/relay/ -R && chmod 755 /var/www/html/vilarkptl.com/ai-monitor/relay/`
7. Verificar que relay-master en root pm2 recibe correctamente ANTHROPIC_API_KEY: `pm2 env 15 | grep ANTHROPIC`
8. Si no tiene la key, cargarla: `pm2 restart relay-master --update-env` (después de asegurarse que relay/.env tiene ANTHROPIC_API_KEY)
9. Listar todos los providers registrados: `curl -s http://127.0.0.1:3010/api/providers`
10. Reportar en outbox.md: qué .env encontraste, qué keys hay (solo nombre de variable + últimos 4 chars del valor), y estado de relay-master
