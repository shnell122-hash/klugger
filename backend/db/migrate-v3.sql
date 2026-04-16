-- AI Monitoring — Schema migration v3
-- Compatible MySQL 5.7+
-- Run on VPS: mysql -u root -p ai_monitoring < backend/db/migrate-v3.sql

USE ai_monitoring;

-- Fix event_type: change from ENUM to VARCHAR so future values don't fail
ALTER TABLE agent_events
  MODIFY COLUMN event_type VARCHAR(32) NOT NULL DEFAULT 'pre_tool';

-- Add missing columns to agent_sessions (MySQL 5.7 compatible — use stored procedure)
DROP PROCEDURE IF EXISTS migrate_sessions;
DELIMITER $$
CREATE PROCEDURE migrate_sessions()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'agent_sessions'
      AND COLUMN_NAME = 'project_name'
  ) THEN
    ALTER TABLE agent_sessions ADD COLUMN project_name VARCHAR(128) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'agent_sessions'
      AND COLUMN_NAME = 'api_provider'
  ) THEN
    ALTER TABLE agent_sessions ADD COLUMN api_provider VARCHAR(32) NOT NULL DEFAULT 'anthropic';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'agent_sessions'
      AND INDEX_NAME = 'idx_project'
  ) THEN
    ALTER TABLE agent_sessions ADD INDEX idx_project (project_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'agent_sessions'
      AND INDEX_NAME = 'idx_provider'
  ) THEN
    ALTER TABLE agent_sessions ADD INDEX idx_provider (api_provider);
  END IF;
END$$
DELIMITER ;
CALL migrate_sessions();
DROP PROCEDURE IF EXISTS migrate_sessions;

-- Add new projects (safe with INSERT IGNORE)
INSERT IGNORE INTO projects (id, name, github_repo, url, branch, is_active) VALUES
  ('coordinator',    'Orquestador Central', 'vilarkptl-lang/agentic-repo', 'http://ia.vilarkptl.com', 'claude/agent-monitoring-dashboard-4v8iq', 1),
  ('fiscalai-front', 'FiscalAI — Frontend', 'vilarkptl-lang/ryby.lease',   'https://fiscalai.mx',     'claude/ml-backend-69bis-module-5iap0',    1);

UPDATE projects SET is_active = 1 WHERE id IN ('ai-monitor', 'fiscalai');

SELECT 'Migration v3 complete' AS status;
