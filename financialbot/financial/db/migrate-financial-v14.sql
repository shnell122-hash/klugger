-- migrate-financial-v14.sql
-- Tracking de margen intermediario (modelo Alfa y similares)
-- costo_pct = lo que paga GV al proveedor (ej. 0.030)
-- comision_pct ya existente = lo que cobra GV al cliente (ej. 0.040)
-- margen = comision_pct - costo_pct (ej. 0.010)

ALTER TABLE fin_operations
  ADD COLUMN costo_pct DECIMAL(6,4) NULL AFTER comision_pct;

ALTER TABLE fin_client_models
  ADD COLUMN costo_pct DECIMAL(6,4) NULL AFTER comision_pct;
