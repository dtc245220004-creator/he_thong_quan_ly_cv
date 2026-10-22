import express, { Router } from 'express'
import { requestError } from './date-utils.js'
import bcrypt from 'bcryptjs'

export function createProfileRouter(db) {
  const router = Router()

  router.get('/', async (request, response) => {
    const [profile] = await db.query(
      `SELECT id, name, email, role, created_at,
              CAST(UNIX_TIMESTAMP(avatar_updated_at) * 1000 AS UNSIGNED) AS avatarVersion
       FROM users WHERE id = ? AND is_active = 1 LIMIT 1`,
      [request.user.id],
    )
    if (!profile) throw requestError(404, 'Không tìm thấy tài khoản.')
    const [stats] = await db.query(
      `SELECT COUNT(*) AS total,
              SUM(status = 'Done') AS completed,
              SUM(status = 'In Progress') AS inProgress,
              SUM(status = 'To do') AS todo
       FROM tasks WHERE owner_id = ?`,
      [request.user.id],
    )
    const total = Number(stats.total || 0)
    response.json({
      ...profile,
      stats: {
        total,
        completed: Number(stats.completed || 0),
        inProgress: Number(stats.inProgress || 0),
        completionRate: total ? Math.round(Number(stats.completed || 0) * 100 / total) : 0,
      },
    })
  })

  router.patch('/', async (request, response) => {
    const { name } = request.body || {}
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) {
      throw requestError(400, 'Họ tên phải có từ 2 đến 120 ký tự.')
    }
    await db.query('UPDATE users SET name = ? WHERE id = ? AND is_active = 1', [name.trim(), request.user.id])
    const [profile] = await db.query(
      `SELECT id, name, email, role, created_at,
              CAST(UNIX_TIMESTAMP(avatar_updated_at) * 1000 AS UNSIGNED) AS avatarVersion
       FROM users WHERE id = ? LIMIT 1`,
      [request.user.id],
    )
    response.json(profile)
  })

  router.put('/avatar', express.raw({ type: ['image/png', 'image/jpeg'], limit: '2mb' }), async (request, response) => {
    const mime = request.get('content-type')?.split(';')[0].toLowerCase()
    const image = request.body
    if (!Buffer.isBuffer(image) || image.length > 2 * 1024 * 1024 || !validAvatar(image, mime)) {
      throw requestError(400, 'Chỉ chấp nhận ảnh PNG hoặc JPEG hợp lệ, tối đa 2 MB.')
    }
    await db.query(
      'UPDATE users SET avatar_mime = ?, avatar_data = ?, avatar_updated_at = CURRENT_TIMESTAMP(6) WHERE id = ? AND is_active = 1',
      [mime, image, request.user.id],
    )
    const [profile] = await db.query(
      'SELECT CAST(UNIX_TIMESTAMP(avatar_updated_at) * 1000 AS UNSIGNED) AS avatarVersion FROM users WHERE id = ?',
      [request.user.id],
    )
    response.json(profile)
  })

  router.get('/avatar', async (request, response) => {
    const [profile] = await db.query(
      'SELECT avatar_mime AS mime, avatar_data AS image FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [request.user.id],
    )
    if (!profile?.image || !['image/png', 'image/jpeg'].includes(profile.mime)) {
      throw requestError(404, 'Tài khoản chưa có ảnh đại diện.')
    }
    response.set({
      'Content-Type': profile.mime,
      'Content-Length': profile.image.length,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    })
    response.send(profile.image)
  })

  router.patch('/password', async (request, response) => {
    const { currentPassword, newPassword, passwordConfirmation } = request.body || {}
    if (typeof currentPassword !== 'string' || currentPassword.length > 72) {
      throw requestError(400, 'Vui lòng nhập mật khẩu hiện tại.')
    }
    if (
      typeof newPassword !== 'string' ||
      newPassword.length < 10 ||
      newPassword.length > 72 ||
      Buffer.byteLength(newPassword, 'utf8') > 72 ||
      !/[a-z]/.test(newPassword) ||
      !/[A-Z]/.test(newPassword) ||
      !/\d/.test(newPassword)
    ) {
      throw requestError(400, 'Mật khẩu mới cần ít nhất 10 ký tự, gồm chữ hoa, chữ thường và chữ số.')
    }
    if (passwordConfirmation !== newPassword) {
      throw requestError(400, 'Mật khẩu xác nhận không khớp.')
    }
    const [user] = await db.query(
      'SELECT password_hash FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [request.user.id],
    )
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      throw requestError(401, 'Mật khẩu hiện tại không chính xác.')
    }
    const passwordHash = await bcrypt.hash(newPassword, 12)
    await db.query('UPDATE users SET password_hash = ? WHERE id = ? AND is_active = 1', [passwordHash, request.user.id])
    if (request.user.sessionId) {
      await db.query('DELETE FROM auth_sessions WHERE user_id = ? AND id <> ?', [request.user.id, request.user.sessionId])
    }
    response.json({ message: 'Mật khẩu đã được cập nhật. Các phiên đăng nhập khác đã bị thu hồi.' })
  })

  return router
}

function validAvatar(image, mime) {
  if (mime === 'image/png') {
    if (image.length < 24 || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false
    if (image.toString('ascii', 12, 16) !== 'IHDR') return false
    const width = image.readUInt32BE(16)
    const height = image.readUInt32BE(20)
    return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 20_000_000
  }
  if (mime !== 'image/jpeg' || image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image.at(-2) !== 0xff || image.at(-1) !== 0xd9) {
    return false
  }
  let offset = 2
  while (offset + 4 < image.length) {
    if (image[offset] !== 0xff) return false
    while (image[offset] === 0xff) offset += 1
    const marker = image[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > image.length) return false
    const length = image.readUInt16BE(offset)
    if (length < 2 || offset + length > image.length) return false
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) return false
      const height = image.readUInt16BE(offset + 3)
      const width = image.readUInt16BE(offset + 5)
      return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 20_000_000
    }
    offset += length
  }
  return false
}
