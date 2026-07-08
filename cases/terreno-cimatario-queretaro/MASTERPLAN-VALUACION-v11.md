# /masterplan v11 — Ingesta de literatura académica → transcripción Gemini Flash → base para METHODOLOGY.md v2

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador: Opus 4.8.
> Motiva: `MethodologyAnalysis.md` (Fable + Opus + Grok + Gemini, 3 rondas) califica el modelo actual **5.5–6.0/10** vs estándares HBU/HBV profesionales (Appraisal Institute, IVS 410, RICS, IAAO) y entrega un plan de refundición con ~22 fuentes académicas. Antes de reescribir `METHODOLOGY.md` con LaTeX/pseudocódigo, hay que **ingerir esas fuentes de forma fiel y barata**.
> Regla de datos: **cero invención** — las fórmulas del futuro `METHODOLOGY.md` deben salir textual de las fuentes, no de memoria.

---

## Objetivo de v11 (acotado)

1. **Subir** los ~22 PDFs + `Chapter78-HedonicPricing082412.doc` a `cases/terreno-cimatario-queretaro/literatura/` (branch `testing`).
2. **Transcribir** cada uno a Markdown **fiel** con **Gemini 2.5 Flash** → `literatura/transcripciones/`.
3. **Gate de decisión de lectura** (abajo): con la transcripción lista, decidir por documento si (a) lo leo dirigido, (b) pido resumen estructurado a Gemini Flash → `literatura/resumenes/`, o (c) se difiere.

> v11 **NO** reescribe el `METHODOLOGY.md` todavía — eso es v12, alimentado por esta ingesta. Tampoco recolecta datos casa-habitación (v13). Esas fases se enumeran al final para contexto, sin ejecutarse aquí.

---

## Decisión: qué leer y cómo (mapeo fuente → componente del modelo, según `MethodologyAnalysis.md`)

Prioridad **P1** = fórmula/estándar que el `METHODOLOGY.md` v2 debe reproducir textual (leo dirigido a métodos/ecuaciones). **P2** = marco conceptual o caveat (leo solo ecuaciones clave / caveats). **P3** = referencia/ejemplo (basta el resumen de Gemini).

| Archivo | Fuente probable | Componente del modelo | Prioridad |
|---------|-----------------|------------------------|-----------|
| `Chapter78-HedonicPricing082412.doc` | Hedonic pricing (Rosen 1974) | Hedónico base | **P1** |
| `9789279259845-ch005.pdf` | Manual FMI precios residenciales (cap. 5) | Forma funcional log-lineal, descomposición suelo/estructura | **P1** |
| `ssrn_id2942836…` / `dp53.pdf` / `FORLand-2019-08.pdf` | Parcel size / land value (Colwell-Munneke, Guntermann, Munneke-Sirmans-Slade 2025) | **Ajuste $/m² por tamaño de lote** (la falla #1) | **P1** |
| `LeSagePace2009…spatial econometrics.pdf` | LeSage & Pace 2009 | SAR/SEM/SDM, W, GMM | **P1** |
| `anselin_rey_weights.pdf` | Anselin & Rey (PySAL) | Matrices de pesos espaciales, Moran's I, LM robustos | **P1** |
| `Fotheringham-2017-Multiscale.pdf` | MGWR (Fotheringham, Yang, Kang 2017) | **MGWR bandwidth por AICc** (reemplaza radios ad-hoc) | **P1** |
| `Geographicallyweightedregression…non-Euclidean.pdf` | GWR distancia no-euclidiana | Kernels de **distancia de red** | **P1** |
| `Standard_on_Mass_Appraisal.pdf` | IAAO Standard on Mass Appraisal | Validación AVM | **P1** |
| `OPA-Tax-Year-2023-Ratio-Study.pdf` (25 MB) | IAAO ratio study (ejemplo) | COD/PRD/PRB/PRB, hold-out | **P2** |
| `IVS_effective_…2028_Exposure_Draft…pdf` | IVS 400/410 merge | Método residual, reconciliación IVS 105 | **P1** |
| `valuation-of-development-property…pdf` | RICS Valuation of Development Property | Residual + sensibilidad + cruce comparable | **P1** |
| `Commercial_Real_Estate_Analysis…pdf` | Geltner & Miller | DCF, RLV | **P1** |
| `appraisal_overvaluation_price_adjustment_bias…pdf` | Eriksen et al. — sesgo asking-vs-cierre | **Factor list-to-sale** (defecto más grave) | **P1** |
| `urbansci-10-00134.pdf` | AHP-Entropía land suitability (10.3390/urbansci10020067) | **Pesos formales** (AHP/BWM + entropía) | **P1** |
| `entropy.pdf` | Entropía de Shannon | Pesos objetivos | **P2** |
| `Titman_1985_Urban_Land_Prices…pdf` | Titman 1985 opciones reales | Marco conceptual (flagged *flawed* por Hui&Fung) | **P2** |
| `Real_estate_development_as_an_option.pdf` | Williams 1991 / Hui&Fung | Opción real (usar **LSM/binomial**, no esto) | **P2** |
| `rchap3rdall.pdf` / `pp2.pdf` / `main.pdf` | (identificar en transcripción) | por confirmar | **P3→reclasificar** |

> Los 3 opacos (`rchap3rdall`, `pp2`, `main`) se clasifican tras la transcripción (por eso transcribir primero es correcto). BWM (Rezaei 2015), Longstaff-Schwartz (2001), SHAP (Lundberg-Lee 2017) y Cox (1972) **no** vienen como PDF en el lote → se buscarán aparte o se implementan desde su cita canónica en v12.

**Cómo leo (regla):** transcripción Markdown primero (barata, fiel) → para P1 leo la **sección de especificación/ecuaciones** del transcript; para P2 solo ecuaciones clave + caveats; para P3 basta el resumen de Gemini. Nunca la revisión de literatura/intro completa salvo que el paper *sea* el marco central.

---

## Tabla de tareas

| # | Tarea → Subtareas | Owner/Modelo | Razón | Ola ∥ | Deps | Verificación |
|---|-------------------|--------------|-------|-------|------|--------------|
| 0 | **Inventario + normalizar nombres** de los 23 archivos en `~/Downloads` (slug estable, sin espacios) | **HAIKU** | mecánico | 0 | — | 23 archivos listados con slug destino |
| 1 | **Subir a `literatura/`** (scp Mac→clone dev-2, `git add`, commit, push `testing`) | **TÚ** | red/credenciales/push | 1 | 0 | 23 archivos en `origin/testing:.../literatura/` |
| 2 | **Pipeline de transcripción Gemini 2.5 Flash** (`GEMINI_API_KEY` de Infisical): por PDF → Markdown fiel → `literatura/transcripciones/<slug>.md`. Chunking para el de 25 MB. Reanudable por archivo | **TÚ** (keys/red) + script | keys/red viva | 2 | 1 | 23 `.md` con contenido no vacío; verificación de fidelidad por muestreo |
| 3 | **Clasificar los 3 opacos** (`rchap3rdall/pp2/main`) desde su transcripción → asignar prioridad | **HAIKU** | mecánico (grep título/abstract) | 3 | 2 | cada uno con fuente + prioridad P1/P2/P3 |
| 4 | **Gate de lectura**: por documento decidir leer-dirigido vs resumen-Gemini. Los P3 → resumen estructurado Gemini Flash → `literatura/resumenes/<slug>.md` | **TÚ** (decisión) + Gemini (resúmenes) | criterio + costo | 4 | 2,3 | cada P1/P2/P3 con acción asignada; resúmenes P3 generados |
| 5 | **Índice `literatura/README.md`** (tabla fuente → componente → prioridad → estado) | **HAIKU** | mecánico | 4 ∥ | 4 | índice navegable commiteado |

## Reglas de paralelización
- Ola 0 (Haiku, inventario) mientras yo preparo el clone. Ola 1 (upload) = orquestador. Ola 2 (transcripción) corre en dev-2 con la key de Infisical — **una sola corrida batch reanudable** (evita rate-limits de Gemini). Ola 3-4 tras las transcripciones.
- Keys/red/push = orquestador. Gemini Flash hace el trabajo verboso (transcripción/resúmenes); yo solo decido y verifico.

## Gate de smoke tests
1. Los 23 archivos existen en `origin/testing:.../literatura/`.
2. `literatura/transcripciones/` tiene 23 `.md`, ninguno vacío; muestreo confirma fidelidad (números/fórmulas conservados).
3. Los 3 opacos quedaron identificados y priorizados.
4. `literatura/README.md` mapea cada fuente a su componente del modelo y estado de lectura.

## Pendientes del operador
- Confirmar que subir PDFs con copyright a un repo **privado** es aceptable (uso interno/investigación). Si el repo fuera público, mejor no versionar los PDFs (solo transcripciones/resúmenes).
- Decidir si tras el gate quieres que **yo lea los P1 dirigido** o que Gemini genere resúmenes de todo antes.

---

## Fases downstream (contexto — NO se ejecutan en v11)

- **v12 — `METHODOLOGY.md` v2**: reescritura con **LaTeX nativo + pseudocódigo + procesos**, incorporando: ajuste por tamaño de lote (Colwell-Munneke/Munneke-Sirmans-Slade), reconciliación absoluta IVS 105, hedónico espacial (SAR/SEM/SDM + MGWR por AICc), distancia de red, pesos formales (BWM + entropía) + PCA para S3-S6, validación IAAO (COD/PRD/PRB/PPE/FSD con hold-out), Monte Carlo corregido (sin GBM ni tasas diferenciadas; +VaR/CVaR), opción real por LSM/binomial, Cox para absorción, XGBoost+SHAP como challenger, fiscalidad ISR/IVA y estructura de capital.
- **v13 — Datos**: multi-fuente de comps (Inmuebles24 vía Apify/Piloterr — Cloudflare, no DataDome; Propiedades.com; Vivanuncios), **DENUE API (INEGI)** reemplazando Google Places, factor **list-to-sale**, SHF/ISABI/RPP como ancla de cierre. **Mercado casa-habitación** para precios reales de construcción (alimenta la pro-forma). Bases de datos terminadas y mejoradas.
- **Bloqueadores binarios (operador, Fase 0 del spec)**: factibilidad de agua **CEA** (emergencia hídrica feb-2025) y **dictamen CUS por escrito** (el supuesto "12 niveles" es frágil; norma de zona ≈ CUS 1.8–3.0 → 3–4 niveles). Sin estos, ningún pro-forma es válido.
