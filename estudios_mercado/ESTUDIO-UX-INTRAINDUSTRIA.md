# Estudio de mercado UI/UX intra-industria + propuesta integral — Klugger

> Objetivo: determinar el **UI/UX y las innovaciones** que Klugger debe implementar para volverse el **monopolio de facto** del sector inmobiliario mexicano — el lugar donde ningún jugador (comprador, agente, desarrollador, banca) encuentra un mejor lugar para buscar, valuar, vender, o compartir información.
> Método: investigación web (jul-2026, 2 agentes: portales MX + mejores del mundo) + síntesis de nuestros estudios (`estudioPROPTECH.md`, `PROPTECHcomplemento.md`). Cada afirmación marca **HECHO** (verificable) vs **PERCEPCIÓN** (queja recurrente). Fuentes al final.
> Aterriza la capa de **innovación** sobre `MASTERPLAN-UI-v1.md`.

---

## 1. Síntesis de nuestros estudios previos (interno)

De `estudioPROPTECH.md §B/§C` y `PROPTECHcomplemento.md`:
- **Duopolio** Inmuebles24 + Vivanuncios (Navent→QuintoAndar) con **leads compartidos**, **costo de posicionamiento +30-40% en renovación**, **sin datos de cierre**, **duplicados/fraude sin verificación IA**.
- **Búsqueda NL**: Zillow la lanzó (2024) pero "solo lee texto, no interpreta fotos" → hueco en MX + oportunidad de **visión (VLM)**.
- **Páginas de agente**: WordPress/Wix/EasyBroker = plantillas rígidas, mal SEO. Hueco: **generación por chat IA sobre Next.js con subdominio propio**.
- **Mar azul**: HBU/HBV automatizado (nadie lo da a precio de avalúo), estudios de zona mid-market (4S/REDI es caro), verificación anti-fraude.
- **Monetización correcta** (bootstrap): HBU cash → agentes SaaS ($600-1,200 MXN/mes) → comprador gratis → desarrolladores → banca.

---

## 2. Flaws de UI/UX de los portales inmobiliarios mexicanos (todas)

### Top 15 transversales (por severidad)
1. **No hay MLS ni registro público de precios de cierre** — RPP fragmentados/offline; se sub-reporta el precio real → AVM/historial imposibles. **HECHO** (raíz estructural).
2. **Sin verificación de propiedad/anunciante** — portales se declaran "tablón neutral" ("validamos textos, no la propiedad"). **HECHO**.
3. **Fraude masivo/creciente** — +800% en 20 años; 660 casos en un portal en Q2-2025; Vivanuncios admite **~15% de anuncios fraudulentos**. **HECHO**.
4. **Moderación reactiva** — el fake vive hasta que alguien lo reporta; reaparece tras removerlo. **HECHO**.
5. **Listados fantasma/vendidos que no se retiran** — Propiedades.com el peor; ML sugiere filtro "publicado hoy". **PERCEPCIÓN recurrente**.
6. **Duplicación estructural** — cross-posting mismo-dueño (i24↔Vivanuncios) + sindicación de aggregators (Lamudi/Trovit/Mitula/ICasas vía Proppit). **HECHO**.
7. **Concentración en un dueño** (Navent/QuintoAndar) — denuncia **AMPI ante Cofece**; menos competencia = menos incentivo a mejorar UX/datos. **HECHO**.
8. **Pay-to-feature entierra lo orgánico** — "super-destacadas Premier" monopolizan primeras páginas; orgánico "casi quimera". **HECHO/PERCEPCIÓN**.
9. **Fotos robadas + precios gancho** como cebo. **HECHO**.
10. **Filtros pobres/con fugas** — sin NLP; sin filtro fiable por m² exacto, **uso de suelo** ni **plusvalía**; categorías cruzadas (remates en venta). **PERCEPCIÓN/inspección**.
11. **Sin inteligencia de mercado por propiedad** — nadie da historial de precio del inmueble ni comparables reales; a lo sumo $/m² por colonia. **HECHO por ausencia**.
12. **Valuaciones opacas** — "¿Cuánto vale?" (i24) y "valor estimado" (Propiedades.com) sin metodología ni validación, sobre inventario viejo. **HECHO/PERCEPCIÓN**.
13. **Mala performance móvil + muros/ads** — crashes (i24, Lamudi), login fallido (ML), "inútil en móvil" (Vibbo). **PERCEPCIÓN recurrente**.
14. **Herramientas de agente débiles** — CRM inexistente/naciente (CyT Pro 1.0★), carga manual, precios no públicos; monetizan visibilidad, no conversión. **HECHO/PERCEPCIÓN**.
15. **Soporte deficiente sin recurso ante fraude** — reportes ignorados, cuentas fraudulentas no eliminadas. **PERCEPCIÓN recurrente**.

### Por portal (condensado)
| Portal | Estado | Flaw distintiva |
|---|---|---|
| Inmuebles24 | líder | filtros con fugas, sin verificación, monopolio (Cofece), fee EasyBroker +200% |
| Mercado Libre Inmuebles | #2 genérico | UX de e-commerce, vendidos vivos, sin verificación, Trustpilot ~1.3-1.6/5 |
| Lamudi MX | aggregator | 3 dueños en 3 años, solo morales, crashes, no guarda búsquedas |
| Vivanuncios | #2-3 | **~15% fraude admitido**, moderación reactiva, combo con i24 |
| Metros Cúbicos | **muerto** | redirect a ML desde ago-2023 |
| Propiedades.com | top inventario | "más anuncios desactualizados", 660 fraudes Q2-2025 |
| Casas y Terrenos | regional GDL | sin NLP/valuación, app Pro 1.0★ |
| Segundamano/Vibbo | **muerto** | cerró MX mar-2023 |
| Trovit/Mitula/ICasas | aggregators | duplicados + links muertos inherentes |

### Huecos que NINGUNO llena (oro para diferenciación)
1. **AVM/Zestimate universal real por inmueble** (con metodología transparente).
2. **Historial de precio por propiedad**.
3. **Datos de venta cerrada / MLS** — el mayor foso disponible.
4. **Búsqueda por lenguaje natural** (todos son checkbox).
5. **Dibujar-zona en mapa** (polígono).
6. **Verificación de listado / anti-duplicado que funcione**.
7. **Inteligencia de plusvalía por activo específico**.
8. **Monetización alineada al cierre**, no a la colocación.

---

## 3. Los mejores del mundo — UI/UX e innovaciones (Zillow y otros)

### Top 15 patrones de clase mundial (adoptar/superar)
1. **Mapa como núcleo (map-first + split-view)** con refresh automático al pan/zoom, pins con precio. (Redfin, Zillow — estándar de facto).
2. **Dibujar la zona sobre el mapa** ("Draw-a-Search") y guardarla. (Rightmove, Idealista, Domain, Zillow).
3. **AVM propio** (Zestimate/Redfin Estimate) — gancho + confianza.
4. **Búsqueda en lenguaje natural / AI Mode** — Zillow (2026); Rightmove/Idealista integran ChatGPT.
5. **Capas de mapa múltiples** — escuelas (catchment + "dónde viven los alumnos"), transporte/commute, precios (heatmap). Trulia: 34 overlays.
6. **Transparencia radical de datos** — price history + tax history + días en mercado + **precios de venta oficiales** (Rightmove usa HM Land Registry).
7. **Tours 3D / Interactive Floor Plans / SkyTour** — +60% vistas, +79% saves (Zillow).
8. **Saved searches + alertas inteligentes** en tiempo real.
9. **Affordability en tiempo real** — BuyAbility (Zillow) filtra por lo que realmente puedes pagar (tasas + crédito en vivo).
10. **Contenido de zona por residentes** ("What Locals Say", Neighborhood Stories) — prueba social hiperlocal.
11. **Edificio como entidad de primer nivel** (StreetEasy) — histórico de precios, quejas, disponibilidad.
12. **Shortlisting colaborativo** — invitar pareja/agente a lista compartida (Domain, Zillow). Comprar es decisión multipersona.
13. **Herramientas de agente con insights predictivos** — Compass Home Platform ("likely to sell" 3× Zillow, "Buyer Demand" pricing, Collections).
14. **Mobile-first + velocidad**.
15. **Datos abiertos como marketing/autoridad** — Redfin Data Center; efecto "Zillow Gone Wild" viraliza y expande el pool de compradores.

### Zillow: por qué es el estándar y dónde AÚN es superable
- **Estándar:** Zestimate creó la categoría AVM de consumo (referencia mental de "cuánto vale mi casa"); marca cultural ("Zillow Gone Wild"); suite integrada (AVM + tours + affordability + history + AI Mode).
- **Superable (huecos incluso en el mejor):**
  1. **AVM off-market impreciso** — error mediano ~6.9-7.5% off-market (vs 1.9% on-market); 25% >10% desviados. Ningún estimador "ve dentro de la casa". → **AVM con intervalos de confianza honestos + ajuste por características verificadas (visión VLM) + explicabilidad ("por qué este número")**.
  2. **Confianza/alineación con agentes** — reventa de leads generó backlash (Homes.com "your listing, your lead"). → **transparencia de leads + verificación**.
  3. **Datos hiperlocales** — StreetEasy/Rightmove/Domain superan a Zillow en profundidad de zona (datos oficiales, catchment). → **capas oficiales verificadas + reseñas de residentes**.
  4. **iBuying fracasó** (Zillow escribió >$500M en pérdidas, 2021) — la confianza en el AVM tiene límite comercial. → **no iBuyer; datos + confianza**.
  5. **NL search aún incipiente** — el ganador real hará **búsqueda semántica + explicación + comparación conversacional confiable end-to-end**.

---

## 4. Síntesis estratégica — los 3 pilares que nadie une

Los incumbentes MX no unen, y ni Zillow domina del todo:
1. **Datos propietarios de venta/plusvalía** (foso defensible; imposible por falta de MLS → quien lo construya gana).
2. **Verificación anti-fraude / anti-duplicado real** (confianza; todos se autodeslindan).
3. **Descubrimiento inteligente** (NLP + **AVM transparente con visión** + draw-map).

La **opacidad es estructural** (por eso el hueco persiste y es defendible) y la **monetización actual castiga la veracidad** → abre espacio a un modelo **trust-first / alineado al cierre**.

---

## 5. Propuesta integral (formato `/masterplan`) — UI/UX que construye el monopolio

> Orden: SEGURIDAD → CALIDAD → COSTO. Extiende `MASTERPLAN-UI-v1.md` con la **capa de innovación**. Cada innovación mapea a un **jugador que atrae** y al **foso** que crea.

### 5.1 Mapeo objetivo-monopolio → innovación UI/UX → jugador → foso
| Objetivo (ser el mejor lugar para…) | Innovación UI/UX concreta | Atrae a | Foso |
|---|---|---|---|
| **Buscar información** | **Búsqueda en lenguaje natural + visión (VLM)**: "2 rec bajo 20k cerca de Metro Chabacano, pet-friendly, buena plusvalía"; interpreta fotos, no solo texto | comprador | UX 10× + datos de intención |
| **Encontrar casa** | **Map-first** (split-view, refresh al pan/zoom, pins con precio) + **draw-zona** + **capas** (transporte, escuelas, plusvalía, riesgo) + **shortlisting colaborativo** + alertas Telegram | comprador | hábito + efecto de red |
| **Crear estudios / estudios de mercado** | **Generador de estudios HBU/HBV y de zona** (pipeline Cimatario) con UI de reporte interactivo, comparables reales, mapas de scoring | dueño, desarrollador | producto propietario (metodología) |
| **Compartir información cifrada y segura** | **Data rooms cifrados** por operación (docs, avalúos, contratos) con control de acceso y bitácora; para banca/adjudicados y cierres | banca, agente, dueño | switching cost + confianza |
| **Acelerar una venta** | **AVM transparente con confianza explicable** + **verificación de listado (anti-fraude/dedup con IA)** + **sitio de agente por IA** (subdominio, SEO) + leads calificados alineados al cierre | agente, dueño | confianza + alineación de incentivos |
| **Atender a agentes y decirles cómo actuar** | **Copiloto del agente**: insights predictivos ("likely to sell", precio óptimo, buyer demand), **next-best-action** ("baja 3%", "llama a estos 5 leads"), carga por chat/extensión | agente | datos + dependencia operativa |

### 5.2 Tabla de tareas (owner/modelo · ola · deps · verificación)
| # | Innovación → subtareas | Owner/Modelo | Ola ∥ | Deps | Verificación (prueba positiva) |
|---|---|---|---|---|---|
| N1 | **Búsqueda NL + visión** (input NL → embeddings pgvector + reranking; VLM sobre fotos) | TÚ + **Opus** (arquitectura) + Sonnet | 1 | MASTERPLAN-UI U0/U2 | consulta en prosa devuelve resultados relevantes; explica el match |
| N2 | **Mapa map-first + draw-zona + capas** (Mapbox ya instalado; polígono → query; capas escuelas/transporte/plusvalía) | Sonnet + Haiku | 1 ∥ | U0 | dibujar zona filtra en vivo; capas conmutan |
| N3 | **AVM transparente con confianza** (pipeline Cimatario → estimación por inmueble + intervalo + explicabilidad) | **Opus** (correctness) + Sonnet | 2 | Parte II Cimatario | AVM con intervalo y "por qué"; error <10% vs cierres |
| N4 | **Verificación anti-fraude / dedup IA** (dedup por embeddings + señales de fraude + "dueño validado") | **Opus** (seguridad) + Sonnet | 2 ∥ | ingesta VLM | flag de duplicado/fraude; badge verificado |
| N5 | **Copiloto del agente** (insights predictivos + next-best-action + carga por chat/extensión) | Sonnet + Opus (modelo) | 3 | U1 realtor | agente recibe acciones concretas priorizadas |
| N6 | **Data rooms cifrados** (E2E, control de acceso, bitácora) | **TÚ** + Opus (seguridad/cripto) | 3 | multi-tenant | doc cifrado compartido con acceso auditable |
| N7 | **Shortlisting colaborativo + alertas** (lista compartida multiusuario, Telegram) | Sonnet + Haiku | 2 ∥ | U2 | pareja/agente ven la misma lista; alerta llega |
| N8 | **Datos abiertos como marketing** (Klugger Data Center: índices de zona, "gone wild" MX) | Sonnet + Fable (copy) | 3 ∥ | datos | páginas con datos únicos → prensa/SEO |

### 5.3 Gate de smoke tests (innovación)
1. NL search: prosa → resultados + explicación del match (incluye señal de fotos).
2. Map: draw-zona filtra en vivo; capas conmutan; refresh al pan/zoom.
3. AVM: número + intervalo de confianza + explicabilidad; error <10% vs cierres reales.
4. Verificación: badge "verificado/dueño validado" + flag de duplicado/fraude que funciona.
5. Copiloto: entrega next-best-action priorizada por agente.
6. Data room: cifrado E2E + bitácora de acceso.
7. Todo mobile-first, veloz, sin muros/ads intrusivos (anti-flaw #13).

### 5.4 Pendientes del operador
- Congelar prioridad de innovaciones por ola (recomendado: N1+N2 primero = visible; N3+N4 = foso; N5+N6 = agentes/banca).
- Validaciones de marca (azul, Nexa ✅ ya integrada, logo SVG).
- Decisiones legales del buscador (link-out, robots.txt, LFPDPPP) — ya en `PROPTECHcomplemento §1`.

---

## Fuentes (selección verificable)
**MX:** Chilango (re-publicación i24), UnoTV (suplantación), Centro Urbano (Vivanuncios ~15% fraude), El Financiero (660 fraudes Propiedades.com Q2-2025), Milenio (anuncios desactualizados; pay-to-feature), Reforma/OnlineMarketplaces (AMPI→Cofece), ESET (phishing ML), Trustpilot MX, App Store/Play (CyT Pro 1.0★).
**Mundo:** Zillow ([3D Home](https://www.zillow.com/3d-home/), [SkyTour](https://www.zillow.com/news/take-home-listings-to-new-heights-with-skytour/), [AI Mode—Inman](https://www.inman.com/2026/03/25/zillow-goes-ai-mode-with-new-home-search-assistant/), [BuyAbility](https://www.zillow.com/homeloans/buyability/)), [Redfin Estimate](https://www.redfin.com/redfin-estimate)+[Data Center](https://www.redfin.com/news/new-redfin-data-center/), [Rightmove Sold Prices](https://www.rightmove.co.uk/house-prices.html), [Idealista prospecting](https://www.idealista.com/tools/centrodeayuda/en/articulos/prospecting-map/), [Trulia Neighborhoods](https://www.trulia.com/neighborhoods/), [Compass AI](https://www.compass.com/newsroom/press-releases/4jOjK5Ej4ai0SyAnZGGlpP/), [Homes.com vs Zillow](https://theclose.com/homes-com-vs-zillow/), StreetEasy, Domain (AU). Zestimate precisión: [ListWithClever](https://listwithclever.com/real-estate-blog/how-accurate-is-a-zillow-zestimate-5-things-to-know/).
**Interno:** `estudioPROPTECH.md`, `PROPTECHcomplemento.md`.
