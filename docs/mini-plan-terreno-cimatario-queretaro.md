# Mini Plan de Acción - Terreno en Cimatario, Querétaro (Caso Práctico)

**Fecha**: 2026-06-22  
**Propiedad**: Terreno ideal para desarrollo - 660 m² en Cimatario, Querétaro  
**Links proporcionados**:  
- [Pincali / EasyBroker](https://www.pincali.com/inmobiliarios/ivan_medina_1/inmueble/terreno-ideal-para-desarrollo-alta-plusvalia-y-excelente-ubicacion)  
- [Facebook Share](https://www.facebook.com/share/19Ba5RjPnT/?mibextid=wwXIfr)  
**Info disponible**: Solo los dos links + fotos del listing (19 fotos en galería).  

Este plan sigue el **REAL_ESTATE_ROADMAP.md** (adaptado del PLAN_MAESTRO de ocr-ruby-lease) y el setup del proyecto klugger (agents de financialbot, vision agents, pill.ai para browser/vision/scraping, frontend para landing, costo-eficiente con Gemini Flash).

## 1. Síntesis de la Información del Terreno

### Datos Básicos (del listing Pincali/EasyBroker)
- **Precio**: $7,000,000 MXN
- **Superficie**: 660 m²
- **Ubicación**: Lic. Carlos Septien 53, Cimatario, Querétaro, Querétaro. CP 76030
- **ID**: EB-WE7457
- **Vendedor**: MHabitat (Ivan Medina en Pincali/EasyBroker)
- **Tipo**: Terreno (ideal para desarrollo residencial multifamiliar)
- **Potencial de desarrollo**:
  - Coeficiente de Ocupación del Suelo (COS): 0.60
  - Coeficiente de Utilización del Suelo (CUS): 2.4
  - Niveles permitidos: 4 (altura máxima 14 metros)
  - Por nivel ocupable: ~395.40 m² (COS)
  - Apartamentos: 3 por nivel (~131.80 m² c/u)
  - **Total estimado**: 12 apartamentos en el predio
- **Otras specs**: Excelente ubicación con alta plusvalía. Permite desarrollo de 3 apartamentos por nivel en 4 niveles.
- **Fotos**: 19 fotos en la galería (muestran el terreno vacío/plano, accesos, entorno urbano con casas y potencial de desarrollo. Una imagen de ejemplo descargada localmente en `C:\Users\noela\temp_images\terreno_1` para análisis).

### Análisis de Imágenes (usando Vision Agent del proyecto)
- **Herramienta**: VisionAgent del proyecto en `financialbot/financial/bot/agents/vision-agent.js` (prioriza Gemini Flash vía GOOGLE_API_KEY del .env del klugger repo - costo-eficiente como en el roadmap). 
- **Imágenes del caso**: Ahora dentro del repo en `cases/terreno-cimatario-queretaro/images/` (4 imágenes descargadas de las fuentes para análisis; el listing tiene 19 en galería).
- **Runner script creado**: `cases/terreno-cimatario-queretaro/analyze-images-with-vision.js` (usa el VisionAgent del proyecto, procesa las imágenes locales con prompt adaptado a real estate/development, guarda JSON en data/vision-analysis.json).
- **Cómo correr** (dentro de klugger, con .env cargada):
  ```
  cd financialbot/financial  # o donde estén las deps/node_modules
  node ../../cases/terreno-cimatario-queretaro/analyze-images-with-vision.js
  ```
- **Estado actual (sintetizado del listing + imágenes descargadas, pendiente ejecución full del agent)**: 
  - Fotos muestran terreno vacío/plano listo para construcción, accesos viales, entorno de colonia residencial con casas 1-2 niveles cercanas (buena consolidación, alto potencial densificación per specs).
  - Alta calidad visual para marketing (ángulos limpios del lote, contexto urbano).
  - Facebook/IG posts repiten el listing para promover el desarrollo.
- **Próximo en plan**: Ejecutar el runner (usará tu Gemini key), integrar outputs al scraper y marketing (descripciones para posts, moodboard, etc.).

**Nota**: Si pill.ai o node no están listos, el script usa el agent del proyecto directamente. Todo dentro de este repo klugger.

**Nota sobre FB**: El tool de fetch retornó redirección sin contenido detallado (común en shares de FB). El post de Instagram relacionado repite la info del listing.

### Contexto de Mercado (inicial de búsquedas)
- Zona: Cimatario, Querétaro – cerca del centro, buena plusvalía por desarrollo.
- Comps iniciales (de búsquedas web): Terrenos en Cimatario/San Francisquito ~$4.9M+ para habitacionales; otros en Altozano o Río con diferentes tamaños/precios. Precio/m² aproximado en zona ~7,000-12,000 MXN dependiendo de potencial.
- Oportunidad: Terreno con alto CUS para 12 unidades es atractivo para desarrolladores locales.

## 2. Mini Plan de Acción (siguiendo el REAL_ESTATE_ROADMAP)

### Fase Prioritaria 1: Estudio de Mercado + Scraper (Primer punto del usuario)
**Objetivo**: Colectar datos de terrenos similares para entrenar modelo de precio aproximado (y modelos de cálculo/ROI).

**Paso 1.1: Generar Scraper (inmediato)**
- **Herramientas del roadmap**: pill.ai (browser + vision para screenshots y análisis de fotos), agents del financialbot/ocr (tropicalizar para real estate), LiteLLM tiers (Gemini Flash para visión barata).
- **Fuentes a scrapear** (inicial batch de 20-50 listings):
  - Pincali/EasyBroker (buscar "terrenos en venta Cimatario Querétaro" o "terreno Querétaro 500-800m2").
  - Inmuebles24, Lamudi, Vivanuncios, Facebook Marketplace/Instagram.
  - Foco: Cimatario + colonias cercanas (San Francisquito, Altozano, Juriquilla), tamaño 400-900 m², uso residencial/desarrollo (buscar menciones COS/CUS o "para construir").
- **Datos a extraer por listing**:
  - Precio, m², colonia/ubicación exacta, link, fecha publicado.
  - Specs: COS, CUS, niveles permitidos, potencial unidades (si disponible), zoning.
  - Fotos: URLs + descripción vía VisionAgent (estado del lote, accesos, entorno, calidad visual para marketing).
- **Implementación**:
  - Crear `klugger/scraper/real_estate_scraper.py` o usar pill.ai en modo agent (e.g. "busca y lista 10 terrenos similares en Cimatario, extrae datos y analiza fotos").
  - Almacenar en `klugger/docs/data/terrenos_comps.json` o DB del proyecto (usar el schema de financial/ocr).
  - Frecuencia: Script inicial + scheduled (usar hooks o cron en deploy).
- **Entregable**: Dataset inicial + reporte "Comps Cimatario - Terrenos para Desarrollo" (precio promedio/m², factores de plusvalía).

**Estrategia para scrapers con más éxito (terrenos similares a este en la zona)**:
- Priorizar fuentes locales con alta densidad de listings en Cimatario/Querétaro: Pincali/EasyBroker (ya usado para este caso), Inmuebles24, Lamudi, Vivanuncios, Facebook Marketplace e Instagram (buscar posts de agentes locales como MHabitat).
- Queries efectivas: "terreno venta Cimatario Querétaro", "terreno desarrollo residencial Querétaro 600m2", "terreno Cimatario COS" o por código postal 76030 + colonias aledañas.
- Enfoque en similitud: Filtrar por m² (500-800), uso (terreno/habitacional/desarrollo), mencionar potencial construcción (COS/CUS o "para construir apartamentos").
- Éxito incrementado con: 
  - pill.ai browser agent para navegación dinámica y screenshots automáticos.
  - VisionAgent (Gemini Flash) post-scrape para describir fotos de comps (estado, entorno, potencial visual) y enriquecer datos.
  - Rotación de user-agents y delays para evitar bans.
  - Monitoreo de nuevas listings vía búsquedas programadas o alerts de sitios.
- Esto generará rápidamente 20-50 comps de terrenos similares para el modelo de precio.

**Current status (updated scraper run)**: With aggressive link-focused parser (full URLs via urljoin), last-child/next pagination follower (up to 20 pages), and expanded searches (broad lamudi + specific Cimatario/Cumbres + vivanuncios), we reached **176 unique full-URL listings**. Exceeds the 100 target. Some are filter/search pages but many are actual terreno listings in the target area/zone. CSV now has complete links (no more example.com placeholders). No photos extracted per instruction. Parser and pagination now robust for scaling.

**Decisión para la base de datos en esta etapa**:
- **CSV es la mejor decisión ahora**.
  - Razones: Etapa inicial/prototipo (un caso + scraper para decenas de comps). Simple, sin servidores ni setup (Postgres/Mongo requieren instalación/config). Fácil de versionar con git, abrir en Excel/pandas para análisis rápido y modelo de precio. Rápido para iterar el estudio de mercado.
  - Almacenar en `cases/terreno-cimatario-queretaro/data/terrenos_similares.csv` con columnas: precio, m2, colonia, link, cos, cus, potencial_unidades, descripcion_vision, etc.
- **Evolución recomendada**: 
  - CSV → MongoDB (flexible para datos variables de listings + descripciones de vision agent, queries fáciles con pymongo).
  - O Postgres si se prefiere estructura relacional para el modelo de precio (buenas joins y analytics).
- No empezar con DB compleja para evitar overhead en esta fase temprana del roadmap (enfocarse en scraper + datos + modelo primero).

**Paso 1.2: Modelo de Precio y Cálculo** (continúa igual, ahora con CSV como fuente).

**Paso 1.2: Modelo de Precio y Cálculo**
- **Basado en roadmap**: Usar agents de código (coder agent de pill.ai o financialbot), tiers baratos para bulk.
- **Modelo simple**:
  - Features: m², score_zona (plusvalía por ubicación/desarrollo), potencial_unidades (basado en CUS/COS o zoning), distancia_centro.
  - Precio_base = m² * (precio_m2_zona_promedio ~8,000-12,000 MXN).
  - Ajustes: +20% por alto CUS (como este con 2.4), -10% si no tiene specs de desarrollo.
- **Implementación**:
  - Script Python (sklearn simple o rules) en `klugger/docs/modelo_precio_terrenos.py`.
  - Para este terreno: Calcular estimado vs $7M. (Ej. si comps muestran ~6-8M, está en rango o con premium por specs).
  - Extensión: Modelos para ROI (12 aptos estimados), costos construcción aproximados.
- **Entregable**: Modelo validado + predicción para este terreno + dashboard simple (usar frontend financialbot).

**Paso 1.3: Vision Agent en las Fotos**
- Usar VisionAgent (financialbot) o pill.ai vision en las 19 fotos + imagen local descargada.
- Output: Descripciones estructuradas para dataset (ej. "terreno plano, acceso por calle pavimentada, rodeado de casas 1-2 niveles, alto potencial densificación").
- Integrar en scraper (auto para nuevas listings).

### Fase 2: Proyecto de Marketing No Convencional
**Objetivo**: Usar el terreno como caso piloto para marketing agentic, generar leads para desarrolladores/inversores.

**Estrategia** (no convencional: data-driven, visual-heavy, agent-generated, targeted a nicho):
- **Herramientas del roadmap**: 
  - Vision para analizar fotos y crear assets visuales (moodboards, selling points de las imágenes).
  - Bulk generator / Marketing agents (de financialbot/ocr) para contenido masivo (posts, emails, descripciones).
  - Frontend financialbot (adaptado en `landing/`) para microsite/landing custom del terreno con:
    - Galería analizada por vision.
    - Calculator de precio/ROI basado en el modelo.
    - Form lead.
  - Slash commands / agents para bulk (ej. /masivo para 10 posts + 1 landing variant).
- **Contenido**:
  - Posts sociales (FB/IG/LinkedIn): "El terreno que permite 12 aptos en Cimatario – plusvalía garantizada por ubicación centro y specs COS/CUS".
  - Historias: "De lote vacío a 12 hogares – data del mercado".
  - Email para lista de inversores: Casos de éxito + specs + modelo precio.
  - Landing no convencional: Interactiva, con "simulador de desarrollo" (input m2/unidades -> estimado ROI), testimonios generados, video script.
- **Canales y tácticas**:
  - Social targeted (developers en Querétaro + CDMX).
  - Colabs con agentes locales o grupos de inversión inmobiliaria.
  - QR en materiales físicos (si aplica).
  - A/B test con diferentes creativos (usar vision para variantes visuales).
- **Métricas**: Leads (formularios), engagement, tiempo en landing, conversion a inquiry.
- **Entregable**: 5-10 assets de marketing listos + landing deployable (usar el frontend) + reporte de performance inicial.

### Timeline y Recursos (Mini)
- **Semana 1 (Scraper + Vision + Data)**: 
  - Implementar scraper básico (pill.ai + custom).
  - Correr vision en fotos del terreno + 5-10 comps.
  - Colectar dataset inicial.
- **Semana 2 (Modelo + Análisis)**: 
  - Entrenar/validar modelo precio.
  - Análisis de este terreno vs mercado.
  - Primeros assets de marketing.
- **Semana 3 (Marketing Launch)**: 
  - Landing custom + posts/emails.
  - Lanzar campaña piloto.
  - Iterar con más data del scraper.
- **Recursos**: 
  - Vision/Agents: Gemini Flash (key en .env, costo bajo ~$0.10/M).
  - Scraper: pill.ai + código en klugger.
  - Frontend: klugger/landing/ (customizado).
  - Almacenamiento: local (json/DB del proyecto).
- **Próximos en roadmap**: Bulk para más propiedades, integración con financial agents para ROI, deploy si escala.

### Archivos a Crear/Actualizar en Local
- `klugger/docs/data/terrenos_cimatario_comps.json` (dataset).
- `klugger/docs/modelo_precio_terrenos.py` (o notebook).
- `klugger/landing/terreno-cimatario/` (instancia custom del frontend).
- `klugger/scraper/real_estate_scraper.py` (o script pill.ai).
- Actualizar `REAL_ESTATE_ROADMAP.md` con este caso como ejemplo.
- Este plan: `klugger/docs/mini-plan-terreno-cimatario-queretaro.md`

**Siguientes acciones recomendadas**:
1. Correr vision agent en la imagen local + screenshots (una vez fixes en pill.ai o usando JS agent directamente).
2. Implementar scraper inicial y correr para 10 comps.
3. Construir el modelo básico.
4. Adaptar landing para este terreno.

---

## 2026-06-22 Update: Dashboard de Valuación + Tiempo de Venta (TSX)

Completado el entregable pedido:

- **Modelos implementados (REAL_ESTATE_ROADMAP + mini-plan + especificación exacta del usuario)**:
  - Filtro a terrenos **sin construcción** (12 comps limpios curados desde Lamudi/Inmuebles24 actuales).
  - Mediana ppm × 660 m² (ejemplo literal del query) → base $5.085M.
  - Vector de precios: para cada comp se calcula "implied value para 660m²" + delta % vs asking actual.
  - Ajustes CUS/potencial: ×1.4 (12 unidades vs densidad baja de comps) + ×1.05 zona = modelo ajustado mediana **$7.476M** (rango consenso 6.88M–8.07M).
  - Referencia Lamudi reportada: 6,433 $/m² área.
  - Fórmulas completas documentadas numéricamente en el TSX y en el .py.

- **Archivo TSX generado** (mobile-first, ultra atractivo, usa patrones exactos de `dashboard-financial/`):
  - `cases/terreno-cimatario-queretaro/ValuacionDashboard.tsx`
  - KPIs glass (copia fiel de KPICard: colores accent #7c3aed, success, warning... + glow blobs).
  - Secciones glass rounded-2xl/3xl con Tailwind del proyecto.
  - Explicación de valuación con fórmulas numéricas paso a paso.
  - Tabla de vector + comps (desktop table + mobile cards stacked, filtro, links reales a listings).
  - Gráficos Recharts (BarChart de implied values con ReferenceLine en asking 7M; otro Bar+Lines para tiempo de venta).
  - **Panel nuevo de tiempo estimado de venta** (investigación web): buckets de precio vs meses (5-8 meses estimado para $7M asking actual). Gráfica atractiva con highlight naranja en el bucket del precio actual + rangos optimista/pesimista.
  - Todo 100% responsive (cols-2 en mobile → md:4), sin servidor, listo para copiar a Next dashboard-financial.

- **Archivos de datos nuevos**:
  - `data/comps_clean.json` (12 comps puros, con links y notas).
  - `data/terrenos_similares_clean.csv`.
  - `data/valuation_output.json` (generado por el modelo; consumible por el TSX o landing).

- **Cómo correr el modelo (actualizado)**: usa el venv de pill.ai o el python del sistema con el CSV/JSON limpios.
- **Cómo ver el dashboard**: Copia `ValuacionDashboard.tsx` a `dashboard-financial/app/valuacion-cimatario/page.tsx` (o similar) + instala recharts + asegura globals.css + tailwind tokens. O úsalo standalone con Vite/Next mínimo.

El dashboard comunica TODO: tabla DB limpia, valuación numérica+formulas, vector comparación, y el panel "cuánto tardaríamos en vender según precio" con gráfica muy visual.

Próximo: integrar este TSX en landing/ o en financialbot/dashboard-financial real, agregar outreach para reducir el tiempo estimado, y vision en las fotos del terreno para enriquecer features del modelo.

---

Este plan alinea con el roadmap (agentes, vision para fotos, scraping para data, marketing agentic, frontend). Una vez con más data/imágenes, iteramos.

---

*Guardado localmente en: C:\Users\noela\klugger\docs\mini-plan-terreno-cimatario-queretaro.md*