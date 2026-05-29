-- migrate-v18.sql — ASK protocol fields for dispatch_tasks
-- Compatible with MySQL 5.7+ and MariaDB 10.x
-- Run: mysql -u root -p"$DB_PASS" ai_monitoring < backend/db/migrate-v18.sql

ALTER TABLE dispatch_tasks
  ADD COLUMN ask_question TEXT NULL AFTER commits_made;

ALTER TABLE dispatch_tasks
  ADD COLUMN ask_session_id VARCHAR(100) NULL AFTER ask_question;
