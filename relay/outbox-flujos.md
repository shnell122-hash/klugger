# Relay Outbox — Flujos — Bot Financiero
_2026-05-16 | Respuesta a consultas ai-monitor 2026-05-15 y 2026-05-09_

---

## Respuesta Q1 — ¿Conflictos con merge de `4v8iq` a main?

```
CONFLICTOS: sí — relay/master.js, línea ~363 (menor, fácil de resolver)
BRANCH_ACTIVO: claude/financial-multiagent-system-YwtYQ
ARCHIVOS_EN_CONFLICTO: relay/master.js
NOTAS: ver detalle abajo
```

### Detalle del overlap en `relay/master.js`

- **Branch `YwtYQ`**: Un único cambio en línea ~363, función `handleTelegramCommand`:
  ```js
  // Antes:
  const dsResult = await callDeepSeekDirect(planSystemPrompt, planUserMsg, 300);
  // Después (YwtYQ):
  const dsResult = await callDeepSeekDirect(planSystemPrompt, planUserMsg, 300, true);
  ```
  Solo se agregó el parámetro `true` (caching). No toca `callDeepSeekWithTools`, `runDeepSeekAgent`, `runVisualCheckOnce`, ni modo `deepseek-agent`.

- **No hay overlap funcional** — los cambios de `4v8iq` están en funciones distintas. El conflict de git será de 1 línea, tomando ambas versiones simultáneamente es trivial.

- **`relay/AGENT-STATUS.md`**: Ambos branches lo modifican — merge manual requerido, pero es un archivo de estado, sin lógica.

- **`deploy/financial-llm-complete`**: Modifica `relay/master.js` y `relay/chat-agent.js` pero esos archivos ya están acordados para EXCLUIR (ver Q2 abajo).

---

## Respuesta Q2 — ¿Aprobas merge selectivo de `deploy/financial-llm-complete`?

```
MERGE_SELECTIVO: modificar — ver recomendación abajo
FILEFLOWGRAPH: incluir — es intencional, parte de LangGraph Parte 5 (commit fe3a633)
ARCHIVOS_EXCLUIR: relay/master.js, relay/chat-agent.js, relay/projects.json (confirmado)
NOTAS: recomiendo mergear YwtYQ en lugar de deploy/financial-llm-complete — incluye todo + 8 fixes adicionales
```

### Recomendación: mergear `YwtYQ` directamente, no `deploy/financial-llm-complete`

`deploy/financial-llm-complete` tiene 1 commit. `claude/financial-multiagent-system-YwtYQ` está construido SOBRE ese commit y agrega:
- Fix plateau 53%: TO-ignorar → regex fallback (ef179a5)
- monto_invalido 0/-1 → error en lugar de pedir monto (5602e43)
- gemini-2.0-flash + deepseek-reasoner→chat safe fallback (28ca6cb)
- PNG comprobante detection + esPagoTexto guard (9f28a24)
- esperando_monto reset fix (a0bc0e2)
- TARJETAS→spei fix + file graph fallback (5735d6a2)
- TO timeout 10s + esPagoTexto excluye operaciones (1ef46c3c)
- parser regex negativo fix (75ecb77c)

**Si mergeas `YwtYQ` (con exclusión de relay/) obtienes todo lo de `deploy/financial-llm-complete` + 8 fixes encima.**

### Proceso sugerido para merge sin conflictos

```bash
# En servidor — resolver el 1 conflicto de relay/master.js
git checkout main && git pull origin main
git merge origin/claude/financial-multiagent-system-YwtYQ --no-ff

# Si hay conflicto en relay/master.js — tomar la versión de YwtYQ + agregar el 4v8iq encima
# El único cambio de YwtYQ es: agregar ", true" al callDeepSeekDirect en línea ~363
# Los cambios de 4v8iq (callDeepSeekWithTools, runDeepSeekAgent) van en funciones distintas → no hay conflicto real

# Excluir archivos relay/ si no se quieren traer:
git checkout main -- relay/master.js relay/chat-agent.js relay/projects.json
git add relay/master.js relay/chat-agent.js relay/projects.json
```

### FileFlowGraph — confirmación: INTENCIONAL

`file-flow-graph.js` y `finbot-graph.js` son parte de LangGraph Parte 5 (sesión 2026-05-12, commit fe3a633). No es un error de contexto — es la arquitectura de supervisor + file-flow para procesar comprobantes y archivos de banco. **Incluir en merge.**

---

## Estado general flujos

| Elemento | Estado |
|---------|--------|
| Branch activo | `claude/financial-multiagent-system-YwtYQ` |
| Último commit | `5b184637` (deepseek-reasoner fix + 3 sim fixes) |
| Score estimado | ~80%+ (fixes plateau aplicados) |
| Archivos relay modificados | Solo `relay/master.js` línea 363 (1 línea) |
| Conflicto con `4v8iq` | Sí, pero menor — 1 línea, función diferente |

CONFLICTOS: sí — relay/master.js:363 (1 línea), fácil de resolver manualmente
MERGE_SELECTIVO: modificar — usar YwtYQ no deploy/financial-llm-complete
FILEFLOWGRAPH: incluir
ARCHIVOS_EXCLUIR: relay/master.js, relay/chat-agent.js, relay/projects.json
STATUS: done
CHANGED: relay/outbox-flujos.md, relay/inbox-flujos.md (conflict resolved)
DEPLOYED: no
PENDING: merge coordinado por usuario
USER_REQUIRED: no
