-- Migración v19: añadir updated_at a fin_banking_accounts
-- Corrige: "Unknown column 'updated_at' in 'field list'" en guardarCuentas()

ALTER TABLE fin_banking_accounts
  ADD COLUMN updated_at DATETIME(3) NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP(3)
  AFTER created_at;
