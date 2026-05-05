-- Migración v2: agrega instrucciones_pago por tipo de operación
-- Compatible con MySQL 5.7+ y MariaDB (sin IF NOT EXISTS en ALTER TABLE)

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'fin_operation_types'
    AND COLUMN_NAME  = 'instrucciones_pago'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE fin_operation_types ADD COLUMN instrucciones_pago TEXT AFTER descripcion',
  'SELECT "instrucciones_pago ya existe, omitiendo" AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
