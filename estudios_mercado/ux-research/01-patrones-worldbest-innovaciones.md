# §1 — Benchmark de innovaciones intra-industria: QUIÉN lo hace MEJOR (real estate + cross-industry)

> Investigación web (jul-2026), patrón por patrón. Cada sección: (i) quién lo hace mejor, (ii) patrón de UX exacto, (iii) evidencia, (iv) qué adoptar / dónde aún es superable. URLs inline. Fuentes comisionadas marcadas como direccionales.

---

## 1. Búsqueda en lenguaje natural + semántica (+ visión sobre fotos)

**(i) Quién lo hace mejor:** Zillow (NL search sept-2024 → AI Mode 25-mar-2026); Perplexity (respuesta conversacional con fuentes); Notion Q&A (entrada + respuestas con citas scoped por permisos).

**(ii) Patrón de UX exacto**
- **Zillow NL (2024):** el usuario escribe en la barra principal: `"$700K homes in Charlotte with a backyard"`, `"homes 30 minute drive from the Minneapolis Institute of Art"`. Parsea commute-time, affordability, escuelas y POIs. ([zillow.com/news](https://www.zillow.com/news/zillows-ai-powered-home-search-gets-smarter-with-new-natural-language-features/))
- **Zillow AI Mode (2026):** caja de chat "Ask Zillow" **fija abajo en la página de resultados**, desktop y mobile, solo texto. Prompts sugeridos accionables: `"Can I afford this apartment if I move in June?"`. Hilvana affordability (BuyAbility), Zestimate, historia de precios y tours. ([Zillow mediaroom](https://zillow.mediaroom.com/2026-03-25-Zillow-debuts-AI-mode,-bringing-guided-intelligence-to-every-step-of-the-housing-journey), [Inman](https://www.inman.com/2026/03/25/zillow-goes-ai-mode-with-new-home-search-assistant/))
- **Perplexity:** chips de cita `[1]` grounded, hover revela snippet; lista "Related" de follow-ups; tabs Answer/Links/Images/Sources; UI de "plan en ejecución" paso a paso. ([UX Design Institute](https://www.uxdesigninstitute.com/blog/perplexity-ai-and-design-process/))
- **Notion Q&A:** tres entradas (sparkle abajo-derecha, `Cmd/Ctrl+Shift+K`, "Ask AI" en Search); respuestas enlazan a páginas fuente con excerpts, solo de páginas visibles al usuario. ([Notion](https://www.notion.com/blog/introducing-q-and-a))

**(iii) Evidencia:** AI Mode en 5% de mercados para may-2026; Zillow = única app inmobiliaria integrada en ChatGPT (6-oct-2025); Notion Q&A llevó a un cliente de "10 min" a "segundos".

**(iv) Adoptar / superable:** chat fijo abajo + chips de cita con hover + follow-ups + shortcut global + mostrar plan/progreso. **Superable:** nadie explica visiblemente POR QUÉ un listing hizo match → chips por resultado ("commute 30 min ✓, planta abierta ✓, cerca de [escuela] ✓"); la **visión sobre fotos está sin lanzar** (buscar "cocina con isla de mármol y luz natural" contra las fotos).

---

## 2. Mapa map-first + dibujar-zona + capas

**(i) Quién lo hace mejor:** Redfin y Rightmove (draw-a-search canónico); Idealista (multi-área no-adyacente, ene-2026); Airbnb (split-view + "search as I move"); Google Maps (capas).

**(ii) Patrón de UX exacto**
- **Redfin draw:** botón "Draw" abajo en el mapa → dibujo freehand, cruza zip codes; el área se guarda como búsqueda → alertas email. ([Redfin](https://www.redfin.com/news/draw-your-own-search-on-the-redfin-iphone-app/))
- **Rightmove Draw-a-Search:** conecta puntos en una forma → "View Properties" o guarda el área con nombre para alertas. "Una de nuestras herramientas más queridas". ([Rightmove FAQ](https://faq.rightmove.co.uk/support/solutions/articles/7000048757-draw-a-search))
- **Idealista multi-área (28-ene-2026):** añadir áreas con un clic, combinar ilimitadas áreas **no-adyacentes** (Madrid + Cáceres + Málaga en una búsqueda), con precios en el mapa; accesible desde 3 lugares. ([idealista](https://www.idealista.com/en/news/property-for-sale-in-spain/2026/01/28/874395-goodbye-to-grey-maps-idealista-launches-multi-area-home-searches))
- **Airbnb split-view:** lista izq, mapa der; pan/zoom actualiza listings ("search as I move the map") con price pins. ([Airbnb Help](https://www.airbnb.com/help/article/252))
- **Google Maps capas:** botón de capas; toggles Transit/Traffic/Satellite/Terrain; tráfico en tiempo real; info en bottom card. ([Google](https://support.google.com/maps/answer/3092439))

**(iii) Evidencia:** Draw-a-Search de Rightmove existe desde 2010 (15+ años de retención); Redfin corre sobre Google Maps Platform; Idealista lanzó multi-área "por peticiones de usuarios".

**(iv) Adoptar / superable:** draw freehand + guardar-área-con-nombre→alertas + **multi-área no-adyacente** (estado del arte) + split-view live + price pins + toggle de capas. **Superable:** nadie combina draw-zone + heatmaps (precio/escuela/transporte) + query NL en un mismo canvas; "search as I move" molesta → toggle explícito "Buscar en esta zona" persistente.

---

## 3. AVM / estimación de valor con confianza explicable

**(i) Quién lo hace mejor:** Redfin Estimate y Zillow Zestimate; Credit Karma (score + factores ponderados, cross-industry); Nubank (transparencia como marca).

**(ii) Patrón de UX exacto**
- **Zestimate:** valor puntual + rango de precio ($531,400; rango $505K–$558K). "Por qué": sqft, ubicación, bed/bath, antigüedad, lote. El usuario envía upgrades para corregir; admite que el estimado se mueve hacia el list price al estar activo. ([Eaton Realty](https://www.eatonrealty.com/blog/selling/how-accurate-zillows-zestimate))
- **Redfin Estimate:** confianza como "within X%, half of the time" (error mediano); pesa "más de 500 data points"; Owner Estimate (elige comparables), edit home facts, gráfico de historia de valor; diario si listado, semanal si off-market; disclaimer "no es un avalúo". ([redfin.com/redfin-estimate](https://www.redfin.com/redfin-estimate))
- **Credit Karma (modelo de explicabilidad a robar):** desglose ponderado de 5 factores — Payment history 40%, Age & type 21%, Utilization 20%, Balances 11%, Recent 5% — con "factor breakdowns" +/−. ([Credit Karma](https://www.creditkarma.com/credit/i/what-affects-your-credit-scores))

**(iii) Evidencia**

| AVM | Error mediano on-market | Error mediano off-market |
|---|---|---|
| Zestimate | ~1.94–2.4% | ~7.06–7.5% |
| Redfin Estimate | ~1.85–2.06% | ~6.45–7.25% |

Estudio SSRS (comisionado por Redfin, 24,789 ventas): 64% de homes dentro de 3% de la predicción Redfin vs 29% Zillow vs 16% Homes.com (direccional). Nubank 90M+ clientes.

**(iv) Adoptar / superable (mayor oportunidad):** valor + rango honesto; framing "within X%, half the time"; home-facts editables + comps del usuario; gráfico de valor; breakdown ponderado +/− (Credit Karma). **Superable:** ningún AVM explica ajustes por-comparable ("+$8k por baño, −$5k por calle transitada"); ninguno muestra distribución de confianza real (solo min/max) → banda que se estrecha según densidad de datos; ninguno **ingiere fotos/condición** → visión-sobre-fotos al AVM.

---

## 4. Verificación / anti-fraude / badges de confianza

**(i) Quién lo hace mejor:** Airbnb (Verified Listing + Guest Favorite); Mercado Libre (reputación LATAM); Zillow (Verified Source/FSBO).

**(ii) Patrón de UX exacto**
- **Airbnb Verified Listing:** anti-fraude + IA + revisión humana confirman que el home es real; badge sobre la ubicación en el mapa (prueba que el pin es real). ([Skift](https://skift.com/2024/03/04/airbnb-closes-in-on-1-5-million-verified-listings-to-build-trust/))
- **Airbnb Guest Favorite:** aparece en 3 posiciones (card, tope del detalle, junto a reviews); laurel/medalla flanqueando el rating; criterio = ranking comparativo diario vivo (4.9+, ≥5 reviews, top en 6 subcategorías); tag "low-quality" al ~10% inferior; **filtrable en búsqueda**. ([TechCrunch](https://techcrunch.com/2024/03/04/airbnb-has-another-label-to-tell-you-about-a-propertys-quality/))
- **Mercado Libre:** reputación = termómetro de color (gris→rojo→…→verde); gris = "datos insuficientes" hasta 10 ventas (cold-start explícito); ventana móvil 3 meses (reclamos ≤2%, despacho ≤48h); medallas MercadoLíder Plata/Oro/Platino con prioridad en ranking. ([global-selling](https://global-selling.mercadolibre.com/learning-center/news/seller-reputation-learn-how-it-works/))
- **Zillow:** "Verified Source" dentro del formulario de contacto (ata confianza a la conversión); FSBO con revisión manual hasta 72h + posible certificado de título. ([Zillow FSBO](https://www.zillow.help/article/where-is-my-for-sale-by-owner-listing-zd4405402125459))

**(iii) Evidencia:** Guest Favorite +52% CTR, 23% conversión vs 9% sin badge; Airbnb ~1.5M listings verificados (~20% de 7.7M) para fin de mar-2024.

**(iv) Adoptar / superable:** dos ejes — "Owner-Validated" (identidad/título) y "Reputación/Calidad"; badge de validación en el pin del mapa + módulo CTA; badge de calidad en card + tope del detalle; faceta de filtro; estado gris cold-start; tag negativo para stale. **Superable:** nadie muestra un "qué se verificó y cómo" expandible (título ✓, geolocalización ✓, ID de dueño ✓, fecha) → panel de verificación itemizado con método + "última re-verificación".

---

## 5. Copiloto del agente / next-best-action

**(i) Quién lo hace mejor:** Compass (Likely-to-Sell + Buyer Demand); Salesforce Einstein NBA; GitHub Copilot (aceptación sin fricción); Superhuman (triage).

**(ii) Patrón de UX exacto**
- **Compass Likely-to-Sell:** ML puntúa cada contacto del CRM por probabilidad de vender en 12 meses y surface solo el **decil superior** (foco, no dashboard). **Buyer Demand:** en la cita de listing el agente ve "# de compradores serios en la red buscando homes como este", por precio y tipo, desde millones de saved searches. Ambos dentro del CRM. ([Buyer Demand PR](https://www.compass.com/newsroom/press-releases/5YGnjMpU2IQgVamYYSuPvg/))
- **Salesforce Einstein NBA:** card nativa en el record page; motor de estrategia en tiempo real; top N recomendaciones con Accept/Reject; aceptar dispara un Flow (crea tarea, manda email). ([Salesforce Admins](https://admin.salesforce.com/blog/2019/use-einstein-next-best-action-with-flow))
- **GitHub Copilot:** ghost text atenuado en el cursor; Tab acepta, seguir tecleando rechaza; cero modal. ([VS Code](https://code.visualstudio.com/docs/editing/ai-powered-suggestions))
- **Superhuman Split Inbox:** secciones fijas (Important/Other/VIP) auto-pobladas por IA; splits custom desde prompts NL. ([Split Inbox](https://blog.superhuman.com/how-to-split-your-inbox-in-superhuman/))

**(iii) Evidencia:** Copilot 55% más rápido, 88% más productivo, 73% en flow. Compass publica poca data dura (documenta lógica).

**(iv) Adoptar / superable:** estrechamiento radical (lista diminuta rankeada); card Accept/Reject que dispara la acción; entrega in-surface no-modal; prioridades por prompt NL. **Superable:** nadie cierra quién → por qué (con evidencia) → acción redactada → enviado → outcome-tracked en una sola card.

---

## 6. Compartir información cifrada y segura / data rooms

**(i) Quién lo hace mejor:** 1Password (Psst — item sharing); DocSend (Dropbox) — Data Rooms.

**(ii) Patrón de UX exacto**
- **1Password Psst:** del ítem → Share → "Get a link". Dos controles: **Expiration** (default 7d; opciones hasta "tras una sola vista") y **Availability** (cualquiera con el link vs emails específicos). El receptor ingresa email → código de un solo uso; sin cuenta 1Password; ve un snapshot congelado (inmutabilidad deliberada); Activity Log con receptor, vistas, IP, expiración. ([support](https://support.1password.com/share-items/))
- **DocSend Data Room:** permisos por link/rol hasta documento/carpeta; toggles descargas, watermark dinámico, NDA-al-entrar, password, expiración; links sin login, actualizables/revocables sin romper la URL; Audit Log por User/Activity/Date exportable, tracking página-por-página, notificación en tiempo real; AES-256 + TLS, SOC 2 Type II. ([DocSend VDR](https://www.docsend.com/features/virtual-data-room/))

**(iii) Evidencia:** DocSend SOC 2 Type II + revocación remota = estándar board/legal/inversores; Psst lanzó con amplia prensa. Ninguno publica cifras de adopción.

**(iv) Adoptar / superable:** diálogo de dos sliders (Expiration + Audience) para compartir un paquete de propiedad; "expire tras una vista" + email + código sin cuenta; permisos granulares por carpeta + watermark/NDA/password; audit log filtrable/exportable de primera clase; revoke remoto + link válido mientras el contenido se actualiza; snapshot inmutable para docs legales. **Superable:** el audit trail está construido para el emisor, no da al receptor un recibo de confianza → **audit trail compartido, a prueba de manipulación, de doble cara** (ambas partes ven la misma línea de tiempo firmada) — convierte el log en evidencia.

---

## 7. Shortlisting colaborativo

**(i) Quién lo hace mejor:** Zillow (Homes to Compare + Messaging co-shoppers 2025); Airbnb (Wishlists con voto); Figma/Notion (multiplayer); Arc.

**(ii) Patrón de UX exacto**
- **Zillow co-shopping:** Inbox → invita a pareja/roommate; cada conversación de listing en un hilo; ambos ven saved homes y tags del otro (lista compartida). **Homes to Compare:** selecciona hasta 5 → "+ Compare" → chart side-by-side con notas editables → share. ([Homes to Compare](https://www.zillow.com/learn/home-comparison-tool-zillow-app/))
- **Airbnb Wishlists:** invita por cuenta o email; colaboradores votan up/down, añaden notas, cambian fechas/huéspedes. ([Airbnb](https://www.airbnb.com/help/article/1236))
- **Figma/Notion:** cursor nombrado por color; clic en avatar salta a dónde está; comentarios @-mention; edición en tiempo real sin locking. ([Figma](https://www.figma.com/blog/multiplayer-editing-in-figma/))

**(iii) Evidencia:** 60%+ de compradores co-compran (Zillow); Wishlists 20M+ usuarios antes del voto.

**(iv) Adoptar / superable:** shortlist compartida única + voto + compare con notas + share de un toque + presencia live. **Superable:** el invite es indescubrible (~9% de usuarios de wishlist sabían que podían compartir) → "Invita a tu co-comprador" como CTA de primera clase siempre visible + modo "Decidir" que tabula votos y surface el #1 con razones.

---

## 8. Saved searches + alertas inteligentes

**(i) Quién lo hace mejor:** Redfin (real-time más rápido); Rightmove (mejor redesign documentado); Zillow (notification center); CamelCamelCamel/Keepa (price-tracker cross-industry).

**(ii) Patrón de UX exacto**
- **Zillow:** guardar → cada fila Edit → Instant/Daily/Off; consolidado en notification center. ([Zillow](https://zillow.zendesk.com/hc/en-us/articles/16115195331091-Email-types-consumers-can-receive))
- **Rightmove:** frecuencia Instant/Daily/cada 3d/cada 7d; un botón Save con toggles; setup de alerta en pantalla propia reusable; filtros como tags; permiso push por dispositivo; tap en push → resultados + "apagar alertas" inline. ([Case study](https://www.elisaseijas.com/portfolio/saved-searches-and-push-notifications))
- **Redfin:** email 15–30 min tras publicar; marcar un home dispara Instant Updates (precio, under-contract, sold, back-on-market). ([Redfin](https://www.redfin.com/news/redfin-notifies-customers-about-new-listings-faster/))
- **Camel/Keepa:** en el chart de precio, "Set Price Alert" → target + email (threshold-based). ([Camel](https://camelcamelcamel.com/))

**(iii) Evidencia:** Redfin alertó ~3 h más rápido que Zillow, 94% de notificaciones más rápidas; A/B de push de Rightmove con CTR materialmente mayor que email.

**(iv) Adoptar / superable:** frecuencia por búsqueda; push por dispositivo; alertas a nivel de evento sobre un home marcado; alerta por umbral. **Superable:** casi nadie hace **price-drop-hasta-mi-presupuesto** atado a affordability → "avísame cuando un home cruce a mi BuyAbility"; igualar latencia <30 min de Redfin y batirla con push.

---

## 9. Tours 3D / floor plans interactivos

**(i) Quién lo hace mejor:** Matterport (Dollhouse); Zillow 3D Home + Interactive Floor Plan (mejor distribución).

**(ii) Patrón de UX exacto**
- **Matterport:** 3D walkthrough (click-to-move), Dollhouse (ver cómo conectan los cuartos), Floor Plan cenital, Measurement Mode; transiciones suaves entre cuartos = diferenciador. ([Viewing modes](https://support.matterport.com/s/article/Matterport-Viewing-Modes-3D-Dollhouse-360-and-Video))
- **Zillow Interactive Floor Plan:** el plano 2D es clicable — tocar un cuarto salta a ese punto del tour 3D; el plano como índice espacial, inline en el detalle. ([Virtuance](https://www.virtuance.com/blog/power-of-zillow-3d-home-tours-interactive-floor-plans/))

**(iii) Evidencia (fuerte):** tour 3D +43% views/+55% saves; Interactive Floor Plan **+60% views/+79% saves/+72% shares**; 50% prefiere tours a solo fotos; Matterport FY2024 14.1M espacios (+21%), 1.2M suscriptores.

**(iv) Adoptar / superable:** plano 2D clicable como nav primaria; tour inline; tours como filtro de calificación de leads. **Superable:** el Dollhouse es llamado "gimmick, más lento que clicar cuartos en un plano 2D" → navegación **floor-plan-first** con saltos instantáneos + dimensiones/medición; reservar el 3D inmersivo para cuando se pida.

---

## 10. Onboarding + affordability en vivo

**(i) Quién lo hace mejor:** Zillow BuyAbility; Nubank & Revolut (onboarding progresivo).

**(ii) Patrón de UX exacto**
- **Zillow BuyAbility:** ingresa ingreso, credit score, deudas, enganche, pago cómodo → en segundos precio BuyAbility + máximo sugerido por el pago mensual; guarda inputs y se actualiza en tiempo real con tasas y score; al navegar, **los homes se etiquetan cuando caen dentro de tu BuyAbility**. ([PR Newswire](https://www.prnewswire.com/news-releases/zillows-real-time-affordability-tool-helps-shoppers-quickly-find-homes-within-their-budget-302309760.html))
- **Nubank/Revolut:** KYC en micro-pasos, una tarea por pantalla, progress bar; input progresivo; personalización por objetivo; momento de recompensa (oferta pre-aprobada tras el paso pesado). ([Craft Innovations](https://craftinnovations.global/banking-onboarding-best-practices-revolut-nubank-monzo/))

**(iii) Evidencia:** ~80% de compradores prioriza encontrar home dentro de su presupuesto; swing de $40K por 1% de tasa (BuyAbility lo hace visible).

**(iv) Adoptar / superable:** presupuesto vivo que etiqueta homes affordable en el feed + micro-pasos/progress bar/personalización/reward moment. **Superable:** BuyAbility es un formulario que devuelve un número → **slider vivo** (arrastrar pago → resultados y tags "dentro de presupuesto" en el mapa se actualizan al instante), cableado a la alerta de cruce de presupuesto; onboarding que muestra un home affordable en ~30s como momento de recompensa.

---

## Tabla resumen — Innovación × mejor referencia × patrón clave × evidencia

| # | Innovación | Mejor referencia (RE / cross) | Patrón clave | Evidencia | Frontera superable |
|---|---|---|---|---|---|
| 1 | NL + semántica + visión | Zillow AI Mode / Perplexity, Notion | Chat fijo abajo; chips de cita + follow-ups; mostrar plan | AI Mode 5% mercados; única app en ChatGPT | Chips "por qué hizo match"; visión sobre fotos sin lanzar |
| 2 | Map-first + draw + capas | Idealista / Redfin / Rightmove / Airbnb / Google | Multi-área no-adyacente; draw→alerta; split live; capas | Draw Rightmove desde 2010 | Draw + heatmaps + NL en un canvas |
| 3 | AVM con confianza | Redfin / Zillow / Credit Karma | Rango honesto; comps editables; factor-weighting % | Redfin 64% vs 29% dentro de 3% | Ajustes por-comp; banda por densidad; AVM que ve fotos |
| 4 | Verificación / badges | Airbnb / Mercado Libre / Zillow | Dos ejes; badge en pin+CTA; faceta de filtro; cold-start gris | Guest Favorite +52% CTR | Recibo itemizado "qué se verificó y cuándo" |
| 5 | Copiloto / NBA | Compass / Einstein / Copilot / Superhuman | Lista diminuta; Accept/Reject que dispara acción; no-modal | Copilot 55% más rápido | Loop quién→por qué→acción→enviado→outcome |
| 6 | Cifrado / data rooms | 1Password / DocSend | Dos sliders; permisos por carpeta; audit exportable | DocSend SOC 2 Type II | Audit de doble cara, criptográfico |
| 7 | Shortlist colaborativo | Zillow / Airbnb / Figma-Notion | Shortlist única + voto + compare; presencia live | 60%+ co-compran | Invite como CTA visible; modo "Decidir" |
| 8 | Saved searches + alertas | Redfin / Rightmove / Camel-Keepa | Instant/Daily/Off; push por dispositivo; umbral | Redfin ~3h más rápido | Alerta "cruzó a mi presupuesto"; <30 min |
| 9 | Tours 3D / floor plans | Matterport / Zillow 3D | Plano 2D clicable como nav; tour inline | +60%/+79% (floor plan) | Floor-plan-first; dimensiones/medición |
| 10 | Onboarding + affordability | Zillow BuyAbility / Nubank, Revolut | Presupuesto vivo que etiqueta homes; micro-pasos + reward | 80% prioriza presupuesto | Slider vivo; home affordable en 30s |

---

## Meta-hallazgo (foso de composición)
Cada pieza existe en algún lado, pero **nadie las fusiona ni añade la capa de "explicar".** Las 4 fusiones que ningún incumbente lanzó end-to-end (frontera de Klugger):
1. **Canvas único map-first** = dibujar/multi-zona + heatmap + query NL con chips "por qué hizo match" + AVM con factor-weighting legible + banda de confianza + ajustes por-comp (fusiona #1+#2+#3).
2. **Affordability + alertas + shortlist:** "avísame cuando un home cruce a mi BuyAbility → añádelo a nuestra shortlist compartida para votar" (#7+#8+#10).
3. **Confianza transparente:** recibo itemizado de verificación (#4) + audit trail de doble cara criptográfico (#6).
4. **Copiloto de loop cerrado (#5):** quién → por qué ahora (con evidencia) → acción pre-redactada → enviado → outcome aprendido, en una card.

*Fiabilidad: cifras de Redfin (SSRS) y Guest Favorite son comisionadas/terceros → direccionales. Compass, DocSend, 1Password publican poca data dura de adopción.*
