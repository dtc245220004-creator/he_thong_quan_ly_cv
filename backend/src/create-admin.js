import bcrypt from 'bcryptjs'
import { pool, queryDatabase } from './db.js'

async function provisionAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const name = process.env.ADMIN_NAME?.trim()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Set ADMIN_EMAIL to a valid email address.')
  }
  if (!name || name.length < 2 || name.length > 120) {
    throw new Error('Set ADMIN_NAME to a name between 2 and 120 characters.')
  }
  if (!password || password.length < 12 || password.length > 72 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Set ADMIN_PASSWORD to a unique password of 12-72 bytes.')
  }

  const [existing] = await queryDatabase('SELECT id, is_active FROM users WHERE email = ? LIMIT 1', [email])
  if (existing.length) {
    if (!existing[0].is_active) throw new Error('The configured admin account is inactive; activate it deliberately first.')
    await queryDatabase('UPDATE users SET role = ? WHERE id = ?', ['admin', existing[0].id])
    console.info(`Granted admin role to existing account ${email}. Its password and profile were not changed.`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await queryDatabase(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, 'admin'],
  )
  console.info(`Created admin account ${email}. The password was read from the environment and was not logged.`)
}

try {
  await provisionAdmin()
} catch (error) {
  console.error('Admin provisioning failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
