-- VILAR Legal OS v59 — Schema MySQL 8.0
-- Base: vilar_legal_os | User: vilar_legal | Pass: VilarLegal2026x

CREATE DATABASE IF NOT EXISTS vilar_legal_os
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE vilar_legal_os;

CREATE TABLE IF NOT EXISTS cases (
  case_id      VARCHAR(36)  NOT NULL,
  case_name    VARCHAR(255) NOT NULL,
  matter_type  VARCHAR(100) NOT NULL DEFAULT 'general',
  status       ENUM('active','closed','archived') NOT NULL DEFAULT 'active',
  client_name  VARCHAR(255) DEFAULT NULL,
  client_email VARCHAR(255) DEFAULT NULL,
  notes        TEXT         DEFAULT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id),
  KEY idx_status  (status),
  KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_artifacts (
  artifact_id     VARCHAR(36)  NOT NULL,
  case_id         VARCHAR(36)  NOT NULL,
  filename        VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  file_path       VARCHAR(500) NOT NULL,
  file_size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
  checksum_sha256 CHAR(64)     NOT NULL,
  extracted_text  LONGTEXT     DEFAULT NULL,
  source          VARCHAR(20)  NOT NULL DEFAULT 'user',
  uploaded_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (artifact_id),
  KEY idx_case_id      (case_id),
  KEY idx_checksum_dup (checksum_sha256, case_id),
  KEY idx_uploaded     (uploaded_at),
  CONSTRAINT fk_ua_case FOREIGN KEY (case_id) REFERENCES cases (case_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_artifacts (
  artifact_id       VARCHAR(36)  NOT NULL,
  case_id           VARCHAR(36)  NOT NULL,
  artifact_name     VARCHAR(255) NOT NULL,
  artifact_type     VARCHAR(50)  NOT NULL DEFAULT 'analysis',
  content           LONGTEXT     NOT NULL,
  mime_type         VARCHAR(100) NOT NULL DEFAULT 'text/markdown',
  file_size_bytes   INT UNSIGNED NOT NULL DEFAULT 0,
  source            VARCHAR(20)  NOT NULL DEFAULT 'system',
  source_artifacts  JSON         DEFAULT NULL,
  selected_ctx_json JSON         DEFAULT NULL,
  share_slug        VARCHAR(255) DEFAULT NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (artifact_id),
  UNIQUE KEY uk_share_slug (share_slug),
  KEY idx_case_id (case_id),
  KEY idx_type    (artifact_type),
  KEY idx_created (created_at),
  CONSTRAINT fk_sa_case FOREIGN KEY (case_id) REFERENCES cases (case_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migración para instancias existentes (ejecutar una sola vez en producción):
-- ALTER TABLE system_artifacts ADD COLUMN share_slug VARCHAR(255) DEFAULT NULL;
-- ALTER TABLE system_artifacts ADD UNIQUE KEY uk_share_slug (share_slug);

-- Cache de extracción: evita re-procesar el mismo archivo SHA256
CREATE TABLE IF NOT EXISTS extraction_cache (
  checksum_sha256 CHAR(64)     NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  extracted_text  LONGTEXT     NOT NULL,
  extracted_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (checksum_sha256, mime_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_history (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id    VARCHAR(36)     NOT NULL,
  role       ENUM('user','assistant') NOT NULL,
  content    TEXT            NOT NULL,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_case_history (case_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
