-- migrate-financial-v18.sql
-- Cliente por grupo: mismo usuario de Telegram puede ser clientes
-- diferentes en distintos grupos (proveedor vs cliente).
--
-- Cambio: añade chat_id a fin_clients.
-- chat_id = 0  → cliente "universal" / legacy (sin grupo específico)
-- chat_id = -X → cliente específico de ese grupo de Telegram

-- 1. Añadir columna chat_id
ALTER TABLE fin_clients
  ADD COLUMN chat_id BIGINT NOT NULL DEFAULT 0 AFTER telegram_user_id;

-- 2. Eliminar unique anterior (solo telegram_user_id)
ALTER TABLE fin_clients
  DROP INDEX telegram_user_id;

-- 3. Nueva unique compuesta (telegram_user_id, chat_id)
ALTER TABLE fin_clients
  ADD CONSTRAINT uq_client_chat UNIQUE (telegram_user_id, chat_id);

-- 4. Índice de búsqueda rápida por chat_id
ALTER TABLE fin_clients
  ADD INDEX idx_chat_id (chat_id);

-- Nota: registros existentes quedan con chat_id=0 (compatibilidad hacia atrás)
