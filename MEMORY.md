# MEMORY.md — Gestión de contexto y compactación semántica

> Actualizado: 2026-05-10.

---

## Cuándo compactar

- Sesión con **>25-30 mensajes** (riesgo de overflow)
- Contexto estimado **>80,000 tokens**
- Antes de leer archivos grandes (>50KB)
- Antes de una operación costosa (push de múltiples archivos)

---

## Formato de resumen compacto (≤400 palabras objetivo)

```markdown
## Estado actual
- Rama: <nombre> | Último commit: <SHA corto>
- Bot: online | Dashboard: online | DB: migración vN aplicada

## Archivos modificados (esta sesión)
- ruta/archivo.js — qué cambió (1 línea)
- ruta/otro.py — qué cambió

## Pendiente
- [ ] tarea pendiente 1
- [ ] tarea pendiente 2

## Errores resueltos
- Causa raíz → fix aplicado (1 oración)
```

---

## Qué INCLUIR en el resumen

- Archivos modificados: `ruta/archivo.js:línea — qué cambió`
- Errores resueltos: causa raíz + fix en una oración
- PRs mergeados: número + título + SHA corto
- Pendientes: lista bulleted sin contexto extra
- Variables de entorno si cambiaron

## Qué NO INCLUIR

- Bloques de código completos (solo snippets de 1-3 líneas si son esenciales)
- Logs del servidor (solo el mensaje de error, no el stack trace)
- Contenido completo de archivos SQL o configuración
- Historial de intentos fallidos (solo el fix final)
- Contexto de arquitectura general (está en CLAUDE.md)
- Archivos de más de 3KB de contenido inline

---

## Presupuesto de tokens por operación

| Operación | Tokens estimados | ¿Seguro en sesión pesada? |
|-----------|-----------------|---------------------------|
| Read archivo < 20KB | ~5,000 | ✅ Sí |
| Read archivo 20-50KB | ~5,000–13,000 | ⚠️ Con cuidado |
| Read archivo 50-80KB | ~13,000–21,000 | ⚠️ Solo si contexto < 50k |
| Read archivo > 80KB | ~21,000+ | ❌ No — usar Edit puntual |
| push_files con 5 archivos < 20KB c/u | ~5,000 por archivo | ✅ Sí en batches |
| push_files con archivo 103KB | ~26,000 | ❌ No en sesión pesada |

---

## Estrategia de lectura para archivos grandes

```bash
# 1. Verificar tamaño primero:
wc -c ruta/archivo.js && wc -l ruta/archivo.js

# 2. Buscar solo lo que necesitas:
grep -n "constructor\|new Agent" ruta/archivo.js

# 3. Ver solo las líneas relevantes:
sed -n '95,110p' ruta/archivo.js

# 4. Si necesitas leer el archivo completo (> 80KB):
#    → Abrir sesión nueva y limpia
#    → Read en chunks de ≤1,600 líneas (offset 0, limit 1600; luego offset 1600, limit 800)
```

---

## Memoria de agentes en relay

### Carga de memoria (relay/master.js)

- Máximo 15 entradas en `loadAgentMemory()`
- Resumen de sesión anterior se guarda en `relay/workspaces/[agente]/agent-memory.md`
- Al inicio de cada tarea, relay-master inyecta la memoria en el system prompt

### Formato de memory.md por agente

```markdown
# Memoria del agente [id]

## Última sesión: [fecha]
- Completé: [lista breve]
- Dejé pendiente: [lista breve]
- Archivos modificados: [lista]

## Contexto persistente
- [hechos técnicos importantes que no cambiarán pronto]
```

---

## Regla de oro de compactación

> Si el resumen supera 600 palabras, está incluyendo demasiado.
> Si el agente necesita ese detalle, debe re-leerlo directamente del archivo, no del resumen.
