import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'

const COOKIE_NAME = 'task_tracker_session'
const SESSION_DAYS = 7

function requestError(status, message, code) {
  const error = new Error(message)
  error.status = status
  if (code) error.code = code
  return error
}

function sessionHash(value) {
  return createHash('sha256').update(value).digest('hex')
}

function getCookie(request, name) {
  const cookies = request.headers.cookie?.split(';') || []
  const entry = cookies.map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null
}

function cookieOptions(maxAge) {
  const secure = process.env.NODE_ENV === 'production'
  const sameSite = getSameSite()
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSite}`,
    ...(secure ? ['Secure'] : []),
    `Max-Age=${maxAge}`,
  ].join('; ')
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production'
  const sameSite = getSameSite()
  response.setHeader(
    'Set-Cookie',
    [
      `${COOKIE_NAME}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      `SameSite=${sameSite}`,
      ...(secure ? ['Secure'] : []),
      `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
    ].join('; '),
  )
}

function getSameSite() {
  const value = process.env.SESSION_COOKIE_SAME_SITE || 'Lax'
  if (!['Lax', 'Strict', 'None'].includes(value)) {
    throw new Error('SESSION_COOKIE_SAME_SITE must be Lax, Strict, or None.')
  }
  if (value === 'None' && process.env.NODE_ENV !== 'production') {
    throw new Error('SameSite=None requires a production HTTPS deployment.')
  }
  return value
}

function validateOrigin(request) {
  const origin = request.get('origin')
  if (!origin) return

  const configuredOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (!configuredOrigins.includes(origin)) {
    throw requestError(403, 'Nguồn gửi yêu cầu không được phép.')
  }
}

export async function requireAuth(db, request, _response, next) {
  try {
    const token = getCookie(request, COOKIE_NAME)
    if (!token || token.length > 200) {
      throw requestError(401, 'Vui lòng đăng nhập để tiếp tục.')
    }

    const rows = await db.query(
      `SELECT u.id, u.name, u.email, u.role, s.id AS sessionId
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = 1
       LIMIT 1`,
      [sessionHash(token)],
    )
    if (!rows.length) {
      throw requestError(401, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
    }

    request.user = rows[0]
    next()
  } catch (error) {
    next(error)
  }
}

export function requireRole(role) {
  return (request, _response, next) => {
    if (request.user?.role !== role) {
      next(requestError(403, 'Bạn không có quyền thực hiện thao tác này.'))
      return
    }
    next()
  }
}

export function createAuthRouter(db, transaction = (callback) => callback(db)) {
  const router = Router()

  router.post('/register', async (request, response) => {
    validateOrigin(request)
    const { name, email, password, passwordConfirmation } = request.body || {}
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) {
      throw requestError(400, 'Họ tên phải có từ 2 đến 120 ký tự.')
    }
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      normalizedEmail.length > 254
    ) {
      throw requestError(400, 'Vui lòng nhập địa chỉ email hợp lệ.')
    }
    if (
      typeof password !== 'string' ||
      password.length < 10 ||
      password.length > 72 ||
      Buffer.byteLength(password, 'utf8') > 72 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      throw requestError(400, 'Mật khẩu cần ít nhất 10 ký tự, gồm chữ hoa, chữ thường và chữ số.')
    }
    if (passwordConfirmation !== password) {
      throw requestError(400, 'Mật khẩu xác nhận không khớp.')
    }

    const existing = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [normalizedEmail])
    if (existing.length) throw requestError(409, 'Email này đã được đăng ký.')

    const passwordHash = await bcrypt.hash(password, 12)
    try {
      await db.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [name.trim(), normalizedEmail, passwordHash, 'user'],
      )
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw requestError(409, 'Email này đã được đăng ký.')
      throw error
    }

    response.status(201).json({ message: 'Đăng ký thành công. Vui lòng đăng nhập.' })
  })

  router.post('/login', async (request, response) => {
    validateOrigin(request)
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const password = request.body?.password
    if (!email || typeof password !== 'string' || password.length > 72) {
      throw requestError(400, 'Vui lòng nhập email và mật khẩu.')
    }

    const rows = await db.query(
      `SELECT id, name, email, password_hash, role,
              CAST(UNIX_TIMESTAMP(avatar_updated_at) * 1000 AS UNSIGNED) AS avatar_version
       FROM users WHERE email = ? AND is_active = 1 LIMIT 1`,
      [email],
    )
    const user = rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw requestError(401, 'Email hoặc mật khẩu không chính xác.')
    }

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
    await db.query('DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP')
    await db.query(
      'INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, sessionHash(token), expiresAt],
    )
    if (user.role === 'admin') {
      await db.query(
        `INSERT INTO admin_activity
           (actor_id, target_user_id, target_type, target_id, action, description)
         VALUES (?, ?, 'user', ?, 'auth.login', 'Đăng nhập quản trị thành công')`,
        [user.id, user.id, user.id],
      )
    }
    setSessionCookie(response, token)
    response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarVersion: user.avatar_version,
      },
    })
  })

  router.post('/forgot-password', async (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw requestError(400, 'Vui lòng nhập địa chỉ email hợp lệ.')
    }
    const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: pass, SMTP_FROM: from } = process.env
    if (!host || !from) {
      throw requestError(503, 'Dịch vụ email đặt lại mật khẩu chưa được cấu hình.')
    }

    const emailHash = sessionHash(email)
    const requestIpHash = sessionHash(request.ip || 'unknown')
    const [recentRequests] = await db.query(
      `SELECT COUNT(*) AS total FROM password_reset_tokens
       WHERE requested_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE)
         AND (email_hash = ? OR request_ip_hash = ?)`,
      [emailHash, requestIpHash],
    )
    if (Number(recentRequests.total) >= 3) {
      throw requestError(429, 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.')
    }

    const [account] = await db.query(
      'SELECT id, name, email FROM users WHERE email = ? AND is_active = 1 LIMIT 1',
      [email],
    )
    const token = account ? randomBytes(32).toString('base64url') : null
    await db.query(
      `INSERT INTO password_reset_tokens
         (user_id, email_hash, request_ip_hash, token_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        account?.id || null,
        emailHash,
        requestIpHash,
        token ? sessionHash(token) : null,
        token ? new Date(Date.now() + 30 * 60 * 1000) : null,
      ],
    )
    if (account && token) {
      const transport = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        ...(user && pass ? { auth: { user, pass } } : {}),
      })
      const origin = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].trim()
      const resetUrl = new URL('/reset-password', origin)
      resetUrl.searchParams.set('token', token)
      try {
        await transport.sendMail({
          from,
          to: account.email,
          subject: 'Đặt lại mật khẩu Task Tracker',
          text: `Xin chào ${account.name},\n\nMở liên kết để đặt lại mật khẩu trong 30 phút:\n${resetUrl}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
        })
      } catch (error) {
        console.error('Password reset email delivery failed:', error.code || 'SMTP_ERROR')
        await db.query(
          'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND used_at IS NULL',
          [sessionHash(token)],
        )
        throw requestError(503, 'Không thể gửi email đặt lại mật khẩu lúc này. Vui lòng thử lại sau.')
      } finally {
        transport.close()
      }
    }
    response.status(202).json({ message: 'Nếu email này thuộc tài khoản đang hoạt động, hướng dẫn đặt lại mật khẩu sẽ được gửi.' })
  })

  router.post('/reset-password', async (request, response) => {
    const { token, newPassword, passwordConfirmation } = request.body || {}
    if (typeof token !== 'string' || token.length < 32 || token.length > 100) {
      throw requestError(400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.')
    }
    if (!isStrongPassword(newPassword)) {
      throw requestError(400, 'Mật khẩu mới cần ít nhất 10 ký tự, gồm chữ hoa, chữ thường và chữ số.')
    }
    if (passwordConfirmation !== newPassword) {
      throw requestError(400, 'Mật khẩu xác nhận không khớp.')
    }
    const passwordHash = await bcrypt.hash(newPassword, 12)
    await transaction(async (tx) => {
      const [resetRequest] = await tx.query(
        `SELECT id, user_id FROM password_reset_tokens
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
         LIMIT 1 FOR UPDATE`,
        [sessionHash(token)],
      )
      if (!resetRequest?.user_id) {
        throw requestError(400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.')
      }
      await tx.query(
        'UPDATE users SET password_hash = ? WHERE id = ? AND is_active = 1',
        [passwordHash, resetRequest.user_id],
      )
      await tx.query(
        'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?',
        [resetRequest.id],
      )
      await tx.query('DELETE FROM auth_sessions WHERE user_id = ?', [resetRequest.user_id])
    })
    response.json({ message: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập.' })
  })

  router.get('/me', async (request, response) => {
    const token = getCookie(request, COOKIE_NAME)
    if (!token || token.length > 200) {
      response.json({ user: null })
      return
    }
    const rows = await db.query(
      `SELECT u.id, u.name, u.email, u.role,
              CAST(UNIX_TIMESTAMP(u.avatar_updated_at) * 1000 AS UNSIGNED) AS avatarVersion
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = 1
       LIMIT 1`,
      [sessionHash(token)],
    )
    response.json({ user: rows[0] || null })
  })

  router.post('/logout', async (request, response) => {
    validateOrigin(request)
    const token = getCookie(request, COOKIE_NAME)
    if (token) {
      const [admin] = await db.query(
        `SELECT u.id FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND u.role = 'admin' AND u.is_active = 1 LIMIT 1`,
        [sessionHash(token)],
      )
      if (admin) {
        await db.query(
          `INSERT INTO admin_activity
             (actor_id, target_user_id, target_type, target_id, action, description)
           VALUES (?, ?, 'user', ?, 'auth.logout', 'Đăng xuất quản trị thành công')`,
          [admin.id, admin.id, admin.id],
        )
      }

      await db.query('DELETE FROM auth_sessions WHERE token_hash = ?', [sessionHash(token)])
    }
    response.setHeader('Set-Cookie', cookieOptions(0))
    response.status(204).end()
  })

  return router
}

function isStrongPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 10 &&
    password.length <= 72 &&
    Buffer.byteLength(password, 'utf8') <= 72 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  )
}
