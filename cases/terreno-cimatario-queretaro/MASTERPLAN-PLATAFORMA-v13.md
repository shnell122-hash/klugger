# /masterplan v13 — Plataforma Klugger: sitios de agentes + subida + ingesta + DB + estilos por usuario

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador: Opus 4.8.
> **Track A** (∥ v12). Greenfield: **app nueva en el repo klugger** (Next.js multi-tenant), no repo aparte (per decisión de operador y `estudioPROPTECH.md §E` monolito modular).
> Prioridad del operador: **#1 sitios de agentes + subida de inmuebles + agente de ingesta** (los agentes quieren subir sus bienes YA; personalización mínima aceptable), luego **#2 búsqueda NL**.

## Prerequisito — v13.0 Masterplan de diseño (BLOQUEA la construcción de UI)

Antes de construir la UI, **investigación de arte/diseño/estilos/colores/tipografía por tipo de usuario + evaluación del brandbook Klugger**.

- **Brandbook** (Drive, `Klugger -.pdf`, 2017): logo **zorro** (inteligencia/audacia/seguridad), **degradado verde→azul** + textura suave, **minimalista**, tipografías **Nexa Black** (marca) + **Open Sans** (secundaria).
- **Pendiente de ingesta multimodal (Gemini Flash):** valores exactos de color (Pantone/CMYK/RGB) + aplicaciones — la extracción de texto los pierde. **Gate:** compartir el PDF por link, o Gemini CLI con OAuth a Google Workspace.
- **Estilos por audiencia (requisito de operador):** valuaciones = oscuro (se mantiene) · desarrolladores/insights = **toggle día/noche estilo Claude** · **personas físicas = versión clara y amigable** (animaciones, arte, elementos de ciudad/equipamiento/valuación).
- **Salida v13.0:** sistema de theming por tenant (tokens de color, tipografía, componentes) + guía de estilo por segmento, anclado al brandbook.

## Tabla de tareas

| # | Tarea | Owner/Modelo | Ola | Deps | Verificación |
|---|-------|--------------|-----|------|--------------|
| **13.0** | **Masterplan de diseño** (investigación estilos/colores/tipografía por usuario + eval brandbook via Gemini Flash) → design tokens + guía | **OPUS** (dir) + agentes de research + Gemini Flash (brandbook) | 0 | brandbook accesible | tokens + guía por segmento; colores exactos del brandbook |
| **13.1** | **DB: Postgres + pgvector** (schema: agentes, inmuebles, usuarios, fotos JSONB; pgvector para NL) | **TÚ** (infra) + Sonnet | 0 ∥ | — | DB corriendo; migraciones; pgvector activo |
| **13.2** | **Scaffold app Next.js multi-tenant** en repo klugger (subdominios por agente, wildcard SSL Caddy/Traefik en Hetzner) | **SONNET** | 1 | 13.1 | app arranca; ruteo por subdominio |
| **13.3** | **Agente de ingesta VLM** (Gemini Flash visión): el agente sube fotos/ficha → extrae/normaliza inmueble → DB. **Que funcione bien es la prioridad.** | **TÚ** (keys) + Sonnet | 1 | 13.1 | sube inmueble real → queda estructurado en DB (dedup, campos) |
| **13.4** | **UI de subida + sitio del agente** (personalización mínima, buen servicio) con theming de 13.0 | **SONNET** + Haiku | 2 | 13.0, 13.2, 13.3 | agente sube y ve su inmueble publicado en su subdominio |
| **13.5** | **Búsqueda NL** (pgvector + embeddings multilingües es) sobre el inventario | **SONNET** + Opus (diseño) | 3 | 13.1, 13.4 | consulta en lenguaje natural devuelve inmuebles relevantes |

## Reglas de paralelización
- Ola 0: **13.0 (diseño) ∥ 13.1 (DB)** — disjuntos. 13.0 bloquea la UI (13.4), no la DB/ingesta.
- La ingesta (13.3) puede avanzar sin el theming; la UI final (13.4) espera 13.0.
- Infra/DB/keys/deploy = orquestador. Multi-tenant y wildcard SSL = orquestador.

## Gate de smoke tests
1. Design tokens + guía por segmento (con colores exactos del brandbook).
2. Postgres+pgvector corriendo; schema de inmuebles/agentes.
3. Un agente real sube ≥1 inmueble vía el agente de ingesta → queda limpio en DB.
4. El inmueble aparece en el subdominio del agente.
5. Búsqueda NL devuelve resultados relevantes.

## Pendientes del operador
- **Compartir el brandbook** por link (o autorizar Gemini CLI OAuth) para el pase de color exacto — **bloquea 13.0 → 13.4**.
- Decidir dominio definitivo (`klugger.mx` vs `kluger.mx`) — afecta subdominios de agentes.
- Confirmar hosting (Hetzner recomendado por costo vs Vercel).
- **Domingo:** definir qué parte del roadmap se delega en el handoff a agentes.
