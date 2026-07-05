# /masterplan v4 — Auditoría UI/UX + Tab "Estudio de Mercado" exhaustivo

> Orden no negociable: **SEGURIDAD → CALIDAD → COSTO**. Orquestador: Opus 4.8.
> Insumos: principios de **Emil Kowalski** (motion/craft), hallazgos acumulados de **Gemini 2.5 Flash** (3 pasadas de vision sobre staging), y las 2 fuentes del estudio:
> - `analisisCimatario2023.md` (análisis estructurado de Gemini)
> - `transcripcionEstudioMercado2023.md` (transcripción fiel, 1749 líneas, del doc con gráficas)
> Objetivo: (A) **cuestionar y elevar el UI/UX** del dashboard completo; (B) construir el **tab faltante "Estudio de Mercado"** con charts nativos (Recharts) + mapas, **exhaustivo y fiel** a las fuentes; (C) cerrar los defectos reales que dejó v3.
> **Regla de datos: CERO alucinación.** Cada cifra/serie cita su fuente (doc + capítulo/página). Si un dato no está en las fuentes, no se inventa.

---

## PARTE A — Auditoría UI/UX (cuestionamiento, no solo pulido)

Principios rectores: los 10 de Emil Kowalski (propósito>decoración, ease-out corto, solo transform/opacity, springs, reduced-motion, micro-interacciones, origen del movimiento, interrumpible, restraint+consistencia) **+** legibilidad de datos para un lector no experto (es una herramienta de decisión de inversión).

Preguntas duras que el rediseño debe responder (con evidencia de las 3 pasadas de Gemini + vista del orquestador):

| # | Cuestión de UX | Diagnóstico actual | Decisión de diseño |
|---|----------------|--------------------|--------------------|
| A1 | ¿La **arquitectura de información** (tabs) es la correcta? | "Estudio" está diluido en "Marketing + Estudio" y "HBU + Estudio Colonia"; no hay un lugar exhaustivo para el estudio de mercado. | **Agregar tab dedicado "📈 Estudio de Mercado"** (Parte B) y revisar si "Marketing + Estudio" se renombra a solo "Marketing/Outreach". |
| A2 | ¿Las **columnas clave se entienden**? Gemini leyó mal 3 veces "Implícito 660m²" y "% vs Asking". | Si un modelo entrenado las malinterpreta, un humano también. | Reencabezar + microcopy: "Precio del comp normalizado a 660 m²" y "Qué tan barato/caro vs tu asking". Tooltip persistente, no solo hover. |
| A3 | ¿Los **KPIs** son los correctos y legibles? | Formato ya corregido en v3; falta jerarquía (cuál es EL número). | Un KPI héroe (estimado de valor) + secundarios; `tabular-nums`; una línea de "qué significa". |
| A4 | ¿Los **charts comunican**? | Vector de precios sin etiquetas en eje-Y; algunos ejes crudos. | Ejes con formato ($/M, m²), leyendas, `ReferenceLine` del asking, estados vacíos honestos. |
| A5 | ¿**Mobile-first** real? | Grid de KPIs se rompía (ya mitigado); tablas anchas. | Revisar breakpoints; tablas con scroll horizontal contenido; charts que colapsan bien. |
| A6 | ¿**Consistencia** de motion y componentes? | v3 introdujo motion en KPIs/tabs; falta propagar el lenguaje a charts/tab nuevo. | Un solo sistema de tokens (duración/ease) ya en `globals.css`; el tab nuevo lo hereda. |
| A7 | ¿**Accesibilidad**? | reduced-motion ya en 3 capas (v3); falta contraste/foco en algunos textos secundarios. | Auditar contraste AA en textos gris sobre glass; foco visible en tabs/inputs. |
| A8 | ¿El **mapa** es honesto? | 358 coords reales + 179 "aproximadas" (scatter) mezcladas. | Geocodificar o **excluir** las 179; nunca presentar posiciones inventadas como reales. |

Entregable de la Parte A: decisiones aplicadas en el código (no un doc aparte) durante las olas de build.

---

## PARTE B — Tab "📈 Estudio de Mercado" (exhaustivo, nativo, fiel)

Nuevo `components/EstudioMercadoTab.tsx` + entrada en el navbar. Consume un módulo de datos tipado nuevo (`data/estudio-mercado.ts`) extraído **fielmente** de las 2 fuentes. Cada sección = heading claro + chart(s) Recharts + 1-2 líneas de insight citando fuente.

| # | Sección | Chart(s) nativo(s) | Datos (fuente) |
|---|---------|--------------------|----------------|
| B1 | Conectividad & movilidad | BarChart horizontal (distancia + tiempo) de **8 POIs** desde el predio | Centro 2.7km/11min … Aeropuerto 32.6km/31min (`analisis` §1.2) |
| B2 | Demografía & bono | LineChart proyección **2022 (1,007,923) → 2030 (1,138,178)**; barras estructura por edad (20-34 = 27.5%); histograma Col. Cimatario (300/500/700/390) | `analisis` §2.1, §4.1, elem. visuales §2 |
| B3 | Migración | Querétaro **4º nacional**; barras inmigrantes/emigrantes (interestatal 26,730/8,651; internacional 2,413/7,722) | `analisis` §2.2 |
| B4 | Vivienda | Donut tipología (**84.9%** horizontal / 8.7% / 2.4% / **3.9%** vertical) + contraste Big-Data vs INEGI (**30%** vertical en oferta activa, 84% nueva, mediana $24,148/m²) | `analisis` §2.3, elem. visuales §4 |
| B5 | Salud & Educación | Pie afiliación (IMSS **72.1%**, INSABI 17.2%, privada 6.4%) + barras escolaridad (superior **34.7%**, media 25.6%, básica 37%) | `analisis` §2.4 |
| B6 | Empleo & economía | KPIs PEA **67%**, ocupada 96.36%, >2 SM **67.29%**; barras ramas de actividad (manufactura 23.5%…); IDH **0.781** desglosado | `analisis` §2.5, §3.1 |
| B7 | Ecosistema 5 km (mapa) | Mapa radio 5km + barras: **37** corporativos, **29** universidades, **18** hospitales, **58** bancos, **20** comerciales | `analisis` elem. visuales §1 |
| B8 | **Mercado inmobiliario (la más exhaustiva)** | (a) Co-living: informal **$3,837** vs institucional **$8,950**; tabla/barras de listados granulares del mundo/local ($21,360–$49,000, capacidad, amenidades); (b) Depts renta $16,425 (112m², $150/m²); (c) Depts venta $4,247,272 (118m², $36,516/m²); (d) Casas $4,917,059 (293m², $17,088/m²) | `analisis` §4.4; `transcripcion` p.~40-46 (benchmarks co-living) |
| B9 | Ciclo de vida & oportunidad | Curva de ciclo (horizontal **madurez/saturación** vs townhouses **desarrollo**) | `analisis` elem. visuales §4 |
| B10 | Inversión & obras | Timeline/barras megaproyectos: Cloud-HQ **$14,942 MDP**, Hospital Ángeles (21 pisos), Westin (37 niveles), carreteras 210/540, Cimatario 2ª/3ª sección ($55.9M/$63.5M); output Cimatario **$1,800M/año, 430 establecimientos** | `analisis` §3.2; `transcripcion` L510 |
| B11 | Predio, zoning, FODA, riesgos | Ficha 660m²/H2/CUS 1.8; SWOT 2×2 (cards glass); **matriz de riesgos** como heatmap prob×impacto (6 riesgos) | `analisis` §4.1-4.3, §6 |
| B12 | Modelo HAIV (link a HBU) | KPIs TIR **23%**, ROI **20.36%**, ingreso bruto $50,300/mes; CTA a tab HBU/FinObra | `analisis` §5 |

Extras: filtros globales (año de proyección, "solo Cimatario"), export CSV/JSON de datasets, nota "Fuente: Estudio de Mercado VDD 2023 (transcripción fiel)".

---

## PARTE C — Fixes reales pendientes de v3
- **Mapa**: geocodificar o excluir los 179 puntos sin coords (no presentar scatter como real). (A8)
- **Vector de precios (Valuación)**: etiquetas numéricas en eje-Y + `ReferenceLine` del asking.
- **Pro-forma (HBU)**: corregir truncado de ROI/Costo; formato de miles consistente.
- **Microcopy** de "Implícito 660m²" / "% vs Asking" (A2).

---

## Tabla de tareas (olas + asignación)

| # | Tarea | Owner/Modelo | Razón (sec/cal/costo) | Ola | Deps | Verificación | Estado |
|---|-------|--------------|------------------------|-----|------|--------------|--------|
| 0 | Auditoría UI/UX (Parte A) — decisiones de diseño | **TÚ** (orq., Opus) | criterio de diseño de alto nivel | — | — | tabla A1-A8 resuelta | ✅ (en este doc) |
| 1 | Extraer `data/estudio-mercado.ts` **fiel** de las 2 fuentes (arrays tipados + cita de fuente por dataset) | Haiku (bajo Sonnet) | mecánico de alto volumen, verificable | **A** | — | cada array cita fuente; 0 cifras inventadas (spot-check orquestador) | ⬜ |
| 2 | Fixes reales de v3 (mapa 179 / eje-Y vector / pro-forma / microcopy) | Sonnet | correctness UI, archivos acotados | **A** ∥ | — | build ok; Gemini sin esos hallazgos | ⬜ |
| 3 | `EstudioMercadoTab.tsx` + navbar: 12 secciones B1-B12 con charts nativos + mapa, motion Emil | Sonnet | impl. grande con spec claro | **B** | 1 | build ok; render de las 12 secciones | ⬜ |
| 4 | Revisión adversarial de fidelidad de datos (cada chart vs fuente) | **OPUS** (paralelo) | correctness crítico (cero alucinación) | **B** ∥ | 3 | veredicto: coincide con MD | ⬜ |
| 5 | Build static export del clon testing | **TÚ** | gate pre-deploy | C | 2,3,4 | `out/` sin errores | ⬜ |
| 6 | Push a `testing` → deploy | **TÚ** + humano | prod-adjacent | final | 5 | Action verde + 200 | ⬜ (aprobación) |
| 7 | Re-captura + re-review Gemini (Valuación, DB, HBU, **Estudio**, Marketing) | **TÚ** + Gemini | verificación adversarial | final | 6 | 0 críticos; Estudio comunica el MD | ⬜ |

## Reglas de paralelización
- Ola A: T1 (`data/estudio-mercado.ts`, archivo nuevo) ∥ T2 (fixes en `MapboxMap.tsx`/`HbuTab.tsx`/`ValuacionTab.tsx`/`CompsTable.tsx`) — disjuntos.
- Ola B: T3 crea `EstudioMercadoTab.tsx` (nuevo) + toca el wrapper `ValuacionDashboard.tsx` para el navbar; T4 (Opus) solo **lee** y juzga (no edita). Sin colisión.
- `data/*` lo crea T1; nadie más lo edita en paralelo.
- Build/push/deploy = orquestador.

## Gate de smoke tests
- [ ] `next build` (`NEXT_STATIC_EXPORT=true`) → `out/` sin errores.
- [ ] Tab "Estudio de Mercado" con las 12 secciones renderizando charts poblados + mapa 5km.
- [ ] Cada cifra del tab rastreable a `analisis`/`transcripcion` (revisión Opus).
- [ ] Mapa de Oportunidades sin puntos inventados presentados como reales.
- [ ] Vector con eje-Y etiquetado; pro-forma sin truncado.
- [ ] Motion consistente (Emil) + reduced-motion en el tab nuevo.
- [ ] Re-review Gemini: sin críticos; el estudio "comunica exhaustivamente el MD".

## Pendientes del operador
- Aprobar deploy final a `testing`.
- Decidir geocodificación de los 179 comps sin coords (o excluirlos).
- Rotar `GITHUB_PAT_TOKEN` y `GEMINI_API_KEY` (viajaron en el chat).
