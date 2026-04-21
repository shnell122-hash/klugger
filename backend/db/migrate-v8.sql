-- AI Monitoring — Schema migration v8
-- Adds code_reviews table for relay/code-reviewer.js (DeepSeek automated reviews)
-- Run on VPS: mysql -u root -p ai_monitoring < backend/db/migrate-v8.sql

USE ai_monitoring;

DROP PROCEDURE IF EXISTS migrate_v8;
DELIMITER $$
CREATE PROCEDURE migrate_v8()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'code_reviews'
  ) THEN
    CREATE TABLE code_reviews (
      id             INT          AUTO_INCREMENT PRIMARY KEY,
      commit_hash    VARCHAR(40)  NOT NULL,
      commit_message TEXT,
      diff_summary   TEXT,
      review_result  MEDIUMTEXT,
      severity       ENUM('ok','warning','error') NOT NULL DEFAULT 'ok',
      reviewed_at    DATETIME(3)  DEFAULT NOW(3),
      INDEX idx_severity    (severity),
      INDEX idx_reviewed_at (reviewed_at),
      INDEX idx_commit      (commit_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;
END$$
DELIMITER ;
CALL migrate_v8();
DROP PROCEDURE IF EXISTS migrate_v8;

SELECT 'Migration v8 complete — code_reviews table created' AS status;
