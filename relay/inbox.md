# Verificar spawn y outbox push

Ejecuta y reporta en la respuesta:

```bash
whoami && echo "HOME=$HOME" && echo "CLAUDE_VERSION=$(claude --version 2>/dev/null || echo n/a)"
```

Este es un test end-to-end: verifica que el spawn funciona como usuario correcto
y que el outbox llega a GitHub sin el bug de reset hard.
