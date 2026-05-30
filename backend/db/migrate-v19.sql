-- migrate-v19.sql — Índices para /api/relay/dispatch (latencia 637ms → <200ms)
-- Safe: CREATE INDEX IF NOT EXISTS no falla si ya existen

CREATE INDEX IF NOT EXISTS idx_dispatch_status_created
  ON dispatch_tasks(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dispatch_project_created
  ON dispatch_tasks(project, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dispatch_completed
  ON dispatch_tasks(completed_at DESC);
