-- migrate-v17.sql — Add result_summary + quality metrics to dispatch_tasks
-- Tracks what the agent actually produced (files changed, commits made)
-- Run: mysql -u root -p"$DB_PASS" ai_monitoring < backend/db/migrate-v17.sql

ALTER TABLE dispatch_tasks
  ADD COLUMN IF NOT EXISTS result_summary TEXT NULL AFTER result_items,
  ADD COLUMN IF NOT EXISTS files_changed   SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER result_summary,
  ADD COLUMN IF NOT EXISTS commits_made    SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER files_changed;
