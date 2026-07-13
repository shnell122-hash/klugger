# /masterplan — Catálogo del sistema de diseño Klugger (v1)

> Orden: SEGURIDAD → CALIDAD → COSTO. Craft de animación = Emil Kowalski / Linear (`ux-research/04`).
> **Propósito:** inventario EXHAUSTIVO de cada elemento del sistema (componentes, interacciones, **arte en movimiento**) para que **german marque qué se construye / cambia / descarta** ANTES de ejecutar. Este catálogo es el **gate de decisión**; el `MASTERPLAN-UX-v1.md` (navbar/journeys) lo consume después.
> Columna **Decisión**: ✅ mantener · ✏️ cambiar · ❌ descartar · ⭐ prioridad. (german llena.)
> Stack ya instalado en `dashboard-financial/`: **Framer Motion 11 · Mapbox GL · @react-three/fiber+drei+three · Recharts · @xyflow/react**. A añadir: **GSAP + ScrollTrigger**, **Sonner** (toasts), **Vaul** (drawers), **lottie-react**.

## Mapeo de librería por tipo (regla de oro)
| Necesidad | Librería | Por qué |
|---|---|---|
| Componentes React, estados, presence, gestos, layout | **Framer Motion** | default de UI; interrumpible; `useReducedMotion` |
| Scroll-driven, timelines, pin/scrub, parallax, **arte narrativo** | **GSAP + ScrollTrigger** | control fino de timeline y scroll; el zorro recorriendo el mapa |
| Animaciones vectoriales exportadas (mascota, delight) | **Lottie** (lottie-react) | ligero, escalable, del pipeline de diseño |
| Toasts / drawers-bottom-sheets | **Sonner / Vaul** | ya resuelven interrupción, velocity, damping |
| Micro-transiciones (hover/press/color) | **CSS + tokens** | 60fps fuera del main thread |
| 3D (massing de edificios, escenas low-poly) | **R3F / three** | ya instalado (`FinObra3DBuilding`) |
| Gráficas (historial de precio, KPIs) | **Recharts** | ya instalado |

---

## A. Fundacionales (tokens — ya cableados en `tokens.css`/`brand.ts`)
| # | Token | Estado | Decisión |
|---|---|---|---|
| A1 | Color (marca + mundo/arte, 3 temas por `data-theme`) | ✅ hecho | |
| A2 | Tipografía (Nexa Black display + Open Sans body) | ✅ integrada | |
| A3 | Spacing grid 4px | por definir | |
| A4 | Radius / shadow / elevation | por definir | |
| A5 | Motion tokens (dur/ease, §1b Emil) | ✅ en catálogo | |
| A6 | Z-index / layering | por definir | |

## B. Átomos (componentes base)
| # | Elemento | Variantes / notas | Lib | Decisión |
|---|---|---|---|---|
| B1 | **Button** | primary/secondary/ghost/destructive/icon; sizes sm/md/lg; loading; disabled; press `scale(0.97)` 160ms | Framer/CSS | |
| B2 | **Toggle / Switch** | on/off animado; label; sizes | Framer/CSS | |
| B3 | **Chat pill "Ask Klugger"** | pill de búsqueda NL, **sticky abajo** en resultados (patrón Zillow AI Mode); estados idle/typing/thinking | Framer | |
| B4 | **Input / Textarea** | texto, con **modo NL**; estados focus/error; con icono | Framer/CSS | |
| B5 | **Select / Combobox / Autocomplete** | ubicación multi-tipo; teclado | Framer | |
| B6 | **Chips / Filter chips / Tags** | seleccionable, removible, badge de conteo | Framer | |
| B7 | **Checkbox / Radio** | check animado | CSS/Framer | |
| B8 | **Slider** | rango de precio; **affordability slider vivo** (BuyAbility) | Framer | |
| B9 | **Badge** | Verificado ✓, Nuevo, ▲/▼ precio, estado (Vendido/Apartado) | CSS | |
| B10 | **Avatar** | usuario/agente; iniciales/imagen | CSS | |
| B11 | **Tooltip** | origin-aware, skip-delay | Framer | |
| B12 | **Skeleton / Shimmer** | por card/ficha; solo carga real inevitable | CSS | |
| B13 | **Progress / Spinner** | mínimo (optimistic-first) | CSS | |
| B14 | **Icon system** | set consistente; line-draw en marca | SVG | |

## C. Moléculas (compuestos)
| # | Elemento | Notas | Lib | Decisión |
|---|---|---|---|---|
| C1 | **Card de propiedad** | carrusel foto al hover; **card↔pin linking**; badges | Framer | |
| C2 | **Popover / Dropdown** | origin-aware (sale del trigger) | Framer | |
| C3 | **Modal / Dialog** | origin center; focus-trap | Framer | |
| C4 | **Drawer / Bottom-sheet** | **Vaul**; swipe/damping/velocity | Vaul | |
| C5 | **Toast** | **Sonner**; undo; stacking | Sonner | |
| C6 | **Tabs / Segmented control** | Comprar/Rentar/Vender; underline animado | Framer | |
| C7 | **Accordion** | secciones de ficha (Read More) | Framer | |
| C8 | **Table / Data grid** | inventario agente; sticky header (ya `@tanstack/react-table`) | — | |
| C9 | **Pagination** | resultados; "Next" | CSS | |
| C10 | **Command palette (⌘K)** | búsqueda global; **sin animación** (alta frecuencia) | — | |
| C11 | **Search bar (hero + NL)** | multi-tipo + modo conversacional | Framer | |
| C12 | **Filter bar** | orden budget-first + "Más" (uso de suelo/plusvalía/verificado) | Framer | |
| C13 | **Navbar (top)** | por público; sticky transparente→sólido | Framer | |
| C14 | **Bottom tab-bar (móvil)** | 4–5 tabs; oculta en vista mapa | Framer | |
| C15 | **Sidebar** | agente/dev | Framer | |
| C16 | **Stepper** | onboarding micro-pasos + progress | Framer | |
| C17 | **Empty / Error / Success states** | con **mascota zorro** (Lottie) | Lottie | |

## D. Organismos (dominio inmobiliario)
| # | Elemento | Notas | Lib | Decisión |
|---|---|---|---|---|
| D1 | **Mapa map-first** | split; mapa=filtro; **draw-zona + multi-área**; capas (precio/transporte/escuelas/plusvalía/riesgo); pines con precio + cluster | Mapbox + Framer | |
| D2 | **Galería / Lightbox** | full-screen "magazine"; carrusel "1 de N" | Framer | |
| D3 | **Tour 3D / Floor plan clicable** | plano 2D como nav primaria; salto a cuarto | R3F/embed | |
| D4 | **AVM widget "Valuar"** | valor + **rango de confianza** + **factores ponderados** + "por qué" | Recharts+Framer | |
| D5 | **Panel de verificación itemizado** | título ✓, geo ✓, dueño ✓, fecha, "última re-verificación" | Framer | |
| D6 | **Historial de precio** | timeline + días en mercado | Recharts | |
| D7 | **Shortlist colaborativa** | lista compartida, voto, invitar (CTA visible), modo "Decidir" | Framer | |
| D8 | **Copiloto del agente** | next-best-action in-surface, accept/dispara acción | Framer | |
| D9 | **Data room cifrado** | dos sliders (expiración/audiencia), audit itemizado | — | |
| D10 | **KPI cards / dashboards** | ya en `dashboard-financial` (KPICard, charts) — retematizar | Recharts | |
| D11 | **Massing 3D de edificio** | ya `FinObra3DBuilding` (R3F) | R3F | |

## E. Animaciones / interacciones (Emil §1b)
| # | Interacción | Spec | Lib | Decisión |
|---|---|---|---|---|
| E1 | Hover / press / focus | `ease-out`, 100–160ms | CSS/Framer | |
| E2 | Transiciones de ruta / view | asimétrico; entrada rápida, salida ~150ms | Framer/View Transitions | |
| E3 | List stagger | 30–80ms | Framer | |
| E4 | **Optimistic UI** | guardar/alertas re-render síncrono; cero spinners | — | |
| E5 | Skeleton/loading | solo carga inevitable | CSS | |
| E6 | Toast + undo | Sonner | Sonner | |
| E7 | Map pin cluster/expand, card↔pin, fly-to | — | Mapbox+Framer | |
| E8 | **Number/price counters** | conteo al entrar en viewport | GSAP/Framer | |
| E9 | Reduced-motion | conservar opacity/color | CSS | |

## F. Arte en movimiento (moving art) — GSAP + ScrollTrigger + Lottie + video
| # | Pieza | Técnica | Fuente/arte | Decisión |
|---|---|---|---|---|
| F1 | **Hero low-poly animado** (mundo del zorro / mapa CDMX) | GSAP entrance + parallax | R2 `maps/canonical` | |
| F2 | **Scroll-storytelling: el zorro recorre el mapa** | **GSAP ScrollTrigger** (pin + scrub timeline) | cartones zorro + mapa | |
| F3 | **Parallax de capas** (nubes/mundo/edificios) | ScrollTrigger parallax | assets low-poly | |
| F4 | **Mascota zorro — estados** (bienvenida/buscando/éxito/vacío) | **Lottie** o sprite | `cartones-transparent/` zorro | |
| F5 | **Video loop hero** (los Veo del zorro/mamut) | `<video>` autoplay muted loop | R2 `video/` | |
| F6 | **SVG line-draw** (logo/iconos de marca) | GSAP DrawSVG / stroke-dashoffset | logo SVG (pendiente) | |
| F7 | **Marquee** (colonias/ciudades/logos) | CSS/GSAP loop | — | |
| F8 | **Reveal on scroll** (secciones, cards, stats) | ScrollTrigger + Framer whileInView | — | |
| F9 | **Cursor-follow / hover art** (delight puntual) | Framer/GSAP | — | |
| F10 | **Isla/atlas isométrico interactivo** (arte hero de consumidor) | R3F o imagen + hotspots GSAP | escenas-iso / low-poly | |
| F11 | **Transición de mapa 2D↔ilustración low-poly** | GSAP timeline | mapa + atlas | |

> Regla: el arte lo **crea german** (assets en R2); el agente lo **cablea** en estos slots (Lottie/GSAP/video/R3F) respetando `prefers-reduced-motion` y performance (transform/opacity, lazy-load).

---

## Tabla `/masterplan` de construcción (tras tu curación del catálogo)
| # | Ola | Contenido | Owner/Modelo | Verificación |
|---|---|---|---|---|
| K0 | 0 | Fundacionales A3–A6 + **átomos B** + primitivas de animación Emil + instalar GSAP/Sonner/Vaul/Lottie | Sonnet + Opus (perf) | átomos en `/style`, 3 temas, <300ms |
| K1 | 1 | **Moléculas C** (nav, tab-bar, search, filtros, drawer, toast, tabs) | Sonnet + Haiku | `/style` completo; a11y AA |
| K2 | 2 | **Organismos D** (mapa, ficha, AVM, verificación, shortlist, copiloto) | Opus (AVM/verif/seguridad) + Sonnet | smoke tests de dominio |
| K3 | 3 | **Arte en movimiento F** (GSAP/ScrollTrigger/Lottie/video) cableando assets de R2 | Sonnet + operador (arte) | scroll-story fluido 60fps; reduced-motion |
| K4 | ∥ | **Guía viva `/style`** con TODO el catálogo + specs de animación | Sonnet + Haiku | página `/style` navegable |

## Gate de smoke tests
1. Cada elemento del catálogo curado existe en `/style`, en 3 temas, con estados. 2. Animaciones cumplen Emil (<300ms, sin `ease-in`, reduced-motion, 60fps). 3. GSAP/ScrollTrigger no bloquea scroll ni rompe en móvil. 4. Sonner/Vaul/Lottie integrados. 5. Arte en movimiento lazy-load + degrada con reduced-motion.

## Pendientes del operador (german)
- **Curar este catálogo** (marcar ✅/✏️/❌/⭐ por fila) — es el gate.
- Entregar los **assets de arte** (Lottie del zorro, SVG del logo, videos, escenas) a los slots F.
- Validar librerías (GSAP club plugins DrawSVG/MorphSVG si se usan — licencia).

## Secuencia
1. **Este `MASTERPLAN-CATALOGO.md`** → german cura (qué se cambia). 2. Ajustar **`MASTERPLAN-UX-v1.md`** (navbar/journeys/animación) con lo curado. 3. Ejecutar olas K0→K4 (+ X0–X7 de UX). Ref: `ROADMAP.md §I.4b/§I.4c`, `ux-research/01–04`.
