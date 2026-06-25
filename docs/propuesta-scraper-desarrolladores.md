# Propuesta: Nuevo Scraper para Real Estate Desarrolladores (de menor a mayor complejidad)
Fecha: 2026-06-25
Contexto: Klugger / caso Cimatario. Necesario para marketing zero-cost (JV, outreach devs), enriquecer DB más allá de listings individuales (terrenos_full.json ~1000 pero muchos sim), extraer contactos de desarrolladores para agentes/WA.

El scraper actual (scraper.py) es bueno para listings Lamudi/Inmuebles24/Vivanuncios (COLONIA_SEARCH_URLS + BS4/parse + optional Playwright). Pero para "desarrolladores" (empresas que construyen/proponen JV en QRO) necesitamos datos de proyectos de devs, teléfonos, emails, tamaños de proyectos, etc.

## Fases de implementación (menor -> mayor complejidad, incremental, testable)

### Fase 1: Simple / Bajo costo / Rápido (1-2 días, solo Python std + requests/BS4)
- Extender scraper.py o nuevo `scraper_desarrolladores.py` en cases/terreno-cimatario-queretaro/
- Targets iniciales (hardcode 5-10 URLs conocidas o de búsqueda "desarrolladores inmobiliarios queretaro 2026"):
  - Sitios de devs grandes en QRO (e.g. páginas de proyectos, "nuestros desarrollos").
  - Google "site:desarrolladorqro.com proyectos cimatario" pero vía requests a páginas conocidas.
  - Páginas de asociaciones (AMPI QRO, etc) o listados de "mejores desarrolladores".
- Parse: BS4 para nombre dev, proyectos (m2 total, #unidades, tipo: multifam/residencial), loc, "contacto" links.
- Output: JSON/CSV con campos: dev_name, project_name, size_m2, units, type, contact_phone?, contact_email?, website, source_url, scraped_at.
- Ética: delays 2-4s, UA real, 1 req por dominio.
- Ventaja: cero deps extra, corre local en PS con python (usa el venv o pill.ai si tiene bs4).
- Validar: correr, producir 20-50 devs/projects, merge con DB actual (dedup por name).
- Link a cambios: después de commit.

### Fase 2: Medio (agregar Playwright + pagination/JS, + extracción contactos)
- Instalar playwright (ya en plan del scraper actual).
- Para sitios que cargan listings por JS o "ver más devs".
- Extra: seguir links "contacto del desarrollador", parse tel/email con regex + LLM ligero si .env tiene Gemini (ya usa en analyze-images).
- Enriquecer: para cada dev, buscar "JV" o "terrenos en venta para desarrollo" mentions.
- Output mejorado + tags HBU (e.g. "busca multifam CUS>2").
- Integrar: output a terrenos_devs.json , importable en ValuacionDashboard (nuevo tab o en DB).
- Correr desde PS admin: python ...scraper_desarrolladores.py --mode devs
- Meta: 50-150 devs/projects reales (mejora concentración del hist actual).

### Fase 3: Avanzado (multi-fuente, dedup, agents integration)
- Agregar fuentes: portales devs (Inmuebles24 "desarrolladores", Lamudi "empresas"), LinkedIn público scrape (cuidadoso), sitios de QRO nearshoring.
- Dedup inteligente: fuzzy match name + loc (o simple title).
- Integrar con relay/agents o /masivo: después scrape, agent genera outreach personalizado usando datos live (nombre dev + proyecto + HBU calc from dashboard).
- Playwright stealth + proxies básicos si rate limit.
- Schedule: agregar a cron o script que append a DB (csv -> json update).
- Vision: si listing tiene fotos de proyectos, pipe a analyze-images-with-vision.js para tags (altura, estilo, amenities) -> enriquece modelo precio/HBU.

### Fase 4: Alta complejidad / Production (full pipeline, LLM heavy, legal/ethical)
- Crawler full (start from search "desarrolladores queretaro cimatario" -> discover new URLs).
- LLM extract (Gemini Flash via keys): parse unstructured "llámanos al 442-xxx para JV en su terreno Cimatario".
- Storage: migrate to backend/db (relay or financial db) + versioning.
- Classify auto: usar el HBU calculator del dashboard para score cada dev project.
- Feedback loop: dashboard muestra "devs matches para JV" con phones/emails extraídos (zero cost marketing).
- Compliance: robots, rate, no personal data abuse, user consent for outreach.
- Extras: n8n/Langflow or relay dispatch para orquestar scrape + agent email/WA.
- Monitoreo: logs, count nuevos, alert si < X nuevos/semana.

## Próximos pasos recomendados (después fixes actuales)
1. Aprobar esta propuesta (fase 1 primero).
2. Implementar fase 1 en scraper_desarrolladores.py (basado en COLONIA_SEARCH_URLS + nuevos devs_urls list).
3. Correr, output a data/, copiar ~50 entries a terrenos_full.json (o nuevo devs.json cargado en dashboard).
4. Actualizar ValuacionDashboard: nueva sección "Desarrolladores matches" o filtro en DB tab, mostrar contactos para outreach (link a Agentes tab).
5. Commit + push + actualizar journal.
6. User provee más URLs de devs o feedback de corrida real.
7. Escalar a fase 2+ una vez DB real crezca (reduce sim, mejora hist/regresión naturalmente).

Esto alinea con roadmap (zero-cost first: outreach devs/JV, agents content), y con "nuevo scraper de real estate desarrolladores".

Datos actuales (1000) ya útiles pero concentrados por sim; devs reales darán variedad + contactos accionables.

Ejemplo output fase 1 esperado:
[
  {"dev_name": "Desarrollos Cimatario Partners", "project": "Residencial 4 niveles 12u", "size_m2": 1584, "units": 12, "phone": "+52 442 XXX XXXX", "source": "https://..."},
  ...
]

## Cambios entregados en este commit
- Ver commit link abajo.
- Fixes en ValuacionDashboard.tsx (ambas copias): counts 176->1000 dinámico, hist custom bins + explicación mercado, regression mejorada con modelLine ppm, mapa visual con pins approx + nota key.
- 3D FinObra integrado (después npm install three/r3f).
- Propuesta este doc.
- (Siguiente: scraper nuevo + journal update + push).

Para ejecutar propuesta: en PS admin (con python deps): cd cases/terreno-cimatario-queretaro ; python scraper_desarrolladores.py (crear el archivo basado en current scraper.py).

¡Listo para iterar!