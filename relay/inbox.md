# Test rápido — whoami y versión de claude

Ejecuta y reporta output:

```bash
whoami && id
```

```bash
/usr/local/bin/claude --version 2>/dev/null || claude --version 2>/dev/null || echo "claude no encontrado en PATH"
```

```bash
echo "RELAY_OK_$(date +%s)"
```

Tres comandos, tres outputs. Nada más.
