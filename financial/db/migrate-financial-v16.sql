-- migrate-financial-v16.sql
-- Learning DB: Curriculum Learning + Case-Based Reasoning
-- Documenta el aprendizaje iterativo del financial-bot a través de episodios de prueba.
--
-- MODELO: Curriculum Learning + CBR
--   - Episodio = una corrida completa de la suite T01-T10 (análogo a una "época" en ML)
--   - Score     = % de tests pasados (análogo a accuracy)
--   - Tier      = nivel de complejidad actual (avanza cuando score > 80%)
--   - Patrón    = firma de falla recurrente (análogo a un caso en CBR)
--   - Fix       = resolución aplicada al patrón (análogo a label en supervised learning)
--   - Curva     = evolución del score por episodio (learning curve)

-- ── Episodios ─────────────────────────────────────────────────────────────────
-- Cada corrida de la suite = un episodio. Equivalente a una época de entrenamiento.
CREATE TABLE IF NOT EXISTS learning_episodes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  episode_num     INT NOT NULL,                           -- secuencial, auto-calculado
  started_at      DATETIME(3) NOT NULL DEFAULT NOW(3),
  completed_at    DATETIME(3),
  total_tests     INT DEFAULT 0,
  passed_tests    INT DEFAULT 0,
  skipped_tests   INT DEFAULT 0,
  score_pct       DECIMAL(5,2),                           -- passed/total * 100
  complexity_tier TINYINT DEFAULT 1,                      -- 1=básico 2=intermedio 3=avanzado 4=edge_cases
  git_sha         VARCHAR(40),                            -- SHA del commit activo del bot
  triggered_by    VARCHAR(100) DEFAULT 'manual',          -- 'manual'|'verifier'|'post_fix'|'cron'
  notes           TEXT,
  INDEX idx_started  (started_at),
  INDEX idx_tier     (complexity_tier),
  INDEX idx_score    (score_pct)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Resultados por test ───────────────────────────────────────────────────────
-- Un row por test por episodio. Permite ver qué tests fallan consistentemente.
CREATE TABLE IF NOT EXISTS learning_test_results (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  episode_id  INT NOT NULL,
  test_id     VARCHAR(10) NOT NULL,                       -- T01..T10
  passed      BOOLEAN NOT NULL,
  duration_ms INT,
  detail      TEXT,                                       -- mensaje de resultado
  db_snapshot JSON,                                       -- estado DB relevante post-test
  created_at  DATETIME(3) DEFAULT NOW(3),
  INDEX idx_episode (episode_id),
  INDEX idx_test    (test_id, passed),
  CONSTRAINT fk_ltr_episode FOREIGN KEY (episode_id) REFERENCES learning_episodes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Patrones de falla (Case Base) ────────────────────────────────────────────
-- Firma de fallas recurrentes. Análogo a los "casos" en Case-Based Reasoning.
-- Cuando el mismo patrón aparece en 2+ episodios consecutivos → dispatch de fix.
CREATE TABLE IF NOT EXISTS learning_patterns (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  pattern_key          VARCHAR(150) NOT NULL UNIQUE,      -- e.g. 'T03_draft_null_post_clabe'
  test_id              VARCHAR(10),
  description          TEXT,
  first_seen_episode   INT,
  last_seen_episode    INT,
  occurrence_count     INT DEFAULT 1,
  consecutive_count    INT DEFAULT 1,                     -- episodios consecutivos con esta falla
  resolved_episode     INT,                               -- episodio donde dejó de fallar
  status               ENUM('active','resolved','regressed') DEFAULT 'active',
  created_at           DATETIME(3) DEFAULT NOW(3),
  updated_at           DATETIME(3) DEFAULT NOW(3),
  INDEX idx_status     (status),
  INDEX idx_test       (test_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Fixes aplicados ───────────────────────────────────────────────────────────
-- Historial de cambios de código y su efectividad.
-- Permite saber qué fix resolvió qué patrón → reusable en futuras sesiones (CBR retrieval).
CREATE TABLE IF NOT EXISTS learning_fixes (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  episode_id           INT NOT NULL,                      -- episodio DESPUÉS del cual se aplicó el fix
  pattern_id           INT,
  git_sha_before       VARCHAR(40),
  git_sha_after        VARCHAR(40),
  files_changed        TEXT,
  commit_message       TEXT,
  dispatched_by        VARCHAR(100),                      -- 'finbot-verifier'|'manual'|'claude-code'
  score_before         DECIMAL(5,2),
  score_after          DECIMAL(5,2),
  effectiveness        DECIMAL(5,2)                       -- score_after - score_before
    GENERATED ALWAYS AS (score_after - score_before) STORED,
  created_at           DATETIME(3) DEFAULT NOW(3),
  INDEX idx_pattern    (pattern_id),
  INDEX idx_episode    (episode_id),
  CONSTRAINT fk_lf_episode FOREIGN KEY (episode_id)  REFERENCES learning_episodes(id),
  CONSTRAINT fk_lf_pattern FOREIGN KEY (pattern_id)  REFERENCES learning_patterns(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Niveles de complejidad (Curriculum) ───────────────────────────────────────
-- Define qué acciones ejecuta cada test en cada tier.
-- El sistema avanza de tier automáticamente cuando score_pct > 80% en 2 episodios consecutivos.
CREATE TABLE IF NOT EXISTS learning_complexity (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  tier         TINYINT NOT NULL,
  test_id      VARCHAR(10) NOT NULL,
  label        VARCHAR(200),
  description  TEXT,
  test_params  JSON,                                      -- parámetros del test (monto, tipo, clabe, etc.)
  active       BOOLEAN DEFAULT TRUE,
  UNIQUE KEY uk_tier_test (tier, test_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tier 1: Básico — operaciones simples, verificaciones directas
INSERT IGNORE INTO learning_complexity (tier, test_id, label, description, test_params) VALUES
(1, 'T01', '/saldo básico',          'Bot responde /saldo y hay actividad en DB',               '{"comando": "/saldo"}'),
(1, 'T02', 'Operación texto',         'Bot crea sesión con /operacion IAS neto 10000',           '{"tipo": "IAS", "monto": 10000, "solicita_neto": true}'),
(1, 'T03', 'CLABE entrada',           'Bot acepta CLABE Banregio y guarda en draft/banking',     '{"clabe": "058597000030773833", "banco": "Banregio"}'),
(1, 'T04', 'Cancelar operación',      'Bot resetea sesión al recibir "cancelar"',                '{"accion": "cancelar"}'),
(1, 'T08', 'DB clientes',             'fin_clients accesible y tiene datos',                     '{}'),
(1, 'T09', 'Dashboard KPIs',          '/api/financial/kpis responde con datos',                  '{"endpoint": "/api/financial/kpis"}'),
(1, 'T10', 'Columna costo_pct',       'fin_operations.costo_pct existe (migración v14)',          '{}');

-- Tier 2: Intermedio — flujo completo, múltiples CLABEs, verificación post-operación
INSERT IGNORE INTO learning_complexity (tier, test_id, label, description, test_params) VALUES
(2, 'T02', 'Operación monto grande',  'Bot maneja montos > 100,000 correctamente',              '{"tipo": "IAS", "monto": 150000, "solicita_neto": true}'),
(2, 'T03', 'CLABE múltiple',          'Bot guarda segunda CLABE diferente sin duplicar',        '{"clabe": "058597000068994820", "banco": "Banregio", "titular": "Noela"}'),
(2, 'T04', 'Cancelar tras CLABE',     'Bot cancela después de recibir CLABE (no solo al inicio)','{"secuencia": ["operacion", "clabe", "cancelar"]}'),
(2, 'T11', 'Confirmar operación',     'Bot confirma y guarda en fin_operations',                '{"accion": "confirmar", "verify_db": true}'),
(2, 'T12', 'Saldo post-operación',    'Saldo del cliente baja tras operación confirmada',       '{"verify_saldo_delta": true}');

-- Tier 3: Avanzado — casos de error, edge cases de monto, concurrencia básica
INSERT IGNORE INTO learning_complexity (tier, test_id, label, description, test_params) VALUES
(3, 'T13', 'CLABE inválida',          'Bot rechaza CLABE con dígito verificador incorrecto',    '{"clabe": "058597000030773834", "expect_reject": true}'),
(3, 'T14', 'Monto cero',              'Bot rechaza monto = 0',                                  '{"monto": 0, "expect_reject": true}'),
(3, 'T15', 'Monto negativo',          'Bot rechaza monto negativo',                             '{"monto": -5000, "expect_reject": true}'),
(3, 'T16', 'Doble operación',         'Segunda /operacion mientras hay sesión activa',          '{"secuencia": ["operacion_1", "operacion_2_sin_cancelar"]}'),
(3, 'T17', 'Lenguaje natural',        'Bot interpreta "quiero mandar 50 mil a IAS" correctamente','{"texto_libre": true, "monto": 50000}');

-- Tier 4: Edge cases — concurrencia, recuperación de sesión, interrupciones
INSERT IGNORE INTO learning_complexity (tier, test_id, label, description, test_params) VALUES
(4, 'T18', 'Restart bot mid-session', 'Bot recupera sesión tras pm2 restart (checkpointing)',   '{"simula_restart": true}'),
(4, 'T19', 'Timeout de sesión',       'Sesión expirada retoma correctamente',                   '{"session_age_hours": 25}'),
(4, 'T20', 'Tres usuarios simultáneos','GV, Noela y Kevin operan al mismo tiempo sin interferir','{"concurrencia": 3}');

-- ── Vista: Learning Curve ─────────────────────────────────────────────────────
-- Curva de aprendizaje: score por episodio. Equivalente a accuracy over epochs en ML.
CREATE OR REPLACE VIEW v_learning_curve AS
SELECT
  e.episode_num,
  e.started_at,
  e.complexity_tier,
  e.score_pct,
  e.passed_tests,
  e.total_tests,
  e.triggered_by,
  e.git_sha,
  (SELECT COUNT(*) FROM learning_patterns p
   WHERE p.first_seen_episode = e.id AND p.status = 'active') AS new_patterns_detected,
  (SELECT COUNT(*) FROM learning_fixes f WHERE f.episode_id = e.id)    AS fixes_applied
FROM learning_episodes e
ORDER BY e.episode_num;

-- ── Vista: Tasa de falla por test ─────────────────────────────────────────────
CREATE OR REPLACE VIEW v_test_failure_rate AS
SELECT
  r.test_id,
  COUNT(*)                                               AS total_runs,
  SUM(r.passed = 0)                                      AS total_fails,
  ROUND(SUM(r.passed = 0) / COUNT(*) * 100, 1)          AS failure_rate_pct,
  MAX(e.episode_num)                                     AS last_episode_seen,
  SUM(r.passed = 0 AND e.episode_num = (SELECT MAX(episode_num) FROM learning_episodes)) AS failed_last_episode
FROM learning_test_results r
JOIN learning_episodes e ON e.id = r.episode_id
GROUP BY r.test_id
ORDER BY failure_rate_pct DESC;

-- ── Vista: Patrones activos con recomendación ────────────────────────────────
CREATE OR REPLACE VIEW v_active_patterns AS
SELECT
  p.pattern_key,
  p.test_id,
  p.description,
  p.occurrence_count,
  p.consecutive_count,
  p.status,
  f.commit_message AS last_fix_applied,
  f.effectiveness  AS last_fix_effectiveness
FROM learning_patterns p
LEFT JOIN learning_fixes f ON f.pattern_id = p.id
  AND f.id = (SELECT MAX(f2.id) FROM learning_fixes f2 WHERE f2.pattern_id = p.id)
WHERE p.status = 'active'
ORDER BY p.consecutive_count DESC, p.occurrence_count DESC;
