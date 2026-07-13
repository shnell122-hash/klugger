# /masterplan v9 — Validación de scoring + enriquecimiento IPRoyal + cierre de pendientes v8

> Orden **no negociable: SEGURIDAD → CALIDAD → COSTO**. Orquestador: Opus 4.8.
> Motiva: cerrar los 5 pendientes que dejó v8 (ver `MASTERPLAN-VALUACION-v8.md` §"Pendientes del operador").
> Regla de datos: **cero alucinación**. Todo score deriva de los JSON de entrada vía `SCORING-SPEC.md`; todo comp nuevo trae `link`/precio/m²/coords reales o se excluye.
> **Secretos:** se consumen en runtime vía Infisical UA (machine identity de german, env=staging). **Nunca** a disco/log ni embebidos en este doc. **Rotar la credencial tras esta corrida** (viajó en texto plano por el chat).

---

## Contexto — de dónde partimos (v8 desplegado)

v8 shipeó a `testing`/staging: dataset **1,439 comps**, re-scoring, iconografía del mapa (dots=propiedades, íconos=ancla/POI), **panel de metodología** (`MetodologiaScoring.tsx`), 3 massings FinObra y panel "¿Podemos competir en precio?". Lo que quedó abierto son estos 5 frentes:

| # | Pendiente (de v8) | Naturaleza | Quién puede cerrarlo |
|---|-------------------|------------|----------------------|
| 1 | **Validar los pesos del scoring** — los ⚠️ "supuestos a validar" de `SCORING-SPEC.md` nunca fueron confirmados | decisión de negocio | **german** (el panel v8 los expone; v9 los aterriza a una checklist accionable) |
| 2 | **Reconciliar `main` ↔ `testing`** — código en `testing`, `.md` en `main`; divergido | irreversible | **german** (v9 planea; gate de operador) |
| 3 | **Presupuesto Google geocoding +231 ≈ $1.15** — no cuadrado en `api-costs.json` | contabilidad | orquestador (reconciliar ledger) |
| 4 | **QA Gemini + spot-check del mapa v8** — no hay registro de re-review sobre v8 (la última fue v6 Ola 2) | verificación | orquestador (red/keys) |
| 5 | **IPRoyal** — enriquecer ~811 comps sin metadata + Inmuebles24/Vivanuncios; `IP_ROYAL` daba 401 | proxy/red viva | orquestador (credencial IPRoyal ahora provista) |

**Decisiones de alcance (german):** (5) = **enriquecer → re-scoring → deploy**. (2) = **planear, NO ejecutar** (default seguro; el merge irreversible espera aprobación explícita).

---

## Los "supuestos a validar" del scoring (insumo para la Tarea 1)

Extraídos textualmente de `SCORING-SPEC.md`. El panel `MetodologiaScoring.tsx` los muestra; v9 los convierte en preguntas sí/no para que german firme:

| Supuesto | Valor actual (default) | Alternativa configurable | Pregunta a validar |
|----------|------------------------|--------------------------|--------------------|
| **Población de referencia** de la normalización percentil-rank | los **537 comps** de Cimatario (`NORM_MODE=percentile`) | escala absoluta con cotas externas (no hay datos hoy) | ¿"bueno/malo" es relativo a la oferta local, o quieres estándar externo? |
| **Trade-off de competencia** | `comp_net = 50 − 0.60·(sat−50) + 0.30·(val−50)` — saturación pesa el **doble** que validación (postura anti-sobreoferta) | invertir a tesis "clúster gana" vía `W_SAT`/`W_VAL` | ¿Sobreoferta = principal riesgo (conservador) o aglomeración = ventaja? |
| **Redundancia S3–S6** vs S2 (growth_surface) | S2=0.30 lleva el peso geoespacial; S3–S6 con pesos chicos (0.10/0.10/0.05/0.10) como interpretabilidad | `w3=w4=w5=w6=0` y subir `w2` (cero redundancia) | ¿Mantener capa de interpretabilidad o eliminar doble-conteo parcial? |
| **Radios/escalas de kernel** | ancla R3000/d0 500 · consumo R1200/d0 300 · equip R1000/d0 300 · comp sat R800/d0 150, val R1500/d0 400 | ajustables por señal | ¿Los radios reflejan tu tesis de alcance (auto vs caminable)? |
| **Pesos Land Score** | S1 0.30 · S2 0.30 · S3 0.10 · S4 0.10 · S5 0.05 · S6 0.10 · S7 0.05 | cualquier reponderación (suma 1.00) | ¿Precio y ubicación co-dominan (0.30/0.30)? |
| **S7 crecimiento nulo** | `inversion-proyectos.json` existe (v7); si faltara, S7=null y su peso se reparte | — | Confirmar que S7 ya entra (no está `growth_included:false`) tras v7 |

---

## Tabla de tareas

| # | Tarea → Subtareas | Owner/Modelo | Razón (sec/cal/costo) | Ola ∥ (worktree?) | Deps | Verificación |
|---|-------------------|--------------|------------------------|-------------------|------|--------------|
| **0** | **Re-auth Infisical UA** (machine identity de german, env=staging) + smoke de credenciales: `GOOGLE_MAPS`, `Fal.ai`, `IP_ROYAL`(+`_LA_API_TOKEN`), `GITHUB_PAT_TOKEN` | **TÚ** | credenciales/red viva = orquestador | **0** | — | `infisical secrets` lista las llaves; ninguna se imprime a log |
| **1** | **Aterrizar validación de pesos**: generar `SCORING-VALIDATION.md` (checklist de los 6 supuestos ↑ con default/alternativa/impacto) + wire de un botón "exportar config de pesos" en `MetodologiaScoring.tsx` para que german edite y re-corra | **SONNET** | archivo acotado, spec claro | **1** ∥ | — | doc con 6 decisiones; panel permite ver/exportar pesos efectivos; build ok |
| **2** | **Resolver credencial IPRoyal**: probar el token como (a) API de gestión y (b) **password de proxy** (`user:pass@host:port`), identificar el modo correcto contra `resi.iproyal.com`/gateway; documentar en `IPROYAL-SETUP.md` (sin secreto) | **TÚ** | proxy/red viva = orquestador | **1** ∥ | 0 | request de prueba vía proxy devuelve 200 + IP rotada distinta a la de dev-2 |
| **3** | **Enriquecer comps vía IPRoyal** en dev-2 (reanudable por checkpoint `terrenos_enriched.json`): completar ~811 sin metadata + **scrapear Inmuebles24/Vivanuncios** → sumar al dataset; parsear precio/m²/`link`/imágenes; geocodificar los nuevos (Google) | **TÚ** + agente scraper (supervisado, sandbox dev-2) | proxy+parsing+keys = orquestador | **2** | 2 | dataset ≥1,439→**objetivo ≥1,800 reales**, 0 fakes, ≥90% con coords; `api-costs.json` + ledger IPRoyal actualizados |
| **4** | **Validar dataset enriquecido** (guardas de `SCORING-SPEC.md §0.2`): descartar coords implausibles (>50 km), comps `price/size ≤0`, dedup por `link`; reporte de exclusiones | **HAIKU** (bajo Sonnet) | mecánico/determinista | **3** | 3 | `terrenos_full.json` limpio; `terrenos_excluidos.json` con motivo por fila |
| **5** | **Re-correr `compute-scores.mjs`** sobre el dataset ampliado + con los pesos que german validó (Tarea 1) → regenerar `land-scores.json`, `predio-scorecard.json`, `growth-grid.json`, `threats.json`, `scores-report.json` | **TÚ** (corrida) | dato prod-adjacent | **4** | 1,4 | guarda §0.1 (haversine ancla0==401 m) pasa; N comps = nuevo total; percentil del predio recomputado y reproducible |
| **6** | **Wire de datos nuevos al dashboard** (el mapa, ranking, scorecard y estudio leen los JSON regenerados; sin cambiar UI salvo conteos) | **SONNET** | archivos de datos + refs | **5** ∥ | 5 | build estático verde; conteos nuevos visibles; 0 errores de shape |
| **7** | **QA visual con Gemini 2.5 Flash** (vision agent, screenshots puppeteer+Chrome, PIN 1206) sobre el build v9: mapa (0 POIs como dots, ancla/POI con ícono, popups/toggles), ranking, scorecard, panel metodología | **TÚ** + Gemini | keys/red viva | **5** ∥ | 6 | veredicto Gemini registrado en journal; hallazgos ALTA = 0 |
| **8** | **Reconciliar ledger de costos** (Tarea 3 v8 geocoding $1.15 + IPRoyal + Fal + Gemini de esta ronda) en `api-costs.json` + tab Costos | **HAIKU** | mecánico | **5** ∥ | 3,7 | total del ledger cuadra con gastos reales de la sesión |
| **9** | **Build gate + commit + push `testing`** → GitHub Action → Cloudflare Pages; spot-check `/valuacion-cimatario` 200 | **TÚ** + humano | prod-adjacent | **final** | 6,7,8 | Action verde; 200; smoke gate ↓ pasa |
| **10** | **PLAN de reconciliación `main`↔`testing`** (qué rama gana por archivo, orden de merge, riesgos) — **documento, NO merge** | **OPUS** | irreversible → solo diseño | **operador** | 9 | `RECONCILIACION-MAIN-TESTING.md` listo; merge espera OK de german |

---

## Reglas de paralelización
- **Ola 1**: validación de pesos (Sonnet, archivos de docs/panel) ∥ resolver credencial IPRoyal (TÚ, red) — disjuntos.
- **Olas 2→5 secuenciales por dependencia de dato**: enriquecer → validar → re-scoring → wire. El scoring corre **una vez** sobre el dataset final; si el scraping de Inmuebles24/Vivanuncios se atora, se cierra con lo enriquecido de Lamudi y se marca lo truncado (nada de límites silenciosos).
- **Ola 5 (post-scoring)**: wire (Sonnet) ∥ QA Gemini (TÚ) ∥ ledger (Haiku) — disjuntos.
- Todo lo de **keys/red/proxy/deploy/merge = orquestador**. Build limpio final (builds paralelos corrompen `.next`).
- Tarea 10 la hace **Opus** (diseño de una operación irreversible) pero **no ejecuta**: es gate de operador.

## Gate de smoke tests (prueba positiva)
1. Credenciales Infisical resueltas; IPRoyal hace un request 200 con IP rotada (≠ IP de dev-2).
2. `terrenos_full.json` crece a ≥1,800 reales (o el máximo alcanzable, con lo truncado **logueado**); 0 fakes; ≥90% con coords.
3. `compute-scores.mjs` corre limpio; guarda haversine §0.1 pasa; `scores-report.json.meta.n_comps` = nuevo total; percentil del predio recomputado.
4. `land-scores.json` / `predio-scorecard.json` / `threats.json` regenerados y consumidos sin error de shape.
5. `SCORING-VALIDATION.md` existe con las 6 decisiones de pesos; el panel exporta la config efectiva.
6. QA Gemini sobre v9: mapa con iconografía correcta (0 POIs como dots), popups/toggles ok; hallazgos ALTA = 0.
7. `api-costs.json` cuadra (geocoding v8 $1.15 + IPRoyal + Fal + Gemini de v9).
8. Build static export verde; deploy Action verde; `/valuacion-cimatario` HTTP 200.
9. `RECONCILIACION-MAIN-TESTING.md` redactado (merge **no** ejecutado).

## Pendientes del operador
- **Validar los 6 pesos/supuestos** del scoring (Tarea 1 los aterriza; solo german firma). Es la decisión #1 de v9.
- **Aprobar (o no) la reconciliación `main`↔`testing`** tras leer el plan (Tarea 10). El merge es irreversible; no se hace sin OK explícito.
- **Rotar la machine identity de Infisical** (client-id `e046648d-…`) usada esta ronda — viajó en texto plano.
- **Modo del harness**: habilitar **accept edits** para que el orquestador lea Infisical (auto-mode bloquea el classifier de secretos).
- **Presupuesto**: IPRoyal (tráfico residencial, ~$ por GB) + Google geocoding de los comps nuevos + Fal (holgado bajo tope $5) + Gemini vision (centavos). Confirmar antes de la Ola 3.
