# Smoke test agente AI Monitor

## Plan

1. Ejecuta `whoami` y anota el usuario del sistema
2. Ejecuta `claude --version` y anota la versión
3. Ejecuta `echo $ANTHROPIC_API_KEY | cut -c1-12` (no mostrar la key completa)
4. Crea `/tmp/relay-smoke-test.txt` con fecha, usuario y versión de Claude
5. Lee el archivo creado y confirma su contenido

## Criterios de verificación

- [ ] Usuario NO es `root` (debe ser `german` o `claude-agent`)
- [ ] `claude --version` retorna versión ≥ 2.x
- [ ] `ANTHROPIC_API_KEY` disponible (primeros 12 chars visibles)
- [ ] Archivo `/tmp/relay-smoke-test.txt` creado y legible

## Resultados

Al terminar reporta exactamente:

```
## Resultados
✅/❌ Usuario del sistema: [valor]
✅/❌ Claude version: [valor]
✅/❌ API key disponible: [primeros 12 chars]
✅/❌ Archivo /tmp/relay-smoke-test.txt: [contenido]
```
