# ROADMAP Real Estate — Klugger Inmuebles MX

> Basado en el PLAN_MAESTRO v60 de ocr-ruby-lease (VILAR Legal OS "Artifact Factory") y el frontend de financialbot.
> Adaptado para: Marketing local + Scraping de inmuebles en México + Generación agentic de artefactos de marketing (landings, copy, campañas, insights).
> Proyecto local-first en `klugger/`.
> Fecha: 2026-06-22
> Objetivo: Herramienta autónoma que usa scraping ético + agentes (tropicalizados de financial-bot) + el frontend dashboard de financialbot para dominar marketing de real estate en MX.

---

## 1. Resumen ejecutivo

Usar la metodología del roadmap de ocr-ruby-lease (agentes costo-eficiente, routing LiteLLM, fases incrementales, "tropicalización" de financial-bot) para construir un sistema de **marketing y inteligencia de mercado para inmuebles en México**.

**Foco:** Scraping público de listings (precios, colonias, m², tendencias), análisis de mercado (del estudio de mercado del usuario), generación masiva de artefactos de marketing (copy para ads, descripciones de propiedades, emails, landings personalizadas, reportes de insights), usando el frontend de financialbot como UI base (dashboard live + stats).

**Fuera de alcance inicial:** OCR profundo de documentos legales de inmuebles (se puede agregar después usando la base de ocr/v60). Enfoque en scraping + marketing.

**Base assets:**
- Frontend: `klugger/landing/` (copiado de financialbot frontend — vanilla HTML/JS dashboard con live feed, tabs, stats, charts, socket.io ready).
- Agents y lógica: `klugger/financialbot/` (financial/bot con agents, graph, tools) + ocr components para inspiración de agentes + pill.ai local para computer-use/scraping.
- Roadmap original: `klugger/ocr/v60/PLAN_MAESTRO.md` (estructura de fases, agent tree, stack, slash commands).

---

## 2. Reglas estrictas del proyecto

| # | Regla |
|---|-------|
| 1 | Nunca modificar el código original de los forks (ocr-ruby-lease y financialbot). Solo copiar/adaptar en `klugger/`. |
| 2 | Scraping 100% ético y legal: delays, robots.txt, solo datos públicos agregados, no bypass, no datos personales. Cumplir LFPDPPP México. |
| 3 | Mantener local-first (klugger/ + pill.ai). Exponer solo landing vía ngrok para pruebas. |
| 4 | Usar el frontend de financialbot como base UI (adaptar tabs para scraping feed, market insights, marketing generator). |
| 5 | Seguir la estructura del PLAN_MAESTRO: agent tree tropicalizado, tiers de modelos (baratos para scraping/masivo, Claude/Grok para razonamiento), fases incrementales. |
| 6 | Incluir comentarios `# klugger-v1` en adiciones. |
| 7 | Priorizar costo-eficiencia (DeepSeek/Gemini para ejecución, Grok/Claude para planificación). |
| 8 | Integrar el estudio de mercado del usuario como input para agents. |
| 9 | Todo en GitHub `vilarkptl-lang/klugger` (rama main o feature/real-estate). |

---

## 3. Stack tecnológico (adaptado)

| Capa | Base de forks | Klugger (nuevo) | Razón |
|------|---------------|-----------------|-------|
| **Frontend** | financialbot `frontend/` (vanilla + dashboard live) | `landing/` adaptado + posible Next.js de dashboard-financial o shnell-mx-landing | Rápido prototipo + live updates para scraping/marketing. |
| **Agentes / Backend** | financial-bot agents + ocr agents (tropicalizados) + pill.ai (browser/scraping local) | Agentes para Scraper, MarketAnalyzer, CopyGenerator, LandingCustomizer. LangGraph o pill.ai graph. | Reutilizar financial-bot agents + metodología ocr. |
| **Routing AI** | LiteLLM tiers del PLAN_MAESTRO | Igual: Tier 0 ultra-barato para scraping/bulk, Tier 1 visión, Tier 2 redacción marketing, Tier 3 razonamiento (Grok 4.3 / Claude). | Costo-eficiencia extrema para volumen de listings MX. |
| **Scraping** | pill.ai browser + ocr vision | Playwright/pill.ai + delays + ethical wrappers. Integrar con financial-bot tools. | Local, potente para sitios de inmuebles (Inmuebles24, etc.). |
| **Datos / DB** | MySQL de financial + filesystem ocr | SQLite local o la DB existente + JSON para market studies. | Simple para local. |
| **Live / UI** | Socket.io + Chart.js del frontend financialbot | Mantener + extender para live scraping events, insights en tiempo real. | El dashboard ya está listo para "live tool calls". |
| **Despliegue** | Local + ngrok para landing. Futuro: DO como shnell. | PM2 o similar para agents si se escala. | Local-first como pedido. |

---

## 4. Árbol de agentes (tropicalizado de financial-bot + ocr)

```
User / Estudio de Mercado / Query
       │
       ▼
┌─────────────────────────────────┐
│  Supervisor / Intent Router     │  Grok 4.3 o Claude (planificación)
│  (clasificación + routing)      │
└───────────────┬─────────────────┘
                │
       ┌────────▼────────┐
       │  LiteLLM Cost   │  ← Graph orchestrator (pill.ai o LangGraph)
       │     Router      │
       └──┬──┬──┬──┬─────┘
          │  │  │  │
   Tier 0 (Ultra barato)  Tier 1 (Visión)  Tier 2 (Redacción)  Tier 3 (Legal/Marketing crítico)
   DeepSeek / Gemini Flash / Llama   |   DeepSeek V4 Pro   |   Grok 4.3 / Claude Sonnet
          │                        │                     │
   ▼                              ▼                     ▼
Scraper Agent                 Vision/OCR Agent      Marketing Generator Agent
(Browser pill.ai + Playwright  (para imágenes de    (copy para ads, descripciones,
para listings inmuebles MX)     propiedades)         emails, campañas)
          │                        │                     │
          └──────────────┬─────────┘
                         ▼
            Market Analyzer + Insights Agent
            (combina estudio usuario + scraped data)
                         │
                         ▼
            Landing / Artifact Generator
            (usa financialbot frontend patterns + templates)
```

Reglas de routing (adaptadas del PLAN_MAESTRO):
- Tarea scraping/bulk listings → Tier 0
- Análisis imágenes de propiedades → Tier 1 Gemini Flash
- Generación copy marketing → Tier 2 DeepSeek
- Estrategia completa o validación → Tier 3 Grok/Claude
- Slash commands para forzar tier.

---

## 5. Slash commands / Tools (inspirados en PLAN_MAESTRO + financial-bot)

| Comando | Descripción | Agente principal |
|---------|-------------|------------------|
| `/scrape` | Scraping de un portal o query de inmuebles | Scraper Agent |
| `/insights` | Generar insights de mercado a partir de estudio + scraped | Market Analyzer |
| `/copy` | Generación de copy marketing (ads, descripciones) | Marketing Generator |
| `/landing` | Generar variante de landing page | Landing Generator |
| `/masivo` | Generación masiva de artefactos (campañas para 100+ propiedades) | Bulk + Celery-like |
| `/ultra` | Forzar modo ultra-barato | — |
| `/grok` | Forzar Grok 4.3 para la tarea | — |

Añadir a tool router del financial-bot o pill.ai.

---

## 6. Estructura de archivos objetivo (en klugger/)

```
klugger/
├── landing/                  ← Frontend financialbot adaptado (UI principal)
│   ├── index.html            ← Dashboard/Landing para Inmuebles (repurposed)
│   ├── css/dashboard.css
│   ├── js/dashboard.js       ← Adaptar para scraping events, insights
│   └── ...
├── financialbot/             ← Código agents y dashboard avanzado (copia del fork)
│   ├── financial/bot/        ← Agents base (tropicalizar para real estate)
│   └── dashboard-financial/  ← Next.js dashboard (opcional usar para admin)
├── ocr/                      ← Referencia del ocr-ruby-lease (no tocar directo)
│   └── v60/PLAN_MAESTRO.md   ← Base del roadmap
├── docs/
│   ├── REAL_ESTATE_ROADMAP.md  ← Este archivo (adaptado)
│   └── MARKET_STUDY.md       ← (cuando des el estudio de mercado)
├── agents/                   ← Nuevos agentes klugger (o en financialbot/)
├── scraping/                 ← Wrappers éticos + pill.ai integration
├── marketing/                ← Generadores de copy, landings, campañas
├── README.md
└── ecosystem.config.js o similar para agents locales
```

---

## 7. Fases de implementación (adaptadas del PLAN_MAESTRO v60)

### Fase 0 — Preparación (~1 día)
- [x] Folder klugger/ creado + forks de ocr-ruby-lease y financialbot.
- [x] `landing/` con frontend financialbot copiado.
- [ ] `klugger/financialbot/` integrado (agents + dashboard).
- [ ] Instalar deps si falta (pill.ai ya está, playwright, etc.).
- [ ] Crear `REAL_ESTATE_ROADMAP.md` (este).
- [ ] Configurar git en klugger/ (remote ya en vilarkptl-lang/klugger).

### Fase 1 — Agentes backend (Scraping + Análisis) (~4-7 días)
- [ ] Adaptar agents de financial-bot (TransactionOrchestrator style) para real estate.
- [ ] Scraper Agent: usar pill.ai browser o playwright para sitios MX (Inmuebles24, Vivanuncios, etc.) con ethical delays.
- [ ] Market Analyzer Agent: combina estudio de mercado + datos scraped (precios por colonia, trends).
- [ ] Integrar LiteLLM router (tiers como en PLAN_MAESTRO).
- [ ] DB/Storage para listings (usar la de financial o nueva SQLite).
- [ ] Slash /scrape /insights básicos.

### Fase 2 — Frontend adaptation (usando financialbot frontend) (~5-7 días)
- [ ] Repurpose `landing/index.html` + js/css como UI de Klugger Inmuebles:
  - Header con stats (listings scraped hoy, campañas generadas, costo API, insights).
  - Tabs adaptados: Feed (scraping live), Agentes, Insights de mercado, Copy Generator, Landings, Campañas.
  - Live feed de tool calls de scraping.
  - Integrar charts para precios/mercado.
- [ ] Añadir secciones estáticas para landing marketing (hero, features, demo).
- [ ] Conectar a backend agents (fetch / SSE).
- [ ] Tema oscuro premium (heredado).
- [ ] Mobile friendly (ya tiene tab bar).

### Fase 3 — Generación de Marketing + Integración (~4 días)
- [ ] Copy Generator Agent (tropicalizado de financial-bot response-gen).
- [ ] Landing Generator: usar templates + frontend patterns para generar variants.
- [ ] Integrar estudio de mercado del usuario.
- [ ] Slash commands /copy /landing /masivo.
- [ ] Conectar frontend a los nuevos endpoints/agents.
- [ ] Ejemplo end-to-end: scrape colonia → insights → generar 5 copies + 1 landing.

### Fase 4 — Testing, Ética, Go-Live local (~3 días)
- [ ] Smoke tests de scraping ético (10-50 listings, verificar delays y robots).
- [ ] Verificar calidad de marketing generado (usar Grok/Claude para review).
- [ ] Exponer landing con ngrok para pruebas.
- [ ] Documentar compliance legal.
- [ ] Demo completa con tu estudio de mercado.
- [ ] Iterar basado en feedback.

---

## 8. Estado actual (2026-06-22)

**Reutilizado directamente:**
- Frontend financialbot en `landing/`.
- Agents y estructura de financialbot/ y ocr/.
- Metodología completa del PLAN_MAESTRO (agent tree, tiers, fases, tropicalización).

**Nuevo en Klugger:**
- Estructura `klugger/`.
- `REAL_ESTATE_ROADMAP.md`.
- `landing/` (frontend listo para adaptar).
- Integración de forks (ocr + financialbot) en un proyecto de real estate marketing.

**Próximo inmediato:**
- Adaptar el HTML/JS de landing/ para marca Klugger Inmuebles + secciones de marketing.
- Implementar primer agente scraper básico (usando pill.ai browser).
- Añadir tu estudio de mercado cuando lo des.

---

## 9. Instrucciones para desarrollo (inspirado en PLAN_MAESTRO)

- Lee siempre este roadmap + el PLAN_MAESTRO original antes de codificar.
- Usa `/ejecutar` style si tienes Claude tools: lee estado, implementa un ítem completo, verifica.
- Prioriza local y ético.
- Commit a `vilarkptl-lang/klugger` con mensajes claros.
- Para slash commands y agents, tropicaliza los de financial-bot (ver `klugger/financialbot/financial/bot/agents/`).

---

**¡Listo para empezar!** El frontend de financialbot está en `klugger/landing/` listo para customizar. El roadmap de real estate (adaptado del ocr) está en `klugger/REAL_ESTATE_ROADMAP.md`.

Dime qué parte atacamos primero (customizar el landing HTML, implementar el primer scraper agent, integrar el estudio de mercado, etc.) y lo hacemos con subagentes si es complejo. 

También puedo hacer git commit + push de estos cambios al repo klugger si quieres.