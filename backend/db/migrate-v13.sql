-- migrate-v13: Telegram users stored in DB (replaces relay/telegram-users.json)
CREATE TABLE IF NOT EXISTS telegram_users (
  id          BIGINT       NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  role        VARCHAR(20)  NOT NULL DEFAULT 'dev',
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  note        TEXT,
  created_at  DATETIME(3)  NOT NULL DEFAULT NOW(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT NOW(3) ON UPDATE NOW(3)
);
