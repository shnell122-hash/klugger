-- AI Agent Monitoring — Database Schema v2
-- Run: mysql -u root -p < backend/db/schema.sql

CREATE DATABASE IF NOT EXISTS ai_monitoring
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ai_monitoring;

-- -------------------------------------------------------
-- API Providers (Anthropic, OpenAI, DeepSeek, FAL, ElevenLabs…)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_providers (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  provider              VARCHAR(32)    NOT NULL,       -- anthropic|openai|deepseek|fal|elevenlabs
  project_name          VARCHAR(128),                  -- e.g. "FiscalAI", "DeCabeceraTax"
  api_key_masked        VARCHAR(64),                   -- last 6 chars only, never full key
  cost_per_input_token  DECIMAL(16,12) DEFAULT 0,      -- USD per token
  cost_per_output_token DECIMAL(16,12) DEFAULT 0,
  cost_per_request      DECIMAL(12,8)  DEFAULT 0,      -- for flat-rate APIs (ElevenLabs chars)
  monthly_limit_usd     DECIMAL(10,2)  DEFAULT 0,      -- 0 = no limit
  is_active             TINYINT(1)     NOT NULL DEFAULT 1,
  created_at            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_provider (provider),
  INDEX idx_project  (project_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default providers
INSERT IGNORE INTO api_providers
  (id, provider, project_name, api_key_masked, cost_per_input_token, cost_per_output_token)
VALUES
  (1, 'anthropic',   NULL, NULL, 0.000003000000, 0.000015000000),
  (2, 'openai',      NULL, NULL, 0.000002500000, 0.000010000000),
  (3, 'deepseek',    NULL, NULL, 0.000000270000, 0.000001100000),
  (4, 'fal',         NULL, NULL, 0,              0),
  (5, 'elevenlabs',  NULL, NULL, 0,              0);

-- -------------------------------------------------------
-- Agent sessions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_sessions (
  id                       VARCHAR(128)   PRIMARY KEY,
  started_at               DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at                 DATETIME(3)    NULL,
  working_dir              VARCHAR(512),
  agent_user               VARCHAR(64),
  project_name             VARCHAR(128),
  api_provider             VARCHAR(32)    NOT NULL DEFAULT 'anthropic',
  total_input_tokens       INT            NOT NULL DEFAULT 0,
  total_output_tokens      INT            NOT NULL DEFAULT 0,
  total_cache_read_tokens  INT            NOT NULL DEFAULT 0,
  total_cache_write_tokens INT            NOT NULL DEFAULT 0,
  total_cost_usd           DECIMAL(12,8)  NOT NULL DEFAULT 0,
  tool_call_count          INT            NOT NULL DEFAULT 0,
  is_active                TINYINT(1)     NOT NULL DEFAULT 1,
  INDEX idx_started  (started_at),
  INDEX idx_active   (is_active),
  INDEX idx_provider (api_provider),
  INDEX idx_project  (project_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------
-- Individual tool call events
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_events (
  id                    BIGINT         AUTO_INCREMENT PRIMARY KEY,
  session_id            VARCHAR(128)   NOT NULL,
  event_type            ENUM('pre_tool','post_tool','stop') NOT NULL,
  tool_name             VARCHAR(64),
  tool_input_summary    TEXT,
  tool_response_summary TEXT,
  duration_ms           INT            NULL,
  timestamp             DATETIME(3)    NOT NULL,
  working_dir           VARCHAR(512),
  agent_user            VARCHAR(64),
  project_name          VARCHAR(128),
  api_provider          VARCHAR(32)    NOT NULL DEFAULT 'anthropic',
  estimated_tokens      INT            NOT NULL DEFAULT 0,
  estimated_cost_usd    DECIMAL(12,8)  NOT NULL DEFAULT 0,
  INDEX idx_session  (session_id),
  INDEX idx_ts       (timestamp),
  INDEX idx_tool     (tool_name),
  INDEX idx_provider (api_provider),
  INDEX idx_project  (project_name),
  CONSTRAINT fk_session FOREIGN KEY (session_id)
    REFERENCES agent_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------
-- -------------------------------------------------------
-- Projects registry (mirrors relay/projects.json in DB)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id           VARCHAR(64)   PRIMARY KEY,
  name         VARCHAR(128)  NOT NULL,
  github_repo  VARCHAR(256),
  url          VARCHAR(256),
  branch       VARCHAR(128),
  is_active    TINYINT(1)    NOT NULL DEFAULT 0,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed from projects.json
INSERT IGNORE INTO projects (id, name, github_repo, url, branch, is_active)
VALUES
  ('ai-monitor',            'AI Monitor',                  'vilarkptl-lang/agentic-repo', 'http://ia.vilarkptl.com',       'claude/agent-monitoring-dashboard-4v8iq', 1),
  ('fiscalai',              'FiscalAI / DeCabeceraTax',    'vilarkptl-lang/ryby.lease',   'https://fiscalai.mx',           'claude/ml-backend-69bis-module-5iap0',    1),
  ('credito',               'credito.vilarkptl.com',       NULL, 'https://credito.vilarkptl.com',  NULL, 0),
  ('voltic',                'voltic.mx',                   NULL, 'https://voltic.mx',              NULL, 0),
  ('ocr',                   'ocr.ryby.lease',              NULL, 'https://ocr.ryby.lease',         NULL, 0),
  ('tareas',                'tareas.ryby.lease',           NULL, 'https://tareas.ryby.lease',      NULL, 0),
  ('noticias',              'noticias.ryby.lease',         NULL, 'https://noticias.ryby.lease',    NULL, 0),
  ('telegram-inversiones',  'Telegram Bot Inversiones',    NULL, NULL,                             NULL, 0);

-- -------------------------------------------------------
-- Cost aggregates by hour + provider + project
-- -------------------------------------------------------
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS cost_hourly (
  hour_bucket          DATETIME      NOT NULL,
  api_provider         VARCHAR(32)   NOT NULL DEFAULT 'anthropic',
  project_name         VARCHAR(128)  NOT NULL DEFAULT '',
  event_count          INT           NOT NULL DEFAULT 0,
  session_count        INT           NOT NULL DEFAULT 0,
  total_cost_usd       DECIMAL(12,6) NOT NULL DEFAULT 0,
  total_input_tokens   INT           NOT NULL DEFAULT 0,
  total_output_tokens  INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (hour_bucket, api_provider, project_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
