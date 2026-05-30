-- migrate-v19.sql — Índices para /api/relay/dispatch (latencia 637ms → <200ms)
-- Compatible con MySQL 5.7+ y MariaDB 10.x (usa procedure para IF NOT EXISTS)

DROP PROCEDURE IF EXISTS _relay_add_indexes;

DELIMITER //
CREATE PROCEDURE _relay_add_indexes()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'dispatch_tasks'
      AND index_name = 'idx_dispatch_status_created'
  ) THEN
    ALTER TABLE dispatch_tasks ADD INDEX idx_dispatch_status_created (status, created_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'dispatch_tasks'
      AND index_name = 'idx_dispatch_project_created'
  ) THEN
    ALTER TABLE dispatch_tasks ADD INDEX idx_dispatch_project_created (project, created_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'dispatch_tasks'
      AND index_name = 'idx_dispatch_completed'
  ) THEN
    ALTER TABLE dispatch_tasks ADD INDEX idx_dispatch_completed (completed_at);
  END IF;
END //
DELIMITER ;

CALL _relay_add_indexes();
DROP PROCEDURE IF EXISTS _relay_add_indexes;
