-- v11: columna is_admin en fin_clients para gestión de admins desde el bot
ALTER TABLE fin_clients ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0;
