-- migrate-v17.sql — Add result_summary + quality metrics to dispatch_tasks
-- Compatible with MySQL 5.7+ and MariaDB 10.x
-- Run: mysql -u root -p"$DB_PASS" ai_monitoring < backend/db/migrate-v17.sql

ALTER TABLE dispatch_tasks
  ADD COLUMN result_summary TEXT NULL AFTER result_items;

ALTER TABLE dispatch_tasks
  ADD COLUMN files_changed SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER result_summary;

ALTER TABLE dispatch_tasks
  ADD COLUMN commits_made SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER files_changed;
