import { readFile } from 'node:fs/promises'
import { pool } from './db.js'

try {
  const schemaUrl = new URL('../../database/schema.sql', import.meta.url)
  const schema = await readFile(schemaUrl, 'utf8')
  await pool.query(schema)
  await pool.query('INSERT INTO admin_guard (id) VALUES (1) ON CONFLICT (id) DO NOTHING')
  console.info('PostgreSQL schema initialized successfully.')
} catch (error) {
  console.error('PostgreSQL schema initialization failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
