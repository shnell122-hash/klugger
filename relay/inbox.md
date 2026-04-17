# Diagnóstico rápido del entorno de ejecución

## Plan

1. Ejecuta el comando de shell: `id && echo "HOME=$HOME" && echo "KEY=${ANTHROPIC_API_KEY:0:12}..."`
2. Reporta los resultados

## Criterios de verificación

- [ ] El comando shell ejecutó sin error
- [ ] Se reporta el usuario del sistema (no debe ser root idealmente)

## Resultados

```
## Resultados
✅/❌ id: [salida]
✅/❌ HOME: [valor]
✅/❌ API KEY prefix: [primeros 12 chars]
```
