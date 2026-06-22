-- Migración v3: tabla de cuentas bancarias por cliente/operación
-- Compatible con MySQL 5.7+ / MariaDB

CREATE TABLE IF NOT EXISTS fin_banking_accounts (
  id           INT          NOT NULL AUTO_INCREMENT,
  client_id    INT          NOT NULL,
  operation_id INT          NULL,
  tipo         ENUM('CLABE','tarjeta','cuenta','otro') NOT NULL DEFAULT 'CLABE',
  numero       VARCHAR(50)  NOT NULL,
  titular      VARCHAR(200) NULL,
  banco        VARCHAR(100) NULL,
  notas        TEXT         NULL,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ba_client    (client_id),
  KEY idx_ba_operation (operation_id),
  CONSTRAINT fk_ba_client    FOREIGN KEY (client_id)    REFERENCES fin_clients(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ba_operation FOREIGN KEY (operation_id) REFERENCES fin_operations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
