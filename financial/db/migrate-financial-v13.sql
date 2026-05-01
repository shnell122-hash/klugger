-- migrate-financial-v13.sql
-- Agrega modo de operación a fin_chats
-- 'normal'    = comportamiento interactivo (default, para chats con clientes)
-- 'asistente' = silencioso — solo registra comprobantes y cuentas bancarias

ALTER TABLE fin_chats
  ADD COLUMN modo ENUM('normal','asistente') NOT NULL DEFAULT 'normal';
