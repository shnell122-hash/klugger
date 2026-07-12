# §3 — Teardown UI/UX + user journey de los mejores portales inmobiliarios del MUNDO

> Método: WebFetch en vivo + WebSearch de teardowns/case studies. Fiabilidad: Zillow, Idealista, Realtor.com y StreetEasy bloquean scraping (403/PerimeterX/Cloudflare) — reconstruidos desde docs oficiales, help-centers, DOM tutorials y críticas UX (Pratt IXD, Medium, Built for Mars). Rightmove, Compass y Redfin (vía reader-proxy) se leyeron en vivo.

---

## A) Teardown por portal

### 1. Zillow (zillow.com)
1. **Navbar (desktop):** **logo/wordmark CENTRADO** (atípico). Izq: Buy · Rent · Sell · Home Loans · Find an Agent; der: Manage Rentals · Advertise · Help · Sign In. Sin botón CTA de color — el CTA real es la barra de búsqueda. Cada ítem abre **mega-menú al hover**. Header sticky: transparente sobre el hero, blanco sólido al scrollear.
2. **Móvil:** web = hamburguesa. App = **bottom tab-bar ~5 tabs**: Search/Discover · Saved · Home Loans · Inbox · Account. En la pantalla de mapa **oculta la tab-bar**. Crítica: 4 controles apiñados arriba del mapa.
3. **Homepage:** hero fotográfico full-bleed + **una barra de búsqueda gigante centrada**. Placeholder "Enter an address, neighborhood, city, or ZIP code". Tabs Buy·Rent·Sell. Debajo feed "Homes for you".
4. **Búsqueda→resultados:** **split — mapa IZQ, lista DER**. El **mapa ES el query** (pan/zoom re-ejecuta). Botón **Draw** (polígono). Filtros: **Listing Type · Price · Beds & Baths · Home Type · More**. Save Search arriba-der. Sort: Homes for You, Price H↔L, Newest…
5. **Ficha (redesign Oct-2023):** galería → **Price + key facts grandes** → "What's Special" → Facts & features → **Zestimate** + historial → Monthly Cost → Price & tax history → Neighborhood → similares. CTA **"Contact Agent"** en tarjeta persistente arriba-der (lightbox); secundario "Request a tour", luego Save/Share. Móvil: **barra sticky inferior**.
6. **Micro-interacciones:** carrusel de foto en la card al hover + **hover en card resalta el pin del mapa** (su firma); heart con pulse + modal de sign-in si anónimo; pines cluster/de-cluster; skeleton loaders.
7. **User journey:** (1) hero→una acción; (2) tipear ciudad/ZIP; (3) split map+list; (4) filtros budget-first (criterios profundos en "More"); (5) Draw opcional (poco descubrible); (6) pan/zoom (fricción: pan accidental re-ejecuta); (7) hover card/pin; (8) ficha top-down; (9) **Save → muro de sign-in**; (10) Contact/Tour lightbox — "demasiado compromiso", el lead va a Premier Agent (no el listing agent), sorprende.

### 2. Redfin (redfin.com) — leído en vivo
1. **Navbar:** logo izq + Buy▾ · Rent▾ · Sell▾ · Mortgage▾ · Real Estate Agents▾ · **Feed** … Sign in · **Open app** · Join. Feed = link plano (superficie logged-in). Sin botón de color.
2. **Móvil:** app = **bottom tab-bar**: Search(map) · Favorites · Feed · Tours · Account. En ficha, **Schedule Tour pineado abajo**.
3. **Homepage:** hero "Redfin Early Access. Find it first." con búsqueda por tabs. Above-the-fold: **"Popular homes in [tu ciudad]"** con 5 cards en vivo.
4. **Búsqueda→resultados:** split mapa IZQ/lista DER. Filtros: For sale▾ · Price▾ · Beds/baths▾ · Home type▾ · Filters. **Save search** ("aviso en <5 min de un match nuevo"). Sort default **Recommended**. **Draw + multi-área hasta 5 zonas.** **Mapa Google-backed y rápido** (385% más rápido con 500 pines). Cards con **NEW 1 HR AGO**, HOT HOME, OPEN.
5. **Ficha:** galería → price+badge → dirección+mini-mapa → panel **"Go Tour This Home"** → About → **Redfin Estimate** → comps → sale & tax history → details → schools → **Walk/Transit/Bike scores** → **Climate risk** → similares. Botones: **Schedule tour** (primario), **Book it now** (instantáneo con rayo), Ask a question, Start an offer; utilitarios Favorite · Share · **X-Out** (descartar). Panel der sticky.
6. **Micro-interacciones:** card↔pin al hover; lightbox; pan/zoom con momentum; live match-counts; micro-copy "NEW 1 HR AGO"; dark mode.
7. **User journey:** (1) hero personalizado; (2) tab Buy; (3) split rápido card↔pin; (4) filtros + Draw + 5 áreas + live counts; (5) Save→alertas <5 min; (6) ficha data-rich pero scroll larguísimo; (7) Favorite/X-Out/Share; (8) panel "Go Tour" (Book it now rayo o Schedule); (9) **Feed 100% login-gated**.

### 3. Rightmove (rightmove.co.uk) — leído en vivo
1. **Navbar:** logo verde izq + Buy · Rent · House Prices · Mortgages · Find Agent · Commercial · Inspire · Overseas. Der: **"Sign in"** texto plano (sin CTA de color). Nav lean.
2. **Móvil:** web = hamburguesa. App = **bottom tab-bar 3 tabs**: Home · Saved · Profile. Regresión reciente: en mapa movieron las cards a una tira horizontal inferior ("not user friendly").
3. **Homepage:** hero "believe in finding it" + widget con **3 tabs Buy·Rent·Sold**. Un campo de ubicación con autocomplete. CTA verde literal **"Search"**.
4. **Búsqueda→resultados:** **list-centric** con toggle "Map". Filtros exacto: **Radius · Min Price · Max Price · Min Beds · Max Beds · Property Type · Filters**. Sort: Price/Newest. **Save Search + Create Alert**. Conteo prominente. **Draw-a-Search** con tooltips que narran el dibujo. Cards con carrusel "1/14", iconos floorplan/tour, Call (número visible) · Email · Save.
5. **Ficha (de-tabbed):** **galería PRIMERO** (antes que precio: "las fotos venden") → Price & Address → **Key Information** (chips) → Description (Read More) → Floorplan → EPC → **Map & Street View** → **Nearest stations & Schools** → historial de ventas → similares → Notes. Panel de agente sticky der. Firma: **modo lado-a-lado full-screen** (fotos + floorplan/Street View).
6. **Micro-interacciones:** carrusel con contador; tooltips que siguen el cursor en Draw; heart consistente; lightbox split; panel del agente sticky.
7. **User journey:** (1) hero un box un botón verde (fricción: novatos buscan botón); (2) ubicación station-aware; (3) lista + 7 filtros; (4) refinar + Map + Draw-a-Search (best-in-class); (5) Save/Alert → muro sign-in; (6) ficha galería-first (fricción: EPC tras "Read More"); (7) Save→Saved; (8) contactar Email/Call — **journey termina en "enquiry sent"**, no en visita (lead-gen).

### 4. Idealista (idealista.com)
1. **Navbar:** logo verde izq, sticky. Operaciones: **Comprar · Alquilar · Compartir (flat-share) · Obra nueva · Vacacional**. Der: **Publicar anuncio gratis** (único botón filled) · Hipotecas · Favoritos · Iniciar sesión. Denso, verde como único acento.
2. **Móvil:** app = **bottom tab-bar**: Buscar · Favoritos · Mensajes · Cuenta. 2025 añadió **listas colaborativas** en Favoritos. Filtros = bottom-sheet full-screen.
3. **Homepage:** módulo de búsqueda grande (hero pequeño). Toggle Comprar·Alquilar·Compartir + ubicación (**múltiples zonas no adyacentes**, 2026). CTA "Buscar".
4. **Búsqueda→resultados:** list-dominant con mapa vía toggle. Filtros: **Precio · Habitaciones · Tipo · Metros · Más filtros** (obra nueva/reformar, ascensor, garaje, **solo de particulares**, con foto/vídeo/tour 360º). **Guardar búsqueda** → alertas. Sort: Relevancia/Precio/Recientes. **"Dibujar tu zona"** (polígono guardable) = firma. Cards con **precio bold + ▲/▼ de cambio**, heart + descartar.
5. **Ficha:** galería (fotos + vídeos + **tour 360º** + plano) → **Precio (€/m² + histórico)** → título/ubicación → Características básicas (grid) → Descripción → equipamiento → Mapa (pin aproximado) → **Certificado energético (A–G)** → similares. CTA **"Contactar/Enviar mensaje"** + "Ver teléfono" + Favorito + Descartar. Sidebar sticky; barra inferior en móvil.
6. **Micro-interacciones:** hover shadow/lift; lightbox; visor 360º; pines con precio (mapa "plano"); dibujo con re-query en vivo; toast tras "Guardar búsqueda".
7. **User journey:** (1) tab Buscar; (2) operación (fricción: "Compartir" ambiguo); (3) ubicación multi-zona; (4) filtros (inputs de precio sin slider, dated); (5) mapa + "Dibujar tu zona" + Guardar → alertas; (6) ordenar + cards (queja: fotos variables); (7) ficha con contacto sticky (fricción: pin aproximado); (8) heart → lista colaborativa; (9) Contactar/Ver teléfono + chat Mensajes.

### 5. Compass (compass.com) — leído en vivo
1. **Navbar:** wordmark izq, mucho aire. Buy · Rent · Sell · **Compass Exclusives** · New Development · Agents. Exclusives → Private Exclusives · Coming Soon · Compass Listings (inventario off-market en el nav = diferenciador). Auth minimizada. Header transparente→sólido. Minimalista editorial ("casa de moda, no marketplace").
2. **Móvil:** web = hamburguesa. App = **bottom tab-bar**: Search/Browse · **Collections** · Workshop · Agent/Messages. Inbox del agente difícil de hallar.
3. **Homepage:** hero full-bleed aspiracional + barra de búsqueda centrada flotando. Headline "Find your place". Placeholder "City, Neighborhood, Address, School, ZIP, Agent, MLS #".
4. **Búsqueda→resultados:** filtros ultra-colapsados: **[Price▾] [Filters▾] … [Save Search] [Sort by Recommended▾]**. Sort default **Recommended** (curación). Split map+grid. Cards con badges "Coming Soon"/"Listed by Compass". **Collections** = "el Pinterest del real estate" (boards colaborativos comprador+agente, updates en vivo) = hook de retención.
5. **Ficha:** galería grande → price+key facts+badge → descripción editorial → details → mapa/barrio → similares. **Tarjeta del agente sticky der** con "Contact agent"/"Request a tour" primario; Save (heart→Collection) y Share secundarios. **Jerarquía eleva contactar al agente por encima de guardar.**
6. **Micro-interacciones:** motion "soft, fluid" ("nada rebota, todo se desliza"); hover con imagen+elevación; BulkActionBar (agentes) con toast + undo; fade-in on scroll.
7. **User journey:** (1) hero calmante (fricción: no comunica el diferenciador off-market); (2) buscar (sin botón "Search" de color); (3) resultados editoriales + badge "Coming Soon"; (4) refinar + Save Search; (5) ficha photo-forward + agent card sticky (empuje fuerte a contactar); (6) Save→**Collection** colaborativa (diferenciador real); (7) Contact agent → hilo de mensajes (inbox difícil de hallar).

### 6. Realtor.com
1. **Navbar:** "R" + Buy · Rent · Sell · Mortgage · **My Home** · Find an Agent · News & Insights. Mega-menús. Der: Sign In/Join + heart. Financiación prominente.
2. **Móvil:** app = bottom tab-bar con tab "More". Web = hamburguesa; filter chips thumb-reachable.
3. **Homepage:** hero con un campo grande; empuje a **búsqueda conversacional/IA** ("find homes the way they actually talk and type").
4. **Búsqueda→resultados:** **split map/list** con **"Draw on Map"** de primera clase. **Capas: POI, nivel de ruido, riesgo de inundación.** Filtros: Price · Beds & Baths · Home Type · More (+ commute time + **búsqueda por nombre de escuela**). Save Search → alertas. Paginación con "Next".
5. **Ficha:** galería (**fotos por habitación**, 3D tours) → price+key facts → fila de acción → descripción → details + tax history → **mapa interactivo con capas** → "Brokered by" (deliberadamente abajo) → similares. Primario **Contact Agent** + Ask a Question + Schedule a Tour. CTA sticky.
6. **Micro-interacciones:** heart + lista de saved-homes **colaborativa** (link + comentarios); fotos-por-habitación + 3D drag; capas de mapa que repintan.
7. **User journey:** (1) búsqueda conversacional; (2) split map+list (fricción: cards con sqft/lot en blanco); (3) filtros + commute + schools; (4) Draw + capas ruido/inundación (fricción: descubribilidad); (5) Save homes + Save Search; (6) ficha 3D + fotos por cuarto; (7) Contact/Schedule vía CTA sticky (el lead va al concierge pagado); (8) colaborar cuenta linkeada.

### 7. StreetEasy (streeteasy.com, NYC) — la mejor documentada
1. **Navbar:** wordmark izq + Buy · Rent · Sell · **Buildings** · Agents · Advertise (Buildings = búsqueda a nivel edificio). **Quick-search box persistente arriba-der en TODA página** (firma).
2. **Móvil:** app como **un único filtro dominante**; en mapa, listados en **bottom-sheet swipeable**; onboarding con progress bar; back/cancel consistente arriba-izq.
3. **Homepage:** campo de búsqueda central grande; tipear **barrio, edificio o dirección** ("singular filter philosophy").
4. **Búsqueda→resultados:** toggle List↔Map; **pines muestran el precio directo** y clusterizan/separan al zoom. Filtro "singular": Location → Price → Size (Studio·1·2·3·4+) con **constraint criticado: no rango de recámaras >3 de 5 opciones**. Filtros de renta: **No Fee, By Owner, requisitos de edificio, move-in date, cercanía a subte, keywords, Amenities**. **Custom Boundary** (dibujar). **Conteo en vivo dentro del botón de búsqueda** (flip a "NO RESULTS", criticado). Cards con fecha de open-house sobre la foto.
5. **Ficha:** carrusel "1 of 11" → key facts → **fila de acción: Request a Tour · Ask a Question · Share · Save** (web "SEND MESSAGE" vs app "CONTACT AGENT" = inconsistencia) → **SAVE→SAVED con estrella amarilla** + "ADD NOTE" (disclosure progresivo) → descripción → mapa/edificio → similares.
6. **Micro-interacciones:** **conteo de resultados en vivo en el botón** (la estrella); pines con precio + cluster; bottom-sheet swipe-up (criticado por "false affordance"); Save→estrella amarilla + ADD NOTE.
7. **User journey:** (1) tab Rent + tipear barrio/edificio/dirección; (2) list+map con **precio en el pin** (fricción: tap-vs-swipe); (3) filtro único: Price → size → No Fee, subte, Amenities (killer NYC; fricción: constraint "3 de 5"); (4) leer conteo en vivo; (5) Save Search; (6) ficha "1 of 11"; (7) Save→estrella + ADD NOTE; (8) Request a Tour/"SEND MESSAGE" (fricción: mismatch de labels).

---

## B) Tablas comparativas

### B.1 — Navbar global (ítems × portal, orden real izq→der)
| Portal | Ítems primarios | Der / auth | Logo | CTA color |
|---|---|---|---|---|
| Zillow | Buy · Rent · Sell · Home Loans · Find an Agent | Manage Rentals · Advertise · Help · Sign In | **Centrado** | No (search = CTA) |
| Redfin | Buy · Rent · Sell · Mortgage · Real Estate Agents · **Feed** | Sign in · Open app · Join | Izq | No |
| Rightmove | Buy · Rent · House Prices · Mortgages · Find Agent · Commercial · Inspire · Overseas | Sign in (texto) | Izq | No |
| Idealista | Comprar · Alquilar · Compartir · Obra nueva · Vacacional | **Publicar anuncio gratis** · Hipotecas · Favoritos · Iniciar sesión | Izq | **Sí** |
| Compass | Buy · Rent · Sell · Compass Exclusives · New Development · Agents | Auth minimizada | Izq (wordmark) | No |
| Realtor.com | Buy · Rent · Sell · Mortgage · My Home · Find an Agent · News & Insights | Sign In/Join | Izq | No |
| StreetEasy | Buy · Rent · Sell · Buildings · Agents · Advertise | Sign In + quick-search persistente | Izq | No |

**Constantes:** Buy·Rent·Sell en ese orden; financiación es ítem de primera clase en 5 de 7; "Find an Agent"/Agents en los 7; casi ninguno usa botón CTA de color (excepción Idealista) — **la barra de búsqueda ES el CTA**.

### B.2 — Orden de secciones de la ficha
| # | Zillow | Redfin | Rightmove | Idealista | Compass | Realtor | StreetEasy |
|---|---|---|---|---|---|---|---|
| 1 | Galería | Galería | **Galería** | Galería(+360º) | Galería | Galería(por cuarto+3D) | Carrusel "1 of N" |
| 2 | Price+key facts | Price+badge | Price & address | **Precio (€/m²)** | Price+key facts | Price+key facts | Key facts |
| 3 | What's Special | Dir+mini-mapa | Key Info (chips) | Características | Descripción | Fila de acción | **Fila acción** |
| 4 | Facts & features | Panel "Go Tour" | Descripción | Descripción | Amenities | Descripción | Save→note |
| 5 | **Zestimate** | About | Floorplan | Equipamiento | Mapa/barrio | Details + tax | Descripción |
| 6 | Monthly Cost | **Redfin Estimate** | EPC | Mapa | Edificio | **Mapa+capas** | Mapa/edificio |
| 7 | Price & tax hist. | Comps | **Map+Street View** | **Cert. energético** | Similares | Brokered by | Similares |
| 8+ | Neighborhood → similares | schools → **Walk score** → **Climate risk** → similares | Stations & Schools → historial → similares | similares | — | similares | — |

**Patrón universal:** **galería SIEMPRE #1** → precio #2 → acción muy arriba → descripción → AVM/datos → mapa → **similares al final**. Redfin el más data-rich (AVM+comps+tax+schools+walk+climate). Rightmove pone galería antes que precio ("las fotos venden").

### B.3 — Búsqueda: layout, filtros, herramientas
| Portal | Layout | Orden de filtros | Draw | Refresh pan | Save | Sort default |
|---|---|---|---|---|---|---|
| Zillow | Split map-izq/lista | Type·Price·Beds&Baths·HomeType·More | Sí | Sí | Sí | Homes for You |
| Redfin | Split map-izq/lista | ForSale·Price·Beds/baths·HomeType·Filters | Sí (+5 áreas) | Sí | Sí (<5min) | Recommended |
| Rightmove | Lista + toggle Map | Radius·MinP·MaxP·MinBeds·MaxBeds·Type·Filters | Sí | — | Sí + Alert | Newest |
| Idealista | Lista + mapa toggle | Precio·Habitaciones·Tipo·Metros·Más | Sí | — | Sí | Relevancia |
| Compass | Split map+grid | **Price·Filters** (colapsado) | Sí | Sí | Sí | **Recommended** |
| Realtor.com | Split map/list | Price·Beds&Baths·HomeType·More(+commute/school) | Sí | Sí | Sí | — |
| StreetEasy | Toggle List↔Map | Location·Price·Size (+NoFee/subte/amenities) | Sí | Sí | Sí | Newest |

---

## C) Top 15 patrones UX/UI que comparten los mejores
1. **La barra de búsqueda ES el CTA primario del home** — hero full-bleed + un campo gigante centrado con placeholder multi-tipo. 6 de 7 no usan botón de color en el nav.
2. **Split-screen mapa-izq / lista-der** como layout canónico de resultados (Zillow, Redfin, Compass, Realtor). Europeos (Rightmove, Idealista) lista + toggle de mapa.
3. **El mapa ES el filtro:** pan/zoom re-ejecuta a los límites visibles + botón "Search this area". Redfin lo hace bandera de performance.
4. **Draw-a-polygon / "dibujar tu zona"** presente en los 7. Redfin permite hasta 5 áreas.
5. **Pines de mapa con etiqueta de PRECIO + cluster/de-cluster al zoom.**
6. **Acoplamiento card↔pin al hover** (Zillow, Redfin).
7. **Orden de filtros budget-first idéntico:** Precio → Recámaras/baños → Tipo → "More". Compass lo lleva al extremo (Price + Filters).
8. **Galería SIEMPRE como sección #1 de la ficha**; click → lightbox full-screen. Card con carrusel "1 of N" al hover.
9. **CTA de acción sticky/persistente en la ficha:** panel de contacto/tour en rail der fijo + **barra inferior pineada en móvil**.
10. **Jerarquía consistente: Contactar/Tour (primario) > Guardar (heart) > Compartir.** Heart anónimo → **muro de sign-in** (primer wall).
11. **AVM propietario embebido en la ficha** (Zestimate, Redfin Estimate) — mostrado incluso off-market, con historial.
12. **Save Search → alertas push/email** como motor de retención. Redfin "<5 min".
13. **App móvil = bottom tab-bar (NO hamburguesa)** con Search + Saved + Messages/Feed + Account al pulgar. Web móvil sí colapsa a hamburguesa.
14. **Badges de recencia/estado sobre las cards:** "NEW 1 HR AGO"/"HOT HOME" (Redfin), "Coming Soon" (Compass), ▲/▼ (Idealista), open-house (StreetEasy).
15. **Header sticky con búsqueda re-invocable:** transparente→sólido al scroll; en resultados/ficha el campo de ubicación queda pineado.

**Diferenciadores singulares:** Redfin **Book It Now** (slots reservables con rayo) + verbo **X-Out**; Compass **Collections** (boards colaborativos con updates en vivo); StreetEasy **conteo en vivo en el botón** + filtros No Fee/By Owner/subte; Realtor.com **capas de ruido/inundación** + búsqueda conversacional; Rightmove **modo lado-a-lado full-screen**; Idealista **listas colaborativas + multi-zona**.

**Anti-patrón compartido (fricción):** el journey de los lead-gen (Zillow, Rightmove, Realtor, Idealista) **termina en "enquiry sent", no en visita agendada** — el lead se enruta a un agente pagado que puede no ser el listing agent, lo que sorprende y baja la confianza. Redfin y Compass, con red propia, sí cierran el loop hasta agendar/ofertar.
