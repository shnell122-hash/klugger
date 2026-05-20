-- migrate-v15.sql — Costos reales por proveedor API (DeepSeek, Gemini, Grok, etc.)
-- Claude CLI via Max subscription registra $0 (no es cobro real).

CREATE TABLE IF NOT EXISTS provider_costs (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  ts           DATETIME DEFAULT CURRENT_TIMESTAMP,
  provider     VARCHAR(32)    NOT NULL  COMMENT 'deepseek, gemini, grok, anthropic-api',
  model        VARCHAR(64)    NOT NULL  DEFAULT '',
  project_id   VARCHAR(64)    NOT NULL  DEFAULT '',
  input_tokens INT            NOT NULL  DEFAULT 0,
  output_tokens INT           NOT NULL  DEFAULT 0,
  cost_usd     DECIMAL(12,8)  NOT NULL  DEFAULT 0,
  INDEX idx_ts        (ts),
  INDEX idx_provider  (provider),
  INDEX idx_project   (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
