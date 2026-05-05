-- ============================================================
-- MIGRACIÓN FINANCIERA v1
-- Sistema Multiagéntico Financiero con Telegram
-- Compatible con ai_monitoring DB existente
-- ============================================================

-- Clientes del sistema financiero
CREATE TABLE IF NOT EXISTS fin_clients (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  telegram_user_id  BIGINT NOT NULL UNIQUE,
  telegram_username VARCHAR(255),
  nombre        VARCHAR(255),
  saldo         DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  saldo_pendiente DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  notas         TEXT,
  is_active     TINYINT(1) DEFAULT 1,
  created_at    DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_telegram_user (telegram_user_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tipos de operación con comisiones configurables
CREATE TABLE IF NOT EXISTS fin_operation_types (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  codigo            VARCHAR(50) NOT NULL UNIQUE,
  nombre            VARCHAR(100) NOT NULL,
  comision_pct      DECIMAL(6,4) NOT NULL,
  descripcion       TEXT,
  instrucciones_pago TEXT,   -- datos bancarios configurables por admin desde dashboard
  is_active         TINYINT(1) DEFAULT 1,
  created_at    DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datos estándar de operaciones
INSERT INTO fin_operation_types (codigo, nombre, comision_pct, descripcion) VALUES
  ('IAS',      'IAS',       0.0550, 'Operación IAS - comisión 5.5%'),
  ('TARJETAS', 'Tarjetas',  0.0550, 'Pago con tarjeta - comisión 5.5%'),
  ('SPEI',     'SPEI',      0.0300, 'Transferencia SPEI - comisión 3%'),
  ('EFECTIVO', 'Efectivo',  0.0300, 'Entrega en efectivo - comisión 3%'),
  ('SINDICATO','Sindicato', 0.0550, 'Operación sindicato - comisión 5.5%')
ON DUPLICATE KEY UPDATE
  comision_pct = VALUES(comision_pct),
  updated_at   = CURRENT_TIMESTAMP(3);

-- Operaciones financieras (tabla central)
CREATE TABLE IF NOT EXISTS fin_operations (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  uuid            VARCHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
  client_id       INT NOT NULL,
  tipo_operacion  VARCHAR(50) NOT NULL,
  -- Montos
  monto_bruto     DECIMAL(18,4) NOT NULL,
  comision_pct    DECIMAL(6,4)  NOT NULL,
  monto_neto      DECIMAL(18,4) NOT NULL,
  -- Dirección del flujo
  es_entrada      TINYINT(1) NOT NULL DEFAULT 1,  -- 1=cliente pagó (entrada), 0=nosotros pagamos (salida)
  solicita_neto   TINYINT(1) NOT NULL DEFAULT 1,  -- 1=cliente pidió monto neto, 0=monto bruto
  -- Entrega
  tipo_entrega    ENUM('efectivo','tarjeta','spei','otro') DEFAULT 'efectivo',
  instrucciones_pago TEXT,
  direccion_entrega  TEXT,
  -- Estado de la operación
  estado          ENUM('draft','pendiente','confirmada','completada','cancelada') DEFAULT 'draft',
  retorno_pagado  TINYINT(1) DEFAULT 0,
  -- Facturación
  tiene_factura   TINYINT(1) DEFAULT 0,
  factura_url     VARCHAR(500),
  -- Referidor (desarrollo futuro)
  referidor_id    INT,
  comision_referidor_pct DECIMAL(6,4) DEFAULT 0.0000,
  -- Saldo antes/después para auditoría
  saldo_antes     DECIMAL(18,4),
  saldo_despues   DECIMAL(18,4),
  -- Telegram
  telegram_chat_id   BIGINT,
  telegram_message_id INT,
  poll_message_id    INT,
  poll_id            VARCHAR(255),
  -- Metadata
  notas           TEXT,
  created_at      DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (client_id) REFERENCES fin_clients(id),
  INDEX idx_client_id (client_id),
  INDEX idx_estado (estado),
  INDEX idx_tipo_operacion (tipo_operacion),
  INDEX idx_created_at (created_at),
  INDEX idx_chat_id (telegram_chat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial de saldo por cliente (auditoría completa)
CREATE TABLE IF NOT EXISTS fin_balance_history (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  client_id       INT NOT NULL,
  operation_id    INT,
  tipo_movimiento ENUM('entrada','salida','ajuste_manual','retorno_pagado') NOT NULL,
  monto           DECIMAL(18,4) NOT NULL,
  saldo_antes     DECIMAL(18,4) NOT NULL,
  saldo_despues   DECIMAL(18,4) NOT NULL,
  descripcion     VARCHAR(500),
  created_at      DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (client_id)    REFERENCES fin_clients(id),
  FOREIGN KEY (operation_id) REFERENCES fin_operations(id),
  INDEX idx_client_id (client_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Archivos adjuntos a operaciones (Word, PDF, Excel, imágenes)
CREATE TABLE IF NOT EXISTS fin_attachments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  operation_id    INT,
  client_id       INT NOT NULL,
  tipo_archivo    ENUM('imagen','pdf','excel','word','link','otro') NOT NULL,
  nombre_original VARCHAR(500),
  telegram_file_id VARCHAR(500),
  url_local       VARCHAR(500),
  metadata_json   JSON,
  created_at      DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (client_id)    REFERENCES fin_clients(id),
  FOREIGN KEY (operation_id) REFERENCES fin_operations(id),
  INDEX idx_operation_id (operation_id),
  INDEX idx_client_id (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sesiones de conversación financiera (contexto por chat)
CREATE TABLE IF NOT EXISTS fin_sessions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  chat_id         BIGINT NOT NULL,
  client_id       INT,
  estado          ENUM('idle','esperando_tipo','esperando_monto','esperando_entrega',
                        'esperando_confirmacion','esperando_edicion','completado') DEFAULT 'idle',
  operation_draft_json JSON,
  ultimo_mensaje_id INT,
  created_at      DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_chat_id (chat_id),
  INDEX idx_client_id (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uso de LLM por operación (tracking de costos multiagente)
CREATE TABLE IF NOT EXISTS fin_llm_usage (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  operation_id    INT,
  chat_id         BIGINT,
  agent_name      VARCHAR(100) NOT NULL,
  model           VARCHAR(100) NOT NULL,
  provider        VARCHAR(50) NOT NULL,
  tokens_in       INT DEFAULT 0,
  tokens_out      INT DEFAULT 0,
  cache_read_tokens INT DEFAULT 0,
  cache_write_tokens INT DEFAULT 0,
  cost_usd        DECIMAL(12,8) DEFAULT 0.00000000,
  duration_ms     INT,
  created_at      DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (operation_id) REFERENCES fin_operations(id) ON DELETE SET NULL,
  INDEX idx_operation_id (operation_id),
  INDEX idx_agent_name (agent_name),
  INDEX idx_created_at (created_at),
  INDEX idx_model (model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vista: saldo actual de todos los clientes con estadísticas
CREATE OR REPLACE VIEW fin_client_summary AS
SELECT
  c.id,
  c.telegram_user_id,
  c.telegram_username,
  c.nombre,
  c.saldo,
  c.saldo_pendiente,
  COUNT(DISTINCT o.id)                                          AS total_operaciones,
  SUM(CASE WHEN o.estado = 'completada' THEN 1 ELSE 0 END)     AS ops_completadas,
  SUM(CASE WHEN o.estado = 'pendiente'  THEN 1 ELSE 0 END)     AS ops_pendientes,
  SUM(CASE WHEN o.es_entrada = 1 AND o.estado = 'completada'
            THEN o.monto_neto ELSE 0 END)                       AS total_entrada,
  SUM(CASE WHEN o.es_entrada = 0 AND o.estado = 'completada'
            THEN o.monto_neto ELSE 0 END)                       AS total_salida,
  MAX(o.created_at)                                             AS ultima_operacion,
  c.created_at
FROM fin_clients c
LEFT JOIN fin_operations o ON o.client_id = c.id
GROUP BY c.id;

-- Vista: operaciones con datos completos para dashboard
CREATE OR REPLACE VIEW fin_operations_full AS
SELECT
  o.*,
  c.telegram_username,
  c.nombre AS client_nombre,
  t.nombre AS tipo_nombre,
  t.comision_pct AS tipo_comision_std
FROM fin_operations o
JOIN fin_clients c ON c.id = o.client_id
JOIN fin_operation_types t ON t.codigo = o.tipo_operacion;
