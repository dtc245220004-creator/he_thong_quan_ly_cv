import { Router } from 'express'
import { parseDateRange, requestError } from './date-utils.js'

const statuses = ['To do', 'In Progress', 'Done']
const priorities = ['Low', 'Medium', 'High']

export function createCalendarRouter(db) {
  const router = Router()

  router.get('/', async (request, response) => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const defaultStart = `${today.slice(0, 8)}01`
    const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
      .toISOString().slice(0, 10)
    const startDate = request.query.startDate || defaultStart
    const endDate = request.query.endDate || defaultEnd
    parseDateRange(startDate, endDate, 42)
    const { status, priority } = request.query
    if (status && !statuses.includes(status)) throw requestError(400, 'Bộ lọc trạng thái không hợp lệ.')
    if (priority && !priorities.includes(priority)) throw requestError(400, 'Bộ lọc ưu tiên không hợp lệ.')

    const conditions = [
      'owner_id = ?',
      '((start_date BETWEEN ? AND ?) OR (due_date BETWEEN ? AND ?) OR (start_date <= ? AND due_date >= ?))',
    ]
    const values = [request.user.id, startDate, endDate, startDate, endDate, endDate, startDate]
    if (status) { conditions.push('status = ?'); values.push(status) }
    if (priority) { conditions.push('priority = ?'); values.push(priority) }

    const tasks = await db.query(
      `SELECT id, title, description, start_date, due_date, status, priority, assignee, completed_at
       FROM tasks WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(start_date, due_date), due_date, priority DESC, id`,
      values,
    )
    response.json({ startDate, endDate, items: tasks })
  })

  return router
}
