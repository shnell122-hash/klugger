-- AI Monitoring — Schema migration v5
-- Adds chat_source to agent_sessions (fixes 0-sessions bug in dashboard)
-- Widens tool summaries to MEDIUMTEXT for full expandable outputs
-- MySQL 5.7+ compatible — all changes wrapped in IF NOT EXISTS checks
-- Run on VPS: mysql -u root -p ai_monitoring < backend/db/migrate-v5.sql

USE ai_monitoring;

DROP PROCEDURE IF EXISTS migrate_v5;
DELIMITER $$
CREATE PROCEDURE migrate_v5()
BEGIN
  -- Add chat_source to agent_sessions
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'agent_sessions'
      AND COLUMN_NAME  = 'chat_source'
  ) THEN
    ALTER TABLE agent_sessions
      ADD COLUMN chat_source VARCHAR(128) DEFAULT NULL
      AFTER api_provider;
  END IF;

  -- Index on chat_source
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'agent_sessions'
      AND INDEX_NAME   = 'idx_chat_source'
  ) THEN
    ALTER TABLE agent_sessions ADD INDEX idx_chat_source (chat_source);
  END IF;

  -- Widen tool_input_summary to MEDIUMTEXT (was TEXT → 64KB, now 16MB)
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'agent_events'
      AND COLUMN_NAME  = 'tool_input_summary'
      AND DATA_TYPE    = 'text'
  ) THEN
    ALTER TABLE agent_events
      MODIFY COLUMN tool_input_summary    MEDIUMTEXT,
      MODIFY COLUMN tool_response_summary MEDIUMTEXT;
  END IF;
END$$
DELIMITER ;
CALL migrate_v5();
DROP PROCEDURE IF EXISTS migrate_v5;

SELECT 'Migration v5 complete — chat_source added, MEDIUMTEXT widened' AS status;
