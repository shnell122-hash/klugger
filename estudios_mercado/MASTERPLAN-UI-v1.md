# /masterplan — UI de la plataforma Klugger (v1)

> Orden: **SEGURIDAD → CALIDAD → COSTO**. Orquestador/juez final: TÚ (main loop, modelo más capaz).
> **Arte lo lidera german** (proceso multi-IA + criterio humano). El agente **no genera arte de producción**: implementa **tokens, theming, componentes, slots de integración y wiring**, y cablea lo que german entregue. Ver `MASTERPLAN-DISENO-v13-0.md §V`.
> Fuente de estado: mapa de repo 2026-07-12 (Explore). App real = `dashboard-financial/` (Next.js 15 App Router + React 19 + TS + Tailwind + Framer Motion + Mapbox + R3F/three). Deploy: rama `testing` → Cloudflare Pages → `klugger.shnell.mx`.

## Objetivo
Construir la UI de la plataforma para los **3 públicos** (realtor P0, persona física P1, desarrollador P1) sobre **un solo codebase** (módulos/rutas + multi-tenant por subdominio + feature-flags), con un **sistema de diseño en código** (tokens + 3 temas) y **slots de arte** listos para el arte low-poly/isométrico que entrega german. No ramas por tipo de usuario (ver `ROADMAP.md §I.3`).

## Prerrequisitos bloqueantes (decisiones del operador — sin esto no se congela el look)
1. **Azul del degradado** `#2E9BD6` (validar o corregir). Verdes `#2ED666`/`#29BF5C` + gris `#3B3B3B` = intocables.
2. **Tipografía display:** licenciar **Nexa Black** (Fontfabric, comercial) o alternativa libre (Montserrat/Sora). Body = Open Sans.
3. **Logo en SVG** (hoy solo PNG/JPG en `public/assets/`). Canónico = `klugger-logo-vectorized.png`.
4. **Congelar paleta de arte** A/B/C (`paletas-color.md`) — o adoptar la **paleta low-poly de los videos** ya usada en el arte (ver memoria `cdmx-hero-map-canonical`).
5. **Librería de motion** (Framer Motion ya instalado; confirmar patrones).
6. **Reconciliar `main` ↔ `testing`** (el dashboard de 9 tabs vive en `testing`) antes de escalar multi-tenant.

## Tabla de tareas (owner/modelo · ola · deps · verificación)

| # | Tarea → Subtareas | Owner/Modelo | Razón (sec/cal/costo) | Ola ∥ | Deps | Verificación (prueba positiva) |
|---|---|---|---|---|---|---|
| **U0.1** | **Design tokens en código**: `tokens.css`+`tokens.ts` (primitivos + semánticos), `tailwind.config` mapeado, **3 temas** por `data-theme` (🌑 valuación dark · 🌓 devs toggle · ☀️ consumidor light) | **TÚ** (decide) + Sonnet (impl) | calidad: base que todo consume | 0 | prereq 1–2 | los 3 temas renderizan; 0 colores hardcodeados nuevos |
| **U0.2** | **Slots de integración de arte** (contrato §V): componentes `<Hero>`, `<Illus>`, `<MascotState>` con props de imagen/animación; soporte SVG/WebP/Lottie/MP4; variantes dark/light; lazy-load | **TÚ** + Sonnet | calidad: german inyecta sin tocar código | 0 ∥ | U0.1 | slot acepta los 4 formatos + fallback; atlas cableado |
| **U0.3** | **Librería de componentes tematizada**: botón/card/input/KPI/nav/tabla/badge + `<AppShell>` por tema + guía viva `/style` | Sonnet + Haiku (stories) | calidad + volumen | 0 ∥ | U0.1 | `/style` muestra todos en 3 temas; a11y AA |
| **U0.4** | **Multi-tenant + routing**: subdominio→tenant, feature-flags, middleware, resolución de tema por ruta/tenant | **TÚ** + Opus (seguridad) | seguridad: aislamiento de datos por tenant | 0 | backend `agents.slug` | tenant A no ve datos de B; tema correcto por ruta |
| **U1.1** | **Realtor — onboarding + dashboard de inventario** (alta de agente, plan, lista de propiedades) | Sonnet + Haiku | impl estándar con spec | 1 | U0.*, DB `agents`/`properties` | agente se registra; ve su inventario |
| **U1.2** | **Realtor — flujo de upload/ingesta** (form + fotos → agente VLM `platform/ingest/agent.py` → `properties` pgvector) | Sonnet + **Opus** (correctness/seguridad ingesta) | calidad: datos privados, `allow_free=False` | 1 | U1.1 | subo propiedad → fila en pgvector con embedding → aparece en inventario |
| **U1.3** | **Realtor — sitio público del agente** (multi-tenant, SEO, ficha por propiedad) | Sonnet + Haiku (pSEO volumen) | costo/volumen | 1 ∥ | U0.4 | sitio en subdominio con schema.org; indexable |
| **U2.1** | **Persona física — landing de consumidor** (hero de arte `hero-consumer`, degradado verde→azul protagonista, tema light) | Sonnet + **OPERADOR** (arte) | juez estético = german | 2 | U0.2 | hero con slot de arte low-poly; light theme; responsive |
| **U2.2** | **Buscador federado NL** (input NL → pgvector + scrapers user-side link-out; resultados citan+enlazan fuente) | Sonnet + **Opus** (legal/robots/dedup adversarial) | seguridad legal: link-out, no clonar, robots.txt/LFPDPPP | 2 | U0.*, §I.3 | busca multiportal, cita fuente, 0 login, respeta robots |
| **U2.3** | **Ficha de resultado + alertas** (card link-out, alertas Telegram) | Sonnet + Haiku | estándar | 2 ∥ | U2.2 | alerta llega por Telegram; card enlaza a la fuente |
| **U3.1** | **Desarrollador — dashboards de zona/HBU** (insights por polígono, tema toggle día/noche) | Sonnet (reusa pipeline valuación) | reuso | 3 | U0.*, Parte II | estudio de zona render con datos reales |
| **U4.1** | **Refactor monolito** `ValuacionDashboard.tsx` (9 tabs) a los tokens nuevos + extraer subcomponentes | Sonnet + Opus (review) | deuda técnica Fase 2 | 3 ∥ | U0.1 | 9 tabs consumen tokens; sin regresión visual |
| **U5.1** | **Integrar arte de german** en los slots (mapas hero low-poly, cartones/zorro estados, atlas) conforme llegue | **TÚ** (wiring/optim) + OPERADOR (arte) | proceso §V | 4 (continuo) | U0.2 | `zorro-vacio`, `hero-consumer`, `illus-ciudad` montados + optimizados |
| **UX** | **QA transversal**: a11y AA, performance (LCP/CLS), export estático (`NEXT_STATIC_EXPORT`), review adversarial | **Opus ×2** + Haiku (corridas) | calidad/seguridad | por ola | cada ola | Lighthouse verde; build `out/` ok; deploy testing 2xx |

## Olas de ejecución (paralelización)
- **Ola 0 (fundación, bloquea todo):** U0.1–U0.4. Archivos disjuntos → paralelo; U0.1 primero (todos dependen de tokens). Multi-tenant (U0.4) con review de Opus por seguridad.
- **Ola 1 (Realtor P0):** U1.1→U1.2 (secuencial, comparten `properties`), U1.3 en paralelo.
- **Ola 2 (Persona física P1):** U2.1, U2.2→U2.3.
- **Ola 3 (Devs P1 + refactor):** U3.1, U4.1 en paralelo.
- **Ola 4+ (arte):** U5.1 continuo conforme german entrega.

## Gate de smoke tests
1. Los **3 temas** conmutan por `data-theme` sin colores hardcodeados; verdes/gris de marca intactos.
2. **Slot de arte** acepta SVG/WebP/Lottie/MP4 con variante dark/light + lazy-load + fallback.
3. **Realtor:** alta → upload → propiedad en pgvector con embedding → visible en inventario.
4. **Buscador federado:** NL devuelve resultados **link-out** que citan la fuente, sin login, respetando robots.txt/LFPDPPP (no clona fotos/textos).
5. **Multi-tenant:** aislamiento estricto de datos entre tenants.
6. **Build:** `NEXT_STATIC_EXPORT=true npm run build` → `out/`; deploy a `testing`/Cloudflare Pages responde 2xx.
7. a11y AA + Lighthouse (LCP/CLS) en verde en las páginas nuevas.

## Pendientes del operador (solo german)
- Decisiones de marca: **azul `#2E9BD6`**, **licencia/alternativa de Nexa Black**, **logo SVG**, **congelar paleta** (A/B/C o low-poly de video), librería de motion.
- **Creación de todo el arte** (hero maps, cartones, mascota, ilustraciones) — el agente solo deja slots y cablea.
- Aprobar **prod**, dominio (`klugger.mx`), reconciliación `main`↔`testing`, y umbrales legales del buscador (robots/LFPDPPP).

## Integración con el ROADMAP
Esta tabla **detalla el "cómo UI"** de las tareas de `ROADMAP.md §I.4`: U1.* ↔ tarea 0.3/0.4 (sitios de agente + onboarding), U2.* ↔ tarea 0.2 (buscador federado), U0.* = fundación de diseño previa a todas. Se referencia desde `ROADMAP.md §I.4b`.
