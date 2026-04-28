-- Migración v9: comisiones por cliente, comisionistas y modelos de pago por cliente
-- Compatible con MySQL 5.7+ / MariaDB

-- ── 1. Comisionistas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_comisionistas (
  id                INT          NOT NULL AUTO_INCREMENT,
  nombre            VARCHAR(255) NOT NULL,
  telegram_user_id  BIGINT       NULL,
  email             VARCHAR(255) NULL,
  notas             TEXT         NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. Tasas del comisionista por tipo de operación ───────────────────────────
-- El comisionista cobra un % del total bruto de la operación (siempre < comision_pct del cliente).
CREATE TABLE IF NOT EXISTS fin_comisionista_rates (
  id               INT         NOT NULL AUTO_INCREMENT,
  comisionista_id  INT         NOT NULL,
  tipo_operacion   VARCHAR(50) NOT NULL,
  pct              DECIMAL(6,4) NOT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_com_tipo (comisionista_id, tipo_operacion),
  CONSTRAINT fk_cr_comisionista FOREIGN KEY (comisionista_id)
    REFERENCES fin_comisionistas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. Asignar comisionista al cliente ────────────────────────────────────────
ALTER TABLE fin_clients
  ADD COLUMN comisionista_id INT NULL;
ALTER TABLE fin_clients
  ADD CONSTRAINT fk_client_comisionista
    FOREIGN KEY (comisionista_id) REFERENCES fin_comisionistas(id) ON DELETE SET NULL;

-- ── 4. Modelos de operación por cliente ───────────────────────────────────────
-- Override de comisión + disponibilidad + crédito por cliente × tipo.
-- Si no existe fila para un (client_id, tipo_operacion), se usa la tasa global.
CREATE TABLE IF NOT EXISTS fin_client_models (
  id              INT          NOT NULL AUTO_INCREMENT,
  client_id       INT          NOT NULL,
  tipo_operacion  VARCHAR(50)  NOT NULL,
  comision_pct    DECIMAL(6,4) NOT NULL,
  es_credito      TINYINT(1)   NOT NULL DEFAULT 0, -- 1 = este modelo opera a crédito para el cliente
  is_active       TINYINT(1)   NOT NULL DEFAULT 1, -- 0 = tipo bloqueado para este cliente
  notas           TEXT         NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cm_client_tipo (client_id, tipo_operacion),
  CONSTRAINT fk_cm_client FOREIGN KEY (client_id)
    REFERENCES fin_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. Comisiones generadas por operación ─────────────────────────────────────
-- Una fila por operación confirmada que tenga comisionista asignado.
-- monto_base = monto_bruto (comisión siempre sobre total factura).
CREATE TABLE IF NOT EXISTS fin_comisiones (
  id               INT           NOT NULL AUTO_INCREMENT,
  comisionista_id  INT           NOT NULL,
  client_id        INT           NOT NULL,
  operation_id     INT           NOT NULL,
  tipo_operacion   VARCHAR(50)   NOT NULL,
  monto_base       DECIMAL(18,4) NOT NULL,  -- monto_bruto de la operación
  pct              DECIMAL(6,4)  NOT NULL,
  monto_comision   DECIMAL(18,4) NOT NULL,  -- monto_base * pct
  pagado           TINYINT(1)    NOT NULL DEFAULT 0,
  fecha_pago       DATETIME(3)   NULL,
  notas            TEXT          NULL,
  created_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_com_operation (operation_id),
  CONSTRAINT fk_com_comisionista FOREIGN KEY (comisionista_id)
    REFERENCES fin_comisionistas(id),
  CONSTRAINT fk_com_client      FOREIGN KEY (client_id)
    REFERENCES fin_clients(id),
  CONSTRAINT fk_com_operation   FOREIGN KEY (operation_id)
    REFERENCES fin_operations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
