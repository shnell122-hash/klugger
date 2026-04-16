-- AI Monitoring — Schema migration
-- Run on VPS: mysql -u root -p ai_monitoring < backend/db/migrate-v3.sql

USE ai_monitoring;

-- Add missing columns to agent_events if not present
ALTER TABLE agent_events
  MODIFY COLUMN event_type VARCHAR(32) NOT NULL DEFAULT 'pre_tool';

-- Add missing columns to agent_sessions if not present
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS project_name  VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS api_provider  VARCHAR(32)  NOT NULL DEFAULT 'anthropic';

-- Add index if missing
ALTER TABLE agent_sessions
  ADD INDEX IF NOT EXISTS idx_project  (project_name),
  ADD INDEX IF NOT EXISTS idx_provider (api_provider);

-- Add coordinator + fiscalai-front to projects table
INSERT IGNORE INTO projects (id, name, github_repo, url, branch, is_active) VALUES
  ('coordinator',   'Orquestador Central',   'vilarkptl-lang/agentic-repo', 'http://ia.vilarkptl.com', 'claude/agent-monitoring-dashboard-4v8iq', 1),
  ('fiscalai-front','FiscalAI — Frontend',   'vilarkptl-lang/ryby.lease',   'https://fiscalai.mx',     'claude/ml-backend-69bis-module-5iap0',    1);

-- Update existing projects to active
UPDATE projects SET is_active = 1 WHERE id IN ('ai-monitor','fiscalai');

SELECT 'Migration complete' AS status;
