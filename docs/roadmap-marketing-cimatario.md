# Mini Roadmap de Marketing para el Caso Cimatario (Terreno 660m2)

**Fecha**: 2026-06-24  
**Contexto**: Terreno con alto potencial (COS 0.60 / CUS 2.4 => ~12 unidades). Dashboard actual con tabs: Valuacion, Base de Datos, Marketing + Estudio. Objetivo: reducir tiempo estimado de venta (actual ~5-9 meses) mediante estrategias data-driven y agentic.

Este roadmap expande la estrategia de marketing **no convencional** del proyecto Klugger (basado en REAL_ESTATE_ROADMAP y patrones de financialbot/ocr-ruby-lease). Enfocado en el caso Cimatario, pero escalable.

## a. Incrementar la investigacion de marketing no convencional

**Acciones**:
- Ampliar investigacion en herramientas agentic: AutoGPT, n8n, Langflow, Dify (ver repos.md para lista completa).
- Scraping etico avanzado + vision para analizar listings de la colonia (usar /vector para limpiar logos/imagenes de competidores).
- Analisis de redes sociales y grupos de devs/inversionistas en QRO/CDMX (LinkedIn, FB groups, WhatsApp).
- Benchmark contra grandes (Cushman & Wakefield, CBRE, Colliers): sus reportes usan DB de 500-2000+ comps por submercado, con datos de absorcion, cap rates, highest & best use/value.

**Entregables**:
- Reporte actualizado en docs/ con 50+ fuentes no convencionales.
- Integrar en pestana Investigacion Avanzada del dashboard (ver seccion 3).

**Costo estimado**: Bajo (uso de agentes existentes + API baratas como Gemini).

## b. Landing + Dashboard Interactivo + Animaciones de Finobra

**Acciones**:
- Potenciar el dashboard actual (ya live en /valuacion-cimatario) como herramienta de venta.
- Anadir simulaciones interactivas: Finobra (render de edificio terminado).
  - Usar Recharts + framer-motion (ya en deps del proyecto) para animaciones simples: crecimiento de torres, unidades apareciendo, ROI en tiempo real.
  - Integrar Highest & Best Use (ver c): sliders para diferentes escenarios (12 aptos, mixto, etc.).
- Incluir el logo vectorizado Klugger (3X en header, como actualizado).

**Entregables**:
- Secciones nuevas en el TSX (ver 3).
- Export de propuesta visual en PDF via jsPDF o similar.

**Costo**: Bajo (aprovechar stack existente: Recharts, Tailwind, React).

## c. Highest & Best Use + Highest & Best Value + Barrido de Scraping + Estudio de Mercado (estilo Cushman & Wakefield / CBRE / Colliers)

**Acciones**:
- **Highest & Best Use (HBU)**: Analisis de uso optimo del suelo (residencial multifamiliar vs. mixto vs. comercial). Basado en zoning real (COS 0.60/CUS 2.4), plusvalia, demanda.
- **Highest & Best Value (HBV)**: Valor maximo (no solo precio de venta, sino ROI para comprador: 12 unidades generan X ingresos).
- **Barrido scraping**: Scrapear **toda la colonia Cimatario / Cumbres del Cimatario** (al menos 500-1000 listings).
  - Fuentes: Lamudi, Inmuebles24, Vivanuncios (usar scraper.py mejorado con Playwright + pagination last-child).
  - Campos: precio, m2, tipo (terreno/casa), fecha, features (CUS si menciona), ubicacion exacta.
- **Estudio de mercado estilo big firms**:
  - Tamano DB recomendado: 800-2000+ comps por colonia/submercado (Cushman: ~1000-3000 para reports; CBRE/Colliers: 500-1500 para absorption studies).
  - Incluir: 
    - Demografia (INEGI + scraping social).
    - Comps por tipo (terrenos sin construccion: 127+ en datos actuales; casas, deptos).
    - Absorcion rates (ventas por mes).
    - Cap rates, yields.
    - Tendencias 2026 (nearshoring, plusvalia Cimatario).
    - Escenarios: Base, Optimista (con marketing), Pesimista.
  - Herramientas: Python (pandas, statsmodels para regresion), integrar en dashboard (graficas Recharts).
- Scraping plan: 1-2 semanas para barrido inicial + vision para imagenes de listings.

**Entregables**:
- Reporte en docs/ + datos en JSON/CSV (ampliar DB actual).
- Nueva seccion en dashboard: HBU / HBV + Estudio Colonia.

**Costo**: Muy bajo (scraper existente + agentes OCR para procesar).

## d. Generacion Masiva de Contenido con Agentes (Roadmap) - Plan muy barato con herramientas de ocr-ruby-lease

**Acciones**:
- Usar stack de ocr-ruby-lease / klugger (agentes, LiteLLM, slash commands /copy /masivo).
- Plan barato:
  - Tier 0 (DeepSeek/Gemini Flash): Generar 50+ posts, emails, descripciones.
  - Integrar datos del dashboard (valuacion, HBU, comps).
  - Output: copy para FB/IG/LinkedIn/WhatsApp, guiones de video, landing variants.
- Ejemplo slash: /masivo marketing-cimatario => genera bundle (posts + emails + visuals via vision).
- Herramientas existentes: financialbot agents, ocr vision, relay.

**Entregables**:
- Seccion Generador Masivo en dashboard (botones que simulan /masivo).
- Carpeta en marketing/ con outputs iniciales.

**Costo**: <  USD para batch grande (APIs baratas).

## e. Outreach Directo + WhatsApp Business

**Acciones**:
- Lista de targets: 100+ devs/inversionistas en QRO + CDMX (scraping LinkedIn + DB existente).
- WhatsApp Business API (barata) + broadcast lists.
- Mensajes personalizados con datos del dashboard (ej. Tu ROI: 12 unidades en Cimatario, valor ajustado .48M).
- Secuencia: 1. Intro + link dashboard. 2. HBU simulacion. 3. Llamada a accion.
- Integrar con agentes para personalizacion masiva (d).

**Entregables**:
- Script de outreach en docs/.
- Integracion en dashboard (form para exportar lista + templates).

**Costo**: Bajo (WA Business ~.01/mensaje + tiempo).

## Timeline Sugerido (4-6 semanas)
- Semana 1-2: a + c (investigacion + scraping colonia + HBU/HBV).
- Semana 3: b (animaciones + landing mejorada).
- Semana 4-5: d + e (agentes + outreach).
- Semana 6: Integracion completa en dashboard + tests.

## Metricas de Exito
- Leads calificados: 20+.
- Tiempo de venta estimado reducido a 3-5 meses.
- Engagement no convencional: 10x vs. convencional.

---

**Proximos**: Implementar en dashboard (ver secciones propuestas abajo). Usar herramientas existentes del stack (scraper, agentes, /vector para visuals).

## 3. Propuesta de secciones nuevas del Dashboard para el caso Cimatario

El dashboard actual (tabs: Valuación | Base de Datos | Marketing + Estudio) ya sirve como pieza central de la estrategia. Para ejecutar **todo el roadmap a-e** de forma accionable y visual (especialmente para pitches, leads y ejecución interna), proponemos **añadir tabs/secciones nuevas específicas** dentro del mismo TSX (ValuacionDashboard.tsx). Esto mantiene todo sincronizado en klugger/, mobile-first, reutilizando KPICard/Recharts/glass/framer-motion (ya disponible).

### Tabs / Secciones propuestas (implementar en orden):

1. **Roadmap Marketing** (nuevo tab o sub-sección principal en Marketing)
   - Render del mini-roadmap completo (a-e) en formato visual bonito (timeline horizontal o cards numeradas).
   - Incluye: acciones, entregables, costos estimados (baratos), timeline 4-6 sem, métricas de éxito.
   - Checklist interactivo (useState) para marcar progreso por punto (a. investigacion, b. landing..., etc).
   - Esto da visibilidad rápida de la estrategia no convencional.

2. **HBU / HBV + Estudio Colonia + FinObra** (nuevo tab clave para **b + c**)
   - **Highest & Best Use & Value interactivo**: 
     - Select de escenarios (Residencial Multifamiliar 12u / Mixto 8u+2 locales / Densidad máxima ajustada).
     - Sliders: #unidades (8-15), COS (0.5-0.7), CUS (2.0-2.8), % venta vs renta.
     - Cálculos live: valor bruto proyectado (venta unidades), costos construcción estim (bench ~$12-18k/m2), net value, ROI para developer comprador, payback.
     - Actualiza "consenso valuación" dinámico.
   - **Animaciones FinObra para simular lo construible**:
     - Visual con framer-motion: edificio creciendo (pisos 1→4, unidades apareciendo como cards animadas).
     - Al cambiar sliders, re-anima "torres" + muestra métricas "al terminar" (ej. 12 unidades listas = ingresos $XXM).
     - Botón "Copiar para Landing" o "Exportar GIF sim" (mock). Esto hace tangible "lo que se puede construir ahí".
   - **Barrido scraping colonia + Estudio de Mercado estilo big firms (Cushman & Wakefield, CBRE, Colliers)**:
     - Tabla "Datos Colonia Cimatario (mock + real 176)" con filtro/búsqueda. Campos extendidos: m2, precio, ppm, dias mercado, tipo, features.
     - "Simular barrido completo" button: añade 300-500 filas mock de listings de colonia (precios realistas, etc.).
     - Sección "Tamaños de base de datos recomendados":
       - Cushman & Wakefield: 1000-3000+ comps por submercado para reports institucionales.
       - CBRE: ~800-2000 para absorption + cap rate studies.
       - Colliers: 500-1500 para valuations locales.
       - Nuestra meta para Cimatario: mínimo 800 registros validados (actual ~176 raw; plan scrape 1-2 semanas).
     - **Qué incluir en estos estudios** (lista accionable):
       - Comps transaccionales (precio, m2, fecha, ubicación precisa).
       - Datos de absorción (ventas/mes por segmento, tiempo en mercado).
       - Métricas financieras (cap rates estimados para multifamiliar 6-9% QRO 2026, yields renta, IRR developer).
       - Demografía + demanda (INEGI, nearshoring drivers, perfiles compradores devs CDMX/QRO).
       - Oferta por densidad (terrenos COS/CUS vs unifamiliar).
       - Riesgos/plusvalía (topografía, vistas, amenidades, acceso).
       - Escenarios (base/optimista/pesimista) con sensitividad precio y marketing.
     - Export CSV/JSON "para reportes estilo CBRE".
   - Esto habilita **b** (landing + dashboard + anims finobra) porque el HBU + sim visual se puede embeber en landing custom o usarse en presentaciones a compradores.

3. **Generación Masiva de Contenido con Agentes** (nuevo tab para **d**)
   - Roadmap barato explícito: 
     - Stack: ocr-ruby-lease tools (relay agents, LiteLLM, slash commands como /masivo o /copy, vision para visuals, n8n/Dify si se quiere workflow).
     - Tier barato: DeepSeek + Gemini Flash (costo < $5 USD para 100+ piezas).
     - Flujo: Pull datos live del caso (valuación, HBU actual, 12u, CUS, asking) → templates → batch outputs.
   - UI interactiva:
     - Botones grandes: "Generar 25 Posts + Carruseles (FB/IG/LinkedIn)", "Generar 15 Emails personalizados devs", "Guiones 5 videos cortos + thumbnails", "Variantes copy para Landing/QR".
     - Output area: lista de piezas generadas (hardcode + variaciones con useState + templates). Cada una editable, "Copiar", "Añadir a batch".
     - Preview renderizado como "post" cards.
     - Tracker de costo: "Batch total estimado: $2.40 USD (120k tokens)".
   - Integración: botones que simulan llamada a agente (alert o console + output actualizado con números del dashboard).
   - Entregable: "Exportar todo bundle .zip" (mock) + carpeta marketing/outputs en repo.
   - Cubre el "plan muy barato con herramientas de ocr-ruby-lease".

4. **Outreach Directo + WhatsApp Business** (nuevo tab para **e**)
   - Lista de targets (mock 80-120 contactos: devs, constructoras, fondos QRO/CDMX — con nombre, rol, foco, teléfono/email simulado, prioridad).
   - Filtros: por ciudad, tipo (multifamiliar), tamaño preferido.
   - Generador de mensajes dinámico:
     - Template selector (Intro, HBU pitch, Follow-up, JV proposal).
     - Personalización automática: inserta "Terreno Cimatario 660m² CUS 2.4 → ~12 unidades. Valor modelo $7.48M (vs asking $7M). Tiempo venta optimista con marketing: 4-5 meses. Ver simulación FinObra + dashboard: https://.../valuacion-cimatario"
     - Vista previa mensaje WA listo para copiar.
   - Secuencia de outreach:
     - Botón "Lanzar secuencia 1 (Intro a 40 targets)" → marca enviados, simula respuestas.
     - Dashboard de métricas: Enviados / Respuestas / Reuniones agendadas (useState actualizable).
   - WhatsApp Business:
     - Notas de integración: usar WA Business API (oficial o via n8n), broadcast lists, templates aprobados.
     - "Conectar WA" mock + log de envíos.
   - CTA final: exportar lista + mensajes a CSV para importar en WA tool o agente.
   - Cubre outreach directo + WA Business.

### Cómo integrarlo todo en el código (plan de implementación)
- Extender `activeTab` type: 'valuacion' | 'database' | 'marketing' | 'hbu' | 'agentes'
- Añadir botones en la nav de tabs (overflow-x-auto ya soporta).
- Crear componentes internos: `HbuTab()`, `AgentesTab()` (dentro de este archivo para sync fácil).
- En HbuTab: useState para scenario + sliders (range inputs), motion.div para anims de finobra (edificio con divs + transition, o svg simple animado), tabla mock colonia + schema.
- En AgentesTab: arrays de templates + generate functions que interpolan datos VALUATION + hbu state.
- Añadir al final del MarketingTab actual referencias: "Ver tab HBU/HBV para animaciones y estudio completo (c)" + "Ir a Agentes para ejecución d+e".
- Datos: Añadir mocks en el TSX o JSONs nuevos en la carpeta (hbu_scenarios.json, colonia_scrape_mock.json, targets_outreach.json). Para real: correr scraper.py + parse en modelo.
- Sync: Después de editar el TSX principal (dashboard-financial/app/valuacion-cimatario/ValuacionDashboard.tsx), copiar el archivo completo a cases/terreno-cimatario-queretaro/ValuacionDashboard.tsx + copiar jsons de data si nuevos.
- Extras: Actualizar page.tsx si necesario (no). Añadir import { motion } from 'framer-motion'; para anims suaves.
- Hosting/uso: Dashboard ya es la "landing interactiva". Añadir en hero o footer "Usa este dashboard en pitches — QR en el lote apunta aquí".

### Beneficio para el caso Cimatario
- Convierte el dashboard de "reporte de valuación" a **herramienta de venta y ejecución de marketing** completa.
- Permite mostrarle al comprador developer "mira lo que puedes construir (anim), el estudio que respalda el precio (DB estilo CBRE), y los materiales listos para outreach".
- Reduce tiempo de venta vía datos + ejecución agentic barata.
- Todo "para el caso que nos atañe: cimatario" — reusable para próximos terrenos.

**Siguiente acción inmediata**: Implementar los tabs/secciones en el TSX + actualizar journal + commit/push.

Esto completa la petición del usuario.
