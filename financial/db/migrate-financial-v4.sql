-- Migración v4: saldo_bruto + saldo_neto por cliente, tabla de confirmaciones de pago
-- Compatible con MySQL 5.7+ / MariaDB (usa IF NOT EXISTS para ser idempotente)

-- 1. Agregar columnas de saldo bruto y neto a fin_clients
ALTER TABLE fin_clients
  ADD COLUMN IF NOT EXISTS saldo_bruto DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'Suma bruta (antes de comisiones) acumulada' AFTER saldo,
  ADD COLUMN IF NOT EXISTS saldo_neto  DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'Saldo disponible = saldo (alias para claridad)' AFTER saldo_bruto;

-- 2. Sincronizar columnas con el saldo actual para clientes existentes
UPDATE fin_clients SET saldo_neto = saldo, saldo_bruto = saldo WHERE saldo_neto = 0;

-- 3. Tabla de confirmaciones de pago (comprobantes, facturas, ajustes manuales)
CREATE TABLE IF NOT EXISTS fin_payment_confirmations (
  id               INT           NOT NULL AUTO_INCREMENT,
  client_id        INT           NOT NULL,
  operation_id     INT           NULL,
  tipo             ENUM('factura','comprobante','texto','manual') NOT NULL DEFAULT 'manual',
  monto_bruto      DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  monto_neto       DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  tipo_operacion   VARCHAR(20)   NULL COMMENT 'IAS, SPEI, SINDICATO, TARJETAS…',
  comision_pct     DECIMAL(6,4)  NOT NULL DEFAULT 0.0000,
  notas            TEXT          NULL,
  telegram_file_id VARCHAR(200)  NULL,
  estado           ENUM('pendiente','confirmado','rechazado') NOT NULL DEFAULT 'pendiente',
  saldo_antes      DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  saldo_despues    DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  created_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_pc_client    (client_id),
  KEY idx_pc_operation (operation_id),
  KEY idx_pc_estado    (estado),
  KEY idx_pc_created   (created_at),
  CONSTRAINT fk_pc_client    FOREIGN KEY (client_id)    REFERENCES fin_clients(id)    ON DELETE CASCADE,
  CONSTRAINT fk_pc_operation FOREIGN KEY (operation_id) REFERENCES fin_operations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
