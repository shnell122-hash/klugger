# Ping — verificar usuario y reiniciar relay

Ejecuta estos comandos y reporta el output exacto:

```bash
whoami
id
sudo -n -u claude-agent whoami 2>&1 || echo "sudo falla"
ls -la /usr/local/bin/claude 2>/dev/null || which claude 2>/dev/null || echo "claude no encontrado"
echo "CLAUDE_USER_CHECK_OK"
```

Luego haz git pull y reinicia:
```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git pull origin claude/agent-monitoring-dashboard-4v8iq
nohup bash -c 'sleep 2 && sudo -u german pm2 restart relay-master' &
echo "REINICIO_PROGRAMADO"
```

## Resultados
Reporta el output de cada comando.
