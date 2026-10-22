import { readFile } from 'node:fs/promises'
import { pool } from './db.js'

try {
  const schemaUrl = new URL('../../database/schema.sql', import.meta.url)
  const schema = await readFile(schemaUrl, 'utf8')

  for (const statement of schema.split(';').map((sql) => sql.trim()).filter(Boolean)) {
    await pool.query(statement)
  }
  await pool.execute('INSERT IGNORE INTO admin_guard (id) VALUES (1)')
  const [userColumns] = await pool.execute(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'users'`,
  )
  const existingUserColumns = new Set(userColumns.map((column) => column.columnName))
  const userAdditions = [
    ['avatar_mime', 'ALTER TABLE users ADD COLUMN avatar_mime VARCHAR(32) NULL AFTER password_hash'],
    ['avatar_data', 'ALTER TABLE users ADD COLUMN avatar_data MEDIUMBLOB NULL AFTER avatar_mime'],
    ['avatar_updated_at', 'ALTER TABLE users ADD COLUMN avatar_updated_at TIMESTAMP(6) NULL AFTER avatar_data'],
  ]
  for (const [column, statement] of userAdditions) {
    if (!existingUserColumns.has(column)) await pool.query(statement)
  }
  const [activityColumns] = await pool.execute(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'admin_activity'`,
  )
  const existingActivityColumns = new Set(activityColumns.map((column) => column.columnName))
  const activityAdditions = [
    ['target_type', "ALTER TABLE admin_activity ADD COLUMN target_type VARCHAR(40) NOT NULL DEFAULT 'user' AFTER target_user_id"],
    ['target_id', 'ALTER TABLE admin_activity ADD COLUMN target_id BIGINT UNSIGNED NULL AFTER target_type'],
    ["description", "ALTER TABLE admin_activity ADD COLUMN description VARCHAR(255) NOT NULL DEFAULT '' AFTER action"],
    ['seed_key', 'ALTER TABLE admin_activity ADD COLUMN seed_key VARCHAR(120) NULL AFTER details'],
  ]
  for (const [column, statement] of activityAdditions) {
    if (!existingActivityColumns.has(column)) await pool.query(statement)
  }
  const [activityIndexes] = await pool.execute(
    `SELECT INDEX_NAME AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'admin_activity'`,
  )
  const existingActivityIndexes = new Set(activityIndexes.map((index) => index.indexName))
  if (!existingActivityIndexes.has('idx_admin_activity_action_created')) {
    await pool.query('CREATE INDEX idx_admin_activity_action_created ON admin_activity (action, created_at)')
  }
  if (!existingActivityIndexes.has('uq_admin_activity_seed_key')) {
    await pool.query('CREATE UNIQUE INDEX uq_admin_activity_seed_key ON admin_activity (seed_key)')
  }
  const [columns] = await pool.execute(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'tasks'`,
  )
  const existingColumns = new Set(columns.map((column) => column.columnName))
  const additions = [
    ['start_date', 'ALTER TABLE tasks ADD COLUMN start_date DATE NULL AFTER description'],
    [
      'priority',
      "ALTER TABLE tasks ADD COLUMN priority ENUM('Low', 'Medium', 'High') NOT NULL DEFAULT 'Medium' AFTER status",
    ],
    ['assignee', 'ALTER TABLE tasks ADD COLUMN assignee VARCHAR(120) NULL AFTER priority'],
    ['owner_id', 'ALTER TABLE tasks ADD COLUMN owner_id INT UNSIGNED NULL AFTER assignee'],
    ['completed_at', 'ALTER TABLE tasks ADD COLUMN completed_at DATETIME NULL AFTER owner_id'],
    ['seed_key', 'ALTER TABLE tasks ADD COLUMN seed_key VARCHAR(100) NULL AFTER completed_at'],
  ]

  for (const [column, statement] of additions) {
    if (!existingColumns.has(column)) {
      await pool.query(statement)
    }
  }

  const [indexes] = await pool.execute(
    `SELECT INDEX_NAME AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'tasks'`,
  )
  const existingIndexes = new Set(indexes.map((index) => index.indexName))
  if (!existingIndexes.has('idx_tasks_owner_updated')) {
    await pool.query('CREATE INDEX idx_tasks_owner_updated ON tasks (owner_id, updated_at)')
  }
  if (!existingIndexes.has('idx_tasks_owner_due')) {
    await pool.query('CREATE INDEX idx_tasks_owner_due ON tasks (owner_id, due_date)')
  }
  if (!existingIndexes.has('idx_tasks_owner_completed')) {
    await pool.query('CREATE INDEX idx_tasks_owner_completed ON tasks (owner_id, completed_at)')
  }
  if (!existingIndexes.has('uq_tasks_seed_key')) {
    await pool.query('CREATE UNIQUE INDEX uq_tasks_seed_key ON tasks (seed_key)')
  }
  const [userIndexes] = await pool.execute(
    `SELECT INDEX_NAME AS indexName
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'users'`,
  )
  const existingUserIndexes = new Set(userIndexes.map((index) => index.indexName))
  if (!existingUserIndexes.has('idx_users_created')) {
    await pool.query('CREATE INDEX idx_users_created ON users (created_at)')
  }
  if (!existingUserIndexes.has('idx_users_role_active')) {
    await pool.query('CREATE INDEX idx_users_role_active ON users (role, is_active)')
  }
  const [constraints] = await pool.execute(
    `SELECT CONSTRAINT_NAME AS constraintName
     FROM information_schema.table_constraints
     WHERE table_schema = DATABASE() AND table_name = 'tasks' AND constraint_type = 'FOREIGN KEY'`,
  )
  if (!constraints.some((constraint) => constraint.constraintName === 'fk_tasks_owner')) {
    await pool.query(
      'ALTER TABLE tasks ADD CONSTRAINT fk_tasks_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE',
    )
  }

  console.info('MySQL schema initialized successfully (users, sessions, tasks, audit, and progress history).')
} catch (error) {
  console.error('MySQL schema initialization failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
