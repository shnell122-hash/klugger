# /masterplan v13.1 — Backend de plataforma (DB + agente de ingesta + subida + búsqueda NL)

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador: Opus 4.8.
> **Track A, capa art-independiente.** Se ejecuta mientras el operador resuelve el arte (v13.0). Cubre la prioridad #1 (sitios de agentes + **subida** + **agente de ingesta**) y #2 (**búsqueda NL**) en su parte de **backend** — la UI/estilos esperan a diseño/arte.
> Entorno: **dev-2**, Postgres+pgvector en Docker (no hay Postgres nativo; Docker sí). App nueva en el repo klugger.

## Decisiones de arranque (defaults razonables, el operador ajusta al volver)
- **DB:** `pgvector/pgvector:pg16` en Docker, bind a `127.0.0.1:5433` (no expuesto). Password → Infisical `KLUGGER_DB_URL`.
- **Ingesta VLM:** usa `tools/gemini_ingest.py` (fallback free→paga). El **agente de ingesta** toma fotos + texto de un listado → extrae campos estructurados → normaliza → Postgres.
- **Embeddings NL:** Gemini `text-embedding-004` (768-dim) → columna `vector(768)` en `properties`.
- **App:** Next.js multi-tenant nueva (`app-agentes/` o rutas nuevas) — el scaffold viene después de tokens/diseño; el backend (DB + servicios de ingesta) no lo necesita.

## Esquema (v1)
- **agents**(id, name, email, phone, slug/subdominio, plan, created_at)
- **properties**(id, agent_id FK, title, description, price, currency, operation venta/renta, property_type, size_m2, land_m2, bedrooms, bathrooms, parking, address, colonia, municipio, estado, lat, lng, amenities jsonb, photos jsonb, source, status, raw_ingest jsonb, embedding vector(768), created_at, updated_at)
- **users**(compradores) — diferido
- Índices: `ivfflat`/`hnsw` sobre `embedding` para NL; btree en agent_id, colonia, price.

## Tabla de tareas

| # | Tarea → Subtareas | Owner/Modelo | Ola | Deps | Verificación |
|---|-------------------|--------------|-----|------|--------------|
| **1** | **Provisionar Postgres+pgvector** (Docker en dev-2, 127.0.0.1:5433) + `CREATE EXTENSION vector` + password a Infisical `KLUGGER_DB_URL` | **TÚ** (infra/secreto) | 1 | — | `SELECT version()` + `vector` extension activa; URL en Infisical |
| **2** | **Migración de esquema v1** (`db/migrations/001_init.sql`) — agents/properties + índices + pgvector | **TÚ** + Sonnet | 1 | 1 | tablas creadas; índice vectorial existe |
| **3** | **Agente de ingesta VLM** (`ingest/agent.py`): entrada = fotos(URLs/archivos)+texto libre → `gemini_ingest` extrae {precio, m², recámaras, baños, tipo, operación, ubicación, amenidades} en JSON estricto (schema) → normaliza (parse precio/m², geocode opcional) → inserta en `properties` con `raw_ingest`. **Que funcione bien = la prioridad.** | **TÚ** (keys) + Sonnet | 2 | 2 | sube ≥1 inmueble real de prueba → registro limpio y correcto en DB |
| **4** | **Embeddings + búsqueda NL** (`nl/embed.py` + `nl/search.py`): al insertar, generar embedding del texto del inmueble; búsqueda = embed(consulta) → `ORDER BY embedding <=> q LIMIT k` + filtros (precio/colonia) | **SONNET** + TÚ (keys) | 3 | 3 | consulta NL ("depto 2 recámaras en Cimatario < $3M") devuelve inmuebles relevantes |
| **5** | **API de subida** (endpoint que recibe fotos+texto del agente → dispara ingesta) — mínimo, sin UI | **SONNET** | 3 ∥ | 3 | POST con un listado → 201 + registro en DB |
| **6** | **Wire a la app** (cuando exista el scaffold de diseño): la UI de subida llama al endpoint | **SONNET** | final | 5, v13.0 | (bloqueado por diseño/arte) |

## Reglas de paralelización
- Ola 1: infra DB (TÚ) → esquema. Ola 2: agente de ingesta (núcleo). Ola 3: NL search ∥ API de subida.
- Infra/DB/keys/secretos = orquestador. La tarea 6 (UI) espera a v13.0 (diseño/arte del operador).

## Gate de smoke tests
1. Postgres+pgvector responde; extensión `vector` activa; `KLUGGER_DB_URL` en Infisical.
2. Esquema v1 creado con índice vectorial.
3. Agente de ingesta: 1 listado real → registro correcto (precio/m²/tipo/ubicación bien parseados) en `properties`.
4. Búsqueda NL devuelve inmuebles relevantes a una consulta en lenguaje natural.
5. API de subida acepta un listado y lo persiste.

## Pendientes del operador
- Confirmar dónde vive la app Next.js (default: nueva en repo klugger) y el dominio de subdominios de agentes.
- Aprobar el esquema v1 (campos de inmueble) o pedir campos extra.
- Diseño/arte (v13.0) desbloquea la UI de subida (tarea 6).
- (Futuro) política de datos: los datos de inmuebles de clientes NO pasan por el free tier de Gemini (`allow_free=False` en la ingesta privada).
