-- migrate-financial-v20.sql
-- Ampliar precisión decimal de columnas de saldo que estaban en decimal(14,4)
-- Causa: simulaciones de testing acumularon saldos > 9,999,999,999 (límite de 14 dígitos)
-- Fix: subir a decimal(18,4) para consistencia con fin_clients.saldo

ALTER TABLE fin_payment_confirmations
  MODIFY COLUMN monto_bruto    DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  MODIFY COLUMN monto_neto     DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  MODIFY COLUMN saldo_antes    DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  MODIFY COLUMN saldo_despues  DECIMAL(18,4) NOT NULL DEFAULT 0.0000;

ALTER TABLE fin_clients
  MODIFY COLUMN saldo_bruto    DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  MODIFY COLUMN saldo_neto     DECIMAL(18,4) NOT NULL DEFAULT 0.0000;

ALTER TABLE fin_balance_history
  MODIFY COLUMN monto          DECIMAL(18,4),
  MODIFY COLUMN saldo_antes    DECIMAL(18,4),
  MODIFY COLUMN saldo_despues  DECIMAL(18,4);
