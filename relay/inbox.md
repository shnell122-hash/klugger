# Paso 1 — Escanear todos los .env del servidor

```bash
find / -name '.env' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null
```

Para cada .env encontrado, extrae solo los NOMBRES de variables (no valores).
Guarda en `/var/www/html/vilarkptl.com/ai-monitor/relay/env-scan.json`:
```json
[
  {
    "project": "ai-monitor",
    "path": "/var/www/html/.../relay/.env",
    "has_anthropic": true,
    "has_github": true,
    "has_telegram": true,
    "vars": ["GITHUB_TOKEN", "ANTHROPIC_API_KEY"]
  }
]
```

## Criterios de aceptación
- [ ] env-scan.json existe en relay/
- [ ] tiene al menos 3 proyectos
- [ ] no contiene valores de variables sensibles

## Resultados
Reporta cuántos .env encontraste y el contenido de env-scan.json.
