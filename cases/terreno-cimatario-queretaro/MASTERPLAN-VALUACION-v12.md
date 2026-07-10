# /masterplan v12 — METHODOLOGY.md v2 (desde literatura) + nuevos modelos + scraping multifuente → marketing

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador: Opus 4.8.
> **Track B** de la ejecución paralela (v12 ∥ v13). Cierra la deuda metodológica que `MethodologyAnalysis.md` calificó 5.5–6.0/10.
> Regla: **cero invención** — cada fórmula del `METHODOLOGY.md v2` sale textual de las transcripciones (`literatura/transcripciones/`), en LaTeX nativo + pseudocódigo.

## Pipeline (secuencial por dependencia de conocimiento)

**#4 alimenta #3.** No son paralelos entre sí; #1 (plataforma, v13) sí corre en paralelo a todo esto.

## Tabla de tareas

| # | Tarea → Subtareas | Owner/Modelo | Ola ∥ | Deps | Verificación |
|---|-------------------|--------------|-------|------|--------------|
| **4.1** | **Ingesta multi-agente de las 23 transcripciones** (fan-out): cada agente lee su transcript P1 y extrae **ecuaciones (LaTeX) + método + cuándo aplica + mapeo al componente del modelo** → salida estructurada | **SONNET ×N** (paralelo, 1 por paper P1) | **0** | transcripciones ✅ | 1 extracción por paper P1 con fórmulas fieles |
| **4.2** | **Síntesis** de las extracciones → `methodology-inputs.md` (insumo único para escribir v2) | **OPUS** | 1 | 4.1 | doc con todas las fórmulas por componente |
| **3.1** | **Escribir `METHODOLOGY.md v2`** (LaTeX nativo + pseudocódigo + procesos): ajuste $/m² por tamaño de lote (Colwell-Munneke/Oikarinen), reconciliación absoluta IVS 105, hedónico espacial (OLS→Moran's I→LM→SAR/SEM/SDM; MGWR por AICc), distancia de red, pesos formales (BWM+entropía)+PCA, validación IAAO (COD/PRD/PRB/PPE/FSD + hold-out), Monte Carlo (sin GBM ni tasas diferenciadas; +VaR/CVaR), opción real LSM/binomial, Cox absorción, XGBoost+SHAP challenger, fiscalidad ISR/IVA + estructura de capital | **OPUS** (diseño) + Sonnet (redacción) | 2 | 4.2 | doc reproducible; ecuaciones citadas a su fuente |
| **3.2** | **Nuevos modelos de cálculo** (implementación Python: hedónico espacial + pesos + validación IAAO + Monte Carlo v2) sobre los datos actuales | **SONNET** + Haiku (corridas) | 3 | 3.1 | scripts corren; métricas IAAO reportadas (COD/PRD/PRB) |
| **5** | **Scraping completo multifuente** (Inmuebles24 vía Apify/Piloterr — Cloudflare, no DataDome; Propiedades.com; Vivanuncios) + factor **list-to-sale** + dedup | **TÚ** (proxy/red) + Sonnet | 3 ∥ | proxy IPRoyal | dataset multifuente; factor asking→cierre estimado |
| **6** | **Re-valuar Cimatario** con v2 sobre el dataset ampliado → veredicto de valor absoluto reconciliado | **TÚ** (corrida) | 4 | 3.2, 5 | rango de valor $ reconciliado IVS 105 (no percentil) |
| **7** | **Marketing no convencional Cimatario** (activos + outreach) — **después** de la metodología | **SONNET** + Fable (copy) | 5 | 6 | dossier/teaser + plan de outreach |

## Reglas de paralelización
- Ola 0: **fan-out de N Sonnet** (uno por transcript P1), archivos de salida disjuntos → sin colisión.
- Ola 2-4 secuenciales (dato/modelo). Scraping (5) ∥ modelos (3.2). Todo lo de proxy/red/deploy = orquestador.

## Gate de smoke tests
1. `methodology-inputs.md` cubre los componentes P1 con fórmulas en LaTeX citadas.
2. `METHODOLOGY.md v2` reproducible, con pseudocódigo por modelo y validación IAAO definida.
3. Nuevos modelos corren; COD/PRD/PRB reportados sobre hold-out.
4. Dataset multifuente con factor list-to-sale; re-valuación con rango absoluto reconciliado.

## Pendientes del operador
- Credencial de Apify/Piloterr (o confirmar solo Lamudi+proxy) para el scraping de Inmuebles24.
- Firmar los pesos del scoring una vez que v2 proponga BWM+entropía.
- Riesgo binario CEA de agua (fuera de código).
