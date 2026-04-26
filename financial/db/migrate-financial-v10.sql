-- Migración v10: empresas prestadoras de servicio y sus datos bancarios
-- Compatible con MySQL 5.7+ / MariaDB

-- ── 1. Catálogo de empresas ───────────────────────────────────────────────────
-- "Nuestras" empresas + las que los clientes aportan.
-- Los documentos (constancia fiscal, acta, INE) se almacenan como rutas o
-- telegram_file_id; para el MVP solo son campos opcionales.
CREATE TABLE IF NOT EXISTS fin_empresas (
  id                  INT          NOT NULL AUTO_INCREMENT,
  nombre              VARCHAR(255) NOT NULL,
  rfc                 VARCHAR(13)  NULL,
  origen              ENUM('nuestra','cliente') NOT NULL DEFAULT 'nuestra',
  -- Documentos (telegram_file_id o ruta relativa)
  constancia_fiscal   VARCHAR(512) NULL,
  acta_constitutiva   VARCHAR(512) NULL,
  ine_representante   VARCHAR(512) NULL,
  -- Representante legal
  representante_nombre VARCHAR(255) NULL,
  notas               TEXT         NULL,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_empresa_rfc (rfc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. Cuentas bancarias de las empresas ─────────────────────────────────────
-- Una empresa puede tener varias cuentas (diferentes bancos / monedas).
CREATE TABLE IF NOT EXISTS fin_empresa_cuentas (
  id           INT          NOT NULL AUTO_INCREMENT,
  empresa_id   INT          NOT NULL,
  banco        VARCHAR(100) NOT NULL,
  titular      VARCHAR(255) NOT NULL,
  clabe        VARCHAR(18)  NULL,
  num_cuenta   VARCHAR(30)  NULL,
  num_tarjeta  VARCHAR(19)  NULL,
  moneda       VARCHAR(3)   NOT NULL DEFAULT 'MXN',
  alias        VARCHAR(100) NULL,    -- Ej: "BBVA principal", "SPEI retiro"
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_ec_empresa FOREIGN KEY (empresa_id)
    REFERENCES fin_empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. Asignación de empresas a clientes ──────────────────────────────────────
-- Qué empresas puede usar cada cliente para sus operaciones.
-- notas: instrucciones específicas para este cliente con esta empresa.
CREATE TABLE IF NOT EXISTS fin_client_empresas (
  id           INT          NOT NULL AUTO_INCREMENT,
  client_id    INT          NOT NULL,
  empresa_id   INT          NOT NULL,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  notas        TEXT         NULL,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ce_client_empresa (client_id, empresa_id),
  CONSTRAINT fk_ce_client  FOREIGN KEY (client_id)  REFERENCES fin_clients(id)  ON DELETE CASCADE,
  CONSTRAINT fk_ce_empresa FOREIGN KEY (empresa_id) REFERENCES fin_empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
