# /masterplan v8 — Cierre de datos (→1,439) + iconografía del mapa + validación de scoring

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador: Opus 4.8.
> Alcance chico y quirúrgico sobre v7 (ya desplegado). Regla de datos: cero alucinación.
> **Excluye** reconciliación `main`↔`testing` (decisión de german).

## Objetivos
1. **Top-up del dataset a 1,439 comps reales** (ya consolidados en `scratchpad/terrenos_v7_final.json`: 1,208 con coords + 231 sin). Geocodificar los 231, swap a `terrenos_full.json`, re-correr el scoring, deploy.
2. **Mapa con iconografía distintiva**: ancla y POIs (anclas 312, competencia 54, consumo 163, equipamiento 127, inversión+polos) con **íconos especiales por categoría** (glifos/marcas tipo pin), **NO dots**. Los **círculos/dots quedan EXCLUSIVOS para los bienes inmuebles** (propiedades coloreadas por score). A golpe de vista: dot = propiedad, ícono = ancla/POI.
3. **Panel de metodología/validación de scoring**: exponer de forma transparente los pesos y supuestos de `SCORING-SPEC.md` (3 matrices de lentes, trade-off de competencia 0.60/0.30, radios de kernel, proxies declarados) para que german los revise/valide.

## Tabla de tareas

| # | Tarea → Subtareas | Owner/Modelo | Razón | Ola ∥ | Deps | Verificación |
|---|-------------------|--------------|-------|-------|------|--------------|
| 0 | **Geocodificar 231 sin coords** (Google) + validar (0 fakes, ≤5000 m², bbox QRO) → `terrenos_v7_final.json` con máx. coords | **TÚ** | keys/red viva | 0 | — | ≥1,400 comps, ≥1,300 con coords |
| 1 | **Swap** `terrenos_full.json` ← 1,439 (backup) + **re-correr `compute-scores.mjs`** | **TÚ** | dato prod-adjacent | 1 | 0 | scores regenerados sobre 1,439; percentil predio recalculado |
| 2a | **Mapa: íconos especiales para ancla/POI** (dots solo para propiedades) en `MapboxMap.tsx` | **SONNET** | archivo único, criterio visual | 2 ∥ | 1 | ancla/POI = íconos por categoría, propiedades = dots; toggles+popups+perf intactos; build ok |
| 2b | **Panel de metodología/validación** (`MetodologiaScoring.tsx` + insertar en `ValuacionTab.tsx`) | **SONNET** | disjunto de 2a | 2 ∥ | 1 | muestra pesos+supuestos fieles a SCORING-SPEC; build ok |
| 3 | **Build limpio + commit + push testing + re-review Gemini + spot-check** | **TÚ** | prod-adjacent | final | 2a,2b | Action verde; 200; mapa con íconos verificado |

| 4 | **Animaciones fieles por modelo de vivienda** (comunicar los 3 modelos): rehacer `FinObra3DBuilding.tsx` con la calidad del preview de FinObra (R3F) → **3 massings distintos y reconocibles** (híbrido co-living / torre vertical / townhouses horizontal), animación de reveal+órbita | **SONNET** (referencia `scratchpad/finobra-ref/finobra/src/preview/*`) | criterio visual, archivo acotado | +1 | referencia FinObra | 3 siluetas distintas; selector cambia massing; build ok |

## Reglas de paralelización
- Ola 0-1 secuenciales (dato). Ola 2: **2 Sonnet en archivos disjuntos** (`MapboxMap.tsx` / `ValuacionTab.tsx`+nuevo componente). Sin colisión.
- Keys/red/deploy = orquestador. Build limpio final (los builds paralelos corrompen `.next`).

## Gate de smoke tests
1. `terrenos_full.json` tiene ~1,439; land-scores regenerado con ese conteo.
2. En el mapa: 0 POIs dibujados como dots; ancla/POI todos con ícono de categoría; propiedades siguen como dots por score. Popups y toggles funcionan.
3. Panel de metodología renderiza los pesos reales de la spec (no inventados).
4. Build estático verde; deploy verde; `/valuacion-cimatario` 200.

## Pendientes del operador
- Validar los pesos tras verlos en el panel (tarea 3 los expone).
- (Diferido por decisión de german) reconciliar `main`↔`testing`.
- Presupuesto Google geocoding +231 ≈ $1.15 (dentro de lo razonable).
