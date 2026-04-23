-- migrate-v11.sql — Audit log for API key changes via dashboard
-- Run: mysql -u root -p ai_monitoring < backend/db/migrate-v11.sql

CREATE TABLE IF NOT EXISTS key_changes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  key_name   VARCHAR(100) NOT NULL,
  changed_by VARCHAR(100) DEFAULT 'dashboard',
  ip_address VARCHAR(45)  DEFAULT NULL,
  changed_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_key_name  (key_name),
  INDEX idx_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
