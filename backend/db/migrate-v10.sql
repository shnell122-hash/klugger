-- AI Monitoring — Schema migration v10
-- Agrega tablas para monitoreo de gasto real de Claude Platform (Admin API).
-- Run on VPS: mysql -u root -pVilarRoot2026! ai_monitoring < backend/db/migrate-v10.sql

USE ai_monitoring;

-- Uso real por período/modelo (datos de Anthropic Admin API)
CREATE TABLE IF NOT EXISTS platform_usage (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  fetched_at            DATETIME(3) NOT NULL DEFAULT NOW(3),
  period_start          DATETIME NOT NULL,
  period_end            DATETIME NOT NULL,
  granularity           VARCHAR(16) NOT NULL DEFAULT 'hour',
  model                 VARCHAR(64),
  workspace_id          VARCHAR(128),
  workspace_name        VARCHAR(128),
  input_tokens          BIGINT NOT NULL DEFAULT 0,
  output_tokens         BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens     BIGINT NOT NULL DEFAULT 0,
  cache_creation_tokens BIGINT NOT NULL DEFAULT 0,
  cost_usd              DECIMAL(12,6) NOT NULL DEFAULT 0,
  INDEX idx_period  (period_start, granularity),
  INDEX idx_model   (model),
  INDEX idx_fetched (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Presupuestos y umbrales de alerta configurables
CREATE TABLE IF NOT EXISTS platform_budget (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  period        VARCHAR(16) NOT NULL UNIQUE,
  threshold_usd DECIMAL(10,4) NOT NULL,
  updated_at    DATETIME(3) DEFAULT NOW(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO platform_budget (period, threshold_usd) VALUES
  ('hour',  5.00),
  ('day',   20.00),
  ('month', 200.00)
ON DUPLICATE KEY UPDATE threshold_usd = VALUES(threshold_usd);

-- Alertas de presupuesto disparadas
CREATE TABLE IF NOT EXISTS platform_budget_alerts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  period          VARCHAR(16) NOT NULL,
  threshold_usd   DECIMAL(10,4) NOT NULL,
  actual_usd      DECIMAL(12,6) NOT NULL,
  model_breakdown TEXT,
  fired_at        DATETIME(3) DEFAULT NOW(3),
  acknowledged    TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'Migration v10 complete — platform_usage, platform_budget, platform_budget_alerts' AS status;
