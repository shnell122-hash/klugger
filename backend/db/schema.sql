-- AI Agent Monitoring — Database Schema
-- Run once: mysql -u root -p < backend/db/schema.sql

CREATE DATABASE IF NOT EXISTS ai_monitoring
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ai_monitoring;

-- -------------------------------------------------------
-- Agent sessions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_sessions (
  id                      VARCHAR(128) PRIMARY KEY,
  started_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at                DATETIME(3) NULL,
  working_dir             VARCHAR(512),
  agent_user              VARCHAR(64),
  total_input_tokens      INT          NOT NULL DEFAULT 0,
  total_output_tokens     INT          NOT NULL DEFAULT 0,
  total_cache_read_tokens INT          NOT NULL DEFAULT 0,
  total_cache_write_tokens INT         NOT NULL DEFAULT 0,
  total_cost_usd          DECIMAL(12,8) NOT NULL DEFAULT 0,
  tool_call_count         INT          NOT NULL DEFAULT 0,
  is_active               TINYINT(1)   NOT NULL DEFAULT 1,
  INDEX idx_started (started_at),
  INDEX idx_active  (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------
-- Individual tool call events
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_events (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id            VARCHAR(128)  NOT NULL,
  event_type            ENUM('pre_tool','post_tool','stop') NOT NULL,
  tool_name             VARCHAR(64),
  tool_input_summary    TEXT,
  tool_response_summary TEXT,
  duration_ms           INT           NULL,
  timestamp             DATETIME(3)   NOT NULL,
  working_dir           VARCHAR(512),
  agent_user            VARCHAR(64),
  estimated_tokens      INT           NOT NULL DEFAULT 0,
  estimated_cost_usd    DECIMAL(12,8) NOT NULL DEFAULT 0,
  INDEX idx_session   (session_id),
  INDEX idx_ts        (timestamp),
  INDEX idx_tool      (tool_name),
  CONSTRAINT fk_session FOREIGN KEY (session_id)
    REFERENCES agent_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------
-- Hourly cost aggregates (for charts)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS cost_hourly (
  hour_bucket         DATETIME    PRIMARY KEY,  -- truncated to hour
  event_count         INT         NOT NULL DEFAULT 0,
  session_count       INT         NOT NULL DEFAULT 0,
  total_cost_usd      DECIMAL(12,6) NOT NULL DEFAULT 0,
  total_input_tokens  INT         NOT NULL DEFAULT 0,
  total_output_tokens INT         NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
