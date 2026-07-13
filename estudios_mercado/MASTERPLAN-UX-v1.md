# /masterplan — UX/UI concreto de Klugger (v1, derivado de la investigación)

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador/juez: TÚ. Craft de animación = nivel Emil Kowalski / Linear.
> **Insumos** (todos en `estudios_mercado/`): `ux-research/01` (patrones world-best por innovación), `ux-research/04` (craft Emil), `ux-research/02` (errores portales MX), `ux-research/03` (teardown mejores portales), `ESTUDIO-UX-INTRAINDUSTRIA.md` (innovaciones N1–N8 + fosos). Operacionaliza la capa de UX de `MASTERPLAN-UI-v1.md`.
> Este doc fija las **decisiones concretas de interfaz**: navbar/IA, orden de menús, botones, animaciones, hamburguesa vs bottom-nav, y user journeys por público.

## Principios rectores (de la investigación)
1. **La barra de búsqueda ES el CTA del home** (6 de 7 líderes; sin botón de color compitiendo). §3.
2. **Map-first + el mapa es el filtro** (pan/zoom re-consulta) + **draw-zona** + **multi-área no-adyacente** (Idealista, estado del arte). §1/§3.
3. **Móvil = bottom tab-bar, NO hamburguesa** (todos los líderes en app). §3.
4. **Ficha: galería #1 → precio → acción arriba → datos → similares al final**; CTA de acción **sticky** (rail der / barra inferior móvil). §3.
5. **Explicar es el foso:** NL con chips "por qué hizo match", AVM con confianza+factores, verificación itemizada. §1.
6. **Evitar los errores MX:** sin muros de registro para contactar, sin ranking pay-to-win, sin ads intrusivos, sin categorías que se filtran mal, con estado/fecha visible y anti-duplicado. §2.
7. **Animación con propósito** (Emil): <300ms, `ease-out` default, `ease-in` prohibido, optimistic UI, interrumpible, `prefers-reduced-motion`. §1b.

---

## A. Navegación (navbar + orden, por público)

**Regla base:** logo izq → ítems de intención → **búsqueda como CTA** → auth minimizada der. Header **sticky transparente→sólido** al scroll; en resultados/ficha el **campo de ubicación queda pineado**.

| Público (tema) | Navbar desktop (orden exacto) | Der |
|---|---|---|
| **Consumidor** ☀️ light | **Comprar · Rentar · Vender · Valuar · Colonias · Agentes** | Guardados (♥) · Alertas · Entrar |
| **Agente/Realtor** 🌓 | **Inventario · Subir propiedad · Insights · Mi sitio · Leads** | Notificaciones · Cuenta |
| **Desarrollador** 🌓 | **Zonas · Estudios HBU · Mapas · Datos** | Cuenta |

- **Sin CTA de color en el nav** (el input domina). "Valuar" es el gancho diferenciador (AVM), ausente en MX.
- Mega-menú al hover solo en Comprar/Rentar (tipos + Colonias + Mapa). Nada de 8 ítems tipo Lamudi.

**Móvil (app/PWA) = bottom tab-bar de 4–5 (zona pulgar), NO hamburguesa:**
- Consumidor: **Buscar(mapa) · Guardados · Alertas · Cuenta**. En vista mapa se **oculta la tab-bar** (canvas completo, como Zillow).
- Agente: **Inventario · Subir · Insights · Leads · Cuenta**.

---

## B. Homepage
- Hero con **una barra de búsqueda gigante centrada** + **modo NL** ("Depto 2 rec bajo $20k cerca de Metro Chabacano, pet-friendly, buena plusvalía"). Placeholder multi-tipo (dirección, colonia, ciudad, CP, escuela). Tabs Comprar·Rentar·Vender.
- Above-the-fold: **"Casas cerca de ti"** en vivo (valor antes de buscar, patrón Redfin) — NO banners de captación compitiendo (error MX #15).

## C. Búsqueda → resultados
- **Split: mapa IZQ / lista DER** (desktop); móvil toggle + bottom-sheet swipeable.
- **El mapa es el filtro:** pan/zoom re-consulta con toggle explícito **"Buscar en esta zona"** persistente (evita el "search as I move" molesto). Pines con **precio** + cluster/de-cluster.
- **Barra de filtros, orden budget-first:** **Precio · Recámaras/Baños · Tipo · Superficie (m²) · Más** — y en "Más" los diferenciadores que MX no tiene: **uso de suelo, plusvalía, $/m², verificado, con tour**.
- **Draw-zona + multi-área no-adyacente** (superar a todos). **Capas** conmutables: precio (heatmap), transporte, escuelas, plusvalía, riesgo.
- **Guardar búsqueda → alertas** (Instant/Diario/Off) push+Telegram; **alerta "cruzó a mi presupuesto"** (fusión affordability+alertas).
- Cards con **badges de estado/recencia** ("NUEVO hace 1 h", ▲/▼ precio, **Verificado**) + **acoplamiento card↔pin al hover**.
- **Sin muro de registro para ver/contactar** (anti-error MX #7).

## D. Ficha de propiedad (orden de secciones + botones)
Orden: **Galería (lightbox/tour 3D con plano 2D clicable) → Precio + key facts → [AVM Klugger con rango + factores + "por qué"] → Historial de precio + días en mercado → Verificación itemizada (título ✓, geo ✓, dueño ✓, fecha) → Descripción → Características → Mapa + capas → Similares (al final).**
- **Jerarquía de botones:** **Agendar visita / Contactar** (primario, filled, `--accent`) > **Guardar** (♥, secundario) > **Compartir**. **Sticky:** rail der en desktop, **barra inferior pineada en móvil**.
- Diferenciadores vs MX: AVM+historial+verificación **junto al anuncio** (nadie en MX lo tiene junto); contacto **sin muro**; el lead va al **listing agent**, no a un pool revendido (cerrar el loop hasta agendar).

## E. Sistema de animación (Emil Kowalski — §1b)
- Tokens en `tokens.css`: `--dur-quick 100ms · --dur-hover 150ms · --dur-base 250ms · --dur-slow 350ms`; `--ease-out cubic-bezier(0.23,1,0.32,1)` (default), `--ease-drawer cubic-bezier(0.32,0.72,0,1)`. Techo **<300ms**; **`ease-in` prohibido**.
- **Botón** press `scale(0.97)` 160ms; **popover** origin-aware (sale del trigger); **toasts = Sonner**, **bottom-sheets = Vaul** (ya interrumpibles). **Optimistic UI** en guardar/alertas (cero spinners). Solo `transform`/`opacity` (60fps). `prefers-reduced-motion` respetado. **No animar** el command palette / acciones de alta frecuencia.

## F. User journeys por público (feliz path)
- **Consumidor:** home (search NL) → resultados map-first (draw + capas) → ficha (AVM + verificación) → Guardar en **shortlist compartida** (invitar co-comprador = CTA visible) → alerta "cruzó a mi presupuesto" → **Agendar visita** (sin muro, al listing agent).
- **Agente:** onboarding → **subir propiedad por chat/foto** (ingesta VLM) → inventario → **copiloto: next-best-action** ("baja 3%", "llama a estos 5 leads") → sitio propio (subdominio) → lead calificado.
- **Desarrollador:** elegir zona → **estudio HBU/zona** (pipeline Cimatario) → mapas de scoring → exportar/compartir (data room cifrado).

---

## Tabla de tareas (owner/modelo · ola · deps · verificación)
| # | Tarea | Owner/Modelo | Ola ∥ | Deps | Verificación |
|---|---|---|---|---|---|
| X0 | **IA/navegación**: `<AppNav>` por público (orden arriba) + **bottom tab-bar** móvil + header sticky | Sonner+Sonnet | 0 | UI U0 | 3 navbars + tab-bar; sticky ok; a11y |
| X1 | **Sistema de animación** (tokens Emil + Sonner/Vaul + optimistic UI helpers) | Sonnet + Opus (review perf) | 0 ∥ | tokens.css | <300ms, `ease-in`=0, 60fps, reduced-motion |
| X2 | **Home + búsqueda NL** (hero search = CTA + chips "por qué match") | Opus (NL) + Sonnet | 1 | N1, X0 | prosa→resultados+explicación |
| X3 | **Resultados map-first** (split, mapa=filtro, filtros orden, draw+multizona, capas, card↔pin) | Sonnet + Haiku | 1 | N2, X0 | draw filtra en vivo; capas; sin muro |
| X4 | **Ficha** (orden de secciones + AVM + historial + **verificación itemizada** + botones sticky) | Opus (AVM/verif) + Sonnet | 2 | N3,N4 | ficha con AVM+rango+verif; CTA sticky |
| X5 | **Shortlist colaborativa + alertas** (invite CTA visible, voto, "cruzó a presupuesto") | Sonnet | 2 ∥ | N7,N8 | lista compartida + alerta llega |
| X6 | **Copiloto del agente** (next-best-action in-surface, accept/dispara acción) | Sonnet + Opus | 3 | realtor U1 | acción priorizada por agente |
| X7 | **Guía viva `/style`** (todos los componentes en 3 temas + specs de animación) | Sonnet + Haiku | 0 ∥ | X0,X1 | `/style` muestra todo; AA |

## Gate de smoke tests
1. 3 navbars por público + **bottom tab-bar móvil** (no hamburguesa) + sticky. 2. Animaciones cumplen Emil (<300ms, sin `ease-in`, reduced-motion, 60fps). 3. Home NL→resultados con chips de match. 4. Resultados map-first con draw+multizona+capas, **sin muro para contactar**. 5. Ficha con **AVM+historial+verificación itemizada** y CTA sticky. 6. Shortlist compartida + alerta de presupuesto. 7. Lighthouse verde móvil.

## Pendientes del operador
- Validar azul `#2E9BD6`; logo SVG; confirmar copy de navbar por público; aprobar prioridad de olas.
- Todo el **arte** (hero low-poly, mapas, cartones) lo entrega german a los slots (§V diseño).

## Integración con el ROADMAP
Se referencia desde `ROADMAP.md §I.4c`. Operacionaliza la UX de `MASTERPLAN-UI-v1.md` (U0–U5) y las innovaciones N1–N8 de `ESTUDIO-UX-INTRAINDUSTRIA.md`, con base en `ux-research/01–04`.
