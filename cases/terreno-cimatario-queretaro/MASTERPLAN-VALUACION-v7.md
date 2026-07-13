# /masterplan v7 — Mapeo inteligente + Scoring de mercado (dónde crece QRO, competencia, ancla, ranking de terrenos)

> Orden: **SEGURIDAD → CALIDAD → COSTO**. Orquestador: Opus 4.8.
> Motiva: feedback de german. El dashboard hoy *describe* el predio; v7 lo vuelve un **motor de decisión geoespacial**: mapea todo (ancla, competencia, destinos de consumo, equipamiento), **clasifica y rankea** cada terreno del mercado, y **puntúa el predio objeto vs el mercado** desde 3 lentes (desarrollador / comprador / inversionista).
> Regla de datos: **cero alucinación**; toda ancla/competencia/POI viene de Google Places con lat/lng real; todo score expone su fórmula y sus inputs.

---

## Diagnóstico de brechas (lo que hoy falta)

| # | Brecha (feedback german) | Estado actual | v7 |
|---|--------------------------|---------------|-----|
| 1 | **Marcas ancla no mapeadas** | Places se consultó pero solo vive en una tabla del tab HBU | Capa de **ancla en el mapa** (universidades, plazas, hospitales, corporativos, super) con íconos por categoría |
| 2 | **Punteros no llevan a la propiedad ni al link** | Popup básico | Cada puntero → popup con foto/precio/m²/$/m² + **botón "Ver listing original"** (`link` de `terrenos_full.json`) |
| 3 | **Sin clasificación de inmuebles** | Solo tier de $/m² | **Tipología** (baldío/uso, tamaño, frente, submercado) + tier |
| 4 | **Sin ranking de mejores terrenos** | — | **Score compuesto por comp** → tabla/mapa "Top terrenos para comprar" (de los 537) |
| 5 | **Sin modelo de crecimiento/inversión/riesgo** | — | **Modelo geoespacial**: vector de crecimiento de QRO, densidad de inversión, densidad de ancla (actual y futura), riesgo latente → heat/score por zona |
| 6 | **Sin análisis de equipamiento** | — | Capa de **equipamiento urbano** (educación, salud, parques, transporte) + índice de cobertura |
| 7 | **Animación FinObra genérica + sin Street View** | 3 videos (Ola 2) sin ligar a modelo; SV solo en JSON | **1 animación por modelo** (híbrido/vertical/horizontal) ligada al selector 3D + **Street View embebido** del predio |
| 8 | **Sin mapeo de destinos de consumo del usuario meta** | — | Según HBU (co-living / millennial pro): **mapear dónde consume** (coworking, café de especialidad, gym, bares, restaurantes) en colonia y ciudad; medir proximidad del predio |
| 9 | **Competencia no mapeada ni medida** | — | **Capa de competencia** (co-living / estudiantil / multifamiliar) + métricas (n, distancia, precio, saturación por zona) |
| 10 | **Places obtenido pero no mapeado** | tabla | **Todo Places al mapa** (raíz de #1, #6, #8, #9) |
| 11 | **Sin score del predio vs mercado (3 lentes)** | valuación puntual | **Scorecard**: percentil del predio en el mercado para **Desarrollador / Comprador / Inversionista**; si no es el mejor, cuánto le falta y a quién le conviene |
| 12 | **Amenazas no sistematizadas** | riesgos genéricos | **Capa/sección de amenazas** (competencia cercana, sobreoferta, zonas de riesgo, dependencia de ancla) |
| P | **Pendientes previos** | — | Integraciones cruzadas Estudio→HBU, **export JSON** del estudio completo, reconciliar `main`↔`testing`, actualizar `microroadmap.md` |

---

## Arquitectura analítica (la columna vertebral)

**Datasets nuevos (Google Places / Maps, geocodificados):**
- `data/geo/anclas.json` — ancla por categoría (universidad, plaza/mall, hospital, corporativo/oficina, supermercado) en un radio metro-relevante.
- `data/geo/competencia.json` — desarrollos comparables (co-living, residencias estudiantiles, multifamiliar, "departamentos en renta") con lat/lng, precio si Places lo da, rating.
- `data/geo/consumo-usuario.json` — destinos del usuario meta millennial-profesional (coworking, café especialidad, gimnasios, bares, restaurantes, vida nocturna).
- `data/geo/equipamiento.json` — educación, salud, parques, transporte.
- `data/geo/inversion-proyectos.json` — proyectos de inversión pública/privada del estudio 2023 (14,942 MDP, carretera 210, hospital, etc.) geocodificados a mano/Places → anclas de crecimiento futuro.

**Modelos deterministas (script versionado, con fórmula explícita y sin alucinar):**
- **Growth/opportunity surface**: por zona/punto, combina densidad de inversión + densidad de ancla (actual) + proyectos futuros + (menor) riesgo → score 0-100. Vector de crecimiento de QRO documentado con evidencia (estudio + público verificable: eje NE Juriquilla/El Marqués/Zibatá).
- **Land score (ranking de comps)**: por cada uno de los 537 → `score = w1·valor($/m² vs banda) + w2·proximidad_ancla + w3·proximidad_consumo(meta HBU) + w4·exposición_crecimiento + w5·bajo_riesgo − w6·saturación_competencia`. Pesos declarados; sensibilidad mostrada. Output: `data/scores/land-scores.json`.
- **Predio scorecard (3 lentes)**: mismos sub-scores re-ponderados por perfil:
  - *Desarrollador*: HBU/RLV, CUS, frente, absorción, competencia.
  - *Comprador (usuario final)*: consumo/estilo de vida, equipamiento, precio.
  - *Inversionista*: plusvalía esperada (crecimiento), riesgo, líquidez, yield.
  → percentil del predio en cada lente + veredicto "para quién es el mejor / en qué percentil está".

---

## Tabla de tareas

| # | Tarea → Subtareas | Owner/Modelo | Razón (sec/cal/costo) | Ola ∥ (worktree?) | Deps | Verificación |
|---|-------------------|--------------|------------------------|-------------------|------|--------------|
| **0** | **Re-auth Infisical + recolectar Places** (anclas, competencia, consumo, equipamiento, inversión) → 5 JSON en `data/geo/` | **TÚ** | keys/red viva = orquestador | **0** | — | 5 JSON con lat/lng no vacíos; conteos > 0 |
| **0b** | **Enriquecer/scrapear comps vía IPRoyal** (lo que quería el agente previo): completar riqueza de los comps sin datos + scrapear Inmuebles24/Vivanuncios/Lamudi restantes → **de 537/~800 a 1,000–1,200 comps reales** + geocodificar los nuevos | **TÚ** (+ agente scraper bajo supervisión) | proxy/keys/red viva + parsing = orquestador | **0** ∥ | proxy IPRoyal | dataset crece a ≥800 reales, 0 fakes, con `link`/precio/m²/coords; ledger IPRoyal actualizado |
| **1a** | **Diseño del modelo de scoring** (growth surface + land score + scorecard 3 lentes): fórmula, pesos, fuentes, anti-alucinación | **OPUS** | modelo = corazón; error caro | **1** | 0 (esquema) | spec revisable con fórmulas explícitas |
| **1b** | **Research vector de crecimiento + inversión QRO** (estudio 2023 + público verificable) → `inversion-proyectos.json` enriquecido + narrativa citada | **OPUS** (o research) | fidelidad, criticidad | **1** ∥ | 0 | cada proyecto con fuente + coords |
| **2** | **Script de scoring** (implementa 1a): calcula `land-scores.json` (537) + `predio-scorecard.json` | **SONNET** + Haiku (corridas) | spec claro de Opus | **2** | 1a,1b,0 | corre; 537 scores; percentil predio reproducible |
| **3a** | **Mapa v2 — capas Places + propiedades clickeables→link** (`MapboxMap.tsx`) | **SONNET** | archivo único, spec claro | **3** ∥ | 0,2 | popups con link; capas toggle; build ok |
| **3b** | **Tab/So "Ranking de terrenos" + "Mejores para comprar"** (nuevo componente) | **SONNET** | disjunto de 3a | **3** ∥ | 2 | top-N con score y por qué; build ok |
| **3c** | **Scorecard del predio (3 lentes) + percentil + amenazas** (componente en HBU/valuación) | **SONNET** | disjunto | **3** ∥ | 2 | 3 lentes + percentil + amenazas; build ok |
| **3d** | **Street View embebido + 1 animación por modelo** (HbuTab sección FinObra) | **SONNET** | disjunto | **3** ∥ | 4(anim) | SV visible; selector cambia video; build ok |
| **3e** | **Integraciones cruzadas Estudio→HBU + Export JSON del estudio completo** | **SONNET** | disjunto | **3** ∥ | — | botón export baja JSON; cross-links; build ok |
| **4** | **FAL — 1 animación mejor por modelo** (híbrido/vertical/horizontal, mayor calidad) | **TÚ** + FAL | keys | **3** (paralela a impl.) | 0 | 3 mp4 web ligados por modelo |
| **5** | **Update `microroadmap.md`** (reflejar realidad + apuntar a masterplans) | **HAIKU** | mecánico | **0** ∥ | — | doc coherente con estado real |
| **6** | **Build gate + deploy testing + re-review Gemini + spot-check propio** | **TÚ** + humano | prod-adjacent | **final** | 3x,4 | Action verde; 200; hallazgos ALTA = 0 |
| **7** | **Reconciliar `main`↔`testing`** | **TÚ** + humano | irreversible | **operador** | 6 | decisión de german |

## Reglas de paralelización
- Ola 0: recolección Places (TÚ) ∥ **scraper IPRoyal → 800-1,200 comps (TÚ/agente)** ∥ update microroadmap (Haiku) — disjuntos. El scoring (Ola 2) corre sobre el dataset **final enriquecido**; si el scraping tarda, se corre sobre 537 y se re-corre al cerrar 0b.
- Ola 1: diseño de modelo (Opus) ∥ research crecimiento (Opus) — disjuntos.
- Ola 2: un solo Sonnet (script de scoring) — produce los JSON que consumen 3a-3c.
- Ola 3: **5 Sonnet en archivos disjuntos** (`MapboxMap.tsx` / nuevo `RankingTab` / `ScorecardPredio` / `HbuTab` FinObra+SV / `EstudioMercadoTab`+export) + FAL (TÚ) en paralelo. Sin colisión.
- Todo lo de keys/red/deploy = **orquestador**.

## Gate de smoke tests (prueba positiva)
1. Los 5 JSON de `data/geo/` existen, con coords no nulas y conteos razonables.
2. `land-scores.json` tiene 537 entradas; el predio aparece en `predio-scorecard.json` con percentil por lente.
3. Mapa: al menos 1 popup de propiedad abre y su botón "Ver listing" apunta al `link` real; capas de ancla/competencia/consumo visibles y toggleables.
4. Ranking: top-N ordenado por score con desglose del porqué.
5. Scorecard: 3 lentes + percentil + amenazas renderizan con datos, no placeholders.
6. FinObra: seleccionar modelo cambia su animación; Street View del predio visible.
7. Export JSON baja un archivo con valuación + estudio + geo + scores.
8. Build static export verde; deploy Action verde; `/valuacion-cimatario` HTTP 200.

## Pendientes del operador
- Habilitar **accept edits** para que el orquestador lea Infisical (Places/FAL/Gemini/GITHUB_PAT).
- Presupuesto FAL: reusar tope $5 (llevamos $0.91; 3 animaciones nuevas ~$0.9 más → holgado).
- Decidir reconciliación `main`↔`testing` (tarea 7).
- Validar los **pesos del scoring** (tarea 1a) antes de tomarlos como definitivos — es un modelo con supuestos.
