-- migrate-v14.sql — Curriculum Learning: learning_episodes, learning_patterns, learning_test_results, learning_fixes

CREATE TABLE IF NOT EXISTS learning_episodes (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  episode_num      INT NOT NULL,
  started_at       DATETIME(3) NOT NULL DEFAULT NOW(3),
  completed_at     DATETIME(3) NULL,
  total_tests      INT NULL,
  passed_tests     INT NULL,
  skipped_tests    INT NULL DEFAULT 0,
  score_pct        DECIMAL(5,2) NULL,
  complexity_tier  TINYINT NOT NULL DEFAULT 1,
  git_sha          VARCHAR(40) NULL,
  triggered_by     VARCHAR(100) NULL,
  notes            TEXT NULL,
  INDEX idx_episode_num (episode_num),
  INDEX idx_started_at  (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS learning_patterns (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  pattern_key         VARCHAR(200) NOT NULL,
  test_id             VARCHAR(100) NOT NULL,
  description         TEXT,
  first_seen_episode  INT NULL,
  last_seen_episode   INT NULL,
  occurrence_count    INT NOT NULL DEFAULT 1,
  consecutive_count   INT NOT NULL DEFAULT 1,
  status              ENUM('active','resolved') NOT NULL DEFAULT 'active',
  resolved_episode    INT NULL,
  updated_at          DATETIME(3) NOT NULL DEFAULT NOW(3) ON UPDATE NOW(3),
  UNIQUE KEY uq_pattern_key (pattern_key),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS learning_test_results (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  episode_id   INT NOT NULL,
  test_id      VARCHAR(100) NOT NULL,
  passed       TINYINT(1) NOT NULL DEFAULT 0,
  detail       TEXT,
  duration_ms  INT NOT NULL DEFAULT 0,
  db_snapshot  JSON,
  created_at   DATETIME(3) NOT NULL DEFAULT NOW(3),
  INDEX idx_episode_id (episode_id),
  INDEX idx_test_id    (test_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS learning_fixes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  pattern_id     INT NOT NULL,
  commit_message TEXT,
  effectiveness  DECIMAL(5,2) NOT NULL DEFAULT 0,
  applied_at     DATETIME(3) NOT NULL DEFAULT NOW(3),
  INDEX idx_pattern_id (pattern_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
