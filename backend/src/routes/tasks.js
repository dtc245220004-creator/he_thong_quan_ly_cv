import { Router } from 'express'

const taskStatuses = ['To do', 'In Progress', 'Done']
const taskPriorities = ['Low', 'Medium', 'High']
const taskFields = ['title', 'description', 'start_date', 'due_date', 'status', 'priority', 'assignee']
const taskColumns =
  'id, title, description, start_date, due_date, status, priority, assignee, completed_at, created_at, updated_at'
const sortColumns = {
  created: 'created_at',
  due: 'due_date',
  status: 'status',
  priority: 'priority',
}

function createRequestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function validateTask(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createRequestError(400, 'Request body must be a JSON object.')
  }
  const unknown = Object.keys(input).find((field) => !taskFields.includes(field))
  if (unknown) throw createRequestError(400, `Unsupported task field: ${unknown}.`)
  if (!partial && (typeof input.title !== 'string' || !input.title.trim())) {
    throw createRequestError(400, 'Tiêu đề công việc là bắt buộc.')
  }

  const task = {}
  for (const field of taskFields) {
    if (!Object.hasOwn(input, field)) continue
    const value = input[field]
    if (field === 'title') {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 255) {
        throw createRequestError(400, 'Tiêu đề phải có từ 1 đến 255 ký tự.')
      }
      task.title = value.trim()
    } else if (field === 'description') {
      if (value !== null && (typeof value !== 'string' || value.length > 5000)) {
        throw createRequestError(400, 'Mô tả không được vượt quá 5000 ký tự.')
      }
      task.description = value
    } else if (field === 'start_date' || field === 'due_date') {
      if (value !== null && value !== '' && !isValidDate(value)) {
        throw createRequestError(400, `${field} phải đúng định dạng YYYY-MM-DD.`)
      }
      task[field] = value || null
    } else if (field === 'status') {
      if (!taskStatuses.includes(value)) throw createRequestError(400, 'Trạng thái công việc không hợp lệ.')
      task.status = value
    } else if (field === 'priority') {
      if (!taskPriorities.includes(value)) throw createRequestError(400, 'Mức ưu tiên không hợp lệ.')
      task.priority = value
    } else if (field === 'assignee') {
      if (value !== null && (typeof value !== 'string' || value.trim().length > 120)) {
        throw createRequestError(400, 'Người phụ trách không hợp lệ.')
      }
      task.assignee = typeof value === 'string' ? value.trim() || null : value
    }
  }

  if (task.start_date && task.due_date && task.start_date > task.due_date) {
    throw createRequestError(400, 'Ngày bắt đầu không thể sau hạn hoàn thành.')
  }
  return task
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) {
    return false
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function parseTaskId(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw createRequestError(400, 'ID công việc không hợp lệ.')
  return id
}

function parseBoundedInteger(value, fallback, maximum) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createRequestError(400, 'Tham số phân trang phải là số nguyên dương.')
  }
  return Math.min(parsed, maximum)
}

function taskById(db, id, ownerId) {
  return db.query(
    `SELECT ${taskColumns} FROM tasks WHERE id = ? AND owner_id = ?`,
    [id, ownerId],
  )
}

export function createTasksRouter(db) {
  const router = Router()

  router.get('/', async (request, response) => {
    const { status, priority, search, due, sort = 'created', order = 'desc' } = request.query
    const page = parseBoundedInteger(request.query.page, 1, 1000000)
    const pageSize = parseBoundedInteger(request.query.pageSize, 20, 100)
    if (status && !taskStatuses.includes(status)) throw createRequestError(400, 'Bộ lọc trạng thái không hợp lệ.')
    if (priority && !taskPriorities.includes(priority)) throw createRequestError(400, 'Bộ lọc ưu tiên không hợp lệ.')
    if (due && !['overdue', 'upcoming', 'none'].includes(due)) throw createRequestError(400, 'Bộ lọc hạn hoàn thành không hợp lệ.')
    if (!Object.hasOwn(sortColumns, sort)) throw createRequestError(400, 'Kiểu sắp xếp không hợp lệ.')
    if (!['asc', 'desc'].includes(String(order).toLowerCase())) throw createRequestError(400, 'Thứ tự sắp xếp không hợp lệ.')

    const where = ['owner_id = ?']
    const values = [request.user.id]
    if (status) { where.push('status = ?'); values.push(status) }
    if (priority) { where.push('priority = ?'); values.push(priority) }
    if (typeof search === 'string' && search.trim()) {
      where.push('(title ILIKE ? OR description ILIKE ?)')
      values.push(`%${search.trim().slice(0, 120)}%`, `%${search.trim().slice(0, 120)}%`)
    }
    if (due === 'overdue') where.push("due_date < CURRENT_DATE AND status <> 'Done'")
    if (due === 'upcoming') where.push('due_date >= CURRENT_DATE AND status <> \'Done\'')
    if (due === 'none') where.push('due_date IS NULL')
    const whereSql = where.join(' AND ')
    const [countRow] = await db.query(`SELECT COUNT(*) AS total FROM tasks WHERE ${whereSql}`, values)
    const total = Number(countRow.total)
    const items = await db.query(
      `SELECT ${taskColumns} FROM tasks WHERE ${whereSql}
       ORDER BY ${sortColumns[sort]} ${String(order).toUpperCase()}, id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    )
    response.json({ items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) })
  })

  router.get('/:id', async (request, response) => {
    const rows = await taskById(db, parseTaskId(request.params.id), request.user.id)
    if (!rows.length) throw createRequestError(404, 'Không tìm thấy công việc.')
    response.json(rows[0])
  })

  router.post('/', async (request, response) => {
    const task = validateTask(request.body)
    const values = [
      task.title,
      task.description ?? null,
      task.start_date ?? null,
      task.due_date ?? null,
      task.status ?? 'To do',
      task.priority ?? 'Medium',
      task.assignee ?? null,
      request.user.id,
    ]
    const result = await db.query(
      `INSERT INTO tasks (title, description, start_date, due_date, status, priority, assignee, owner_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'Done' THEN CURRENT_TIMESTAMP ELSE NULL END)
       RETURNING id`,
      [...values, task.status ?? 'To do'],
    )
    const rows = await taskById(db, result[0].id, request.user.id)
    response.status(201).json(rows[0])
  })

  router.put('/:id', async (request, response) => {
    const id = parseTaskId(request.params.id)
    const task = validateTask(request.body)
    const existing = await taskById(db, id, request.user.id)
    if (!existing.length) throw createRequestError(404, 'Không tìm thấy công việc.')
    const values = [
      task.title,
      task.description ?? null,
      task.start_date ?? null,
      task.due_date ?? null,
      task.status ?? 'To do',
      task.priority ?? 'Medium',
      task.assignee ?? null,
    ]
    const completionTime = task.status === 'Done'
      ? (existing[0].status === 'Done' ? existing[0].completed_at : new Date())
      : null
    await db.query(
      `UPDATE tasks SET title = ?, description = ?, start_date = ?, due_date = ?, status = ?, priority = ?, assignee = ?, completed_at = ?
       WHERE id = ? AND owner_id = ?`,
      [...values, completionTime, id, request.user.id],
    )
    const rows = await taskById(db, id, request.user.id)
    response.json(rows[0])
  })

  router.patch('/:id/status', async (request, response) => {
    const { status } = request.body || {}
    if (!taskStatuses.includes(status)) throw createRequestError(400, 'Trạng thái công việc không hợp lệ.')
    const id = parseTaskId(request.params.id)
    const result = await db.query(
      `UPDATE tasks
       SET completed_at = CASE
             WHEN ? = 'Done' THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
             ELSE NULL
           END,
           status = ?
       WHERE id = ? AND owner_id = ?
       RETURNING id`,
      [status, status, id, request.user.id],
    )
    if (!result.length) throw createRequestError(404, 'Không tìm thấy công việc.')
    const rows = await taskById(db, id, request.user.id)
    response.json(rows[0])
  })

  router.patch('/:id', async (request, response) => {
    const id = parseTaskId(request.params.id)
    const task = validateTask(request.body, { partial: true })
    const existing = await taskById(db, id, request.user.id)
    if (!existing.length) throw createRequestError(404, 'Không tìm thấy công việc.')
    const updated = { ...existing[0], ...task }
    if (updated.start_date && updated.due_date && updated.start_date > updated.due_date) {
      throw createRequestError(400, 'Ngày bắt đầu không thể sau hạn hoàn thành.')
    }
    const fields = Object.keys(task)
    if (fields.length) {
      const completionTime = Object.hasOwn(task, 'status')
        ? task.status === 'Done'
          ? (existing[0].status === 'Done' ? existing[0].completed_at : new Date())
          : null
        : existing[0].completed_at
      await db.query(
        `UPDATE tasks SET ${fields.map((field) => `"${field}" = ?`).join(', ')}, completed_at = ?
         WHERE id = ? AND owner_id = ?`,
        [...fields.map((field) => task[field]), completionTime, id, request.user.id],
      )
    }
    const rows = await taskById(db, id, request.user.id)
    response.json(rows[0])
  })

  router.delete('/:id', async (request, response) => {
    const result = await db.query(
      'DELETE FROM tasks WHERE id = ? AND owner_id = ? RETURNING id',
      [parseTaskId(request.params.id), request.user.id],
    )
    if (!result.length) throw createRequestError(404, 'Không tìm thấy công việc.')
    response.status(204).end()
  })
  return router
}
