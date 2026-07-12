# Estudio de Mercado Kluger — Proptech de HBU/HBV con IA en México

## TL;DR
1. **Kluger tiene un océano azul real y defendible en el segmento que todos ignoran: HBU/HBV low-cost + sitios de agentes generados por IA.** Las consultoras globales (CBRE, Colliers, Cushman, 4S) cobran un estudio de mejor uso premium (referencia del fundador: ~$10,000 USD) y tardan semanas; el avalúo tradicional mexicano cuesta $3,000–15,000 MXN y NO entrega "mejor uso". Nadie en México ofrece un estudio de *Highest and Best Use* automatizado a precio de avalúo. Ahí está el foco.
2. **El marketplace/portal es mar rojo profundo: un duopolio casi monopólico (Inmuebles24-QuintoAndar) sobre un cementerio de proptechs quemadas.** No competir de frente. Usar la búsqueda por lenguaje natural y las páginas de agentes como *caballo de Troya* para agregar inventario, no como apuesta central.
3. **Orden de monetización correcto para bootstrap: (1) estudios HBU/HBV como cash-flow inmediato, (2) suscripción de sitios+extensión para agentes —que trae inventario gratis y resuelve el chicken-and-egg del lado de la oferta—, (3) búsqueda/alertas para compradores como capa de demanda, (4) datos para desarrolladores, (5) banca/intermediación como visión a 18+ meses, nunca como foco de fase 1.** No construir iBuyer, no garantizar rentas, no quemar en marketing pagado: eso mató a los predecesores.

---

## Key Findings

- **El mercado hipotecario se contrae, no crece.** En 2024 se originaron ~512,000 créditos hipotecarios (Infonavit+Fovissste+banca) por ~$581,500 millones MXN (BBVA Research, con datos Infonavit/Fovissste/CNBV/SHF). Pero en el primer semestre de 2025 el número total de hipotecas otorgadas cayó 9% y el monto total 4.5% anual; la banca comercial retrocedió 6.8% en número y 10.3% en monto (BBVA "Situación Inmobiliaria", vía La Jornada, 14-oct-2025). El PIB de construcción cerró 2025 con contracción de 1.0%, explicada por una caída de 22.5% en obra civil (BBVA Research, 1S2026). **Implicación estratégica:** la propuesta de "acelerar ventas" vale MÁS en un mercado lento, pero el volumen transaccional total se está reduciendo — Kluger debe capturar valor por operación, no por volumen.
- **Informalidad brutal en el gremio de agentes.** El presidente nacional de AMPI, Alejandro Kuri Pheres, cifró la informalidad en ~80% ("en la informalidad y en las calles puede haber un 80% de personas… sin preparación o una certificación oficial", Expansión/Obras); presidencias estatales de AMPI la elevan a 90%. Es simultáneamente el mayor dolor (fraude, mala data) y la mayor oportunidad (cientos de miles de agentes sin herramientas profesionales, en WordPress con mal SEO).
- **El duopolio de portales es casi monopólico.** QuintoAndar (Brasil) compró Navent en dic-2021 (quedándose con Inmuebles24 y Tokko Broker) y Vivanuncios de Adevinta en sep-2022. Online Marketplaces lo describe como "uno de los pocos portales del mundo con posición casi monopólica en su mercado local". Sus precios para agentes son altos y en alza: AMPI CDMX denunció que en su renovación anual i24 subió paquetes 30-40%, "pasando de cerca de 4 mil pesos a 7 mil pesos por 10 anuncios".
- **Las proptechs fondeadas se estrellaron o pivotearon.** Flat.mx (levantó ~$25M) abandonó el iBuying y se convirtió en Clau (jun-2024); QuintoAndar cerró Benvi "en menos de un año por problemas de confianza en el mercado mexicano"; Homie se contrajo; La Haus (levantó ~$212M) no levanta ronda desde jun-2022; Habi/Tuhabi sigue viva pero contraída, financiándose con deuda ($40M en ronda de deuda convencional el 21-abr-2026; revenue ~$300M a jun-2025). El capital de riesgo se secó: en ene-2025 el VC en México cayó 90.65% anual, a solo $3M en dos operaciones —el peor desempeño en cuatro años (TTR Data). **Lección:** los modelos capital-intensivos murieron; el bootstrap con servicios+SaaS es MÁS defendible hoy, no menos.
- **Zillow ya validó la búsqueda por lenguaje natural.** La lanzó el 4-sep-2024 ("buyers and renters can search… using simple, everyday language") y se integró a ChatGPT el 6-oct-2025, siendo "la única app inmobiliaria integrada directamente en ChatGPT" (solo EE.UU.). Nadie lo ha hecho bien en México. Es replicable, pero es un *feature*, no un moat.
- **Existe un mercado de remates/adjudicados fragmentado y opaco** (HSBC, Bancomext, SHF, Metrofinanciera venden adjudicados; startups como Zöku ya digitalizan remates con descuentos "hasta 40%"). No hay estándar de documentos cifrados interbancario — la visión de banca de Kluger es viable pero lejana.

---

## Details

### A. Tamaño de mercado (TAM/SAM/SOM) — con supuestos y aritmética visible

**Mercado residencial nacional (TAM del ecosistema):**
- Créditos hipotecarios originados 2024: ~512,000; monto ~$581,500M MXN (BBVA Research). Desglose: Infonavit +17.4% en número (mayor colocación desde 2018, crédito promedio ~$717K); banca comercial ~120,000 créditos (−4.2%, crédito promedio nuevo ~$2.37M); Fovissste −1.7% (crédito promedio ~$940K).
- Precio promedio de avalúo SHF, cierre 2025: **$1,863,965**; mediana $1,209,189. Apreciación nacional 2025: 8.7% anual (Índice SHF 4T2025). Tasa hipotecaria promedio Banxico: ~11.55–11.65%.
- Universo transaccional total (incluyendo compraventas de contado sin hipoteca) es mayor que las 512K hipotecas; una regla del sector estima 30-40% de operaciones de contado → universo posible de 700,000–850,000 operaciones/año *(proporción contado vs. crédito = estimación del sector, no cifra oficial).*

**Megalópolis centro (SAM geográfico Fase 1) — apreciación SHF 2025 por entidad (Índice SHF 3T2025):**

| Entidad | Apreciación anual 2025 |
|---|---|
| CDMX | 4.8% |
| Estado de México | 5.2% |
| Querétaro | 7.3% |
| Puebla | 8.6% |
| Morelos | 10.4% |
| **Nacional** | **8.6%** |

Seis entidades (CDMX, Jalisco, NL, Edomex, Querétaro, Guanajuato) concentran 52.3% de los créditos bancarios nuevos — la megalópolis pesa desproporcionadamente en operaciones de alto valor, justo el nicho donde un HBU aporta más margen. *(SHF publica % de apreciación por estado y precio promedio nacional, no precio en pesos por entidad.)*

**Mercado de valuación/consultoría (SAM de servicios — el corazón de Kluger):**
- Avalúo tradicional 2025-2026: piso $3,000–3,500 MXN; casa habitación $3,500–7,500 MXN; departamento $2,000–6,000 MXN; comercial/industrial $8,000–25,000 MXN. Tarifa por millar: 2.5–3.5 pesos por cada mil de valor.
- Estudio HBU de consultora global: referencia del fundador ~$10,000 USD *(CBRE/Colliers/Cushman no publican tarifas — no verificable).*
- **Aritmética:** casi todas las ~512,000 hipotecas requieren avalúo → >500,000 avalúos residenciales de originación/año. A ticket conservador de $4,000 MXN promedio = **>$2,000M MXN/año solo en avalúos residenciales de originación**, sin contar avalúos comerciales, fiscales y notariales. Este es el pool que Kluger ataca con un producto de mayor valor (mejor uso) a precio comparable.

**Agentes inmobiliarios (SAM de SaaS):** AMPI reporta ~80% de informalidad; ~10% afiliados a asociación. Estimados estatales: Edomex ~2,200; SLP 3,000-4,000; sureste de Coahuila ~7,000; Querétaro ~2,000. El universo nacional se cuenta en cientos de miles de personas ejerciendo *(padrón nacional consolidado no publicado por AMPI).* Benchmark de gasto: EasyBroker Independiente $990 MXN/mes; Inmuebles24 desde ~$3,549 MXN/mes.

**Desarrolladores (SAM de estudios de zona):** RUV/SNIIV es el registro oficial de oferta de vivienda nueva; los desarrolladores son personas físicas/morales registradas. Universo de miles, en contracción (los registros de vivienda nueva cayeron en 2023-2025). *(Número exacto de desarrolladores activos no consolidado públicamente.)*

**SOM realista Fase 1 (bootstrap, 0-12 meses):**
- Base ya comprometida: 1,000 propiedades de agentes aliados.
- Agentes de pago: si convierte 30-50 a ~$600-1,000 MXN/mes = **$18,000-50,000 MXN/mes** recurrente.
- Estudios HBU: 10-20/mes × $3,000-8,000 MXN = **$30,000-160,000 MXN/mes**.
- **SOM Fase 1 plausible: $50,000-200,000 MXN/mes (~$3,000-12,000 USD/mes)** — suficiente para sostener el bootstrap sin marketing pagado, y una captura microscópica (<0.01%) del mercado de servicios, lo cual es sano y realista para validación.

### B. Competidores y análisis mar rojo / mar azul

**Duopolio de portales:**

| Portal | Dueño | Modelo/pricing | Debilidad explotable |
|---|---|---|---|
| Inmuebles24 | QuintoAndar (Navent, dic-2021) | Agentes ~$3,549–11,484 MXN/mes; subió 30-40% en renovación (AMPI CDMX) | Costo alto y creciente, leads compartidos entre varios agentes, super-destacados dominan primeras páginas (SEO orgánico "casi quimera" para particulares), duplicados |
| Vivanuncios | QuintoAndar (Adevinta, sep-2022) | Combo con i24 | Misma interfaz que i24; consolidado |
| Propiedades.com | Tuhabi (OKOL, 2022) | Pago por listar; ~1M propiedades | Portal challenger; calidad de data variable |
| Lamudi México | Lifull (2023) | Integrado en Proppit/Trovit/Mitula | Perdió relevancia |
| Mercado Libre Inmuebles | MELI | Integró Metros Cúbicos 2023 | Vertical pequeño dentro del ecommerce |

**CRM/SaaS para agentes:**

| Herramienta | Pricing verificado | Notas |
|---|---|---|
| EasyBroker | Colaborador gratis; Emprendedor $490 MXN/mes (10 anuncios); Independiente $990 MXN/mes; sitio web +$400-500 MXN/mes | CRM+MLS+sitios (9 plantillas); domicilio fiscal extranjero (solo recibos); análisis comparativo incluido |
| Wiggot | Planes no públicos en fuentes accesibles | Wiggot Boost (multi-portal), estimaciones de valor, sitios, IA para anuncios, extensión |
| Tokko Broker | Bundle con i24 (2 / 3-5 / 6-10 usuarios) | CRM de QuintoAndar |
| Redes/franquicias | — | Neximo, iad México (redes digitales); Century21/RE-MAX/Coldwell (tradicionales) |

**iBuyers y post-mortem (lección directa para Kluger):**
- **Habi/Tuhabi:** unicornio ($1B, 2022), levantó >$500M; compró Propiedades.com+Tu Cantón (2022); revenue ~$300M (jun-2025); sigue viva pero financiándose con deuda ($40M abr-2026; $60M BBVA Spark ago-2025). Contraída, no muerta.
- **Flat.mx → Clau:** abandonó iBuying (jun-2024), pivote a plataforma para agentes.
- **La Haus:** ~$212M levantados; sin ronda desde jun-2022.
- **Homie** contraído; **QuintoAndar Benvi** cerrado en <1 año "por problemas de confianza".
- **Conclusión:** los modelos capital-intensivos (iBuyer, garantía de renta) murieron; el VC proptech se secó (−90.65% en ene-2025). El bootstrap con servicios+SaaS es la estrategia correcta para 2026.

**Consultoras/valuación (donde está el mar azul):**
- CBRE, Colliers, Cushman, Newmark, JLL, Knight Frank: HBU premium, sin precios públicos.
- **4S Real Estate:** consultoría 360°, +1,500 proyectos; plataforma **REDI** con datos de +130,000 unidades residenciales verticales (México, Ecuador, Panamá, Guatemala), actualizada cada 3 meses, cotización bajo demanda + IVA; productos como Avalaterra, modelo financiero, estudios de mercado.
- **Tinsa México:** valuación masiva/avalúos, publica guías de tarifas.
- **Softec:** estudios DIME, estándar de estudios de mercado.

**Matriz mar rojo / azul / morado por segmento Kluger:**

| Segmento | Color | Justificación |
|---|---|---|
| Comprador (búsqueda NL + alertas) | 🔴 Rojo | Duopolio + Zillow ya lo hizo; difícil monetizar (es gratis en el mercado) |
| Vendedor/dueño (HBU low-cost) | 🔵 Azul | Nadie ofrece mejor-uso automatizado a precio de avalúo |
| Agente (sitios IA + extensión) | 🟣 Morado | Mercado existe (EasyBroker/Wiggot) pero sin generación por IA/chat ni hiperpersonalización real; diferenciable |
| Desarrollador (estudios de zona/HBU) | 🔵 Azul | 4S/REDI es caro y para grandes; hueco en mid-market accesible |
| Banca (docs cifrados/intermediación) | 🔵 Azul, pero lejano | No existe estándar interbancario; barrera de confianza altísima |

**En qué se equivocan exactamente el duopolio y las consultoras:**
1. **Leads compartidos:** i24 vende el mismo lead a múltiples agentes → baja calidad, incentivos desalineados.
2. **Costo de posicionamiento:** los particulares no consiguen visibilidad orgánica; todo es pago, y los precios suben 30-40% en renovación.
3. **Sin datos de cierre:** los portales muestran precio de lista, no de cierre real → opacidad de valuación (donde el pipeline de Kluger con comps reales gana).
4. **Consultoras: precio y velocidad.** ~$10K USD y semanas excluyen al 99% de dueños y desarrolladores mid-market.
5. **Duplicados y fraude:** ninguna verifica listados con IA de forma sistemática.

### C. Errores y oportunidades específicas

1. **Búsqueda por lenguaje natural:** Zillow la lanzó (4-sep-2024) e integró ChatGPT (6-oct-2025), pero admite que "solo lee el texto del listado, no interpreta fotos". En México NADIE la ofrece con calidad. **Copiar:** búsqueda conversacional + alertas guardadas. **Mejorar:** análisis de imágenes con VLMs (visión) — ahí Kluger diferencia frente a lo que Zillow mismo no hace.
2. **Fraude en listados:** la informalidad (80-90%) alimenta fraudes; AMPI llama públicamente a denunciarlos. Verificación anti-fraude con IA = diferenciador de confianza real y monetizable.
3. **Duplicados/calidad:** endémico en portales; oportunidad de "ingesta limpia" con deduplicación por IA.
4. **Páginas de agentes:** WordPress lento/mal SEO; las alternativas (Wix, EasyBroker sitios +$400-500 MXN/mes, Wiggot sites) son plantillas rígidas. Hueco: generación/edición por chat con IA sobre stack moderno (Next.js) con SEO real y subdominios o dominio propio del agente.
5. **Cold outreach a desarrolladores:** práctica establecida (scrapers+correo); debe cumplir LFPDPPP (aviso de privacidad, derechos ARCO). Riesgo de reputación de dominio si se ejecuta mal.
6. **iBuyer:** murió en México (Flat→Clau, Habi contraída). No replicar.
7. **Banca/adjudicados:** HSBC, Bancomext, SHF, Metrofinanciera venden adjudicados; Zöku es "la primera plataforma digital de México especializada en remates bancarios" (descuentos hasta 40%). No hay estándar de documentos cifrados interbancario. IMOR hipotecario banca ~2.8% (dic-2024/2025), repuntando en 2026 ("mayor nivel en 5 años" al 1T2026 según CNBV). Saldo de cartera hipotecaria banca ~$1.434 billones MXN (mar-2025). *(Monto exacto de adjudicados no verificable públicamente — requiere Portafolio CNBV.)*

### D. Modelo de precios recomendado

**1. Estudios HBU/HBV (producto ancla, cash-flow):**
- **Teaser gratis:** ranking básico + rango de valor (lead magnet).
- **Reporte completo automatizado:** **$2,500–6,000 MXN**, posicionado como "más que un avalúo, a precio de avalúo". Justificación: el avalúo tradicional ($3,000-7,500 MXN) no da mejor-uso; la consultora (~$10K USD) sí, pero es inaccesible. Kluger llena el hueco exacto.
- **Estudio certificado con valuador aliado:** **$8,000–15,000 MXN** (revenue-share con perito certificado SHF, aporta validez legal para trámites).
- **Estudio de zona para desarrollador:** **$15,000–40,000 MXN** por polígono, o suscripción.

**2. Suscripción agentes (trae inventario):**
- Freemium (sube propiedades, ficha básica) → **$600–1,200 MXN/mes** (sitio hiperpersonalizado + extensión Chrome + subdominio). Benchmark: EasyBroker $990 + $400-500 sitio. Kluger debe estar al nivel o por debajo con producto de IA superior.
- Self-host en dominio propio del agente: tier superior **~$1,500-2,500 MXN/mes**.

**3. Sitios hiperpersonalizados — arbitraje de valor:** el benchmark USA (Luxury Presence $300-1,500 USD/mes + setup $3,500-5,000 USD) es 10-50x el poder adquisitivo mexicano. Traer esa calidad a precio mexicano ($600-2,500 MXN/mes) es un arbitraje enorme y el gancho de adquisición de agentes.

**4. Alertas/búsqueda comprador:** **GRATIS** (como Zillow). Monetizar por lead calificado entregado al agente, o por verificación premium anti-fraude puntual (~$99-199 MXN). No cobrar suscripción al comprador en fase temprana.

**5. Desarrolladores:** estudios por zona + suscripción a mapas tipo REDI, compitiendo con 4S por debajo en precio.

**6. Banca:** API/licencia de datos — pricing enterprise, fase 3.

**Orden de monetización para bootstrap:** HBU (cash inmediato) → agentes SaaS (inventario + recurrencia) → comprador (demanda, gratis) → desarrolladores → banca.

### E. Stack tecnológico — evaluación

**Reutilizar del stack actual (todo válido):**
- **Pipeline de valuación geoespacial** (1,418 comps Querétaro, kernels de densidad, scoring multi-lente, auditado IVS/RICS/IAAO) → **es el activo diferencial y el moat real; mantener y profundizar.**
- Python scrapers + proxies residenciales, Google Maps/Places, Mapbox, fal.ai (imágenes/video), TypeScript/React, Hetzner/DigitalOcean.

**Decisiones de stack justificadas:**
- **Búsqueda semántica/NL:** **Postgres + pgvector** primero (ya usan Postgres; evita otra pieza de infra). Migrar a **Typesense o Meilisearch** (más ligeros/baratos que Elasticsearch) solo si la latencia lo exige a escala. Embeddings multilingües en español (multilingual-e5, o embeddings de OpenAI/Cohere).
- **Multi-tenancy con subdominios:** Next.js multi-tenant. En bootstrap, **self-host en Hetzner con wildcard SSL automático (Caddy/Traefik) es 10-20x más barato que Vercel** a escala de cientos de sitios. Usar Vercel solo si el time-to-market inicial lo justifica.
- **Ingesta con visión (VLMs):** usar modelos económicos/batch (Gemini Flash, GPT-4o-mini vision, o Qwen-VL self-hosted). Presupuesto ~$0.001-0.01 USD/imagen; 1,000 propiedades × ~10 fotos = ~$10-100 USD de proceso inicial — trivial.
- **Mensajería:** WhatsApp Business API con pricing per-message de Meta (desde jul-2025). México (base Meta): marketing ~$0.0436, utility ~$0.0080, authentication ~$0.0207 USD/mensaje; los BSP añaden markup. **Clave: mensajes de servicio y utility dentro de la ventana de 24h son GRATIS.** **Recomendación:** usar **Telegram (gratis) como canal primario de alertas en bootstrap** y WhatsApp solo dentro de ventana de servicio para minimizar costo.
- **Email con autoridad:** SPF/DKIM/DMARC + warm-up; herramientas tipo Instantly/Smartlead para cold outreach a desarrolladores. **Riesgo:** reputación de dominio — usar dominios secundarios para cold, dominio principal solo para transaccional.
- **Extensión Chrome:** las políticas de Chrome Web Store prohíben scraping encubierto. Enmarcarla como "importación asistida por el propio agente de SUS listados" (el agente importa su propio inventario). Scraping de terceros: prohibido por términos de servicio de portales; sin precedente penal claro en México pero con riesgo civil y de bloqueo técnico.
- **Arquitectura:** **monolito modular, NO microservicios**, para un equipo de 1-3 devs. Celery+Redis+Postgres está bien; usar Mongo solo si hay datos verdaderamente no estructurados — si no, consolidar en Postgres (JSONB) para reducir superficie operativa.

### F. Roadmap por fases (bootstrap como restricción)

**Fase 0 (en curso) — Validación:**
- Producto mínimo: casos HBU individuales (Cimatario ya hecho) + 1,000 propiedades de agentes aliados ingeridas.
- Validar: (a) ¿pagan los dueños por un HBU de $3-6K MXN?; (b) ¿los agentes suben y mantienen inventario?; (c) precisión del pipeline vs. cierres reales.
- Métricas de éxito: 5-10 estudios HBU vendidos; 1,000 propiedades ingeridas; 20-30 agentes activos; error de valuación <10% vs. comparables.

**Fase 1 (0-6 meses) — Caballo de Troya + cash-flow:**
- **Orden argumentado:** primero **HBU** (cash inmediato, valida el activo diferencial); en paralelo el **generador de sitios para agentes** (resuelve el lado de la OFERTA del marketplace — el chicken-and-egg se rompe dándole al agente una herramienta que quiere, y él trae su inventario gratis). La **búsqueda NL viene después**, porque sin inventario no hay demanda que satisfacer.
- Producto mínimo: reporte HBU en tiers + generador de sitios por chat + extensión de importación + búsqueda NL básica sobre el inventario agregado.
- Canal sin presupuesto: **el caso Cimatario como caso de estudio publicable** (contenido/SEO + LinkedIn), alianzas con AMPI local (Querétaro fue el primer estado con ley inmobiliaria), SEO programático incipiente.
- Ingresos esperados: $50,000-200,000 MXN/mes (SOM Fase 1).
- Riesgos y mitigaciones: portales bloquean scrapers → enfocar en importación asistida del propio agente; agentes no mantienen inventario → sincronización automática vía extensión.

**Fase 2 (6-18 meses) — Efectos de red + SEO programático:**
- Expansión megalópolis (CDMX, Edomex, Puebla, Morelos).
- **SEO programático: páginas por colonia/calle generadas con datos** (benchmark Zillow/Idealista) — palanca de adquisición orgánica gratuita y escalable.
- Verificación anti-fraude con IA como diferenciador de confianza.
- Producto para desarrolladores (mapas + estudios de zona) compitiendo con REDI por debajo.
- Riesgo: que Inmuebles24/EasyBroker copien features de IA → el moat es el pipeline de valuación auditado + los datos de cierre propietarios acumulados, no la UI.

**Fase 3 (18+ meses) — Banca, intermediación, LatAm:**
- Documentos cifrados estandarizados para carteras bancarias/adjudicados; empezar por **adjudicados** (mercado existente, Zöku ya validó demanda) antes que el estándar interbancario.
- Intermediación con agentes desplegados (efecto de red).
- Expansión LatAm.
- Riesgo: barrera de confianza bancaria altísima; probablemente requiere tracción y capital.

### G. Riesgos y realidades

1. **Regulación de intermediación:** ~19 estados tienen ley inmobiliaria (AMPI). **Querétaro fue el primero (ley 2016; reglamento con licencia obligatoria, universo ~2,000 agentes, 12 meses para tramitar licencia).** Se requiere licencia estatal por entidad; Kluger como plataforma tecnológica no es "agente", pero si intermedia debe cuidar el encuadre legal estado por estado (CDMX, Querétaro, Puebla).
2. **LFPDPPP:** el cold outreach requiere aviso de privacidad y respeto a derechos ARCO; riesgo de sanción del INAI.
3. **Scraping:** prohibido por términos de servicio de portales; sin precedente penal claro pero con riesgo civil y de bloqueo técnico. Enfocar en datos propios del agente + fuentes públicas.
4. **Dependencia de datos de terceros:** que los portales bloqueen scrapers es un riesgo existencial si el modelo depende de ellos. Mitigar con inventario propio agregado vía agentes.
5. **Post-mortem 2019-2023:** murieron por capital-intensidad y quema (Flat, Homie, Benvi); el VC se secó desde 2022 (−90.65% en ene-2025). Implica que el bootstrap con servicios es MÁS defendible ahora.
6. **Riesgo de copia por el duopolio:** i24/EasyBroker pueden clonar la búsqueda NL. El moat real es el pipeline HBU/HBV auditado (IVS/RICS/IAAO) + los datos de cierre propietarios.

---

## Recommendations

**Etapa inmediata (0-3 meses):**
1. **Monetizar HBU YA.** Empaquetar el pipeline de Cimatario en 3 tiers ($0 teaser / $2,500-6,000 reporte / $8,000-15,000 certificado con valuador aliado). Vender 10-20/mes manualmente. *Umbral que cambia la estrategia:* si <5 ventas/mes tras 8 semanas, revisar pricing o pivotar el segmento (probar desarrolladores en vez de dueños individuales).
2. **Lanzar el generador de sitios + extensión** a los agentes que ya comprometieron 1,000 propiedades. Cobrar $600-1,000 MXN/mes. *Umbral:* si <30% convierte a pago en 90 días, el producto de sitios no es 10x — iterar la UX de IA.
3. **Publicar el caso Cimatario** como contenido SEO + LinkedIn (canal cero-costo, prueba social del pipeline).

**Etapa 6-12 meses:**
4. Construir búsqueda NL (pgvector) sobre el inventario agregado; alertas por Telegram (gratis) antes que WhatsApp (costo).
5. Iniciar SEO programático por colonia.
6. **NO construir iBuyer, NO garantizar rentas, NO quemar en marketing pagado** — esto mató a los predecesores.

**Etapa 18+ meses:**
7. Explorar banca solo con tracción demostrada; empezar por adjudicados (mercado existente) antes que el estándar interbancario cifrado.

**Benchmarks que cambian la estrategia:**
- Si el VC proptech se reactiva (>2x el nivel de 2025) → considerar levantar para acelerar la capa de marketplace.
- Si un portal lanza HBU automatizado → acelerar la certificación con valuadores para defender con validez legal.
- Si la morosidad hipotecaria sigue subiendo (ya en "máximo de 5 años" al 1T2026) → adelantar la línea de adjudicados/banca, porque el inventario de garantías crecerá.

---

## Caveats y datos no verificados

- **Tarifa de ~$10,000 USD de consultoras (CBRE/Colliers/Cushman):** referencia del fundador; estas firmas no publican precios de HBU. Estimación, no verificada.
- **Monto exacto de bienes adjudicados de la banca mexicana:** no localizado públicamente; requiere el Portafolio de Información CNBV (rubro bienes adjudicados). Se usó el IMOR hipotecario (~2.8% dic-2024/2025) como proxy de deterioro.
- **Número nacional exacto de agentes inmobiliarios:** AMPI no publica padrón nacional consolidado; solo estimados estatales y el dato de ~80-90% de informalidad.
- **Número de desarrolladores activos registrados en RUV:** no consolidado públicamente.
- **Proporción de transacciones de contado vs. crédito:** estimación del sector, no cifra oficial.
- **SHF no publica precio en pesos por entidad**, solo % de apreciación por estado y precio promedio nacional ($1,863,965, cierre 2025).
- **Precios de Wiggot y planes de Tokko Broker:** no completamente públicos en las fuentes accesibles.
- **Cifras de funding de proptechs** (Habi >$500M, La Haus ~$212M, Flat ~$25M, Houm ~$45-50M): provienen de Crunchbase/CB Insights/TechCrunch/Tracxn — fuentes secundarias confiables, no estados financieros auditados.
- **Tarifas base de WhatsApp de Meta para México** varían por BSP y han cambiado varias veces en 12 meses; verificar contra la página de precios viva de Meta antes de comprometer presupuesto.
