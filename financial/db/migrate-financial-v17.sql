-- migrate-financial-v17.sql
-- Fix fin_operations_full view: INNER JOIN → LEFT JOIN so operations with
-- tipo_operacion='COMPROBANTE', NULL, or any type not in fin_operation_types
-- are not silently excluded. Resolves /api/financial/operations returning 0
-- while KPIs (which queries fin_operations directly) shows non-zero counts.
--
-- Also ensures fin_operation_types has a COMPROBANTE entry for dashboard display.

-- 1. Recreate view with LEFT JOINs
CREATE OR REPLACE VIEW fin_operations_full AS
SELECT
  o.*,
  c.telegram_username,
  c.nombre AS client_nombre,
  t.nombre AS tipo_nombre,
  t.comision_pct AS tipo_comision_std
FROM fin_operations o
LEFT JOIN fin_clients c ON c.id = o.client_id
LEFT JOIN fin_operation_types t ON t.codigo = o.tipo_operacion;

-- 2. Add COMPROBANTE type if missing (so LEFT JOIN shows a label when present)
INSERT IGNORE INTO fin_operation_types (codigo, nombre, comision_pct, descripcion)
VALUES ('COMPROBANTE', 'Comprobante de pago', 0.0000, 'Registro de comprobante bancario entrante');
