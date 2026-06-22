-- Migración v6: rol de cliente/proveedor + intención de pago pendiente
-- Compatible con MySQL 5.7+ / MySQL 8.0

-- 1. Rol del cliente en el sistema
ALTER TABLE fin_clients
  ADD COLUMN rol ENUM('cliente', 'proveedor', 'ambos') NOT NULL DEFAULT 'ambos' AFTER nombre;

-- 2. Índice para buscar por rol
ALTER TABLE fin_clients
  ADD INDEX idx_fc_rol (rol);

-- 3. Tabla de intenciones de pago pendientes (para cuando el texto llega antes del archivo)
CREATE TABLE IF NOT EXISTS fin_pending_payment_intent (
  id           INT           NOT NULL AUTO_INCREMENT,
  chat_id      BIGINT        NOT NULL,
  client_id    INT           NULL,
  expires_at   DATETIME(3)   NOT NULL,
  created_at   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ppi_chat    (chat_id),
  KEY idx_ppi_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
