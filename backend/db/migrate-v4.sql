-- AI Monitoring — Schema migration v4
-- Adds dispatch_tasks table for multi-agent coordination tracking
-- MySQL 5.7+ compatible
-- Run: mysql -u root -p ai_monitoring < backend/db/migrate-v4.sql

USE ai_monitoring;

CREATE TABLE IF NOT EXISTS dispatch_tasks (
  id             VARCHAR(64)   NOT NULL PRIMARY KEY,
  parent_id      VARCHAR(64)   NULL,
  project        VARCHAR(64)   NOT NULL,
  title          VARCHAR(256)  NULL,
  task           TEXT          NOT NULL,
  requester      VARCHAR(128)  NOT NULL DEFAULT 'api',
  depth          TINYINT       NOT NULL DEFAULT 0,
  status         VARCHAR(20)   NOT NULL DEFAULT 'pending',
  -- 'pending' | 'dispatched' | 'running' | 'completed' | 'failed' | 'timeout'
  plan_items     TEXT          NULL,   -- JSON array of planned steps
  result_items   TEXT          NULL,   -- JSON array of {item, status}
  screenshot_url VARCHAR(512)  NULL,
  exit_code      INT           NULL,
  duration_sec   INT           NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dispatched_at  DATETIME      NULL,
  completed_at   DATETIME      NULL,
  INDEX idx_parent  (parent_id),
  INDEX idx_project (project),
  INDEX idx_status  (status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'Migration v4 complete — dispatch_tasks created' AS status;
