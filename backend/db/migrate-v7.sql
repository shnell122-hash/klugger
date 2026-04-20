-- AI Monitoring — Schema migration v7
-- Adds conversations table for Telegram Claude chat bot (chat-agent.js)
-- Each row is one message turn, keyed by (chat_id, thread_id) = Telegram topic/DM
-- Includes per-message cost tracking and user identity for dashboard visibility
-- Run on VPS: mysql -u root -p ai_monitoring < backend/db/migrate-v7.sql

USE ai_monitoring;

DROP PROCEDURE IF EXISTS migrate_v7;
DELIMITER $$
CREATE PROCEDURE migrate_v7()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'conversations'
  ) THEN
    CREATE TABLE conversations (
      id                INT           AUTO_INCREMENT PRIMARY KEY,
      chat_id           BIGINT        NOT NULL,
      thread_id         INT           NOT NULL DEFAULT 0,
      telegram_user_id  BIGINT        DEFAULT NULL,
      telegram_username VARCHAR(64)   DEFAULT NULL,
      role              ENUM('user','assistant','tool') NOT NULL,
      content           MEDIUMTEXT    NOT NULL,
      tool_name         VARCHAR(64)   DEFAULT NULL,
      model             VARCHAR(64)   DEFAULT NULL,
      provider          VARCHAR(32)   NOT NULL DEFAULT 'anthropic',
      tokens_in         INT           DEFAULT 0,
      tokens_out        INT           DEFAULT 0,
      cost_usd          DECIMAL(10,6) DEFAULT 0,
      created_at        DATETIME(3)   DEFAULT NOW(3),
      INDEX idx_conv   (chat_id, thread_id, created_at),
      INDEX idx_user   (telegram_user_id, created_at),
      INDEX idx_recent (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;
END$$
DELIMITER ;
CALL migrate_v7();
DROP PROCEDURE IF EXISTS migrate_v7;

SELECT 'Migration v7 complete — conversations table created' AS status;
