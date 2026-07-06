---
description: Plan multi-agente con asignación por modelo (SEGURIDAD → CALIDAD → COSTO). Descompone un objetivo en tareas/olas y asigna cada una al tier correcto (TÚ/Opus/Sonnet/Haiku/Fable).
argument-hint: <objetivo> [--lanzar]
---

# /masterplan — Plan multi-agente con asignación por modelo

Descompone un objetivo en tareas y subtareas, asigna **cada una al tipo de agente/modelo correcto** usando toda la flota disponible de forma eficiente, y produce un plan ejecutable (opcionalmente lo lanza).

**Orden de prioridad, no negociable: SEGURIDAD → CALIDAD → COSTO.**
Nunca se sacrifica seguridad por costo, ni calidad por costo. El costo se optimiza *solo* entre tareas donde seguridad y calidad ya están satisfechas.

## Uso
```
/masterplan <objetivo>          # genera el plan (tabla de tareas + asignación)
/masterplan <objetivo> --lanzar # genera y despacha las olas paralelas
```

---

## Flota de modelos y su rol

| Tier | Rol natural | Cuándo asignarlo |
|------|-------------|------------------|
| **TÚ (orquestador, main loop)** | diseño, coordinación, integración, review final, **todo lo sensible** | credenciales, prod, acciones irreversibles, sign-off, decisiones que solo un humano/orquestador debe tomar |
| **OPUS** (paralelos) | razonamiento profundo + verificación adversarial | diseño arquitectónico delicado, tareas donde un error es caro, **review de seguridad y correctness** (paneles de jueces, voto ≥2) |
| **SONNET** (paralelos) | implementación estándar con spec claro | escribir/editar código por archivo, integración con criterio, refactors acotados |
| **HAIKU** (workers de Sonnet) | mecánico / alto volumen / barato | correr tests, grep/scan, edits repetitivos, generar casos de test, verificar un output puntual, boilerplate |
| **FABLE** (consultor externo) | segunda opinión independiente en **alta complejidad** | cuando un problema difícil se atasca o el diseño de Opus necesita un contraste: Fable entra como *abogado del diablo* / consultor, no como worker en la cadena. También prosa/naming/copy cuando el tono importa. |

> Haiku trabaja **bajo** un Sonnet (subtareas mecánicas de una tarea Sonnet), no suelto. Opus **no** se usa para lo mecánico; Haiku **no** para lo delicado. **Fable no es un eslabón de la línea de ensamblaje**: se invoca puntualmente como consultor externo ante alta complejidad (romper un empate de diseño, refutar una arquitectura, dar una lente fresca), no para producir el trabajo en serie.

---

## Regla de jerarquía de capacidad (fundacional)

**El orquestador — quien PLANEA y quien JUZGA la calidad final — debe ser el modelo MÁS capaz disponible.** Estas dos decisiones concentran casi todo el apalancamiento: un mal plan desperdicia a todos los obreros, y un juez menos capaz no atrapa los errores finos del más capaz.

- **Nunca inviertas la jerarquía** en el plan ni en el juicio: un modelo débil no debe planear obreros fuertes ni revisar su output. *El que evalúa debe ser al menos tan capaz como el evaluado.*
- El costo del orquestador se controla haciéndolo **conciso y de alta señal** (planea y revisa; los obreros hacen el trabajo verboso; usa salidas estructuradas para no re-leer transcripts) — **no** degradándolo a un modelo barato. Ahorrar la verbosidad del orquestador es *penny-wise, pound-foolish*: el costo real está en el rework de un plan mediocre.
- Excepción: si el "orquestador" es un *router* sin juicio (solo despacha al especialista correcto, sin integración cruzada), un modelo barato basta — pero eso es ruteo, no planeación.

## Reglas de asignación (aplica en este orden)

### 1. Seguridad primero (gate duro)
- **Toca credenciales, secretos, prod, red interna, o es irreversible** → **TÚ** (orquestador). Nunca se delega a un modelo más barato para ahorrar. Human-in-the-loop para prod/irreversible.
- El agente **nunca** define los límites de su propio poder; los allowlists/sandbox viven fuera de su contexto.
- Secretos: se leen en runtime (Infisical/UA), nunca a disco plano ni embebidos; nunca se imprime su valor.
- Si una tarea *lee contenido externo* y *tiene permisos peligrosos* → aísla (sandbox sin secretos de prod) + gate de confirmación.

### 2. Calidad (correctness-criticality)
- **Un error es costoso / diseño sutil / concurrencia / seguridad** → **OPUS** para el diseño, y **OPUS ×N en paralelo** para verificación adversarial (cada juez intenta *refutar*; sobrevive solo con voto ≥ mayoría).
- Implementación con spec detallado + TDD → **SONNET** (el spec + tests son la red de seguridad). Siempre **two-stage review** (spec-compliance, luego code-quality).
- Verificación con **prueba positiva**: nada se marca "listo" sin un check ejecutado que lo demuestre.

### 3. Costo-eficiencia (solo entre tareas ya seguras y de calidad suficiente)
- Lo **mecánico / alto volumen / determinista** → **HAIKU** como worker.
- Agrupa subtareas mecánicas repetidas en un solo Haiku por lote.
- No sobre-despachar: el modelo más barato que cumpla seguridad+calidad. Un Opus para grep es desperdicio; un Haiku para diseño de concurrencia es un riesgo.
- Prefiere `pipeline` sobre barreras cuando no hay dependencia cruzada (menos wall-clock ocioso).

---

## Reglas de paralelización

- **Archivos disjuntos** → paralelo. Si escriben en paralelo el mismo repo → **worktree isolation** (cada agente su árbol git, sin carreras de índice).
- **Archivos compartidos** → **secuencial** o **fusionar** en un solo agente. *Nunca* dos implementadores en paralelo sobre el mismo archivo.
- **Dependencias** → ola N+1 espera a la ola N solo si consume su salida. Si no, van juntas.
- **Verificación adversarial** → siempre múltiples agentes independientes (diversidad de lente: correctness, seguridad, reproduce-el-bug).
- Cap de concurrencia realista; declara explícitamente lo que se trunca (top-N, no-retry) — nada de límites silenciosos.

---

## Proceso

1. **Alcance**: si el objetivo es ambiguo en algo que cambia el plan, pregunta 1–2 cosas concretas; si no, decide con defaults razonables.
2. **Descompón** en tareas → subtareas (2–5 min cada subtarea, una acción por paso).
3. **Clasifica** cada tarea en 3 ejes: (a) sensibilidad de seguridad, (b) criticidad de correctness, (c) qué tan mecánica es.
4. **Asigna tier** por las reglas de arriba (seguridad→calidad→costo).
5. **Agrupa en olas paralelas** respetando conflictos de archivo y dependencias; marca cuáles necesitan worktree.
6. **Define el gate de verificación** (smoke tests / prueba positiva) que separa "hecho" de "listo".
7. **Emite el plan** (tabla, abajo). Guárdalo como doc fuente-de-verdad si el trabajo es grande.
8. Si `--lanzar`: despacha ola por ola; recoge; **review adversarial (Opus)**; **integra (tú)**; corre el gate.

---

## Formato de salida (tabla de tareas)

| # | Tarea → Subtareas | Owner/Modelo | Razón (sec/cal/costo) | Ola ∥ (worktree?) | Deps | Verificación |
|---|-------------------|--------------|------------------------|-------------------|------|--------------|
| … | … | Opus/Sonnet/Haiku/Fable/TÚ | por qué ese tier | grupo paralelo | de qué depende | prueba positiva |

Cierra con:
- **Gate de smoke tests** (lista de checks con prueba positiva).
- **Pendientes del operador** (lo que solo el humano puede hacer: rotar/otorgar credenciales, elegir ventanas, aprobar prod).

---

## Integra con superpowers
- `writing-plans` para el doc de plan detallado (task-by-task, TDD, sin placeholders).
- `subagent-driven-development` para ejecutar tarea-a-tarea con review de dos etapas.
- `dispatching-parallel-agents` para las olas paralelas.
- `using-git-worktrees` cuando varios implementadores escriben en paralelo.

## Anti-patrones (rechazar)
- Delegar lo sensible a un modelo barato "para ahorrar". ❌
- Dos Sonnet en paralelo sobre el mismo archivo. ❌
- Marcar "listo" sin prueba positiva ejecutada. ❌
- Opus para tareas mecánicas / Haiku para diseño delicado. ❌
- Truncar cobertura en silencio (sin `log` de lo omitido). ❌
