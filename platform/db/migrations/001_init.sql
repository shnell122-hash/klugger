-- Klugger plataforma — esquema v1 (Postgres 16 + pgvector)
-- Aplicado en dev-2 contenedor klugger-pg (127.0.0.1:5433). Conexión en Infisical: KLUGGER_DB_URL.
-- Cubre: agentes inmobiliarios + inventario de inmuebles + embeddings para búsqueda NL.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agentes inmobiliarios (multi-tenant: cada uno con su slug/subdominio)
CREATE TABLE IF NOT EXISTS agents (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text NOT NULL,
  email      text UNIQUE,
  phone      text,
  slug       text UNIQUE NOT NULL,          -- subdominio del agente
  plan       text DEFAULT 'free',
  created_at timestamptz DEFAULT now()
);

-- Inventario de inmuebles
CREATE TABLE IF NOT EXISTS properties (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      uuid REFERENCES agents(id) ON DELETE CASCADE,
  title         text,
  description   text,
  price         numeric,
  currency      text DEFAULT 'MXN',
  operation     text,                        -- venta | renta
  property_type text,                        -- casa | departamento | terreno | ...
  size_m2       numeric,                      -- construcción
  land_m2       numeric,                      -- terreno
  bedrooms      int,
  bathrooms     numeric,
  parking       int,
  address       text,
  colonia       text,
  municipio     text,
  estado        text,
  lat           double precision,
  lng           double precision,
  amenities     jsonb DEFAULT '[]'::jsonb,
  photos        jsonb DEFAULT '[]'::jsonb,    -- URLs
  source        text DEFAULT 'agent_upload',  -- agent_upload | scrape
  status        text DEFAULT 'active',
  raw_ingest    jsonb,                         -- salida cruda del agente de ingesta (VLM)
  embedding     vector(768),                   -- text-embedding-004 para búsqueda NL
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prop_agent     ON properties(agent_id);
CREATE INDEX IF NOT EXISTS idx_prop_colonia   ON properties(colonia);
CREATE INDEX IF NOT EXISTS idx_prop_price     ON properties(price);
CREATE INDEX IF NOT EXISTS idx_prop_embedding ON properties USING hnsw (embedding vector_cosine_ops);

-- TODO (diferido): users (compradores) + alertas guardadas para el buscador NL.
