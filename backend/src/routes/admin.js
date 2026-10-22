import { Router } from 'express'
import { isValidDate, parseDateRange, parsePage, parsePositiveId, requestError } from './date-utils.js'

const roles = ['user', 'admin']
const userFields = 'id, name, email, role, is_active, created_at'

export function createAdminRouter(db, transaction) {
  const router = Router()

  router.get('/stats', async (_request, response) => {
    const [users] = await db.query(
      `SELECT COUNT(*) AS "totalUsers",
              COUNT(*) FILTER (WHERE is_active) AS "activeUsers",
              COUNT(*) FILTER (WHERE NOT is_active) AS "inactiveUsers"
       FROM users`,
    )
    const [tasks] = await db.query(
      `SELECT COUNT(*) AS "totalTasks",
              COUNT(*) FILTER (WHERE status = 'Done') AS completed,
              COUNT(*) FILTER (WHERE status = 'In Progress') AS "inProgress",
              COUNT(*) FILTER (WHERE status = 'To do') AS todo
       FROM tasks WHERE owner_id IS NOT NULL`,
    )
    const recentUsers = await db.query(
      `SELECT ${userFields} FROM users ORDER BY created_at DESC, id DESC LIMIT 5`,
    )
    const recentActivity = await db.query(
      `SELECT a.id, a.action, a.description, a.created_at,
              actor.name AS "actorName", actor.email AS "actorEmail",
              target.id AS "targetId", target.name AS "targetName", target.email AS "targetEmail"
       FROM admin_activity a
       JOIN users actor ON actor.id = a.actor_id
       LEFT JOIN users target ON target.id = a.target_user_id
       ORDER BY a.created_at DESC, a.id DESC LIMIT 5`,
    )
    response.json({
      users: Object.fromEntries(Object.entries(users).map(([key, value]) => [key, Number(value || 0)])),
      tasks: Object.fromEntries(Object.entries(tasks).map(([key, value]) => [key, Number(value || 0)])),
      recentUsers,
      recentActivity,
    })
  })

  router.get('/users', async (request, response) => {
    const page = parsePage(request.query.page, 1)
    const limit = parsePage(request.query.limit, 20, 100)
    const { search, role, status, sort = 'created', order = 'desc' } = request.query
    if (role && !roles.includes(role)) throw requestError(400, 'Bộ lọc vai trò không hợp lệ.')
    if (status && !['active', 'inactive'].includes(status)) throw requestError(400, 'Bộ lọc trạng thái không hợp lệ.')
    const sortColumns = { created: 'u.created_at', name: 'u.name', email: 'u.email' }
    if (!Object.hasOwn(sortColumns, sort)) throw requestError(400, 'Kiểu sắp xếp không hợp lệ.')
    if (!['asc', 'desc'].includes(String(order).toLowerCase())) throw requestError(400, 'Thứ tự sắp xếp không hợp lệ.')

    const conditions = []
    const values = []
    if (role) { conditions.push('u.role = ?'); values.push(role) }
    if (status) { conditions.push('u.is_active = ?'); values.push(status === 'active') }
    if (typeof search === 'string' && search.trim()) {
      conditions.push('(u.name ILIKE ? OR u.email ILIKE ?)')
      values.push(`%${search.trim().slice(0, 120)}%`, `%${search.trim().slice(0, 120)}%`)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const [count] = await db.query(`SELECT COUNT(*) AS total FROM users u ${where}`, values)
    const items = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
              COUNT(t.id) AS "taskCount",
              COUNT(t.id) FILTER (WHERE t.status = 'Done') AS "completedTaskCount"
       FROM users u LEFT JOIN tasks t ON t.owner_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY ${sortColumns[sort]} ${String(order).toUpperCase()}, u.id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit],
    )
    response.json({
      items: items.map((user) => ({
        ...user,
        is_active: Boolean(user.is_active),
        taskCount: Number(user.taskCount || 0),
        completedTaskCount: Number(user.completedTaskCount || 0),
      })),
      page,
      limit,
      total: Number(count.total),
      totalPages: Math.ceil(Number(count.total) / limit),
    })
  })

  router.get('/users/:id/tasks', async (request, response) => {
    const userId = parsePositiveId(request.params.id, 'ID thành viên')
    const page = parsePage(request.query.page, 1)
    const limit = parsePage(request.query.limit, 20, 100)
    const [user] = await db.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId])
    if (!user) throw requestError(404, 'Không tìm thấy thành viên.')
    const [count] = await db.query('SELECT COUNT(*) AS total FROM tasks WHERE owner_id = ?', [userId])
    const items = await db.query(
      `SELECT id, title, status, priority, due_date, completed_at, created_at, updated_at
       FROM tasks WHERE owner_id = ? ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      [userId, limit, (page - 1) * limit],
    )
    response.json({ items, page, limit, total: Number(count.total), totalPages: Math.ceil(Number(count.total) / limit) })
  })

  router.get('/users/:id', async (request, response) => {
    const userId = parsePositiveId(request.params.id, 'ID thành viên')
    const [user] = await db.query(
      `SELECT ${userFields},
              (SELECT COUNT(*) FROM tasks WHERE owner_id = users.id) AS "taskCount",
              (SELECT COUNT(*) FROM tasks WHERE owner_id = users.id AND status = 'Done') AS "completedTaskCount"
       FROM users WHERE id = ? LIMIT 1`,
      [userId],
    )
    if (!user) throw requestError(404, 'Không tìm thấy thành viên.')
    response.json({
      ...user,
      is_active: Boolean(user.is_active),
      taskCount: Number(user.taskCount || 0),
      completedTaskCount: Number(user.completedTaskCount || 0),
    })
  })

  router.patch('/users/:id', async (request, response) => {
    const userId = parsePositiveId(request.params.id, 'ID thành viên')
    const { name } = request.body || {}
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) {
      throw requestError(400, 'Họ tên phải có từ 2 đến 120 ký tự.')
    }
    const updated = await transaction(async (tx) => {
      await tx.query('SELECT id FROM admin_guard WHERE id = 1 FOR UPDATE')
      await assertActiveAdmin(tx, request.user.id)
      const [target] = await tx.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId])
      if (!target) throw requestError(404, 'Không tìm thấy thành viên.')
      await tx.query('UPDATE users SET name = ? WHERE id = ?', [name.trim(), userId])
      await recordActivity(
        tx,
        request.user.id,
        userId,
        'user.profile',
        { name: name.trim() },
        'Cập nhật tên hiển thị thành viên',
      )
      const [result] = await tx.query(`SELECT ${userFields} FROM users WHERE id = ?`, [userId])
      return result
    })
    response.json({ ...updated, is_active: Boolean(updated.is_active) })
  })

  router.patch('/users/:id/status', async (request, response) => {
    const userId = parsePositiveId(request.params.id, 'ID thành viên')
    const { isActive } = request.body || {}
    if (typeof isActive !== 'boolean') throw requestError(400, 'Trạng thái tài khoản không hợp lệ.')
    if (userId === request.user.id && !isActive) {
      throw requestError(400, 'Không thể vô hiệu hóa tài khoản Admin đang sử dụng.')
    }
    const updated = await transaction(async (tx) => {
      await tx.query('SELECT id FROM admin_guard WHERE id = 1 FOR UPDATE')
      await assertActiveAdmin(tx, request.user.id)
      const [target] = await tx.query('SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1', [userId])
      if (!target) throw requestError(404, 'Không tìm thấy thành viên.')
      if (!isActive && target.role === 'admin' && target.is_active) {
        const [count] = await tx.query('SELECT COUNT(*) AS total FROM users WHERE role = ? AND is_active', ['admin'])
        if (Number(count.total) <= 1) throw requestError(409, 'Không thể vô hiệu hóa Admin cuối cùng.')
      }
      await tx.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive, userId])
      if (!isActive) await tx.query('DELETE FROM auth_sessions WHERE user_id = ?', [userId])
      await recordActivity(
        tx,
        request.user.id,
        userId,
        'user.status',
        { isActive },
        isActive ? 'Kích hoạt tài khoản thành viên' : 'Vô hiệu hóa tài khoản thành viên',
      )
      const [result] = await tx.query(`SELECT ${userFields} FROM users WHERE id = ?`, [userId])
      return result
    })
    response.json({ ...updated, is_active: Boolean(updated.is_active) })
  })

  router.patch('/users/:id/role', async (request, response) => {
    const userId = parsePositiveId(request.params.id, 'ID thành viên')
    const { role } = request.body || {}
    if (!roles.includes(role)) throw requestError(400, 'Vai trò không hợp lệ.')
    if (userId === request.user.id && role !== 'admin') {
      throw requestError(400, 'Không thể tự hạ quyền tài khoản Admin đang sử dụng.')
    }
    const updated = await transaction(async (tx) => {
      await tx.query('SELECT id FROM admin_guard WHERE id = 1 FOR UPDATE')
      await assertActiveAdmin(tx, request.user.id)
      const [target] = await tx.query('SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1', [userId])
      if (!target) throw requestError(404, 'Không tìm thấy thành viên.')
      if (role !== 'admin' && target.role === 'admin' && target.is_active) {
        const [count] = await tx.query('SELECT COUNT(*) AS total FROM users WHERE role = ? AND is_active', ['admin'])
        if (Number(count.total) <= 1) throw requestError(409, 'Không thể hạ quyền Admin cuối cùng.')
      }
      await tx.query('UPDATE users SET role = ? WHERE id = ?', [role, userId])
      if (role !== 'admin') await tx.query('DELETE FROM auth_sessions WHERE user_id = ?', [userId])
      await recordActivity(
        tx,
        request.user.id,
        userId,
        'user.role',
        { role },
        role === 'admin' ? 'Cấp quyền quản trị cho thành viên' : 'Đổi thành viên về vai trò người dùng',
      )
      const [result] = await tx.query(`SELECT ${userFields} FROM users WHERE id = ?`, [userId])
      return result
    })
    response.json({ ...updated, is_active: Boolean(updated.is_active) })
  })

  router.get('/tasks', async (request, response) => {
    const page = parsePage(request.query.page, 1)
    const limit = parsePage(request.query.limit, 20, 100)
    const { search, status, priority, ownerId, overdue } = request.query
    const conditions = ['t.owner_id IS NOT NULL']
    const values = []
    if (overdue && overdue !== 'true') throw requestError(400, 'Bộ lọc quá hạn không hợp lệ.')
    if (overdue === 'true') conditions.push("t.due_date < CURRENT_DATE AND t.status <> 'Done'")
    if (ownerId !== undefined && ownerId !== '') {
      conditions.push('t.owner_id = ?')
      values.push(parsePositiveId(ownerId, 'ID chủ sở hữu'))
    }
    if (status) {
      if (!['To do', 'In Progress', 'Done'].includes(status)) throw requestError(400, 'Bộ lọc trạng thái không hợp lệ.')
      conditions.push('t.status = ?')
      values.push(status)
    }
    if (priority) {
      if (!['Low', 'Medium', 'High'].includes(priority)) throw requestError(400, 'Bộ lọc ưu tiên không hợp lệ.')
      conditions.push('t.priority = ?')
      values.push(priority)
    }
    if (typeof search === 'string' && search.trim()) {
      conditions.push('(t.title ILIKE ? OR t.description ILIKE ? OR u.email ILIKE ?)')
      const pattern = `%${search.trim().slice(0, 120)}%`
      values.push(pattern, pattern, pattern)
    }
    const where = conditions.join(' AND ')
    const [count] = await db.query(`SELECT COUNT(*) AS total FROM tasks t JOIN users u ON u.id = t.owner_id WHERE ${where}`, values)
    const items = await db.query(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.completed_at, t.updated_at,
              t.created_at,
              u.id AS "ownerId", u.name AS "ownerName", u.email AS "ownerEmail"
       FROM tasks t JOIN users u ON u.id = t.owner_id WHERE ${where}
       ORDER BY t.updated_at DESC, t.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit],
    )
    const owners = await db.query(
      `SELECT DISTINCT u.id, u.name, u.email
       FROM users u JOIN tasks t ON t.owner_id = u.id
       ORDER BY u.name, u.id`,
    )
    response.json({ items, owners, page, limit, total: Number(count.total), totalPages: Math.ceil(Number(count.total) / limit) })
  })

  router.get('/activity', async (request, response) => {
    const page = parsePage(request.query.page, 1)
    const limit = parsePage(request.query.limit, 20, 100)
    const { search, action, adminId, from, to } = request.query
    const allowedActions = ['user.status', 'user.role', 'user.profile', 'auth.login', 'auth.logout', 'demo.seed']
    if (action && !allowedActions.includes(action)) throw requestError(400, 'Bộ lọc hành động không hợp lệ.')
    if (adminId && !/^\d+$/.test(String(adminId))) throw requestError(400, 'Bộ lọc quản trị viên không hợp lệ.')
    if (from !== undefined && !isValidDate(from)) throw requestError(400, 'Ngày bắt đầu không hợp lệ.')
    if (to !== undefined && !isValidDate(to)) throw requestError(400, 'Ngày kết thúc không hợp lệ.')
    if (from && to) parseDateRange(from, to, 3660)
    const conditions = []
    const values = []
    if (action) { conditions.push('a.action = ?'); values.push(action) }
    if (adminId) { conditions.push('a.actor_id = ?'); values.push(parsePositiveId(adminId, 'ID quản trị viên')) }
    if (from) { conditions.push('a.created_at >= ?'); values.push(`${from} 00:00:00`) }
    if (to) { conditions.push("a.created_at < (?::date + INTERVAL '1 day')"); values.push(to) }
    if (typeof search === 'string' && search.trim()) {
      conditions.push('(a.description ILIKE ? OR a.action ILIKE ? OR actor.name ILIKE ? OR actor.email ILIKE ? OR target.name ILIKE ? OR target.email ILIKE ?)')
      const pattern = `%${search.trim().slice(0, 120)}%`
      values.push(pattern, pattern, pattern, pattern, pattern, pattern)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const [count] = await db.query(
      `SELECT COUNT(*) AS total
       FROM admin_activity a
       JOIN users actor ON actor.id = a.actor_id
       LEFT JOIN users target ON target.id = a.target_user_id ${where}`,
      values,
    )
    const items = await db.query(
      `SELECT a.id, a.action, a.description, a.details, a.target_type AS "targetType",
              a.target_id AS "targetId", a.seed_key AS "seedKey", a.created_at,
              actor.id AS "actorId", actor.name AS "actorName", actor.email AS "actorEmail",
              target.id AS "targetUserId", target.name AS "targetName", target.email AS "targetEmail"
       FROM admin_activity a
       JOIN users actor ON actor.id = a.actor_id
       LEFT JOIN users target ON target.id = a.target_user_id
       ${where}
       ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit],
    )
    const admins = await db.query(
      "SELECT id, name, email FROM users WHERE role = 'admin' ORDER BY name, id",
    )
    response.json({ items, admins, page, limit, total: Number(count.total), totalPages: Math.ceil(Number(count.total) / limit) })
  })

  return router
}

function recordActivity(db, actorId, targetUserId, action, details, description) {
  return db.query(
    `INSERT INTO admin_activity
       (actor_id, target_user_id, target_type, target_id, action, description, details)
     VALUES (?, ?, 'user', ?, ?, ?, ?)`,
    [actorId, targetUserId, targetUserId, action, description, JSON.stringify(details)],
  )
}

async function assertActiveAdmin(db, userId) {
  const [actor] = await db.query(
    'SELECT id FROM users WHERE id = ? AND role = ? AND is_active LIMIT 1 FOR UPDATE',
    [userId, 'admin'],
  )
  if (!actor) throw requestError(403, 'Quyền quản trị không còn hiệu lực.')
}
