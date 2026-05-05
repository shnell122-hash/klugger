-- Migración v5: tracking de chats + log de mensajes para contexto de IA
-- Compatible con MySQL 5.7+

-- 1. Catálogo de chats conocidos (uno por conversación Telegram)
CREATE TABLE IF NOT EXISTS fin_chats (
  chat_id       BIGINT        NOT NULL,
  client_id     INT           NULL,
  titulo        VARCHAR(300)  NULL COMMENT 'Nombre del chat en Telegram o del cliente',
  concepto      VARCHAR(500)  NULL COMMENT 'Descripción breve generada por IA o manual',
  is_group      TINYINT(1)    NOT NULL DEFAULT 0,
  total_msgs    INT           NOT NULL DEFAULT 0,
  ultimo_msg_at DATETIME(3)   NULL,
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (chat_id),
  KEY idx_fc_client (client_id),
  CONSTRAINT fk_fc_client FOREIGN KEY (client_id) REFERENCES fin_clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Log de mensajes (contexto para IA, auditoría, CRM)
CREATE TABLE IF NOT EXISTS fin_messages (
  id            INT          NOT NULL AUTO_INCREMENT,
  chat_id       BIGINT       NOT NULL,
  client_id     INT          NULL,
  telegram_msg_id INT        NULL,
  from_user_id  BIGINT       NULL,
  from_username VARCHAR(100) NULL,
  tipo          ENUM('texto','foto','documento','voz','video','link','otro') NOT NULL DEFAULT 'texto',
  texto         TEXT         NULL,
  file_name     VARCHAR(300) NULL,
  es_bot        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = mensaje enviado por el bot',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_fm_chat    (chat_id),
  KEY idx_fm_client  (client_id),
  KEY idx_fm_created (created_at),
  CONSTRAINT fk_fm_chat   FOREIGN KEY (chat_id)   REFERENCES fin_chats(chat_id)  ON DELETE CASCADE,
  CONSTRAINT fk_fm_client FOREIGN KEY (client_id) REFERENCES fin_clients(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
