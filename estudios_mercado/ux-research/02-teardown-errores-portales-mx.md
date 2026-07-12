# §2 — Teardown UI/UX + user journey + errores estructurales de los portales inmobiliarios MEXICANOS

> Método: WebFetch en vivo + WebSearch de reseñas (App Store/Play, Trustpilot, foros). Caveat: Inmuebles24, Vivanuncios, Mercado Libre, Lamudi y Propiedades.com devuelven HTTP 403/timeout a fetch automatizado (WAF anti-bot); el orden verbatim de navbar/filtros se reconstruyó desde app stores, guías oficiales, proxies de render y quejas reales (marcado donde es inferido). Casas y Terrenos y la home de Lamudi sí se capturaron en DOM vivo.

---

## (a) Teardown por portal

### 1) Inmuebles24 (líder MX, de QuintoAndar) — inmuebles24.com
App Store MX 4.8★ / 14,000+ ratings (inflado por prompts in-app; choca con reseñas escritas negativas).
1. **Navbar:** logo izq, sticky. CTA "Publicar Gratis" derecha (Profesional vs Dueño directo). Operación Venta/Renta/Renta temporal + Desarrollos + tipos como mega-dropdown. Prioriza al vendedor; carga display-ads.
2. **Móvil (app):** bottom-nav de 4 tabs — Listado · Mapa · Favoritos · Perfil (bien). "Publicar" top-right. Muro de registro para contactar/guardar/alertas.
3. **Home:** hero de búsqueda (Comprar/Rentar/Renta temporal + ubicación). Sirve dos amos (comprador vs "Publicar Gratis").
4. **Resultados:** split lista+mapa; "Dibujar en el mapa" SÍ existe (raro en MX). Filtros: Ubicación → Precio → Tipo → Recámaras → Baños → Superficie → Amenidades. Keyword libre pero sin NLP. Sin uso de suelo, sin plusvalía. Guardar búsqueda + alertas (con cuenta). Fuga de categorías (remates en ventas, oficinas en deptos).
5. **Ficha:** galería → precio+ubicación → íconos → descripción → amenidades → mapa → contacto. "Contactar" dominante (form) + "Preguntas"; favorito secundario. AVM "¿Cuánto vale?" existe pero es herramienta separada del vendedor — el comprador NO ve valuación/historial/días-en-mercado junto al anuncio. Ads y "similares patrocinadas".
6. **Micro-interacciones:** mapa moderno, pero UX inestable ("reinstalar cada vez"), bugs de login; changelog repite "corrección de errores".
7. **Journey/fricción:** home (banners) → SRP (fuga de categorías, sin fecha/estado) → ficha (**fotos duplicadas** → sospecha de fraude; sin AVM) → **muro de registro** para contactar → espera (Help tiene artículo "¿y si no me responde el anunciante?"; teléfono desactualizado/vendido) → "~90% estafas/remates", "no verifica anunciantes".

### 2) Mercado Libre Inmuebles — inmuebles.mercadolibre.com.mx
Trustpilot 1.4★. **Debilidad central: NO tiene interfaz propia; es el e-commerce de ML con un filtro encima.**
1. **Navbar (chrome de e-commerce):** logo ML (vuelve al home de productos) → selector "Enviar a tu CP" (absurdo para una casa) → buscador "Buscar productos, marcas y más…" → "Categorías" (Inmuebles una entrada más) → carrito. Fila 2: Ofertas/Play/Vender/Ayuda (nada inmobiliario).
2. **Móvil:** hamburguesa; muro de login antes de navegar; reconocimiento facial percibido intrusivo.
3. **Home inmuebles:** carruseles de cards **tipo producto**; framing "catálogo"; carrito, "Ofertas del día", reputación de vendedor con estrellas, listados Patrocinados.
4. **Resultados:** grilla de cards de producto. "Buscar en mapa" SÍ pero secundario, sin draw. Filtros e-commerce: Operación · Tipo · Ubicación · Precio máx · Recámaras · Baños · m² · Antigüedad. Sin NLP, sin uso de suelo/plusvalía/$-m². Sort "Más relevantes" empuja pagados. **Bug: tocar "Filtros" crashea la app.**
5. **Ficha = ficha de producto:** galería + panel de acción; "Características" key-value; Contactar/Preguntar (Q&A público)/Ver teléfono (tras login)/WhatsApp; reputación de vendedor. Sin AVM/historial/comparables. Módulos "productos relacionados" + carrito en la ficha.
6. **Micro-interacciones:** skeletons estándar, front rápido, pero crash en Filtros; sonidos de notificación intrusivos.
7. **Journey/fricción:** login (+facial) antes de ver una casa → Inmuebles enterrado en "Categorías", buscador dice "productos" y pide CP → filtros pobres + crash → relevancia contaminada por ads → ficha sin valuación rodeada de chrome de compras → teléfono oculto → transacción fuera de plataforma (disonancia "agregar al carrito" algo que no se compra ahí).

### 3) Propiedades.com (de Habi) — propiedades.com
SimilarWeb #2 real estate MX. App Android ~3.4/5. **Foso = capa de datos/AVM.**
1. **Navbar [inferido]:** wordmark izq; Venta · Renta · Desarrollos/Preventa · **Avalúo** · Valores/Explorar · Blog · Publicar + login.
2. **Móvil:** app nativa con hamburguesa; mapa interactivo, favoritos con notificaciones, publicar desde celular.
3. **Home [inferido]:** hero Venta/Renta; diferenciador: bloques a **herramientas gratuitas** (avalúo, Mapa de Precios, simulador crédito, Infonavit).
4. **Resultados:** listado + mapa. Filtros: ubicación, precio, recámaras, tipo, m². Sin NLP, sin draw. Plusvalía/$-m² viven en herramientas, no en la barra.
5. **Ficha + AVM (diferenciador real):** galería → precio → contacto → características → mapa → similares. **AVM propio "Simulador de avalúo"** gratis <3 min: precio estimado, plusvalía ~4 años, $/m², lugares de interés, distribución de zona. **Mapa de Precios: +1.4M propiedades. Mapa catastral /explorar: uso de suelo, valor catastral, superficie de terreno (SIGCDMX).** Simulador de crédito + Infonavit. **No hay historial de precio del anuncio individual** (sí plusvalía de zona).
6. **Micro-interacciones:** timeout de carga en cada fetch (SSR lento) = talón.
7. **Journey/fricción:** home (CTA de compra diluido entre 4 herramientas) → resultados rígidos, sin NLP/draw → ficha (probable muro para ver teléfono) → contactar (**3,143 reportes de fraude en 2024**) → validar precio con AVM+Mapa de Precios = su mejor momento UX → guardar en app de carga lenta.

### 4) Lamudi México (Lifull Connect) — lamudi.com.mx
Portal #3, ~100% mobile-first. Único diferenciador: **asistente NLP** enterrado.
1. **Navbar [dato duro]:** logo. Orden: **En venta** (dropdown) → **En renta** → **Nuevos Desarrollos** → **Remates** → **Infonavit** → **Recursos**. Derecha: idioma ES/EN → favoritos → Ingresar → Publicar. **8 ítems de primer nivel** (carga cognitiva alta); "Comprar/Rentar" duplicado entre nav y tabs.
2. **Móvil:** hamburguesa que colapsa 8 ítems; acciones arriba-derecha = zona muerta del pulgar; search alerts en app.
3. **Home [dato duro]:** hero + buscador dominante. Orden: **Proyecto destacado (inventario pagado como hero)** → otros proyectos → **"Asistente Personal — Dile qué necesitas" (NLP)** → guías → blog → propiedades → muro SEO (mitad inferior).
4. **Resultados:** tabs Venta/Renta; chips por tipo. **NLP SÍ** (Asistente Personal). Filtros: ubicación, precio, recámaras, tipo. Sin split-map en web (mapa en app, sin draw). Sin uso de suelo/plusvalía. Orden dominado por **membresía premium (agentes con "corona" primero)**. Quejas: **"no se puede buscar por municipio completo"** + anuncios sin precio.
5. **Ficha [reconstruida]:** galería HD → precio → título/colonia → specs → descripción → amenidades → mapa → bloque de agente con insignia. Contacto: llamada · WhatsApp · email + favoritos multi-dispositivo. **Sin AVM/historial.** Inventario propio premium (coronas) mezclado.
6. **Micro-interacciones:** web = cascarón SEO con contenido JS-inyectado (primera pintura lenta). "Después de pagar aparece no disponible", "app nueva ni se puede usar".
7. **Journey/fricción:** home (8 ítems + duplicados + muro SEO) → búsqueda geográfica ubicación-por-ubicación (frustrante) → resultados con premium arriba (sesgo de pago), sin mapa/draw, listados sin precio → ficha sin AVM → contactar ("nadie contesta / número no funciona", sospecha de cuentas dummy) → mejor experiencia gated tras la app.

### 5) Vivanuncios Inmuebles (QuintoAndar, motor gemelo de I24) — vivanuncios.com.mx/s-inmuebles
Clasificado generalista (inmuebles = 1 vertical). Mismo buscador que Inmuebles24.
1. **Navbar:** categorías generalistas (Autos, Inmuebles, Empleos, Servicios). Dentro "Bienes Raíces" con subcategorías. CTA "Publicar anuncio gratis" (verde). Densidad alta, banners display.
2. **Móvil:** hamburguesa con árbol generalista antes de Inmuebles; app global "compra/vende autos, ropa… e inmuebles".
3. **Home:** buscador por categoría → estado/ciudad. Ruido medio-alto.
4. **Resultados:** lista galería + toggle lista/mapa (SÍ mapa) + calcula ruta/tiempo de traslado. Filtros: Categoría → Estado/ciudad → Presupuesto → Recámaras → m² → Texto libre → "Con fotos". Sin NLP, sin uso de suelo/plusvalía, sin draw. Guardar búsqueda + alertas email SÍ.
5. **Ficha [reconstruida]:** foto → título → precio → specs → contacto tel+mensaje (fuera de plataforma); tours virtuales. Sin AVM/historial. Ads display.
6. **Micro-interacciones:** mismas quejas del gemelo — bugs que obligan a reinstalar, **filtros que no respetan la selección** (remates/oficinas se cuelan), fotos duplicadas + ubicaciones falsas (sin verificación).
7. **Journey/fricción:** elegir Inmuebles entre autos/empleos → taxonomía profunda → filtros que no filtran → mapa por zona (+traslado) → contacto tel/email sin verificación → app buguea → reinstalar.

### 6) Casas y Terrenos (Bajío/GDL) — casasyterrenos.com
Vertical puro, DOM en vivo. Sobrio, con brechas grandes.
1. **Navbar [dato duro]:** logo → Comprar → Rentar → Publicar → selector "Casa" → barra "Buscar" → der CTA WhatsApp "Asesoría sin costo". **No sticky. Sin sign-in visible. Sin ads de terceros** — el más limpio.
2. **Móvil:** hamburguesa; sin bottom-nav; ancla = WhatsApp. **No existe app de comprador** — la única app ("Casas y Terrenos Pro") es CRM de agentes, 1.0★.
3. **Home [dato duro]:** hero grande + tagline; barra "Buscar"; simulador de crédito hipotecario (32 estados). Ruido visual bajo.
4. **Resultados [dato duro]:** **una sola columna de cards, SIN mapa split** (brecha grande). Barra "Lista | Filtros" + "Ordenar"; único filtro visible: "Ver sólo propiedades nuevas"; precio/recámaras/m² escondidos tras "Filtros". Sin NLP/uso de suelo/plusvalía/draw.
5. **Ficha [proxy card]:** foto → badge "Destacado" → ubicación → título → precio → specs → "Contáctenme" + teléfono/WhatsApp + compartir/favorito. Acción dominante WhatsApp. Sin AVM/historial (solo simulador hipotecario). Sin ads.
6. **Micro-interacciones:** usa AVIF (buena performance); UI tradicional sin skeletons. Sin reseñas de comprador (no hay app).
7. **Journey/fricción:** home limpio → comprar/rentar+ubicación → **resultados en lista sin mapa** → filtros poco visibles → "Contáctenme"/WhatsApp directo (lo mejor) → simulador hipotecario → seguir en móvil sin app y sin login persistente (frágil).

---

## (b) Tablas comparativas

### Tabla 1 — Navbar (ítems × portal)
| Elemento | Inmuebles24 | ML Inmuebles | Propiedades.com | Lamudi | Vivanuncios | Casas y Terrenos |
|---|---|---|---|---|---|---|
| Logo→home vertical | Sí | **No (e-commerce)** | Sí | Sí | Sí (clasificado) | Sí |
| Venta/Comprar | Sí | En "Categorías" | Sí | En venta | Categoría | Comprar |
| Renta | Sí (+temporal) | Sí | Sí | En renta | Sí (+cuartos) | Rentar |
| Desarrollos | Sí | — | Sí | Nuevos Desarrollos | — | — |
| Remates | (mezclado) | — | — | Sí | — | — |
| Avalúo/Herramientas | Separado (vendedor) | — | **Avalúo, Explorar** | Recursos | — | Simulador crédito |
| Buscador en navbar | Sí | **"Buscar productos…"** | Sí | Sí | Sí | Sí |
| Ruido no-inmobiliario | Display ads | **Carrito, CP, Ofertas** | Bajo | Muro SEO | **Autos/Empleos** | **Ninguno** |
| CTA monetización | Publicar Gratis | Vender | Publicar | Publicar | Publicar gratis | Publicar |
| Sticky | Sí | Sí | Probable | JS | — | **No** |
| # ítems 1er nivel | ~5-6 | Genérico e-comm | ~7 | **8** | Categorías | **~5 (limpio)** |

### Tabla 2 — Ficha (features × portal)
| Feature | Inmuebles24 | ML | Propiedades.com | Lamudi | Vivanuncios | Casas y Terrenos |
|---|---|---|---|---|---|---|
| Galería top | Sí | Sí (≥12, 360°) | Sí | Sí HD | Sí (+tours) | Sí |
| CTA primario | Contactar (form) | Ver teléfono/Contactar | Contacto | WhatsApp/llamada/email | Teléfono/mensaje | Contáctenme/WhatsApp |
| **AVM/valuación** | Separado, vendedor | **No** | **SÍ (Simulador)** | **No** | **No** | Solo sim. crédito |
| **Historial de precio** | **No** | **No** | Plusvalía zona | **No** | **No** | **No** |
| **Uso de suelo/catastral** | **No** | **No** | **SÍ (/explorar)** | **No** | **No** | **No** |
| Reputación vendedor | — | Sí (estrellas) | — | Insignia | Particular vs inmob. | — |
| Ads intercalados | Sí | Sí (+carrito) | Bajo | Coronas premium | Sí | **No** |
| Teléfono tras muro | Registro | Ver teléfono+login | Registro probable | Directo | Directo | **Directo** |

---

## (c) Top 15 debilidades estructurales de UI/UX (portales MX)
1. **Sin AVM/valuación junto al anuncio (5 de 6).** Solo Propiedades.com; I24 lo esconde como herramienta de vendedor.
2. **Cero historial de precios del anuncio (6 de 6).** Se negocia a ciegas.
3. **Filtros pobres y sin NLP real.** Solo Lamudi tiene NLP y está enterrado; el resto keyword-match.
4. **Filtros que no filtran (motor QuintoAndar).** Remates en "ventas normales", oficinas en "departamentos".
5. **Sin filtros de inversión/patrimonio:** uso de suelo, plusvalía, $/m² como faceta.
6. **No hay map-first ni draw-polygon.** I24/ML/Vivanuncios tienen mapa secundario sin polígono; Lamudi web y Casas y Terrenos sin mapa split.
7. **Muros de registro para contactar (lead-gate).** Convierte un click en un formulario.
8. **Mercado Libre fuerza metáfora de e-commerce sobre patrimonio** (carrito, "Enviar a tu CP", "productos", transacción fuera).
9. **Ranking dominado por pago, no por relevancia** (coronas Lamudi, "Más relevantes" ML, destacados I24).
10. **Performance móvil deficiente** (timeouts SSR Propiedades, cascarón JS Lamudi, crash Filtros ML, bugs I24/Vivanuncios).
11. **Sin micro-interacciones/estado de carga cuidado.** UI estática/lenta o inestable.
12. **Anuncios stale/fantasma sin marca de estado.** "Después de pagar aparece no disponible", sin fecha visible.
13. **Teléfonos desactualizados y no-response sistémico.** El propio Help de I24 tiene artículo de "¿y si no responde?".
14. **Fraude y fotos duplicadas** (dark pattern de fondo: no verificar). Propiedades.com admite 3,143 reportes de fraude en 2024.
15. **Ruido visual/interstitials y CTA de comprador subordinado al de vendedor.** Homes sirven dos amos; Vivanuncios mezcla autos/empleos; Lamudi muros SEO.

---

## Síntesis del hueco explotable (UI/UX puro)
El estándar MX es un **catálogo de listados sin inteligencia** — sin valuación/historial junto al anuncio, filtros que no filtran ni entienden lenguaje natural, sin map-first con dibujo de zona, con la conversión rota por muros de registro, leads fantasma y teléfonos muertos, y performance móvil frágil. **Propiedades.com (Habi)** es el único con foso de datos real (AVM + catastro + plusvalía) pero lo desperdicia en una experiencia lenta y fragmentada. **Casas y Terrenos** demuestra chrome limpio + WhatsApp directo, pero sin mapa, sin app de comprador y sin datos. **El "monopolio de UX" está vacante:** un buscador rápido, map-first con draw-zone, NLP real, y valuación+plusvalía+historial embebidos en cada ficha, con anuncios verificados y contacto sin muro — nadie en México lo ofrece hoy junto.
