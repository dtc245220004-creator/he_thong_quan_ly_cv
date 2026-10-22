CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_mime VARCHAR(32) NULL,
  avatar_data MEDIUMBLOB NULL,
  avatar_updated_at TIMESTAMP(6) NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_created (created_at),
  KEY idx_users_role_active (role, is_active)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  start_date DATE NULL,
  due_date DATE NULL,
  status ENUM('To do', 'In Progress', 'Done') NOT NULL DEFAULT 'To do',
  priority ENUM('Low', 'Medium', 'High') NOT NULL DEFAULT 'Medium',
  assignee VARCHAR(120) NULL,
  owner_id INT UNSIGNED NULL,
  completed_at DATETIME NULL,
  seed_key VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_owner_updated (owner_id, updated_at),
  KEY idx_tasks_owner_due (owner_id, due_date),
  KEY idx_tasks_owner_completed (owner_id, completed_at),
  UNIQUE KEY uq_tasks_seed_key (seed_key),
  CONSTRAINT fk_tasks_owner FOREIGN KEY (owner_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
  KEY idx_auth_sessions_expires_at (expires_at),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_activity (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id INT UNSIGNED NOT NULL,
  target_user_id INT UNSIGNED NULL,
  target_type VARCHAR(40) NOT NULL DEFAULT 'user',
  target_id BIGINT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  details JSON NULL,
  seed_key VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_activity_created (created_at),
  KEY idx_admin_activity_actor (actor_id, created_at),
  KEY idx_admin_activity_action_created (action, created_at),
  UNIQUE KEY uq_admin_activity_seed_key (seed_key),
  CONSTRAINT fk_admin_activity_actor FOREIGN KEY (actor_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_guard (
  id TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  email_hash CHAR(64) NOT NULL,
  request_ip_hash CHAR(64) NOT NULL,
  token_hash CHAR(64) NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  used_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_token_hash (token_hash),
  KEY idx_password_reset_email_requested (email_hash, requested_at),
  KEY idx_password_reset_ip_requested (request_ip_hash, requested_at),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
