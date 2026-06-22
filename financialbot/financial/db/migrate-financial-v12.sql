-- Financial schema migration v12
-- Adds 'pago_recibido' to fin_balance_history.tipo_movimiento ENUM
-- Run on VPS: see CLAUDE.md for mysql invocation with password from .env

USE ai_monitoring;

ALTER TABLE fin_balance_history
  MODIFY COLUMN tipo_movimiento
  ENUM('entrada','salida','ajuste_manual','retorno_pagado','pago_recibido') NOT NULL;

SELECT 'Migration v12 complete — pago_recibido added to fin_balance_history.tipo_movimiento' AS status;
