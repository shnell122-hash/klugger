-- AI Monitoring — Schema migration v11
-- Kill-switch persistente + costos históricos por proveedor/proyecto/key
-- Run: mysql -u root -pVilarRoot2026! ai_monitoring < backend/db/migrate-v11.sql

USE ai_monitoring;

-- Estado persistente del sistema (key-value genérico)
CREATE TABLE IF NOT EXISTS system_state (
  `key`       VARCHAR(64) NOT NULL PRIMARY KEY,
  `value`     TEXT,
  updated_at  DATETIME(3) DEFAULT NOW(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Umbral de kill diario por proveedor (Anthropic, OpenAI, etc. + "total" para todos juntos)
CREATE TABLE IF NOT EXISTS provider_kill_threshold (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  provider      VARCHAR(32) NOT NULL UNIQUE,  -- 'total' | 'anthropic' | 'openai' | 'deepseek' | ...
  threshold_usd DECIMAL(10,4) NOT NULL,
  kill_enabled  TINYINT(1) NOT NULL DEFAULT 1,
  updated_at    DATETIME(3) DEFAULT NOW(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO provider_kill_threshold (provider, threshold_usd) VALUES
  ('total',      7.00),
  ('anthropic',  6.00),
  ('openai',     2.00),
  ('deepseek',   1.00),
  ('fal',        1.00),
  ('elevenlabs', 0.50)
ON DUPLICATE KEY UPDATE threshold_usd = VALUES(threshold_usd);

-- Snapshot diario de costos por proveedor/proyecto/key (persistencia histórica)
CREATE TABLE IF NOT EXISTS provider_daily_cost (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  date_bucket        DATE NOT NULL,
  provider           VARCHAR(32) NOT NULL,
  project_name       VARCHAR(128) NOT NULL DEFAULT '',
  api_key_masked     VARCHAR(16) DEFAULT NULL,
  estimated_cost_usd DECIMAL(12,6) NOT NULL DEFAULT 0,
  real_cost_usd      DECIMAL(12,6) NOT NULL DEFAULT 0,
  input_tokens       BIGINT NOT NULL DEFAULT 0,
  output_tokens      BIGINT NOT NULL DEFAULT 0,
  event_count        INT NOT NULL DEFAULT 0,
  snapped_at         DATETIME(3) DEFAULT NOW(3),
  UNIQUE KEY uk_day_prov_proj (date_bucket, provider, project_name),
  INDEX idx_date     (date_bucket),
  INDEX idx_provider (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Alertas de kill-switch disparadas (por proveedor)
CREATE TABLE IF NOT EXISTS provider_kill_alerts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  provider      VARCHAR(32) NOT NULL,
  threshold_usd DECIMAL(10,4) NOT NULL,
  actual_usd    DECIMAL(12,6) NOT NULL,
  fired_at      DATETIME(3) DEFAULT NOW(3),
  acknowledged  TINYINT(1) DEFAULT 0,
  INDEX idx_fired (fired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'Migration v11 complete — system_state, provider_kill_threshold, provider_daily_cost, provider_kill_alerts' AS status;
