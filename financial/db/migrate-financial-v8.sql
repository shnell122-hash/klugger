-- Migración v8: Agregar subtabla_json a fin_operations para pagos por tabla
-- Compatible con MySQL 5.7+ / MySQL 8.0

ALTER TABLE fin_operations
  ADD COLUMN subtabla_json LONGTEXT NULL DEFAULT NULL
  COMMENT 'JSON con detalle de pagos individuales ({nombre, numero, banco, monto}[]) cuando la operación proviene de una tabla Excel';
