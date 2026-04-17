# Escaneo .env — inventario de proyectos

```bash
find / -name '.env' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null
```

Para cada .env encontrado, extrae solo los NOMBRES de variables (no valores).
Guarda el resultado en `/var/www/html/vilarkptl.com/ai-monitor/relay/env-scan.json`:
```json
[
  {
    "project": "nombre-inferido-del-path",
    "path": "/ruta/al/.env",
    "has_anthropic": true,
    "has_github": true,
    "has_telegram": true,
    "vars": ["VAR1", "VAR2"]
  }
]
```

## Criterios de aceptación
- [ ] env-scan.json existe en relay/
- [ ] tiene al menos 3 entradas
- [ ] no contiene valores de variables sensibles

## Resultados
Reporta cuántos .env encontraste.
