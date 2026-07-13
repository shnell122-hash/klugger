---
description: Convierte cualquier investigación en decisiones concretas para construir el MONOPOLIO del sector desde la perspectiva investigada. Toma hallazgos (mercado, UX, tech, legal, datos…), identifica los fosos estructurales, y produce las jugadas concretas para que "no exista un mejor lugar" para el trabajo que el usuario busca dominar. Integra con /masterplan.
argument-hint: <perspectiva/tema a investigar> [--jugadores lista] [--jobs lista]
---

# /investigacionmonopolica — De la investigación al monopolio

Toda investigación (UI/UX, datos, tech, legal, GTM, pricing…) debe terminar en **decisiones concretas que construyan el monopolio** del sector desde la perspectiva investigada. No es un resumen: es un plan de captura. El resultado es que, para cada *job to be done*, **no exista un mejor lugar que Klugger** — se atrae a todos los jugadores y luego se sube el costo de irse.

## Cuándo usarlo
Después (o durante) de investigar cualquier ángulo del negocio. Entra cuando ya hay hallazgos crudos (propios o de agentes web) y hay que convertirlos en **movimientos de foso**. Emparéjalo con `/masterplan` para la ejecución.

## Principio rector
**Aggregation + fosos.** Se gana la demanda con UX/datos 10× mejores (aggregation theory: si dueñas la demanda, la oferta debe venir), y luego se **encierra** con fosos que crecen con el uso. "Monopolio" = para cada job, la mejor opción por un margen que aumenta con el tiempo.

## Las 9 lentes de foso (evaluar cada hallazgo contra estas)
1. **Foso de datos** — datos propietarios que nadie más puede reunir (p.ej. precios de cierre donde no hay MLS). Crece con cada usuario.
2. **Efectos de red** — cada lado atrae al otro (agentes↔inventario↔compradores↔leads).
3. **Costos de cambio / lock-in** — el trabajo del usuario vive aquí (CRM, data rooms, estudios, sitio del agente).
4. **Confianza / verificación** — ser el árbitro de la verdad (anti-fraude, "dueño validado", AVM explicable) donde el sector es opaco.
5. **Dueño del estándar** — definir el formato/protocolo que otros adoptan (ficha, score, doc cifrado interbancario).
6. **Plataforma / ecosistema** — terceros construyen encima (extensión, API, sitios de agente).
7. **Economías de escala / costo marginal cero** — IA/datos que abaratan cada estudio siguiente.
8. **Marca / default mental** — ser el verbo del sector ("valuar en Klugger", como "googlear").
9. **Foso regulatorio/legal** — cumplimiento como barrera (LFPDPPP, link-out legal, cifrado) que el informal no puede replicar.

## Proceso
1. **Encuadra la perspectiva** (`$ARGUMENTS`): ¿qué monopolio, para qué *jobs*, para qué jugadores? Lista los **jobs to be done** (p.ej. buscar info · crear estudios · encontrar casa · compartir cifrado · acelerar venta · guiar agentes) y los **jugadores** (comprador, agente, desarrollador, banca…).
2. **Investiga con evidencia** (web + estudios propios; usa agentes en paralelo). Marca **HECHO** vs **PERCEPCIÓN**; cita fuentes. Extrae SIEMPRE tres cosas:
   - **Flaws/gaps estructurales** de los incumbentes — y **por qué no los arreglan** (incentivos, opacidad, concentración). *Ahí está el foso: lo que es estructural es defendible.*
   - **Los mejores del mundo** — qué patrón ganador copiar y **dónde AÚN son superables**.
   - **Dolores por jugador** — qué haría que cada lado del mercado se cambie.
3. **Decide la jugada por gap** — para cada gap, elige **qué foso** lo captura y **la decisión concreta** (producto/UX/dato/pricing) que lo materializa. No "deberíamos"; **haz X exacto**.
4. **Secuencia de captura** — orden: (a) UX/datos 10× que **atraen** a cada jugador; (b) el **foso** que encierra; (c) el **efecto de red** que hace que irse cueste más cada mes.
5. **Emite la tabla** (abajo) e **intégrala a `/masterplan`** (olas, owner/modelo, verificación). Marca **pendientes del operador** (decisiones humanas, legal, prod).

## Formato de salida (tabla monopólica)
| Job / objetivo (ser el mejor lugar para…) | Decisión concreta (producto/UX/dato) | Jugador que atrae | Foso (de las 9 lentes) | Verificación (prueba positiva) |
|---|---|---|---|---|
| … | … exacto, no aspiracional … | … | … | … medible … |

Cierra con:
- **Secuencia de captura** (qué se lanza primero para atraer, qué encierra después).
- **Pendientes del operador** (legal, cripto, prod, alianzas).
- **Integración con `/masterplan`** (olas + owner/modelo + deps).

## Reglas
- **Todo gap debe amarrar a ≥1 foso.** Un hallazgo sin foso es una feature, no un monopolio.
- **Prioriza lo estructural** (lo que el incumbente no puede/quiere arreglar) sobre lo cosmético.
- **Evidencia, no vibes**: HECHO vs PERCEPCIÓN, con fuente. Nada de foso imaginario.
- **Cada job debe tener un dueño** (jugador atraído) y una **prueba positiva** de que "no hay mejor lugar".
- **Legal/seguridad primero** (LFPDPPP, link-out, cifrado): un foso que viola la ley es un pasivo.

## Anti-patrones (rechazar)
- "Copiar a Zillow" sin identificar dónde es superable. ❌
- Feature sin foso (fácil de replicar por el duopolio). ❌
- Foso de datos sin plan de **cómo** se reúne el dato propietario. ❌
- Monopolio de un solo lado (sin efecto de red entre jugadores). ❌
- Recomendaciones aspiracionales ("mejorar la búsqueda") en vez de **decisiones concretas** ("NL + visión VLM sobre pgvector, explica el match"). ❌

## Integración
- **`/masterplan`** para ejecutar (olas, owner/modelo, verificación).
- Salidas viven en `estudios_mercado/` (estudio + propuesta) y se integran al `ROADMAP.md`.
- Ejemplo aplicado: `estudios_mercado/ESTUDIO-UX-INTRAINDUSTRIA.md` (UI/UX → monopolio: 3 pilares = datos propietarios + verificación + descubrimiento inteligente).
