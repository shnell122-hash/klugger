-- AI Monitoring — Schema migration v9
-- Adds cache_read_tokens + cache_write_tokens to conversations table.
-- These come from Anthropic's usage.cache_read_input_tokens /
-- usage.cache_creation_input_tokens and enable dashboard cache efficiency tracking.
-- Run on VPS: mysql -u root -pVilarRoot2026! ai_monitoring < backend/db/migrate-v9.sql

USE ai_monitoring;

DROP PROCEDURE IF EXISTS migrate_v9;
DELIMITER $$
CREATE PROCEDURE migrate_v9()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'conversations'
      AND COLUMN_NAME  = 'cache_read_tokens'
  ) THEN
    ALTER TABLE conversations
      ADD COLUMN cache_read_tokens  INT NOT NULL DEFAULT 0,
      ADD COLUMN cache_write_tokens INT NOT NULL DEFAULT 0;
  END IF;
END$$
DELIMITER ;
CALL migrate_v9();
DROP PROCEDURE IF EXISTS migrate_v9;

SELECT 'Migration v9 complete — cache_read_tokens + cache_write_tokens added to conversations' AS status;
