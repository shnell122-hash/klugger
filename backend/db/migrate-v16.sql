-- migrate-v16.sql — Add `resumed` flag to agent_sessions
-- Tracks whether a relay task reused an existing Claude --resume session
-- Run: mysql -u root -p"$DB_PASS" ai_monitoring < backend/db/migrate-v16.sql

ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS resumed TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;

CREATE INDEX IF NOT EXISTS idx_sessions_resumed ON agent_sessions (resumed, started_at);
