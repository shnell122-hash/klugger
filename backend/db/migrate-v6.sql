-- AI Monitoring — Schema migration v6
-- Adds relay_alerts table for commit quality, session yield, and deploy verification alerts
-- Run: sudo mysql ai_monitoring < backend/db/migrate-v6.sql

USE ai_monitoring;

CREATE TABLE IF NOT EXISTS relay_alerts (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  created_at   DATETIME(3) DEFAULT NOW(3),
  alert_type   VARCHAR(50)  NOT NULL,
  project_id   VARCHAR(64)  DEFAULT NULL,
  severity     VARCHAR(20)  NOT NULL DEFAULT 'warning',
  title        VARCHAR(255) NOT NULL,
  details      TEXT,
  auto_fixed   TINYINT(1)   NOT NULL DEFAULT 0,
  resolved     TINYINT(1)   NOT NULL DEFAULT 0,
  resolved_at  DATETIME(3)  DEFAULT NULL,
  INDEX idx_alerts_created  (created_at),
  INDEX idx_alerts_project  (project_id),
  INDEX idx_alerts_resolved (resolved),
  INDEX idx_alerts_type     (alert_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'Migration v6 complete — relay_alerts table created' AS status;
