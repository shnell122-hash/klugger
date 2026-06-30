# ROADMAP — Dashboard de Valuación Cimatario (Klugger)

> **Documento vivo.** Versión 2.0 · Fecha: 2026-06-30
> Estudio profesional de Highest & Best Use/Value para el terreno de
> **Lic. Carlos Septién García 53, Col. Cimatario, Querétaro** (asking **$7,000,000 MXN**).
> Deploy: `klugger.shnell.mx` (rama `testing` → Cloudflare Pages).

## Índice

1. [Resumen ejecutivo de hallazgos](#1-resumen-ejecutivo-de-hallazgos)
2. [Data backbone — el estudio de mercado real (2023 + listing 2026)](#2-data-backbone)
3. [Metodología HBU/HBV completa](#3-metodología-hbuhbv-completa)
4. [Fix de la regresión](#4-fix-de-la-regresión)
5. [Auditoría y rediseño de las calculadoras de margen](#5-calculadoras-de-margen)
6. [Micro-mapeo cuadra por cuadra](#6-micro-mapeo-cuadra-por-cuadra)
7. [Skills de FinObra + animaciones de edificios en contexto](#7-skills-de-finobra)
8. [Marketing no convencional + más scrapers](#8-marketing--scrapers)
9. [Plan de ejecución por fases](#9-plan-por-fases)
10. [Riesgos · Verificación · Entrega](#10-riesgos-verificación-entrega)

---

## 1. Resumen ejecutivo de hallazgos

| # | Hallazgo | Severidad | Evidencia |
|---|----------|-----------|-----------|
| 1 | **Base de datos 82% inventada.** `terrenos_full.json` = 176 reales + 824 filas `"Terreno simulado"` (links `example.com`, precios secuenciales). Los m² que alimentan scatter/regresión/distribución vienen **solo** de las filas falsas. | 🔴 Crítico | `terrenos_full.json`; import `ValuacionDashboard.tsx:16` |
| 2 | **Regresión corre sobre datos falsos** → pendiente ≈ 0 (precios ~4.3M independientes del tamaño). Los bins del histograma están **hardcodeados** alrededor del clúster fabricado (`'4.1-4.3M (clúster)'`). El `modelLine` (ppm × m²) tapa la OLS rota. | 🔴 Crítico | `ValuacionDashboard.tsx:377-444` |
| 3 | **Calculadora de margen con bug COS/CUS:** `buildCost` usa `customCOS` (0.6 → 396 m²) en vez de `customCUS` (2.4 → 1584 m²) → subvalúa construcción ~4× e infla el ROI. `netToDev` mezcla venta única + 4 años de renta arbitrarios, sin costo de suelo/comisiones/financiamiento. | 🔴 Crítico | `ValuacionDashboard.tsx:1145-1155` |
| 4 | **Token Mapbox hardcodeado** en fuente commiteada y bundleado al cliente, pese a que CI ya inyecta `NEXT_PUBLIC_MAPBOX_TOKEN`. | 🔴 Crítico | `MapboxMap.tsx:9` |
| 5 | **Micro-mapa = 6 rectángulos crudos**, no cuadras. "Centro Sur / Juriquilla" agrupados aunque Juriquilla está a ~18.6 km. Coords del ★ pin ligeramente inconsistentes con el polígono "BIEN OBJETO". | 🟠 Alto | `MapboxMap.tsx:76-155` |
| 6 | **Render IA (Grok) no fiel al sitio:** el video/poster no corresponde a la topología real (lote 660 m², frente 22 m sobre Carlos Septién) ni a las colindancias. `finobra-hero-3d-v2.gif` referenciado **no existe** → 404. | 🟠 Alto | `ValuacionDashboard.tsx:1397-1411` |
| 7 | **Coordenadas del mapa de propiedades 100% simuladas** (golden-angle scatter, 0 lat/lng reales) presentadas como ubicaciones. | 🟠 Alto | `propertyPoints` useMemo; `terrenos_full.json` sin lat/lng |
| 8 | **Botones de descarga rotos (404):** UI enlaza `data/comps_clean.json`, `data/valuation_output.json`, cita `modelo_precio_simple.py` — no existen en el export estático. | 🟠 Alto | `ValuacionDashboard.tsx:1886-1887` |
| 9 | **Estudio de mercado sub-poblado:** existe un estudio 2023 de 1,749 líneas (demografía, co-living, FODA, financiero con TIR 23%) **no reflejado** en el dashboard. | 🟠 Alto | `cases/.../transcripcionEstudioMercado2023.md` |
| 10 | **`main` 3 commits atrás de `testing`** (fuente de verdad ambigua); mega-componente de 1915 líneas con datasets inline + ~40 `any`. | 🟡 Medio | `git log`; `ValuacionDashboard.tsx` |
| 11 | **Conflicto de potencial sin reconciliar:** estudio 2023 dice **H2 / CUS 1.8 / 3 niveles**; listing 2026 dice **CUS 2.4 / 4 niveles / 12 deptos**. El dictamen DUS202104552 dijo "H3" por error (municipio confirmó H2). El dashboard usa el optimista sin nota. | 🟡 Medio | `analisisCimatario2023.md` p.41-43 vs listing |

---

## 2. Data backbone

> Fuente: 8 transcripciones en `cases/terreno-cimatario-queretaro/`. Cada cifra del dashboard
> cita su fuente. **Nota de reconciliación:** dos definiciones del potencial de desarrollo
> coexisten — se presentan ambas marcando cuál es la legalmente confirmada (H2) vs. la
> del listing comercial (CUS 2.4).

### 2.1 Ficha técnica del lote

| Atributo | Valor | Fuente |
|----------|-------|--------|
| Dirección | Lic. Carlos Septién García 53, Col. Cimatario, CP 76030 | Estudio + listing |
| Delegación | Centro Histórico | IDECAT |
| Entre calles | Wenceslao S. de la Barquera y Florencio Rosas; fondo: José Mª Truchuelo | Estudio p.35 |
| Dimensiones | **30 m × 22 m** (frente 22 m al poniente) | Estudio p.36 |
| Superficie | **660 m²** (IDECAT/Catastro) / 420 m² (RPP) — fusión 2 lotes, Escritura 4,652 (2020) | p.36 |
| Zonificación | **H2** confirmado (≤200 hab/ha, ≤40 viv/ha, lote mín 180 m², frente mín 9 m) | DUS202104552; p.41-43 |
| Parámetros H2 | CAS 10% (66 m²) · COS 60% (396 m²) · **CUS 1.8 (1,188 m²)** · 3 niveles / 10.5 m | Plan Parcial |
| Listing 2026 | COS 0.60 · **CUS 2.4 (1,584 m²)** · 4 niveles / 14 m · ~12 deptos (~131 m² c/u) | EasyBroker EB-WE7457 |
| Estado | Lote vacío, plano, tierra/gravilla, doble fachada urbana, trámites avanzados | FODA |
| Asking | **$7,000,000 MXN** | MHabitat / Iván Medina |

### 2.2 Demanda y demografía (drivers de la tesis)

- Querétaro **4º lugar nacional** en recepción de inmigrantes (11.3% pob. inmigrante). Municipio creció **30.9%** (2010-2020); proyección COESPO: +130k hab. en la década (→ 1.14M en 2030).
- Edad mediana municipio **30 años**; cohortes 20-34 = 27.5% del total → **bono demográfico activo**.
- Escolaridad superior municipio **34.7%** (vs 18.4% estatal); 42,913 matriculados educ. superior.
- Colonia Cimatario: ~35 ha · ~1,760 hab en 556 hogares · edad prom. 33 · ~7,000 trabajadores → ~9,000 residentes+trabajadores diarios.
- Salarios >2 SM municipio **67.3%**; NSE objetivo **C+** (11.3% hogares). Target: Millennial con licenciatura, 25-30 años, primera independencia.

### 2.3 Mercado de vivienda y renta (comparables citables)

| Segmento | Indicador | Valor | Fuente |
|----------|-----------|-------|--------|
| Terrenos zona | $/m² reportado | $6,433 (mediana) · rango $7,000-12,000 | Lamudi / Big Data ago-2021 |
| Deptos (municipal) | Mediana $/m² | **$24,148** | Big Data ago-2021 |
| Co-living institucional QRO | Precio/mes promedio | **$8,950** (Kali $7,500-8,250 · Habiteé $9,500 · Altana $10,300 · Xéntric $8,500) | Levantamiento 2023 |
| Mercado informal cuartos | Precio/mes promedio | **$3,837** (Cimatario: $3,600-5,000) | Levantamiento 2023 |
| Deptos amueblados (12 props) | Precio/mes promedio | **$16,425** / 112 m² / $150/m² | Levantamiento 2023 |
| New Soho Condos (Cimatario) | Renta mensual | $20,000 / 110 m² | Levantamiento 2023 |

Ratio crítico: para igualar $16,425/mes a precio unitario promedio informal ($3,837) → **≥4.2 habitaciones mínimo**.

### 2.4 Conclusiones del estudio 2023 — columna vertebral del pitch

- **HBU declarado:** híbrido = **co-living mejorado (renta) + townhouses (venta)**. Vivienda horizontal se desplaza mejor; solo inventario vertical NO es óptimo en esta superficie.
- **Marca:** HAIV ("colmena") · slogan "Vive independiente, vive en comunidad" · target C+.
- **Modelo seleccionado (2VV+6VR, 950 m²):** 2 townhouses 235 m² + 2 lofts 79 m² + 4 estudios 38 m².
- **Financiero:** inversión inicial -$14,057,727 · costo construcción venta $8,277/m² / renta $14,074/m² · venta townhouses año 2: $9,165,000 ($19,500/m²) · renta $50,300/mes · **TIR 23%, ROI 20.36% anual** (horizonte 10 años).
- Escenarios alternativos: 3VV TIR ~25.7% · 6VV (requiere cambio DUS) ventas $15.98M · VV+VR uso mixto TIR 6.7%.
- FODA completo + matriz de riesgos (11 riesgos P×G) + buyer personas: Roberto (29, mercadólogo, $14k/mes) y Alejandra (31, servicio público, pareja, $26k/mes).

**Acción:** estas cifras pueblan las tabs *Estudio de mercado*, *HBU* y *Análisis*. Se crea `data/estudio2023.ts` tipado con fuente por cifra.

---

## 3. Metodología HBU/HBV completa

El dashboard muestra el **método**, no solo el número. Se implementa la metodología estándar de avalúo (USPAP / IVSC): cuatro pruebas de HBU + tres enfoques de valor + valor residual del suelo (RLV).

### 3.1 Las cuatro pruebas — HBU del suelo *como vacante*

| Prueba | Criterio | Datos del sitio |
|--------|----------|-----------------|
| 1. **Legalmente permisible** | Zonificación, Plan Parcial, restricciones de escritura | H2 confirmado (CUS 1.8 / 3 niveles). Fuera de Zona de Monumentos. Listing reclama CUS 2.4 / 4 niveles — **reconciliar antes del pitch** (ver §11). |
| 2. **Físicamente posible** | Superficie, forma, frente, suelo, accesos, servicios | 660 m² · rectangular 30×22 · frente 22 m · plano · luz/agua/drenaje/doble fachada |
| 3. **Financieramente factible** | Usos con ingresos > costos (VPN ≥ 0) | Pro-forma (§5): co-living/townhouse híbrido da VPN+ y TIR > hurdle (>15%) |
| 4. **Máximamente productivo** | Mayor valor residual del suelo / mejor TIR | 2VV+6VR (TIR 23%) > 3VV > VR puro > comercial / oficinas |

**Usos candidatos** (cada uno marcado ✓/✗ por prueba en la tab HBU):
multifamiliar en renta · co-living institucional · townhouses en venta · **híbrido (HBU seleccionado)** · oficinas · comercial · mantener como terreno.

### 3.2 Los tres enfoques de valor — HBV

| Enfoque | Método | Resultado esperado |
|---------|--------|-------------------|
| **1. Comparables de terreno** | Mediana $/m² de terrenos reales scrapeados × 660 m² (ajustado por frente/ubicación). Separar de deptos terminados. | Base de referencia de mercado |
| **2. Ingresos (capitalización)** | NOI estabilizado del co-living ÷ cap rate (6-9% QRO nearshoring) = valor activo terminado → menos costos = valor implícito del suelo | Income approach |
| **3. Costo / Valor Residual del Suelo (RLV)** | `RLV = GDV − (Costos duros + Costos blandos + Financiamiento + Comisiones + Contingencia) − Utilidad desarrollador` | Método rector para suelo de desarrollo |

**GDV** (Gross Development Value) = Σ ventas + (NOI ÷ cap rate). Si **RLV ≥ $7M**, el asking está metodológicamente justificado.

La tab HBU cierra con una **reconciliación de los 3 enfoques** (tabla + ponderación → rango de valor → veredicto explícito vs $7M).

---

## 4. Fix de la regresión

**Causa raíz diagnósticada (`ValuacionDashboard.tsx:377-444`):** OLS corre sobre los 1000 registros (824 filas falsas con precio ~$4.3M independiente del tamaño → pendiente ≈ 0). Los bins del histograma están **hardcodeados** (`'4.1-4.3M (clúster)'` líneas 388-390) alrededor de ese clúster fabricado. El `modelLine` (ppm × m²) tapa la OLS rota sin resolverla.

**Fix (post re-scrape, Fase 0):**
- Correr OLS **solo sobre comparables reales con precio y m²** (terrenos separados de deptos).
- Reportar honestamente **n, pendiente ($/m² marginal), intercepto y R²** en el gráfico. Si R² es bajo, declararlo y apoyar la valuación en la **mediana de $/m²** (más robusta con n pequeño).
- **Bins del histograma recomputados dinámicamente** (equal-width o cuantiles sobre el rango real) — eliminar etiquetas fabricadas.
- Quitar captions apologéticos (líneas 419, 527, 566).
- Separar dos regresiones: **$/m² de terreno** (HBV comparables) y **$/m² de construcción** (validación de precios de venta del pro-forma).

Archivos: extraer a `components/RegressionChart.tsx` + `lib/regression.ts` (OLS, R², bins — tipados y testeables).

---

## 5. Calculadoras de margen

**Bugs confirmados (`ValuacionDashboard.tsx:1145-1155`):**

```
// BUG 1 — usa COS en vez de CUS:
buildCost = baseM2 * customCOS * buildCostPerM2 * 1.15
//  ↑ COS=0.6 → 396 m², debería ser CUS=2.4 → 1,584 m² → subestima construcción ~4×

// BUG 2 — m² de terreno, no de construcción:
unitSize = Math.round(baseM2 / numUnits)   // debería ser (baseM2*CUS)/numUnits

// BUG 3 — mezcla venta + 4 años renta sin suelo ni financiamiento:
netToDev = grossSale + grossRentAnnual*4 − buildCost   // no hay costo de suelo, comisiones, tiempo

// RESULTADO: ROI inflado ~4x; la UI afirma "TIR 15-20%, VPN positivo" sin calcularlos realmente.
```

**Rediseño — pro-forma de desarrollo real** (`lib/proforma.ts` + `components/ProformaSandbox.tsx`):

| Input (slider) | Default | Fuente del default |
|----------------|---------|-------------------|
| m² terreno | 660 | Catastro |
| CUS | 2.4 (o 1.8) | Listing / H2 confirmado |
| COS | 0.60 | Ambos fuentes |
| Costo construc. venta $/m² | $8,277 | Estudio 2023 |
| Costo construc. renta $/m² | $14,074 | Estudio 2023 |
| Precio venta $/m² | $19,500 | Estudio 2023 |
| Renta loft/mes | $11,850 | Estudio 2023 |
| Renta studio/mes | $6,650 | Estudio 2023 |
| Cap rate | 7.5% | Rango 6-9% nearshoring |
| Costo suelo | $7,000,000 | Asking |
| Comisiones | 5% | Estándar |
| Contingencia | 10% | Estándar |
| Horizonte | 10 años | Estudio 2023 |

**Salidas:** `area_construible = terreno × CUS` · `huella = terreno × COS` · GDV · Costo total · Utilidad desarrollador · **RLV** · **VPN** · **TIR** · ROI sobre costo.

**Validación:** el preset 2VV+6VR debe reproducir **TIR ≈ 23%** del estudio. Si se desvía, indica error en los supuestos de entrada.

Presets: 2VV+6VR (base/seleccionado) · 3VV · 6VV · optimista · pesimista.

---

## 6. Micro-mapeo cuadra por cuadra

**Estado actual (`MapboxMap.tsx:76-155`):** 6 polígonos rectangulares hardcodeados; "Centro Sur / Juriquilla" agrupados (Juriquilla está a 18.6 km); pin del ★ con coords ligeramente inconsistentes.

**Rediseño (Mapbox GL — ya el motor único):**

| Elemento | Fuente de geometría | Cómo |
|----------|---------------------|------|
| Manzanas Col. Cimatario | OSM overpass/geojson | Query por bbox de la colonia (~35 ha) |
| Calles nombradas | OSM | Carlos Septién, Wenceslao S. de la Barquera, Florencio Rosas, José Mª Truchuelo |
| ★ Pin del predio | Coords verificadas | Ajustar a la dirección catastral exacta |
| Comparables | Nominatim geocoding (offline cache) | Geocodificar la `location` real de cada listing |
| POIs | Datos del estudio | 12 escuelas superiores, Instituto Plancarte, parque, ~100 establecimientos |

**Capas conmutables:**
- `HBU score` — verde >8 / amarillo 5-8 / rojo <5 (inferido de listings + POIs)
- `$/m² heat` — gradiente de precio por cuadra
- `Uso predominante` — residencial/comercial/educativo/oficinas
- `Crecimiento Nearshoring` — driver 2026
- `POI/Equipamiento` — puntos de la tabla del estudio

**Símbolos proporcionales** para comparables: tamaño = m², color = bin de $/m², lat/lng reales geocodificados (no golden-angle scatter).

Archivos: `MapboxMap.tsx` (refactor a capas data-driven) · `data/cuadras.geojson` · `data/poi.geojson` · `lib/geocode.ts` (resultados cacheados a JSON estático).

---

## 7. Skills de FinObra

FinObra es un producto fintech/construcción con identidad brutalista-industrial. Se reutiliza la **maquinaria** (skills, motores de animación, formato de propuesta) cambiando los **tokens** (paleta/tipografía) a la marca Klugger.

### 7.1 Inventario de skills

| Skill | Ubicación en FinObra repo | Función | Uso en el dashboard |
|-------|--------------------------|---------|---------------------|
| **`impeccable`** | `.impeccable-skill/` | Sistema de calidad frontend: 23 sub-comandos, ~27 reglas anti-patrón + crítica LLM, tokens OKLCH | `/impeccable audit\|polish\|critique\|colorize` sobre cada vista. Lint checklist: contraste ≥4.5:1, ≤3 fuentes, ease-out exponencial, `prefers-reduced-motion`. Bans: gradient text, glassmorphism default, side-stripe borders. |
| **`emil-design-eng`** | `.design-eng-skill/` | Filosofía de animación Emil Kowalski: easing framework, springs, perf rules, Before/After format | Spec de motion para edificios y charts. `--ease-out: cubic-bezier(0.23,1,0.32,1)`. Scan-line de valuación = **lineal**. |
| **`cad`** | `.cad-skill/` | (1) NL→CAD build123d→STEP; (2) Pipeline de GIF brutalista (Pillow 600×600 @12fps) | (1) Modelos paramétricos de masa/envolvente por escenario HBU (STEP). (2) Batch GIFs de construcción sin browser. |
| **`boldkit`** | `.boldkit-skill/` | Librería neubrutalist: 55+ componentes, 10 tipos de chart, stat cards | Charts y stat cards drop-in (Recharts debajo). Override `--radius:0`, paleta Klugger. Inventario: `registry.json`. |
| **`finobra-frontend`** | `.claude/skills/` | Convención TSX: `tokens.ts` / `types.ts` / `data/*.ts` / `components/` / `sections/S##_*`. Ningún `.tsx` > ~120 líneas. | La receta para romper el mega-componente de 1915 líneas. Datos separados del JSX, tokens centralizados. |
| **`finobra-design`** | `.claude/commands/` | Tokens visuales + kit HTML/Tailwind/Chart.js: 6 recetas de chart, scroll-reveal, KPI counter | Recetas de chart y animaciones de scroll para estudio/marketing. |

**Caveats:** skills de Manim y Motion-Canvas en `skills-lock.json` **no están vendorizados** (symlinks colgados) → reinstalar desde fuente. Helper scripts de `impeccable` (`context.mjs`, `palette.mjs`) no presentes — solo el markdown.

### 7.2 Motor de animación reutilizable

**`src/preview/` (S0-S4)** = Animation Lab — R3F + GSAP + Canvas2D (**framer-motion NO está aquí**).
**`src/landing/`** = Landing — **framer-motion sí vive aquí** (scroll reveals) + R3F scroll-pinned.

**Patrones a portar directamente:**

| Patrón | Archivo origen | Qué hace | Para el dashboard |
|--------|----------------|----------|-------------------|
| `useAutoProgress` | `Session1.tsx` | GSAP yoyo → `useRef`; animaciones leen `progress.current` en `useFrame` → **60fps sin re-renders** | Todos los edificios animados |
| Cámara cinematográfica | `Session1-4.tsx` | `CatmullRomCurve3` + `camera.position.lerp(target, k)` + `lookAt` (arcos, follow-through) | Fly-through por escenario HBU |
| Cross-section reveal | `Session3.tsx` | `THREE.Plane clippingPlanes` barriendo −Z → corte del edificio | Mostrar interior del co-living |
| Bloom + LOD | `Session4.tsx` | `drei <Detailed>` + `@react-three/postprocessing <Bloom>` | Grid de escenarios HBU |
| ScrollTrigger + R3F | `landing/Hero.tsx` | GSAP pinned (`scrub:2, end:'+=300%'`) → fly-through con vigas I reales, workers, partículas; framer-motion para texto | Narrativa de scroll del edificio |
| REVEAL pattern | `landing/Problem.tsx` | `initial:{opacity:0,y:40}` → `whileInView:{opacity:1,y:0}` · `transition:{duration:0.8,ease:[0.16,1,0.3,1]}` · stagger `delay:i*0.12` | Reveal de cada chart / sección |
| `ChaosNumber` / `LossMeter` | `landing/*.tsx` | Números jittering + counter IntersectionObserver-gated | "Ticker de valuación en vivo" |

### 7.3 Animaciones de edificios en contexto de la cuadra

Reemplaza el render Grok no-fiel y el GIF 404:

1. **3D paramétrico protagonista** (`FinObra3DBuilding.tsx`, ya existe) — modelar la masa con geometría **real** del lote (660 m², frente 22 m, retiros H2, COS/CUS) alineada al ★ pin.
2. **Contexto de cuadra** — generar la(s) manzana(s) vecinas como volúmenes simples (alturas de colindancias del estudio) para que el edificio aparezca **relativo a sus vecinos en Carlos Septién** — exactamente lo que el render Grok erraba.
3. **Un edificio por escenario HBU** (2VV+6VR, 3VV, 6VV) — el usuario alterna y la masa cambia, ligada al pro-forma (§5). Motor: Session3 + Session4 + scroll de Hero.
4. **Batch de GIFs** sin browser — adaptar `assets/animations/finobra-hero-3d-v2.py` (proyección + glow/bloom multi-pass) para renderizar cada escenario como GIF. El usuario corre Python local.
5. Cualquier render IA conservado → etiquetado explícito "volumetría conceptual — no a escala, no representa colindancias reales".

### 7.4 Propuestas HBU/HBV como activos

Clonar la estructura **`src/propuesta11/`** (tokens/types/data/components/`sections/S01…S09`, regla ≤120 líneas por archivo) como **generador de propuestas HBU/HBV**:
- Una propuesta por escenario (2VV+6VR · 3VV · 6VV)
- Secciones: Resumen ejecutivo · Las 4 pruebas · Pro-forma · Reconciliación de valor · Próximos pasos
- Tokens Klugger (swap de paleta; estructura idéntica a `propuesta11`)

---

## 8. Marketing + scrapers

### 8.1 Scrapers — el problema #1 es la falta de datos reales

El `scraper.py` existente tiene el regex de m² roto y corrió una sola vez. Scraper(s) a arreglar/construir — todos con `source` real, `scraped_at` ISO, `synthetic: false`, delays éticos (1-1.2s, UA realista, LFPDPPP):

| Scraper | Fuentes | Para |
|---------|---------|------|
| **Terrenos** (fix) | Lamudi + Inmuebles24 + Vivanuncios + Pincali/EasyBroker | HBV por comparables |
| **Deptos/rentas** (nuevo) | Mismos portales, filtro por depto/renta | Income approach |
| **Co-living/cuartos** (nuevo) | Portales + grupos FB/WA | Validar NOI del modelo |
| **`scraper_desarrolladores.py`** (nuevo) | LinkedIn + Google Maps + portales inmobiliarios | Tab "Desarrolladores matches" para JV outreach |

**Validación de build:** script Node que falla el build si el dataset trae filas `example.com`/"simulado" o si scatter/regresión quedan sin puntos reales.

*(El usuario corre los scrapers en su entorno con Python+deps. Yo entrego el código corregido + script de validación.)*

### 8.2 Estrategias de marketing no convencional

| Táctica | Descripción | Herramienta / Métrica |
|---------|-------------|----------------------|
| **Hipersegmentación pagada** | Meta/IG: audiencias "desarrolladores inmobiliarios QRO/CDMX" + nearshoring; LinkedIn decision-makers; lookalikes | ROAS >3× |
| **Video + AI renders + drone** | Fly-through 3D (§7.3) + webinars "ROI en lote CUS 2.4 Cimatario 2026" | Leads |
| **SEO long-tail + retargeting** | "terreno desarrollo multifamiliar Cimatario", "lote CUS 2.4 Querétaro" | CTR / posición |
| **Joint-Venture outreach** | Pitch a constructoras medianas QRO ("tú pones construcción, yo el lote") con DB de `scraper_desarrolladores` | Reuniones |
| **Guerrilla + QR físico** | Lona en el terreno con QR gigante al dashboard: "El terreno que el modelo valúa en $7.47M — tú decides a $7M" | Visits |
| **WhatsApp Business** | Secuencia intro→sim HBU→CTA a 100+ targets; WA Business API (~$0.01/msg) | Respuestas |
| **Generación masiva con agentes** | Stack ocr-ruby-lease / LiteLLM / Tier 0 DeepSeek/Gemini Flash → 50+ posts/emails/descripciones por <$5 USD batch | Contenido |

**Métricas objetivo:** 20+ leads · tiempo de venta 3-5 meses (de 5-9) · engagement 10×.

---

## 9. Plan por fases

### Fase 0 — 🔴 Crítico · Credibilidad de datos + seguridad *(bloquea el pitch)*

| # | Acción | Archivo(s) |
|---|--------|------------|
| 0.1 | Arreglar scraper(s): regex m², sanitizar precios, filtrar basura, multi-fuente, `synthetic:false` | `cases/.../scraper.py` (nuevo) |
| 0.2 | Re-correr scrape (usuario) → regenerar `terrenos_full.json` solo con reales | `terrenos_full.json` |
| 0.3 | UI honesta: quitar textos "padded to 1000", conteo real, charts solo con m²+precio reales | `ValuacionDashboard.tsx:286,676,1882` |
| 0.4 | Quitar token Mapbox del código → `process.env.NEXT_PUBLIC_MAPBOX_TOKEN` + **rotar el token** | `MapboxMap.tsx:9` |
| 0.5 | Reparar descargas 404 → copiar `comps_clean.json`/`valuation_output.json` a `public/data/` | `public/data/` (nuevo) |

**Criterio de éxito:** 0 filas sintéticas · scatter/regresión con ≥N puntos reales · build verde.

### Fase 1 — 🟠 Alto · Metodología + visuales fieles + estudio poblado

| # | Acción | Archivo(s) |
|---|--------|------------|
| 1.1 | HBU 4 pruebas + HBV 3 enfoques + RLV | Tab HBU; `lib/proforma.ts` |
| 1.2 | Fix regresión: OLS real, bins dinámicos, n/R² honestos | `lib/regression.ts`; `components/RegressionChart.tsx` |
| 1.3 | Pro-forma real: bug COS→CUS, flujo de caja, VPN/TIR, presets del estudio | `lib/proforma.ts`; `components/ProformaSandbox.tsx` |
| 1.4 | Poblar estudio de mercado con `data/estudio2023.ts` (demographía, co-living, FODA, buyer personas, financiero) | `data/estudio2023.ts` |
| 1.5 | Edificio 3D fiel + en contexto de cuadra; quitar/etiquetar Grok; resolver GIF 404 | `components/FinObra3DBuilding.tsx`; `public/assets/` |
| 1.6 | Reconciliar H2 (CUS 1.8) vs listing (CUS 2.4); mostrar ambos con nota de fuente | Tab HBU; ficha técnica |

**Criterio de éxito:** un cliente puede seguir los 3 enfoques hasta el veredicto de $7M.

### Fase 2 — 🟠 Alto · Micro-mapeo + mantenibilidad

| # | Acción | Archivo(s) |
|---|--------|------------|
| 2.1 | Polígonos OSM a nivel cuadra, capas conmutables, comparables geocodificados, ★ pin corregido | `MapboxMap.tsx`; `data/cuadras.geojson`; `lib/geocode.ts` |
| 2.2 | Romper mega-componente con convención `finobra-frontend` | Sub-componentes; `data/*.ts` tipados; `lib/*.ts` |
| 2.3 | Skills FinObra como deps del proyecto + tokens Klugger + `/impeccable audit` por vista | `package.json`; `.claude/skills/` |

### Fase 3 — 🟡 Medio/Bajo · Marketing, propuestas, higiene

| # | Acción |
|---|--------|
| 3.1 | Tab Marketing expandida (§8.2) + tab "Desarrolladores matches" |
| 3.2 | Generador de propuestas HBU/HBV estilo `propuesta11` (3 escenarios) |
| 3.3 | Batch GIFs de edificios por escenario (usuario corre Python local) |
| 3.4 | Higiene: reconciliar `main`↔`testing`; borrar duplicados y ramas stale; corregir URL `localhost:3020` en `microroadmap.md` |

---

## 10. Riesgos, verificación, entrega

### Riesgos

| Cambio | Riesgo | Mitigación |
|--------|--------|-----------|
| Re-scrape | Anti-bot / pocos resultados / ToS | Delays + multi-fuente + playwright fallback. Respaldo: 12 comps curados + Big Data del estudio. |
| Reemplazar dataset | Cambian los números del pitch | Re-correr el modelo con datos reales; si RLV < $7M, ajustar narrativa (el **método** es el valor). |
| Rotar token Mapbox | Mapa deja de cargar hasta que el secret se actualice | Rotar + actualizar secret en GitHub en la misma ventana; verificar deploy inmediatamente. |
| Afirmar CUS 2.4 en el pitch | Si el Plan Parcial dice 1.8, el pitch pierde credibilidad | Presentar H2 como base confirmada; CUS 2.4 solo si el municipio lo respalda por escrito. |
| Refactor mega-componente | Regresiones visuales | Hacerlo en Fase 2, después de Fases 0/1; verificar tab por tab tras el split. |
| Animaciones 3D en móvil | Peso / rendimiento | LOD + Bloom selectivo + `prefers-reduced-motion`; GIF estático como fallback. |

### Verificación end-to-end

1. **Build:** `cd dashboard-financial && NEXT_STATIC_EXPORT=true npm run build` → sin errores; `out/` generado.
2. **Datos:** script Node falla si hay filas `example.com`/"simulado"; imprime conteo real y % de campos completos.
3. **Metodología:** tab HBU muestra 4 pruebas + 3 enfoques + RLV + veredicto vs $7M.
4. **Pro-forma:** preset 2VV+6VR reproduce TIR ≈ 23% del estudio.
5. **Mapa:** carga con token de entorno (no hardcodeado); ★ pin correcto; cuadras reales; comparables geocodificados.
6. **Descargas:** botones `comps_clean.json` / `valuation_output.json` devuelven 200.
7. **Deploy:** push a `testing` → GitHub Actions verde → `klugger.shnell.mx` con PIN 1206 → datos reales.

---

## Apéndice — fuera de alcance (riesgos del repo, no del dashboard)

- Secretos vivos en docs heredados (`CLAUDE.md`/`SERVER.md`: password SSH, exec tokens, LiteLLM key, bcrypt hash) y **PAT de GitHub embebido en el git remote URL**.
- Docs stale que describen otro sistema (`CLAUDE.md`, `README.md` → AI-Monitor/OCR; `microroadmap.md:5` apunta a `localhost:3020`).
- Corrupción de encoding en `journal.md:52-58`; ~15 entradas repetidas "no corre".
- 2 ramas stale: `claude/docker-sandbox-staging-deploy-ss41kb` y `claude/klugger-docker-sandbox-7s73lh`.
- `klugger/dashboard-financial/` (2 archivos, stub huérfano) y `cases/.../ValuacionDashboard.tsx` (copia divergente) — candidatas a eliminar en Fase 3.
