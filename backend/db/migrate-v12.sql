-- AI Monitoring — Schema migration v12
-- Multi-account Anthropic tracking + per-project monthly budgets ($100/project)
-- Run: mysql -u root -pVilarRoot2026! ai_monitoring < backend/db/migrate-v12.sql

USE ai_monitoring;

-- ── Cuentas Anthropic (multi-cuenta) ─────────────────────────────────────────
-- Cada cuenta tiene su Admin API key en una variable de entorno separada
CREATE TABLE IF NOT EXISTS anthropic_accounts (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  email        VARCHAR(128) NOT NULL UNIQUE,
  env_key      VARCHAR(64)  NOT NULL,   -- nombre de la var de entorno con la Admin API key
  billing_day  TINYINT      NOT NULL DEFAULT 1,  -- día del mes que inicia el ciclo de facturación
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  notes        VARCHAR(256),
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO anthropic_accounts (email, env_key, billing_day, notes) VALUES
  ('vilarkptl@gmail.com',    'ANTHROPIC_ADMIN_KEY',              1, 'Cuenta principal — ai-monitor, fiscalai'),
  ('gva.server@gmail.com',   'ANTHROPIC_ADMIN_KEY_GVA',          1, 'Servidor GVA'),
  ('leasingagata@gmail.com', 'ANTHROPIC_ADMIN_KEY_LEASINGAGATA', 1, 'Leasing Agata')
ON DUPLICATE KEY UPDATE billing_day=VALUES(billing_day), env_key=VALUES(env_key), is_active=1;

-- ── Añadir columna account_email a platform_usage ────────────────────────────
-- NULL = datos de cuenta única (pre-v12) o cuenta no identificada
ALTER TABLE platform_usage
  ADD COLUMN IF NOT EXISTS account_email VARCHAR(128) DEFAULT NULL;

-- Índice solo si no existe (MariaDB 10.5+ / MySQL 8.0+ syntax)
ALTER TABLE platform_usage
  ADD INDEX IF NOT EXISTS idx_account (account_email);

-- ── Presupuesto mensual por proyecto ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_monthly_budget (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  project_name VARCHAR(128) NOT NULL UNIQUE,
  budget_usd   DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  kill_enabled TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at   DATETIME(3)  DEFAULT NOW(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO project_monthly_budget (project_name, budget_usd) VALUES
  ('coordinator',    100.00),
  ('fiscalai',       100.00),
  ('fiscalai-front', 100.00),
  ('ai-monitor',     100.00),
  ('financial-bot',  100.00),
  ('kptl-credito',   100.00),
  ('vilar-legal-os', 100.00)
ON DUPLICATE KEY UPDATE budget_usd=VALUES(budget_usd);

-- ── Alertas de presupuesto mensual por proyecto ───────────────────────────────
CREATE TABLE IF NOT EXISTS project_budget_alerts (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  project_name VARCHAR(128) NOT NULL,
  budget_usd   DECIMAL(10,2) NOT NULL,
  actual_usd   DECIMAL(12,6) NOT NULL,
  fired_at     DATETIME(3)  DEFAULT NOW(3),
  acknowledged TINYINT(1)   DEFAULT 0,
  INDEX idx_project (project_name),
  INDEX idx_fired   (fired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'Migration v12 complete — anthropic_accounts, project_monthly_budget, project_budget_alerts, platform_usage.account_email' AS status;
