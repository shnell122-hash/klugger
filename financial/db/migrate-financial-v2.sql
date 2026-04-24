-- Migración v2: agrega instrucciones_pago por tipo de operación
-- Ejecutar solo si la v1 ya fue aplicada:
--   mysql -u root -p"$DB_PASS" ai_monitoring < financial/db/migrate-financial-v2.sql

ALTER TABLE fin_operation_types
  ADD COLUMN IF NOT EXISTS instrucciones_pago TEXT
  AFTER descripcion;
